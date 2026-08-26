import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migration = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFileSync(new URL(name, migrationDirectory), 'utf8')).join('\n');
const firstCatchMigration = readFileSync(new URL('20260826080000_make_live_duels_first_catch_only.sql', migrationDirectory), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/duel/client.ts', import.meta.url), 'utf8');
const invite = readFileSync(new URL('../src/duel/invite.ts', import.meta.url), 'utf8');
const taunts = readFileSync(new URL('../src/duel/taunts.ts', import.meta.url), 'utf8');
const homeCard = readFileSync(new URL('../src/components/DuelHomeCard.tsx', import.meta.url), 'utf8');
const finishBurst = readFileSync(new URL('../src/components/DuelFinishBurst.tsx', import.meta.url), 'utf8');
const duelReady = readFileSync(new URL('../src/components/DuelReady.tsx', import.meta.url), 'utf8');
const nameSheet = readFileSync(new URL('../src/components/BattleNameSheet.tsx', import.meta.url), 'utf8');
const catPicker = readFileSync(new URL('../src/components/DuelCatPicker.tsx', import.meta.url), 'utf8');
const sessionRoom = readFileSync(new URL('../src/components/DuelSessionRoom.tsx', import.meta.url), 'utf8');
const nickname = readFileSync(new URL('../src/duel/nickname.ts', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../docs/ONLINE_DUEL_SPEC.md', import.meta.url), 'utf8');

for (const table of ['duel_queue', 'duel_matches', 'duel_runs', 'duel_profiles', 'duel_invites', 'duel_sessions']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} schema missing`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} RLS missing`);
}
for (const rpc of ['duel_find_or_join', 'duel_claim', 'duel_forfeit', 'duel_mark_failure', 'duel_settle_failure', 'duel_get_profile', 'duel_set_nickname', 'duel_weekly_league', 'duel_create_invite', 'duel_preview_invite', 'duel_accept_invite', 'duel_get_invite', 'duel_cancel_invite', 'duel_get_session', 'duel_get_active_session', 'duel_choose_session_cat', 'duel_leave_session']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`), `${rpc} missing`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${rpc} authenticated grant missing`);
}
assert.match(migration, /pg_advisory_xact_lock/, 'matchmaking must be serialized');
assert.match(migration, /for update;/, 'winner decision must lock the match row');
assert.match(firstCatchMigration, /FIRST_CATCH_ONLY/, 'multiplayer first-catch-only migration missing');
assert.match(firstCatchMigration, /p_elapsed_ms < 450[^;]+p_attempts < 1/s, 'server must accept catches after any elapsed time and attempt count');
assert.doesNotMatch(firstCatchMigration, /p_elapsed_ms not between 450 and 15000|p_attempts not between 1 and 5/, 'live catch validation must not retain the old upper limits');
assert.match(firstCatchMigration, /older client cannot turn a[\s\S]+create or replace function public\.duel_mark_failure[\s\S]+create or replace function public\.duel_settle_failure/, 'legacy multiplayer failure calls must be harmless');
assert.match(firstCatchMigration, /create trigger duel_matches_keep_live_match_open[\s\S]+starts_at \+ interval '24 hours'/, 'live matches must not retain the old 15-second expiry window');
assert.match(migration, /'serverNow'/, 'server clock synchronization missing');
assert.match(migration, /revoke execute on function public\.duel_record_profile[^;]+authenticated/, 'internal profile updater must not be client-callable');
assert.match(migration, /alter publication supabase_realtime add table public\.duel_matches/, 'match realtime publication missing');
assert.match(migration, /opponent_kind = 'live' and match_source = 'random'/, 'weekly league must count only real random opponents');
assert.match(migration, /token_hash bytea not null unique/, 'invite tokens must be stored as one-way hashes');
assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '2 minutes'\)/, 'friend invite must expire after two minutes');
assert.match(migration, /where token_hash = digest\(p_token, 'sha256'\) for update/, 'invite acceptance must lock the one-time token row');
assert.match(migration, /match_source in \('random', 'ghost', 'invite'\)/, 'match source separation missing');
assert.match(migration, /match_source <> 'invite'/, 'friend matches must not award weekly league points');
assert.match(migration, /friend_matches = duel_profiles\.friend_matches \+ 1/, 'friend record isolation missing');
assert.match(migration, /alter publication supabase_realtime add table public\.duel_invites/, 'invite realtime publication missing');
assert.match(migration, /create or replace function public\.duel_clean_nickname/, 'canonical server nickname validation missing');
assert.match(migration, /clean_name := trim\(regexp_replace\(clean_name, '\\s\+', ' ', 'g'\)\)/, 'server nickname cleanup must trim after removing invalid characters');
assert.match(migration, /left join public\.duel_profiles profile on profile\.user_id = weekly_wins\.user_id/, 'weekly league must use the current profile nickname');
assert.match(migration, /create trigger duel_matches_validate_nickname/, 'match snapshots must enforce canonical nickname validation');
assert.match(migration, /create trigger duel_matches_update_session/, 'finished rounds must atomically advance their session');
assert.match(migration, /next_chooser := room\.guest_id/, 'loser must receive the next cat choice');
assert.match(migration, /choice_deadline = now\(\) \+ interval '15 seconds'/, 'cat choice timeout missing');
assert.match(migration, /status = 'closed', left_by = me/, 'explicit session exit missing');
assert.match(migration, /interval '45 seconds'/, 'abandoned session detection missing');
assert.match(migration, /alter publication supabase_realtime add table public\.duel_sessions/, 'session realtime publication missing');
assert.match(migration, /revoke execute on function public\.duel_start_ghost\(text\) from authenticated/, 'ghost creation must be disabled for all clients');

for (const behavior of ['beginDuel', 'resolveDuelCatch', 'duelResult', 'duelLeague', 'startFriendDuelInvite', 'acceptFriendDuelInvite', 'watchDuelInvite', 'watchDuelSession', 'chooseNextSessionCat', 'leaveActiveDuelSession', 'switchInviteToRandom']) {
  assert.ok(app.includes(behavior), `${behavior} client flow missing`);
}
assert.doesNotMatch(app, /resolveDuelFailure/, 'multiplayer must never end because of misses, time, or visibility');
assert.match(app, /if \(mode === 'duel'\) \{\s*setDuelElapsedMs\(elapsedMs\);\s*return;/, 'multiplayer clock must count up without ending the round');
assert.match(app, /if \(mode !== 'duel' && nextMisses >= difficulty\.attemptsAllowed\)/, 'only non-multiplayer modes may end after five misses');
assert.match(app, /scrollRestoration = 'manual'/, 'browser scroll restoration must not hide screen headers');
assert.match(app, /useLayoutEffect\(\(\) => \{ window\.scrollTo\(0, 0\); \}, \[screen\]\)/, 'screen changes must reset scroll position before paint');
assert.match(app, /requestAnimationFrame\(\(\) => window\.scrollTo\(0, 0\)\)/, 'late WebView scroll restoration must be corrected after paint');
assert.match(app, /reason === 'opponent' \? 'duelBurst' : sessionRound \? 'duelSession' : 'duelResult'/, 'opponent first-catch and session result routing must remain distinct');
assert.match(finishBurst, /상대 손 번역기/, 'opponent catch reaction must clearly identify generated taunt copy');
assert.match(finishBurst, /setTimeout\(\(\) => doneRef\.current\(\), 2_200\)/, 'reaction beat must automatically continue to results');
for (const copy of ['그것밖에 안 되냐?', '거의 잡았네. 거의.', '한 번에 잡았는데, 넌 뭐 함?']) assert.ok(taunts.includes(copy), `contextual taunt missing: ${copy}`);
for (const mode of ['바로 붙기', '친구 지목전', '시비 걸기']) assert.ok(homeCard.includes(mode), `battle mode hierarchy missing: ${mode}`);
assert.match(styles, /html, body, #root \{ height: 100%;[^}]+overflow: hidden;/, 'WebView root must not restore a hidden page scroll position');
assert.match(styles, /\.duel-cat-picker[^}]+(?:\{|;)\s*height: calc\(100dvh - var\(--header-height\)\)[^}]+overflow-y: auto;/, 'friend cat picker must be a viewport-constrained scroll container');
assert.match(styles, /\.battle-name-backdrop \{[^}]+width: min\(100%,520px\)[^}]+left: 50%[^}]+translate: -50% 0;/, 'battle-name bottom-sheet layer must stay within the app maximum width');
assert.match(styles, /\.battle-name-backdrop \{[^}]+padding-inline: calc\(12px \+ var\(--ait-safe-left\)\) calc\(12px \+ var\(--ait-safe-right\)\);/, 'battle-name bottom sheet must preserve horizontal viewport gutters');
assert.match(styles, /\.battle-name-sheet \{[^}]+width: 100%;[^}]+max-width: 496px;/, 'battle-name panel must fit inside the app shell gutters');
assert.match(styles, /\.battle-name-sheet \{[^}]+min-width: 0;[^}]+overflow-x: hidden;/, 'battle-name panel must contain intrinsic child widths on iOS Safari');
assert.match(styles, /\.battle-name-sheet form \{[^}]+width: 100%;[^}]+min-width: 0;[^}]+grid-template-columns: minmax\(0,1fr\);/, 'battle-name form must use a shrinkable grid track');
assert.match(styles, /\.battle-name-sheet form > \* \{[^}]+min-width: 0;[^}]+max-width: 100%;/, 'every battle-name form child must stay inside the sheet');
assert.match(styles, /\.game-screen \{[^}]+position: relative;/, 'duel overlay must anchor to the game screen');
assert.match(styles, /\.duel-game-strip \{[^}]+position: absolute;/, 'duel status must not shrink the shared playfield');
assert.match(app, /pending\.intent === 'accept'\) await acceptFriendDuelInviteNow\(savedName\)/, 'invite acceptance must resume after first-time name confirmation');
assert.match(app, /pending\.intent === 'invite'\).*setScreen\('duelPicker'\)/, 'friend invite must resume at cat selection after first-time name confirmation');
assert.match(nameSheet, /배틀에서 뭐라고 불러\?/, 'battle-name prompt copy missing');
assert.match(nameSheet, /하찮게 다시/, 'one-tap random name fallback missing');
assert.match(duelReady, /시간·기회 무제한/, 'duel ready screen must explain unlimited time and attempts');
assert.match(nickname, /CONFIRMED_KEY/, 'legacy generated names must remain distinguishable from confirmed player names');
for (const rpc of ['duel_find_or_join', 'duel_claim', 'duel_forfeit', 'duel_mark_failure', 'duel_settle_failure', 'duel_get_profile', 'duel_set_nickname', 'duel_weekly_league', 'duel_create_invite', 'duel_preview_invite', 'duel_accept_invite', 'duel_get_invite', 'duel_cancel_invite', 'duel_get_session', 'duel_get_active_session', 'duel_choose_session_cat', 'duel_leave_session']) {
  assert.ok(client.includes(`'${rpc}'`), `${rpc} client binding missing`);
}
assert.doesNotMatch(app, /startGhostDuel|finishGhostDuel/, 'player flow must never create or race a ghost');
assert.match(catPicker, /LEVELS\.map/, 'first-round picker must expose all ten cats');
assert.match(sessionRoom, /패자가|졌으니|복수할 냥이/, 'session loser-choice copy missing');
assert.match(sessionRoom, /ENDLESS FRIEND BATTLE/, 'persistent friend session identity missing');
assert.match(client, /auth\.getUser\(\)/, 'persisted anonymous session must be verified with the auth server');
assert.match(client, /auth\.signOut\(\{ scope: 'local' \}\)/, 'revoked anonymous session must be locally discarded');
assert.match(client, /sessionPromise/, 'concurrent session recovery must be deduplicated');
assert.match(client, /duel-gestures-\$\{matchId\}/, 'per-match opponent gesture broadcast channel missing');
assert.match(client, /broadcast: \{ self: false, ack: false \}/, 'gesture broadcast must not echo the local hand');
assert.match(app, /sendDuelGesture\('start', point\)/, 'duel press start must be broadcast');
assert.match(app, /sendDuelGesture\('move', point\)/, 'duel hand movement must be broadcast');
assert.match(app, /opponent-gesture/, 'opponent gesture must be rendered in the game field');
assert.doesNotMatch(app, /key=\{`opponent-gesture-/, 'gesture container must persist so coordinate interpolation stays continuous');
assert.match(app, /leadSeconds = gesture\.kind === 'move' \? \.09 : 0/, 'delayed gesture packets need short velocity prediction');
assert.match(styles, /opponentTapBurst/, 'opponent release needs a visible click burst');
assert.match(styles, /transition-duration: 155ms/, 'opponent hand must interpolate between throttled network updates');
assert.match(invite, /\?battle=\$\{encodeURIComponent\(token\)\}/, 'universal friend battle link missing');
assert.match(invite, /intoss:\/\/hachan-cat\/battle/, 'Apps-in-Toss friend battle deep link missing');
assert.match(invite, /sessionStorage/, 'active invite token must survive a WebView refresh');
assert.match(spec, /고스트를 생성하지 않는다/, 'real-player-only matchmaking rule missing');
assert.match(spec, /시간과 시도 횟수 제한 없이/, 'first-catch-only round rule missing');
assert.match(spec, /익명 Auth ID와 게임용 랜덤 닉네임만/, 'data-minimization rule missing');
assert.match(spec, /링크를 연 상대에게 방장 이름과 `도전 받기`/, 'explicit invite acceptance UX rule missing');
assert.match(spec, /주간 리그와 랭크 연승에서 제외/, 'friend battle ranking integrity rule missing');
assert.match(spec, /패자가 다음 고양이를 선택/, 'persistent session loser-choice rule missing');

console.log('✓ first-catch-only multiplayer, equal playfield, contained name sheet, matchmaking, sessions, atomic score, league, RLS, and privacy contracts verified');
