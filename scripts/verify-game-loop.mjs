import assert from 'node:assert/strict';
import { challengeDelta, compareChallengeResult, createCatchChallengeDeepLink, createCatchChallengeWebUrl, createLossChallengeDeepLink, createLossChallengeWebUrl, parseChallengeTarget } from '../src/challenge.ts';
import { calculateDailyScore } from '../src/scoring.ts';
import { isBetterResult, recordLevelBest, sanitizeLevelBests } from '../src/records.ts';
import { DEFAULT_START_LEVEL, mapLegacyLevel, nextUnlockedLevel, resolveInitialSelectedLevel, sanitizeCaughtLevels, sanitizeLevelId } from '../src/progress.ts';
import { canReleaseToCatch, distanceFromCatch, dodgeOpeningMs, isCatchGesture, isWithinReactiveRange, missDirection } from '../src/inputRules.ts';
import { getClosenessLabel } from '../src/lossCopy.ts';
import { urgencySecondFor } from '../src/timing.ts';
import { getGrade, sanitizeRewardIds } from '../src/data.ts';
import { averageHitAccuracy, getCatchMoment } from '../src/resultMoment.ts';
import { getDailyStreak, getWeeklyBest, recordDailyScore, sanitizeDailyBest, sanitizeDailyHistory, weekStart } from '../src/dailyProgress.ts';
import { GAME_CENTER_MIN_VERSION, isLeaderboardVersionSupported, normalizeLeaderboardScore } from '../src/gameCenter.ts';
import { safeStorageGet, safeStorageSet } from '../src/storage.ts';
import { analyticsKindFor } from '../src/telemetry.ts';
import { getResultPrimaryAction } from '../src/resultFlow.ts';
import { LEVELS } from '../src/levels.ts';

const result = { level: 7, elapsedMs: 3240, attempts: 2, accuracy: 91, grade: 'A', levelName: '깜빡냥', nearMisses: 1, verdict: '', reward: {}, mode: 'challenge' };
const catchLink = createCatchChallengeDeepLink(result);
const lossLink = createLossChallengeDeepLink({ level: 9, levelName: '철벽냥', reason: 'misses', elapsedMs: 8000, attempts: 5, nearMisses: 2, closestDistance: 30 });

const previousHighLevelTuning = [
  { moveDelay: 420, dodgeDelay: 265, hitRadius: 59 },
  { moveDelay: 380, dodgeDelay: 235, hitRadius: 57 },
  { moveDelay: 340, dodgeDelay: 205, hitRadius: 54 },
  { moveDelay: 310, dodgeDelay: 185, hitRadius: 52 },
  { moveDelay: 280, dodgeDelay: 165, hitRadius: 49 },
  { moveDelay: 245, dodgeDelay: 145, hitRadius: 46 },
];
LEVELS.slice(4).forEach((level, index) => {
  const previous = previousHighLevelTuning[index];
  for (const key of ['moveDelay', 'dodgeDelay', 'hitRadius']) {
    const ratio = level[key] / previous[key];
    assert.ok(ratio >= 1.04 && ratio <= 1.06, `Lv.${level.id} ${key}는 약 5% 완화되어야 합니다.`);
  }
});

assert.ok(catchLink.includes('level=7') && catchLink.includes('time=3240') && catchLink.includes('attempts=2'), '잡은 기록이 딥링크에 포함되어야 합니다.');
assert.ok(lossLink.includes('level=9') && lossLink.includes('from=loss'), '패배 공유는 같은 고양이 복수전으로 이어져야 합니다.');
assert.ok(createCatchChallengeWebUrl(result).startsWith('https://hachan-cat.vercel.app/?level=7'), '웹 공유도 친구 기록 도전으로 이어져야 합니다.');
assert.ok(createLossChallengeWebUrl({ level: 9, levelName: '철벽냥', reason: 'misses', elapsedMs: 8000, attempts: 5, nearMisses: 2, closestDistance: 30 }).includes('level=9'), '웹 패배 공유도 복수전으로 이어져야 합니다.');
assert.deepEqual(parseChallengeTarget('?level=7&time=3240&attempts=2&from=catch'), { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' });
assert.equal(parseChallengeTarget('?level=99&time=1'), null, '잘못된 도전 링크는 무시해야 합니다.');
assert.equal(parseChallengeTarget('?level=7.4&time=3240&attempts=2'), null, '소수 레벨을 반올림해 도전으로 받아들이면 안 됩니다.');
assert.equal(parseChallengeTarget('?level=7&from=catch'), null, '성공 기록 도전에는 시간과 시도 수가 모두 필요합니다.');
assert.equal(parseChallengeTarget('?level=10&time=600&attempts=4'), null, '보스 필수 명중보다 빠른 불가능 기록은 거부해야 합니다.');
assert.equal(parseChallengeTarget('?level=10&time=5000&attempts=9'), null, '기회 규칙상 성공할 수 없는 시도 수는 거부해야 합니다.');
assert.deepEqual(parseChallengeTarget('?level=9&from=loss&time=1&attempts=99'), { level: 9, source: 'loss' }, '패배 복수전은 조작된 성공 기록 값을 무시해야 합니다.');
assert.equal(challengeDelta(3000, { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' }), -240, '친구 기록 차이를 계산해야 합니다.');
assert.equal(compareChallengeResult(3000, 3, { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' })?.outcome, 'won', '더 빠르면 친구 기록을 이겨야 합니다.');
assert.equal(compareChallengeResult(3240, 1, { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' })?.outcome, 'won', '같은 시간이면 적은 시도 수가 이겨야 합니다.');
assert.equal(compareChallengeResult(3240, 2, { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' })?.outcome, 'tied', '시간과 시도 수가 같으면 동률이어야 합니다.');
assert.equal(compareChallengeResult(3240, 3, { level: 7, elapsedMs: 3240, attempts: 2, source: 'catch' })?.outcome, 'lost', '같은 시간이면 많은 시도 수가 져야 합니다.');

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
assert.equal(sanitizeLevelId('NaN', 3), 3, '깨진 선택 레벨은 안전한 기본값으로 복구해야 합니다.');
assert.equal(sanitizeLevelId('7', 3), 7, '문자열로 저장된 정상 레벨은 복구해야 합니다.');
assert.equal(DEFAULT_START_LEVEL, 3, '새 플레이어는 쉬운 두 마리를 건너뛴 추천 난이도에서 시작해야 합니다.');
assert.equal(resolveInitialSelectedLevel(null, null), 3, '저장 기록이 없으면 Lv.3을 선택해야 합니다.');
assert.equal(resolveInitialSelectedLevel('7', null), 7, '기존 사용자의 현재 선택 레벨을 보존해야 합니다.');
assert.equal(resolveInitialSelectedLevel(null, '6'), 3, '이전 20단계 선택 기록은 병합된 10단계로 복구해야 합니다.');
assert.equal(mapLegacyLevel(20), 10, '예전 마지막 레벨은 현재 마지막 레벨로 이동해야 합니다.');
assert.deepEqual(sanitizeCaughtLevels([2, 2, 99, '3', 1]), [1, 2], '도감 진행도는 유효한 레벨만 중복 없이 복구해야 합니다.');
assert.deepEqual(sanitizeRewardIds(['eokul', 'eokul', 'unknown', 4]), ['eokul'], '결과 카드 도감은 실제 보상 ID만 복구해야 합니다.');
assert.deepEqual(sanitizeLevelBests({ 2: { elapsedMs: 5000, attempts: 2, accuracy: 88, grade: 'A' }, 99: { elapsedMs: 1, attempts: 1, accuracy: 100, grade: 'S+' }, 3: { nope: true } }), { 2: { elapsedMs: 5000, attempts: 2, accuracy: 88, grade: 'A' } }, '개인 기록은 검증된 레벨과 수치만 복구해야 합니다.');
assert.equal(sanitizeDailyBest({ date: 'nope', score: 1 }), null, '깨진 오늘 최고 기록은 무시해야 합니다.');
assert.equal(sanitizeDailyBest({ date: '2026-02-31', score: 80_000, elapsedMs: 5000, attempts: 1, level: 5 }), null, '달력에 없는 날짜는 기록으로 복구하면 안 됩니다.');
assert.equal(isCatchGesture(80, 80), false, '빠른 탭으로는 잡히면 안 됩니다.');
assert.equal(isCatchGesture(80, 0), false, '빈 공간의 짧은 탭도 실제 시도로 세면 안 됩니다.');
assert.equal(isCatchGesture(300, 8), false, '머리 위에서 누르고만 있어도 잡히면 안 됩니다.');
assert.equal(isCatchGesture(220, 48), true, '누른 채 실제로 쫓아온 손만 포획할 수 있어야 합니다.');
assert.equal(distanceFromCatch(72, 50), 22, '근접도는 머리 중심이 아니라 성공 판정선까지의 부족 거리여야 합니다.');
assert.equal(distanceFromCatch(40, 50), 0, '성공 판정선 안쪽 거리는 0이어야 합니다.');
assert.equal(canReleaseToCatch(50, 50, 220, 48), true, '성공 신호는 실제 포획 가능한 순간에 켜져야 합니다.');
assert.equal(canReleaseToCatch(51, 50, 220, 48), false, '성공 반경 밖에서 성공 신호를 보여주면 안 됩니다.');
assert.equal(canReleaseToCatch(40, 50, 80, 48), false, '유효한 추적 동작 전에는 성공 신호를 보여주면 안 됩니다.');
assert.equal(isWithinReactiveRange(124, 50), true, '고양이는 성공 반경 바깥에서도 다가오는 손에 반응해야 합니다.');
assert.equal(isWithinReactiveRange(125, 50), false, '멀리 있는 손에는 성급하게 반응하면 안 됩니다.');
assert.ok(dodgeOpeningMs(1) > dodgeOpeningMs(10), '고난도일수록 회피 뒤 빈틈이 짧아야 합니다.');
assert.equal(dodgeOpeningMs(10), 280, '최종 보스도 사람이 반응할 최소 빈틈은 보장해야 합니다.');
assert.equal(missDirection(20, 50, 60, 52), '오른쪽', '빗나간 손에서 고양이 방향을 안내해야 합니다.');
assert.equal(missDirection(50, 80, 52, 40), '위', '세로 차이가 크면 위아래 방향을 안내해야 합니다.');
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
assert.equal(GAME_CENTER_MIN_VERSION, '5.221.0', '게임센터 최소 토스 앱 버전을 공식 지원 기준과 맞춰야 합니다.');
assert.equal(isLeaderboardVersionSupported({ isMinVersionSupported: () => false }), false, '미지원 토스 앱에서 리더보드를 연 것으로 처리하면 안 됩니다.');
assert.equal(isLeaderboardVersionSupported({ isMinVersionSupported: () => true }), true, '지원 토스 앱에서는 리더보드 호출을 허용해야 합니다.');
assert.equal(safeStorageGet('missing'), null, '저장소가 없는 환경에서도 읽기가 앱을 중단하면 안 됩니다.');
assert.equal(safeStorageSet('missing', 'value'), false, '저장소가 없는 환경에서는 실패를 안전하게 알려야 합니다.');
assert.equal(analyticsKindFor('game_start'), 'click', '사용자가 시작한 행동은 클릭 이벤트로 전송해야 합니다.');
assert.equal(analyticsKindFor('tutorial_start'), 'click', '튜토리얼 조작 시작은 클릭 이벤트로 전송해야 합니다.');
assert.equal(analyticsKindFor('loss_meme_share'), 'click', '패배 카드 공유도 사용자 클릭 이벤트로 전송해야 합니다.');
assert.equal(analyticsKindFor('game_catch'), 'impression', '게임 결과는 노출 이벤트로 전송해야 합니다.');
assert.equal(getResultPrimaryAction('campaign', 4, 10, null), 'next', '캠페인 승리 후에는 다음 고양이가 주 행동이어야 합니다.');
assert.equal(getResultPrimaryAction('daily', 6, 10, null), 'retry', '오늘의 한 판은 기록 단축 재도전이 주 행동이어야 합니다.');
assert.equal(getResultPrimaryAction('challenge', 7, 10, 'lost'), 'retry', '친구보다 느리면 기록 재도전이 주 행동이어야 합니다.');
assert.equal(getResultPrimaryAction('challenge', 7, 10, 'tied'), 'retry', '친구와 동률이면 한 판 더가 주 행동이어야 합니다.');
assert.equal(getResultPrimaryAction('challenge', 7, 10, 'won'), 'share', '친구 기록을 깨면 도발 공유가 주 행동이어야 합니다.');
assert.equal(getResultPrimaryAction('campaign', 10, 10, null), 'share', '최종 보스 뒤에는 획득 카드를 자랑하도록 이어져야 합니다.');

console.log('✓ challenge links, fair scoring, records, tension feedback, and analytics routing verified');
