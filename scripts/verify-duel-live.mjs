import { strict as assert } from 'node:assert';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && publishableKey && serviceRoleKey, 'Supabase verification environment is missing');

const createdUsers = [];
const createdClients = [];
const client = () => createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function player(label) {
  const api = client();
  createdClients.push(api);
  const signed = await api.auth.signInAnonymously();
  assert.ifError(signed.error);
  assert.ok(signed.data.user?.id, `${label} anonymous auth failed`);
  createdUsers.push(signed.data.user.id);
  return { api, id: signed.data.user.id, name: `QA ${label.slice(0, 8)} ${Date.now().toString(36).slice(-4)}` };
}

async function rpc(api, name, args = {}) {
  const response = await api.rpc(name, args);
  assert.ifError(response.error);
  return response.data;
}

async function waitUntil(timestamp, serverNow = Date.now()) {
  const localTimestamp = timestamp + (Date.now() - serverNow);
  const delay = Math.max(0, localTimestamp - Date.now());
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
}

try {
  const unauthenticated = client();
  const blockedTable = await unauthenticated.from('duel_profiles').select('user_id');
  assert.ok(blockedTable.error, 'anon role must not read duel profiles');
  const blockedInternalRpc = await unauthenticated.rpc('duel_record_profile', { p_user_id: crypto.randomUUID(), p_nickname: 'QA blocked', p_won: true });
  assert.ok(blockedInternalRpc.error, 'internal profile updater must not be client callable');

  const one = await player('one');
  const two = await player('two');
  const first = await rpc(one.api, 'duel_find_or_join', { p_nickname: one.name });
  assert.equal(first.state, 'waiting');
  const second = await rpc(two.api, 'duel_find_or_join', { p_nickname: two.name });
  assert.equal(second.state, 'matched');
  const firstMatched = await rpc(one.api, 'duel_find_or_join', { p_nickname: one.name });
  assert.equal(firstMatched.state, 'matched');
  assert.equal(firstMatched.match.id, second.match.id);
  assert.equal(firstMatched.match.seed, second.match.seed);
  assert.equal(firstMatched.match.startsAt, second.match.startsAt);

  let realtimeFinished = false;
  const realtime = two.api.channel(`qa-${second.match.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duel_matches', filter: `id=eq.${second.match.id}` }, (payload) => {
      if (payload.new?.status === 'finished') realtimeFinished = true;
    });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Realtime subscription timeout')), 6000);
    realtime.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); } });
  });

  await waitUntil(second.match.startsAt + 700, second.match.serverNow);
  const [oneClaim, twoClaim] = await Promise.all([
    rpc(one.api, 'duel_claim', { p_match_id: second.match.id, p_elapsed_ms: 1250, p_attempts: 2, p_accuracy: 91 }),
    rpc(two.api, 'duel_claim', { p_match_id: second.match.id, p_elapsed_ms: 1320, p_attempts: 2, p_accuracy: 89 }),
  ]);
  assert.equal([oneClaim.didWin, twoClaim.didWin].filter(Boolean).length, 1, 'exactly one live winner required');
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(realtimeFinished, true, 'finished match must arrive over Realtime');
  await two.api.removeChannel(realtime);

  const oneProfile = await rpc(one.api, 'duel_get_profile');
  const twoProfile = await rpc(two.api, 'duel_get_profile');
  assert.equal(oneProfile.matches, 1);
  assert.equal(twoProfile.matches, 1);
  assert.equal(oneProfile.wins + twoProfile.wins, 1);
  assert.equal(oneProfile.losses + twoProfile.losses, 1);
  const oneVisibleProfiles = await one.api.from('duel_profiles').select('user_id');
  assert.ifError(oneVisibleProfiles.error);
  assert.deepEqual(oneVisibleProfiles.data.map((profile) => profile.user_id), [one.id], 'RLS must expose only the caller profile');
  const league = await rpc(one.api, 'duel_weekly_league');
  assert.ok(league.players.some((entry) => entry.points === 3), 'live win must award three league points');

  const friendHost = await player('friend-host');
  const friendGuest = await player('friend-guest');
  const friendThird = await player('friend-third');
  const invitation = await rpc(friendHost.api, 'duel_create_invite', { p_nickname: friendHost.name });
  assert.match(invitation.token, /^[A-Za-z0-9_-]{20,40}$/);
  assert.equal(invitation.invite.status, 'waiting');
  assert.equal(invitation.invite.isHost, true);
  const preview = await rpc(friendGuest.api, 'duel_preview_invite', { p_token: invitation.token });
  assert.equal(preview.state, 'waiting');
  assert.equal(preview.hostName, friendHost.name);
  const untouchedInvite = await admin.from('duel_invites').select('guest_id,status').eq('id', invitation.invite.id).single();
  assert.ifError(untouchedInvite.error);
  assert.equal(untouchedInvite.data.guest_id, null, 'preview must not claim the guest seat');

  let inviteRealtimeMatched = false;
  const inviteRealtime = friendHost.api.channel(`qa-invite-${invitation.invite.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duel_invites', filter: `id=eq.${invitation.invite.id}` }, (payload) => {
      if (payload.new?.status === 'matched') inviteRealtimeMatched = true;
    });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Invite Realtime subscription timeout')), 6000);
    inviteRealtime.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); } });
  });

  const friendAccepts = await Promise.all([
    rpc(friendGuest.api, 'duel_accept_invite', { p_token: invitation.token, p_nickname: friendGuest.name }),
    rpc(friendThird.api, 'duel_accept_invite', { p_token: invitation.token, p_nickname: friendThird.name }),
  ]);
  const accepted = friendAccepts.find((result) => result.state === 'matched');
  const rejected = friendAccepts.find((result) => result.state !== 'matched');
  assert.ok(accepted?.match, 'exactly one invite accepter must receive a match');
  assert.equal(rejected?.state, 'full');
  assert.equal(accepted.match.matchSource, 'invite');
  assert.equal(accepted.match.opponentKind, 'live');
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(inviteRealtimeMatched, true, 'host must receive invite acceptance over Realtime');
  await friendHost.api.removeChannel(inviteRealtime);

  const hostRoom = await rpc(friendHost.api, 'duel_get_invite', { p_invite_id: invitation.invite.id });
  assert.equal(hostRoom.status, 'matched');
  assert.equal(hostRoom.match.id, accepted.match.id);
  assert.equal(hostRoom.match.startsAt, accepted.match.startsAt);
  const acceptedPlayer = friendAccepts[0].state === 'matched' ? friendGuest : friendThird;
  const rejectedPlayer = acceptedPlayer === friendGuest ? friendThird : friendGuest;
  const hiddenInvite = await rejectedPlayer.api.from('duel_invites').select('id').eq('id', invitation.invite.id);
  assert.ifError(hiddenInvite.error);
  assert.equal(hiddenInvite.data.length, 0, 'non-participants must not read an invite room');

  await waitUntil(accepted.match.startsAt + 700, accepted.match.serverNow);
  const friendWin = await rpc(friendHost.api, 'duel_claim', { p_match_id: accepted.match.id, p_elapsed_ms: 1450, p_attempts: 2, p_accuracy: 92 });
  assert.equal(friendWin.didWin, true);
  const friendHostProfile = await rpc(friendHost.api, 'duel_get_profile');
  const friendGuestProfile = await rpc(acceptedPlayer.api, 'duel_get_profile');
  assert.deepEqual([friendHostProfile.matches, friendHostProfile.wins, friendHostProfile.friendMatches, friendHostProfile.friendWins], [0, 0, 1, 1]);
  assert.deepEqual([friendGuestProfile.matches, friendGuestProfile.losses, friendGuestProfile.friendMatches, friendGuestProfile.friendLosses], [0, 0, 1, 1]);
  const friendLeague = await rpc(friendHost.api, 'duel_weekly_league');
  assert.equal(friendLeague.players.some((entry) => entry.isMe), false, 'friend wins must not enter the weekly league');

  const cancelledInvitation = await rpc(friendHost.api, 'duel_create_invite', { p_nickname: friendHost.name });
  const cancelled = await rpc(friendHost.api, 'duel_cancel_invite', { p_invite_id: cancelledInvitation.invite.id });
  assert.equal(cancelled.status, 'cancelled');
  const cancelledPreview = await rpc(friendGuest.api, 'duel_preview_invite', { p_token: cancelledInvitation.token });
  assert.equal(cancelledPreview.state, 'cancelled');

  const ghostPlayer = await player('ghost');
  await rpc(ghostPlayer.api, 'duel_find_or_join', { p_nickname: ghostPlayer.name });
  const ghostJoin = await rpc(ghostPlayer.api, 'duel_start_ghost', { p_nickname: ghostPlayer.name });
  assert.equal(ghostJoin.match.opponentKind, 'ghost');
  const hiddenLiveMatch = await ghostPlayer.api.from('duel_matches').select('id').eq('id', second.match.id);
  assert.ifError(hiddenLiveMatch.error);
  assert.equal(hiddenLiveMatch.data.length, 0, 'non-participants must not read a live match');
  await waitUntil(ghostJoin.match.startsAt + 700, ghostJoin.match.serverNow);
  const ghostElapsed = Math.max(450, ghostJoin.match.ghostElapsedMs - 100);
  const ghostClaim = await rpc(ghostPlayer.api, 'duel_claim', { p_match_id: ghostJoin.match.id, p_elapsed_ms: ghostElapsed, p_attempts: 1, p_accuracy: 95 });
  assert.equal(ghostClaim.didWin, true);
  const ghostLeague = await rpc(ghostPlayer.api, 'duel_weekly_league');
  const ghostRank = ghostLeague.players.find((entry) => entry.isMe);
  assert.equal(ghostRank?.points, 1, 'ghost win must award one league point');

  const quitter = await player('quit');
  await rpc(quitter.api, 'duel_find_or_join', { p_nickname: quitter.name });
  const quitMatch = await rpc(quitter.api, 'duel_start_ghost', { p_nickname: quitter.name });
  const forfeited = await rpc(quitter.api, 'duel_forfeit', { p_match_id: quitMatch.match.id });
  assert.equal(forfeited.didWin, false);
  const quitProfile = await rpc(quitter.api, 'duel_get_profile');
  assert.equal(quitProfile.losses, 1);

  const drawOne = await player('draw-one');
  const drawTwo = await player('draw-two');
  await rpc(drawOne.api, 'duel_find_or_join', { p_nickname: drawOne.name });
  const drawJoin = await rpc(drawTwo.api, 'duel_find_or_join', { p_nickname: drawTwo.name });
  const drawResults = await Promise.all([
    rpc(drawOne.api, 'duel_mark_failure', { p_match_id: drawJoin.match.id }),
    rpc(drawTwo.api, 'duel_mark_failure', { p_match_id: drawJoin.match.id }),
  ]);
  assert.ok(drawResults.some((match) => match.status === 'finished' && match.isDraw === true), 'two failures must settle as a draw');
  const drawProfiles = await Promise.all([rpc(drawOne.api, 'duel_get_profile'), rpc(drawTwo.api, 'duel_get_profile')]);
  assert.deepEqual(drawProfiles.map((profile) => profile.losses), [1, 1]);

  const survivor = await player('survivor');
  const failed = await player('failed');
  await rpc(survivor.api, 'duel_find_or_join', { p_nickname: survivor.name });
  const survivalJoin = await rpc(failed.api, 'duel_find_or_join', { p_nickname: failed.name });
  const markedFailure = await rpc(failed.api, 'duel_mark_failure', { p_match_id: survivalJoin.match.id });
  assert.equal(markedFailure.status, 'ready');
  await new Promise((resolve) => setTimeout(resolve, 700));
  const survived = await rpc(survivor.api, 'duel_settle_failure', { p_match_id: survivalJoin.match.id });
  assert.equal(survived.didWin, true, 'one-sided failure must award a survival win');

  console.log('✓ remote auth, random and friend matching, explicit invite acceptance, one-seat lock, invite Realtime, isolated friend records, atomic winner, ghost, forfeit, draw, profile, and weighted league verified');
} finally {
  for (const userId of createdUsers.reverse()) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) console.warn(`QA user cleanup failed: ${removed.error.message}`);
  }
  await Promise.all(createdClients.map(async (api) => {
    await api.removeAllChannels();
    await api.auth.signOut({ scope: 'local' });
  }));
  await admin.removeAllChannels();
}
