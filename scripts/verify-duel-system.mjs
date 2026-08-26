import { readFileSync, readdirSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migration = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql')).sort()
  .map((name) => readFileSync(new URL(name, migrationDirectory), 'utf8')).join('\n');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../src/duel/client.ts', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../docs/ONLINE_DUEL_SPEC.md', import.meta.url), 'utf8');

for (const table of ['duel_queue', 'duel_matches', 'duel_runs', 'duel_profiles']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `${table} schema missing`);
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`), `${table} RLS missing`);
}
for (const rpc of ['duel_find_or_join', 'duel_start_ghost', 'duel_claim', 'duel_finish_ghost', 'duel_forfeit', 'duel_mark_failure', 'duel_settle_failure', 'duel_get_profile', 'duel_weekly_league']) {
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

for (const behavior of ['beginDuel', 'resolveDuelCatch', 'resolveDuelFailure', 'finishGhostDuel', 'duelResult', 'duelLeague']) {
  assert.ok(app.includes(behavior), `${behavior} client flow missing`);
}
assert.match(app, /window\.scrollTo\(0, 0\)/, 'screen changes must reset scroll position');
for (const rpc of ['duel_find_or_join', 'duel_start_ghost', 'duel_claim', 'duel_finish_ghost', 'duel_forfeit', 'duel_mark_failure', 'duel_settle_failure', 'duel_get_profile', 'duel_weekly_league']) {
  assert.ok(client.includes(`'${rpc}'`), `${rpc} client binding missing`);
}
assert.match(client, /auth\.getUser\(\)/, 'persisted anonymous session must be verified with the auth server');
assert.match(client, /auth\.signOut\(\{ scope: 'local' \}\)/, 'revoked anonymous session must be locally discarded');
assert.match(client, /sessionPromise/, 'concurrent session recovery must be deduplicated');
assert.match(spec, /3초 안에 상대가 있으면 실시간 1:1/, '3-second live-to-ghost product rule missing');
assert.match(spec, /15초, 기회 5번/, 'shared round rule missing');
assert.match(spec, /익명 Auth ID와 게임용 랜덤 닉네임만/, 'data-minimization rule missing');

console.log('✓ realtime duel, ghost fallback, atomic winner, profile, weekly league, RLS, and privacy contracts verified');
