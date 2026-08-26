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
  return { api, id: signed.data.user.id, name: `QA${label.replace(/[^a-z]/gi, '').slice(0, 4)}${Date.now().toString(36).slice(-3)}` };
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
  const winner = oneClaim.didWin ? one : two;
  const renamedWinner = `승자${Date.now().toString(36).slice(-4)}`;
  const renamedProfile = await rpc(winner.api, 'duel_set_nickname', { p_nickname: renamedWinner });
  assert.equal(renamedProfile.nickname, renamedWinner, 'nickname RPC must update the current profile immediately');
  const reservedName = await winner.api.rpc('duel_set_nickname', { p_nickname: '관리자' });
  assert.ok(reservedName.error, 'reserved nickname must be rejected by the server');
  const shortName = await winner.api.rpc('duel_set_nickname', { p_nickname: '냥' });
  assert.ok(shortName.error, 'one-character nickname must be rejected by the server');
  const league = await rpc(one.api, 'duel_weekly_league');
  assert.ok(league.players.some((entry) => entry.points === 3), 'live win must award three league points');
  assert.ok(league.players.some((entry) => entry.nickname === renamedWinner), 'weekly league must use the latest profile nickname');
  const blockedGhost = await one.api.rpc('duel_start_ghost', { p_nickname: one.name });
  assert.ok(blockedGhost.error, 'authenticated clients must not be able to create ghost matches');

  const friendHost = await player('friend-host');
  const friendGuest = await player('friend-guest');
  const friendThird = await player('friend-third');
  const invitation = await rpc(friendHost.api, 'duel_create_invite', { p_nickname: friendHost.name, p_level: 8 });
  assert.match(invitation.token, /^[A-Za-z0-9_-]{20,40}$/);
  assert.equal(invitation.invite.status, 'waiting');
  assert.equal(invitation.invite.isHost, true);
  assert.equal(invitation.invite.selectedLevel, 8);
  const preview = await rpc(friendGuest.api, 'duel_preview_invite', { p_token: invitation.token });
  assert.equal(preview.state, 'waiting');
  assert.equal(preview.hostName, friendHost.name);
  assert.equal(preview.selectedLevel, 8, 'invite preview must disclose the first cat before acceptance');
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
  assert.equal(accepted.match.level, 8);
  assert.ok(accepted.session?.id, 'invite acceptance must create a persistent session');
  assert.equal(accepted.match.sessionId, accepted.session.id);
  assert.equal(accepted.match.sessionRound, 1);
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(inviteRealtimeMatched, true, 'host must receive invite acceptance over Realtime');
  await friendHost.api.removeChannel(inviteRealtime);

  const hostRoom = await rpc(friendHost.api, 'duel_get_invite', { p_invite_id: invitation.invite.id });
  assert.equal(hostRoom.status, 'matched');
  assert.equal(hostRoom.match.id, accepted.match.id);
  assert.equal(hostRoom.match.startsAt, accepted.match.startsAt);
  assert.equal(hostRoom.session.id, accepted.session.id);
  const acceptedPlayer = friendAccepts[0].state === 'matched' ? friendGuest : friendThird;
  const rejectedPlayer = acceptedPlayer === friendGuest ? friendThird : friendGuest;
  let receivedGesture = null;
  const gestureTopic = `duel-gestures-${accepted.match.id}`;
  const hostGestures = friendHost.api.channel(gestureTopic, { config: { broadcast: { self: false, ack: false } } })
    .on('broadcast', { event: 'gesture' }, ({ payload }) => { receivedGesture = payload; });
  const guestGestures = acceptedPlayer.api.channel(gestureTopic, { config: { broadcast: { self: false, ack: false } } });
  await Promise.all([hostGestures, guestGestures].map((channel) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Gesture Realtime subscription timeout')), 6000);
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); } });
  })));
  await guestGestures.send({ type: 'broadcast', event: 'gesture', payload: { kind: 'release', x: 42, y: 61 } });
  for (let attempt = 0; attempt < 20 && !receivedGesture; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(receivedGesture, { kind: 'release', x: 42, y: 61 }, 'opponent gesture must arrive on the shared match channel');
  await Promise.all([friendHost.api.removeChannel(hostGestures), acceptedPlayer.api.removeChannel(guestGestures)]);
  const recoveredSession = await rpc(acceptedPlayer.api, 'duel_get_active_session');
  assert.equal(recoveredSession.id, accepted.session.id, 'active session must recover even when local session storage is missing');
  const hiddenInvite = await rejectedPlayer.api.from('duel_invites').select('id').eq('id', invitation.invite.id);
  assert.ifError(hiddenInvite.error);
  assert.equal(hiddenInvite.data.length, 0, 'non-participants must not read an invite room');
  const hiddenSession = await rejectedPlayer.api.from('duel_sessions').select('id').eq('id', accepted.session.id);
  assert.ifError(hiddenSession.error);
  assert.equal(hiddenSession.data.length, 0, 'non-participants must not read a friend session');

  let sessionRealtimeChoosing = false;
  const sessionRealtime = friendHost.api.channel(`qa-session-${accepted.session.id}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'duel_sessions', filter: `id=eq.${accepted.session.id}` }, (payload) => {
      if (payload.new?.status === 'choosing') sessionRealtimeChoosing = true;
    });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Session Realtime subscription timeout')), 6000);
    sessionRealtime.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(timeout); resolve(); } });
  });

  await waitUntil(accepted.match.startsAt + 700, accepted.match.serverNow);
  const friendWin = await rpc(friendHost.api, 'duel_claim', { p_match_id: accepted.match.id, p_elapsed_ms: 1450, p_attempts: 2, p_accuracy: 92 });
  assert.equal(friendWin.didWin, true);
  for (let attempt = 0; attempt < 20 && !sessionRealtimeChoosing; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(sessionRealtimeChoosing, true, 'finished round must advance the session over Realtime');
  const hostAfterRoundOne = await rpc(friendHost.api, 'duel_get_session', { p_session_id: accepted.session.id });
  const guestAfterRoundOne = await rpc(acceptedPlayer.api, 'duel_get_session', { p_session_id: accepted.session.id });
  assert.deepEqual([hostAfterRoundOne.status, hostAfterRoundOne.myScore, hostAfterRoundOne.opponentScore, hostAfterRoundOne.chooserIsMe], ['choosing', 1, 0, false]);
  assert.deepEqual([guestAfterRoundOne.myScore, guestAfterRoundOne.opponentScore, guestAfterRoundOne.chooserIsMe], [0, 1, true], 'round loser must choose the next cat');
  const friendHostProfile = await rpc(friendHost.api, 'duel_get_profile');
  const friendGuestProfile = await rpc(acceptedPlayer.api, 'duel_get_profile');
  assert.deepEqual([friendHostProfile.matches, friendHostProfile.wins, friendHostProfile.friendMatches, friendHostProfile.friendWins], [0, 0, 1, 1]);
  assert.deepEqual([friendGuestProfile.matches, friendGuestProfile.losses, friendGuestProfile.friendMatches, friendGuestProfile.friendLosses], [0, 0, 1, 1]);
  const friendLeague = await rpc(friendHost.api, 'duel_weekly_league');
  assert.equal(friendLeague.players.some((entry) => entry.isMe), false, 'friend wins must not enter the weekly league');

  const roundTwoSession = await rpc(acceptedPlayer.api, 'duel_choose_session_cat', { p_session_id: accepted.session.id, p_level: 10 });
  assert.deepEqual([roundTwoSession.status, roundTwoSession.round, roundTwoSession.selectedLevel, roundTwoSession.match.sessionRound], ['playing', 2, 10, 2]);
  const hostRoundTwo = await rpc(friendHost.api, 'duel_get_session', { p_session_id: accepted.session.id });
  assert.equal(hostRoundTwo.match.id, roundTwoSession.match.id, 'both players must receive the same next match');
  await waitUntil(roundTwoSession.match.startsAt + 700, roundTwoSession.match.serverNow);
  const guestWin = await rpc(acceptedPlayer.api, 'duel_claim', { p_match_id: roundTwoSession.match.id, p_elapsed_ms: 1600, p_attempts: 2, p_accuracy: 90 });
  assert.equal(guestWin.didWin, true);
  const hostAfterRoundTwo = await rpc(friendHost.api, 'duel_get_session', { p_session_id: accepted.session.id });
  assert.deepEqual([hostAfterRoundTwo.round, hostAfterRoundTwo.myScore, hostAfterRoundTwo.opponentScore, hostAfterRoundTwo.chooserIsMe], [3, 1, 1, true]);

  const roundThreeSession = await rpc(friendHost.api, 'duel_choose_session_cat', { p_session_id: accepted.session.id, p_level: 2 });
  assert.deepEqual([roundThreeSession.round, roundThreeSession.selectedLevel], [3, 2]);
  await waitUntil(roundThreeSession.match.startsAt + 700, roundThreeSession.match.serverNow);
  const friendDraw = await Promise.all([
    rpc(friendHost.api, 'duel_mark_failure', { p_match_id: roundThreeSession.match.id }),
    rpc(acceptedPlayer.api, 'duel_mark_failure', { p_match_id: roundThreeSession.match.id }),
  ]);
  assert.ok(friendDraw.some((match) => match.status === 'finished' && match.isDraw), 'friend session draw must finish the round');
  const afterRoundThree = await rpc(friendHost.api, 'duel_get_session', { p_session_id: accepted.session.id });
  assert.deepEqual([afterRoundThree.round, afterRoundThree.myScore, afterRoundThree.opponentScore], [4, 1, 1]);

  const expiredChoice = await admin.from('duel_sessions').update({ choice_deadline: new Date(Date.now() - 1000).toISOString() }).eq('id', accepted.session.id);
  assert.ifError(expiredChoice.error);
  const timeoutRound = await rpc(friendHost.api, 'duel_choose_session_cat', { p_session_id: accepted.session.id, p_level: null });
  assert.deepEqual([timeoutRound.status, timeoutRound.round, timeoutRound.selectedLevel], ['playing', 4, 2], 'choice timeout must repeat the previous cat without deadlock');
  const closedSession = await rpc(friendHost.api, 'duel_leave_session', { p_session_id: accepted.session.id });
  assert.equal(closedSession.status, 'closed');
  const guestClosedSession = await rpc(acceptedPlayer.api, 'duel_get_session', { p_session_id: accepted.session.id });
  assert.equal(guestClosedSession.opponentLeft, true, 'remaining player must see who left the session');
  assert.equal(await rpc(acceptedPlayer.api, 'duel_get_active_session'), null, 'closed room must not be restored as active');
  await friendHost.api.removeChannel(sessionRealtime);

  const cancelledInvitation = await rpc(friendHost.api, 'duel_create_invite', { p_nickname: friendHost.name, p_level: 4 });
  const cancelled = await rpc(friendHost.api, 'duel_cancel_invite', { p_invite_id: cancelledInvitation.invite.id });
  assert.equal(cancelled.status, 'cancelled');
  const cancelledPreview = await rpc(friendGuest.api, 'duel_preview_invite', { p_token: cancelledInvitation.token });
  assert.equal(cancelledPreview.state, 'cancelled');

  const hiddenLiveMatch = await friendThird.api.from('duel_matches').select('id').eq('id', second.match.id);
  assert.ifError(hiddenLiveMatch.error);
  assert.equal(hiddenLiveMatch.data.length, 0, 'non-participants must not read a live match');

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

  console.log('✓ remote auth, real-only random matching, named invites, selected first cat, endless session, three rounds, loser choice, timeout fallback, session Realtime, exit detection, isolated friend records, atomic winner, draw, profile, and live-only league verified');
} finally {
  if (createdUsers.length) {
    const ids = `(${createdUsers.join(',')})`;
    await admin.from('duel_sessions').delete().or(`host_id.in.${ids},guest_id.in.${ids}`);
    await admin.from('duel_invites').delete().or(`host_id.in.${ids},guest_id.in.${ids}`);
    await admin.from('duel_matches').delete().or(`player_one.in.${ids},player_two.in.${ids}`);
    await admin.from('duel_queue').delete().in('user_id', createdUsers);
    await admin.from('duel_runs').delete().in('user_id', createdUsers);
    await admin.from('duel_profiles').delete().in('user_id', createdUsers);
  }
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
