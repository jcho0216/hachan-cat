import assert from 'node:assert/strict';
import { challengeDelta, createCatchChallengeDeepLink, createCatchChallengeWebUrl, createLossChallengeDeepLink, createLossChallengeWebUrl, parseChallengeTarget } from '../src/challenge.ts';
import { calculateDailyScore } from '../src/scoring.ts';
import { isBetterResult, recordLevelBest } from '../src/records.ts';
import { nextUnlockedLevel } from '../src/progress.ts';
import { distanceFromCatch, isCatchGesture } from '../src/inputRules.ts';
import { getClosenessLabel } from '../src/lossCopy.ts';
import { urgencySecondFor } from '../src/timing.ts';
import { getGrade } from '../src/data.ts';
import { averageHitAccuracy, getCatchMoment } from '../src/resultMoment.ts';
import { getDailyStreak, getWeeklyBest, recordDailyScore, sanitizeDailyHistory, weekStart } from '../src/dailyProgress.ts';
import { normalizeLeaderboardScore } from '../src/gameCenter.ts';
import { safeStorageGet, safeStorageSet } from '../src/storage.ts';

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
assert.equal(isCatchGesture(80, 80), false, '빠른 탭으로는 잡히면 안 됩니다.');
assert.equal(isCatchGesture(300, 8), false, '머리 위에서 누르고만 있어도 잡히면 안 됩니다.');
assert.equal(isCatchGesture(220, 48), true, '누른 채 실제로 쫓아온 손만 포획할 수 있어야 합니다.');
assert.equal(distanceFromCatch(72, 50), 22, '근접도는 머리 중심이 아니라 성공 판정선까지의 부족 거리여야 합니다.');
assert.equal(distanceFromCatch(40, 50), 0, '성공 판정선 안쪽 거리는 0이어야 합니다.');
assert.equal(urgencySecondFor(3001), 0, '막판 3초 전에는 긴급 상태가 아니어야 합니다.');
assert.equal(urgencySecondFor(2999), 3, '막판 카운트다운은 3초부터 시작해야 합니다.');
assert.equal(urgencySecondFor(1), 1, '마지막 순간까지 1초 긴급 상태를 유지해야 합니다.');
assert.equal(getClosenessLabel(Number.POSITIVE_INFINITY), '—', '시도하지 않은 패배에는 근접도를 만들지 않아야 합니다.');
assert.equal(getClosenessLabel(24), '코앞', '가까운 패배를 재도전 단서로 보여줘야 합니다.');
assert.equal(averageHitAccuracy(270, 90, 4), 90, '보스 정확도는 모든 필수 명중의 평균이어야 합니다.');
assert.equal(getGrade(96, 5000, 4, 4)[0], 'S+', '필수 보스 명중은 등급에서 실수로 계산하면 안 됩니다.');
assert.notEqual(getGrade(96, 5000, 4, 1)[0], 'S+', '일반 고양이의 추가 시도는 등급에 반영되어야 합니다.');
assert.equal(getCatchMoment({ elapsedMs: 5000, attempts: 4, accuracy: 94, nearMisses: 0, misses: 0 }, 4).label, '왕관 퍼펙트');
assert.equal(getCatchMoment({ elapsedMs: 14_200, attempts: 3, accuracy: 80, nearMisses: 1, misses: 2 }, 1).label, '0초대 역전');
const dailyHistory = [
  { date: '2026-08-24', score: 81_000, elapsedMs: 7000, attempts: 2, level: 5 },
  { date: '2026-08-25', score: 84_000, elapsedMs: 6200, attempts: 2, level: 6 },
];
assert.equal(weekStart('2026-08-25'), '2026-08-24', '주간 기록은 월요일부터 시작해야 합니다.');
assert.equal(getDailyStreak(dailyHistory, '2026-08-26'), 2, '오늘 플레이 전에는 어제까지의 연속 기록을 유지해야 합니다.');
assert.equal(getDailyStreak(dailyHistory, '2026-08-27'), 0, '하루를 건너뛰면 연속 기록이 끝나야 합니다.');
assert.equal(getWeeklyBest(dailyHistory, '2026-08-25')?.score, 84_000, '이번 주 개인 최고 점수를 찾아야 합니다.');
assert.equal(recordDailyScore(dailyHistory, { ...dailyHistory[1], score: 80_000 }).find((entry) => entry.date === '2026-08-25')?.score, 84_000, '같은 날 낮은 점수로 최고 기록을 덮으면 안 됩니다.');
assert.deepEqual(sanitizeDailyHistory([{ nope: true }]), [], '깨진 주간 기록은 안전하게 무시해야 합니다.');
assert.equal(normalizeLeaderboardScore(Number.POSITIVE_INFINITY), 0, '유효하지 않은 점수는 제출하면 안 됩니다.');
assert.equal(normalizeLeaderboardScore(120_000), 100_000, '리더보드 점수는 계산 가능한 최대값을 넘으면 안 됩니다.');
assert.equal(safeStorageGet('missing'), null, '저장소가 없는 환경에서도 읽기가 앱을 중단하면 안 됩니다.');
assert.equal(safeStorageSet('missing', 'value'), false, '저장소가 없는 환경에서는 실패를 안전하게 알려야 합니다.');

console.log('✓ challenge links, fair scoring, records, and tension feedback verified');
