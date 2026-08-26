import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migration = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFileSync(new URL(name, migrationDirectory), 'utf8')).join('\n');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/duel/client.ts', import.meta.url), 'utf8');
const invite = readFileSync(new URL('../src/duel/invite.ts', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../docs/ONLINE_DUEL_SPEC.md', import.meta.url), 'utf8');

for (const table of ['duel_queue', 'duel_matches', 'duel_runs', 'duel_profiles', 'duel_invites']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} schema missing`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} RLS missing`);
}
for (const rpc of ['duel_find_or_join', 'duel_start_ghost', 'duel_claim', 'duel_finish_ghost', 'duel_forfeit', 'duel_mark_failure', 'duel_settle_failure', 'duel_get_profile', 'duel_weekly_league', 'duel_create_invite', 'duel_preview_invite', 'duel_accept_invite', 'duel_get_invite', 'duel_cancel_invite']) {
  assert.match(migration, new RegExp(`create or replace function public\\.${rpc}`), `${rpc} missing`);
  assert.match(migration, new RegExp(`grant execute on function public\\.${rpc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${rpc} authenticated grant missing`);
}
assert.match(migration, /pg_advisory_xact_lock/, 'matchmaking must be serialized');
assert.match(migration, /for update;/, 'winner decision must lock the match row');
assert.match(migration, /p_elapsed_ms not between 450 and 15000/, 'server catch window validation missing');
assert.match(migration, /p_attempts not between 1 and 5/, 'server attempt validation missing');
assert.match(migration, /'serverNow'/, 'server clock synchronization missing');
assert.match(migration, /revoke execute on function public\.duel_record_profile[^;]+authenticated/, 'internal profile updater must not be client-callable');
assert.match(migration, /alter publication supabase_realtime add table public\.duel_matches/, 'match realtime publication missing');
assert.match(migration, /opponent_kind = 'live' then 3 else 1/, 'weekly league must weight live wins above ghost wins');
assert.match(migration, /token_hash bytea not null unique/, 'invite tokens must be stored as one-way hashes');
assert.match(migration, /expires_at timestamptz not null default \(now\(\) \+ interval '2 minutes'\)/, 'friend invite must expire after two minutes');
assert.match(migration, /where token_hash = digest\(p_token, 'sha256'\) for update/, 'invite acceptance must lock the one-time token row');
assert.match(migration, /match_source in \('random', 'ghost', 'invite'\)/, 'match source separation missing');
assert.match(migration, /match_source <> 'invite'/, 'friend matches must not award weekly league points');
assert.match(migration, /friend_matches = duel_profiles\.friend_matches \+ 1/, 'friend record isolation missing');
assert.match(migration, /alter publication supabase_realtime add table public\.duel_invites/, 'invite realtime publication missing');

for (const behavior of ['beginDuel', 'resolveDuelCatch', 'resolveDuelFailure', 'finishGhostDuel', 'duelResult', 'duelLeague', 'startFriendDuelInvite', 'acceptFriendDuelInvite', 'watchDuelInvite', 'switchInviteToRandom']) {
  assert.ok(app.includes(behavior), `${behavior} client flow missing`);
}
assert.match(app, /scrollRestoration = 'manual'/, 'browser scroll restoration must not hide screen headers');
assert.match(app, /useLayoutEffect\(\(\) => \{ window\.scrollTo\(0, 0\); \}, \[screen\]\)/, 'screen changes must reset scroll position before paint');
assert.match(app, /requestAnimationFrame\(\(\) => window\.scrollTo\(0, 0\)\)/, 'late WebView scroll restoration must be corrected after paint');
for (const rpc of ['duel_find_or_join', 'duel_start_ghost', 'duel_claim', 'duel_finish_ghost', 'duel_forfeit', 'duel_mark_failure', 'duel_settle_failure', 'duel_get_profile', 'duel_weekly_league', 'duel_create_invite', 'duel_preview_invite', 'duel_accept_invite', 'duel_get_invite', 'duel_cancel_invite']) {
  assert.ok(client.includes(`'${rpc}'`), `${rpc} client binding missing`);
}
assert.match(client, /auth\.getUser\(\)/, 'persisted anonymous session must be verified with the auth server');
assert.match(client, /auth\.signOut\(\{ scope: 'local' \}\)/, 'revoked anonymous session must be locally discarded');
assert.match(client, /sessionPromise/, 'concurrent session recovery must be deduplicated');
assert.match(invite, /\?battle=\$\{encodeURIComponent\(token\)\}/, 'universal friend battle link missing');
assert.match(invite, /intoss:\/\/hachan-cat\/battle/, 'Apps-in-Toss friend battle deep link missing');
assert.match(invite, /sessionStorage/, 'active invite token must survive a WebView refresh');
assert.match(spec, /3초 안에 상대가 있으면 실시간 1:1/, '3-second live-to-ghost product rule missing');
assert.match(spec, /15초, 기회 5번/, 'shared round rule missing');
assert.match(spec, /익명 Auth ID와 게임용 랜덤 닉네임만/, 'data-minimization rule missing');
assert.match(spec, /링크를 연 상대에게 방장 이름과 `도전 받기`/, 'explicit invite acceptance UX rule missing');
assert.match(spec, /주간 리그와 랭크 연승에서 제외/, 'friend battle ranking integrity rule missing');

console.log('✓ realtime duel, friend invite, explicit acceptance, ghost fallback, atomic winner, isolated records, weekly league, RLS, and privacy contracts verified');
