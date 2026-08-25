import assert from 'node:assert/strict';
import { challengeDelta, createCatchChallengeDeepLink, createCatchChallengeWebUrl, createLossChallengeDeepLink, createLossChallengeWebUrl, parseChallengeTarget } from '../src/challenge.ts';
import { calculateDailyScore } from '../src/scoring.ts';
import { isBetterResult, recordLevelBest } from '../src/records.ts';
import { nextUnlockedLevel } from '../src/progress.ts';

const result = { level: 7, elapsedMs: 3240, attempts: 2, accuracy: 91, grade: 'A', levelName: '깜빡냥', nearMisses: 1, verdict: '', reward: {}, mode: 'challenge' };
const catchLink = createCatchChallengeDeepLink(result);
const lossLink = createLossChallengeDeepLink({ level: 9, levelName: '철벽냥', reason: 'misses', elapsedMs: 8000, attempts: 5, nearMisses: 2, closestDistance: 30 });

assert.ok(catchLink.includes('level=7') && catchLink.includes('time=3240') && catchLink.includes('attempts=2'), '잡은 기록이 딥링크에 포함되어야 합니다.');
assert.ok(lossLink.includes('level=9') && lossLink.includes('from=loss'), '패배 공유는 같은 고양이 복수전으로 이어져야 합니다.');
assert.ok(createCatchChallengeWebUrl(result).startsWith('https://hachan-cat.vercel.app/?level=7'), '웹 공유도 친구 기록 도전으로 이어져야 합니다.');
assert.ok(createLossChallengeWebUrl({ level: 9, levelName: '철벽냥', reason: 'misses', elapsedMs: 8000, attempts: 5, nearMisses: 2, closestDistance: 30 }).includes('level=9'), '웹 패배 공유도 복수전으로 이어져야 합니다.');
assert.deepEqual(parseChallengeTarget('?level=7&time=3240&attempts=2&from=catch'), { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' });
assert.equal(parseChallengeTarget('?level=99&time=1'), null, '잘못된 도전 링크는 무시해야 합니다.');
assert.equal(challengeDelta(3000, { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' }), -240, '친구 기록 차이를 계산해야 합니다.');

const cleanScore = calculateDailyScore(6000, 1, 5, 1);
const missedScore = calculateDailyScore(6000, 2, 5, 1);
const bossScore = calculateDailyScore(9000, 4, 10, 4);
assert.equal(cleanScore - missedScore, 2200, '불필요한 시도는 점수에서 차감되어야 합니다.');
assert.ok(Math.abs(cleanScore - bossScore) < 8000, '보스의 필수 명중 횟수는 점수에서 보정되어야 합니다.');

const first = recordLevelBest({}, result);
assert.equal(first.isNewBest, true);
assert.equal(isBetterResult({ elapsedMs: 3300, attempts: 1, accuracy: 100 }, first.bests[7]), false, '시간이 느리면 시도 수가 적어도 최고 기록이 아니어야 합니다.');
assert.equal(recordLevelBest(first.bests, { ...result, elapsedMs: 3100 }).isNewBest, true, '더 빠른 기록은 개인 최고 기록이어야 합니다.');
assert.equal(nextUnlockedLevel(3, 7, 'challenge'), 3, '친구 도전은 캠페인 진행도를 건너뛰면 안 됩니다.');
assert.equal(nextUnlockedLevel(3, 7, 'daily'), 3, '오늘의 한 판은 캠페인 진행도를 건너뛰면 안 됩니다.');
assert.equal(nextUnlockedLevel(3, 3, 'campaign'), 4, '캠페인 포획만 다음 레벨을 열어야 합니다.');

console.log('✓ challenge links, fair scoring, and personal bests verified');
