import { strict as assert } from 'node:assert';
import { getOpponentCatchReaction } from '../src/duel/taunts.ts';
import type { DuelOutcome } from '../src/duel/types.ts';

function outcome(overrides: Partial<DuelOutcome['match']> = {}): DuelOutcome {
  return {
    match: {
      id: 'reaction-test', level: 6, seed: 260826, startsAt: 0, expiresAt: 15_000,
      status: 'finished', opponentKind: 'live', matchSource: 'invite', opponentName: '뻔뻔한 참치맨',
      sessionId: 'reaction-session', sessionRound: 2,
      ghostElapsedMs: null, winnerId: 'opponent', winnerSide: null, winnerElapsedMs: 3_120,
      winnerAttempts: 1, winnerAccuracy: 96, isDraw: false, didWin: false, ...overrides,
    },
    localElapsedMs: null, localAttempts: 2, localAccuracy: 0, reason: 'opponent',
  };
}

const oneShot = getOpponentCatchReaction(outcome());
assert.equal(oneShot.title, '뻔뻔한 참치맨님 선착순');
assert.equal(oneShot.detail, '3.12초 만에 잡음 · 1번 시도');
assert.ok(['한 번에 잡았는데, 넌 뭐 함?', '첫 손에 끝. 설명 더 필요함?', '연습인 줄 알았는데 끝났네.'].includes(oneShot.taunt));
assert.deepEqual(getOpponentCatchReaction(outcome()), oneShot, 'same match must render the same taunt on both result visits');

const regular = getOpponentCatchReaction(outcome({ id: 'regular-test', winnerElapsedMs: 7_820, winnerAttempts: 4 }));
assert.match(regular.detail, /7\.82초 만에 잡음 · 4번 시도/);
assert.notEqual(regular.taunt, '');

console.log('✓ deterministic one-shot and regular real-opponent reactions verified');
