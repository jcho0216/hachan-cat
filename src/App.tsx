import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CatCharacter } from './components/CatCharacter';
import { LossCard } from './components/LossCard';
import { RewardCard } from './components/RewardCard';
import { REWARDS, chooseReward, getGrade, sanitizeRewardIds } from './data';
import { LEVELS, getLevel } from './levels';
import { movementFor } from './movement';
import { saveLossMemeCard, saveMemeCard, shareChallenge, shareLossChallenge } from './share';
import { isShareCancellation } from './shareOutcome';
import type { CatPose } from './levels';
import type { MovementAim, Position } from './movement';
import type { GameLoss, GameMode, GameResult } from './types';
import { calculateDailyScore, DAILY_BEST_KEY, getDailyChallenge, readDailyBest } from './daily';
import { haptic, pauseAudio, playSound } from './feedback';
import { openLeaderboard, submitDailyScore } from './gameCenter';
import { track, trackScreen } from './telemetry';
import type { CatBehavior } from './levels';
import { compareChallengeResult, parseChallengeTarget, type ChallengeTarget } from './challenge';
import { LEVEL_BESTS_KEY, readLevelBests, recordLevelBest } from './records';
import { DEFAULT_START_LEVEL, mapLegacyLevel, nextUnlockedLevel, resolveInitialSelectedLevel, sanitizeCaughtLevels, sanitizeLevelId } from './progress';
import { canReleaseToCatch, distanceFromCatch, dodgeOpeningMs, isCatchGesture, isWithinReactiveRange, missDirection } from './inputRules';
import { urgencySecondFor } from './timing';
import { BEHAVIOR_GUIDES, phaseStepsFor } from './behaviorGuide';
import { averageHitAccuracy, getCatchMoment } from './resultMoment';
import { DAILY_HISTORY_KEY, getDailyStreak, getWeeklyBest, readDailyHistory, recordDailyScore } from './dailyProgress';
import { safeStorageGet, safeStorageSet } from './storage';
import { getResultPrimaryAction } from './resultFlow';
import { DuelHomeCard } from './components/DuelHomeCard';
import { DuelLobby } from './components/DuelLobby';
import { DuelReady } from './components/DuelReady';
import { DuelResult } from './components/DuelResult';
import { DuelLeague } from './components/DuelLeague';
import { DuelInviteAccept } from './components/DuelInviteAccept';
import { DuelInviteLobby } from './components/DuelInviteLobby';
import { isDuelConfigured } from './duel/config';
import { duelNickname as getDuelNickname } from './duel/nickname';
import { clearBattleInviteToken, parseBattleInviteToken, readStoredBattleInviteToken, shareBattleInvite, storeBattleInviteToken, stripBattleInviteFromUrl } from './duel/invite';
import type { DuelInvite, DuelInvitePreview, DuelLeague as DuelLeagueData, DuelMatch, DuelOutcome, DuelProfile } from './duel/types';

type Screen = 'home' | 'levels' | 'game' | 'ending' | 'result' | 'loss' | 'collection' | 'duelLobby' | 'duelReady' | 'duelResult' | 'duelLeague' | 'duelInvite' | 'duelInviteLobby';
type Aim = MovementAim & { x: number; y: number; clientX: number; clientY: number; startedAt: number; traveledPx: number };

const START_POSITION: Position = { x: 50, y: 50, tilt: 0 };
const COLLECTION_KEY = 'hachan-cat-collection-v1';
const LEGACY_CAUGHT_LEVELS_KEY = 'hachan-cat-caught-levels-v1';
const LEGACY_PROGRESS_KEY = 'hachan-cat-level-v1';
const LEGACY_SELECTED_LEVEL_KEY = 'hachan-cat-selected-level-v1';
const CAUGHT_LEVELS_KEY = 'hachan-cat-caught-levels-v2';
const PROGRESS_KEY = 'hachan-cat-level-v2';
const SELECTED_LEVEL_KEY = 'hachan-cat-selected-level-v2';
const MISS_TAUNTS = ['아무도 없는데?', '거긴 아까 있었어.', '화면은 잘 눌렀네.', '그것밖에 안되냐?', '한 번 더 해봐.'];
const NEAR_TAUNTS = ['오, 방금은 좀.', '수염만 스쳤네.', '이건 거의 인정.', '조금 늦었어.'];
const LEVEL_TAUNTS = ['아직 보는 중.', '그쪽 아니야.', '손 다 보이는데.', '다음은 어디?'];
const SOUND_KEY = 'hachan-cat-sound-v1';
const FIRST_PLAY_KEY = 'hachan-cat-first-play-v1';
const REACTIVE_POSES: CatPose[] = ['paddle', 'paddle', 'peek', 'leap', 'matrix', 'crab', 'flatten', 'windmill', 'butt', 'taunt'];
const DODGE_WORDS = ['슬쩍', '삭삭', '반대지', '급발진', '잔상!', '옆으로', '없지롱', '맘대로', '철벽', '어딜'];
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatSeconds = (elapsedMs: number) => `${(elapsedMs / 1000).toFixed(2)}초`;
const duelApi = () => import('./duel/client');
const DEV_DUEL_PREVIEW = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('duel-preview') : null;
const INITIAL_BATTLE_TOKEN = parseBattleInviteToken(window.location.search) || readStoredBattleInviteToken();
const DEV_DUEL_MATCH: DuelMatch = {
  id: 'preview-match', level: 6, seed: 260826, startsAt: Date.now() + 3000, expiresAt: Date.now() + 18000,
  status: 'finished', opponentKind: 'live', matchSource: 'invite', opponentName: '뻔뻔한 참치맨', ghostElapsedMs: null,
  winnerId: 'preview-user', winnerSide: 'player', winnerElapsedMs: 4280, winnerAttempts: 2, winnerAccuracy: 91, didWin: true,
  isDraw: false,
};
const DEV_DUEL_PROFILE: DuelProfile = { nickname: '손빠른 냥헌터', matches: 12, wins: 8, losses: 4, currentStreak: 3, bestStreak: 5, fastestWinMs: 3210, ghostWins: 3, friendMatches: 5, friendWins: 3, friendLosses: 2 };
const DEV_DUEL_LEAGUE: DuelLeagueData = { weekStartsAt: Date.now(), myRank: 4, players: [
  { rank: 1, nickname: '약오른 발바닥', wins: 14, points: 34, fastestWinMs: 2680, isMe: false },
  { rank: 2, nickname: '진심인 츄르단', wins: 11, points: 27, fastestWinMs: 3010, isMe: false },
  { rank: 3, nickname: '졸린 소파왕', wins: 9, points: 23, fastestWinMs: 2890, isMe: false },
  { rank: 4, nickname: '손빠른 냥헌터', wins: 8, points: 18, fastestWinMs: 3210, isMe: true },
] };
const DEV_DUEL_INVITE: DuelInvite = { id: 'preview-invite', status: 'waiting', hostName: '손빠른 냥헌터', guestName: null, expiresAt: Date.now() + 94_000, isHost: true, isGuest: false, match: null };
const DEV_DUEL_INVITE_PREVIEW: DuelInvitePreview = { state: 'ready', hostName: '뻔뻔한 참치맨', expiresAt: Date.now() + 87_000, invite: null };
const readLegacyCaughtLevels = () => {
  try {
    const legacy = JSON.parse(safeStorageGet(LEGACY_CAUGHT_LEVELS_KEY) ?? '[]');
    if (!Array.isArray(legacy)) return [];
    return sanitizeCaughtLevels(legacy.filter((item): item is number => typeof item === 'number').map(mapLegacyLevel), LEVELS.length);
  } catch { return []; }
};

function App() {
  const [screen, setScreen] = useState<Screen>(() => DEV_DUEL_PREVIEW === 'lobby' ? 'duelLobby' : DEV_DUEL_PREVIEW === 'ready' ? 'duelReady' : DEV_DUEL_PREVIEW === 'result' ? 'duelResult' : DEV_DUEL_PREVIEW === 'league' ? 'duelLeague' : DEV_DUEL_PREVIEW === 'invite' ? 'duelInvite' : DEV_DUEL_PREVIEW === 'invite-lobby' ? 'duelInviteLobby' : INITIAL_BATTLE_TOKEN ? 'duelInvite' : 'home');
  const [attempts, setAttempts] = useState(0);
  const [misses, setMisses] = useState(0);
  const [nearMisses, setNearMisses] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState(() => {
    return resolveInitialSelectedLevel(safeStorageGet(SELECTED_LEVEL_KEY), safeStorageGet(LEGACY_SELECTED_LEVEL_KEY), LEVELS.length);
  });
  const [activeLevel, setActiveLevel] = useState(selectedLevel);
  const [unlockedLevel, setUnlockedLevel] = useState(() => {
    const saved = safeStorageGet(PROGRESS_KEY);
    if (saved) return sanitizeLevelId(saved, 3, LEVELS.length);
    const migratedCaught = readLegacyCaughtLevels();
    if (migratedCaught.length) return Math.min(LEVELS.length, Math.max(...migratedCaught) + 1);
    const legacyProgress = safeStorageGet(LEGACY_PROGRESS_KEY);
    return legacyProgress ? sanitizeLevelId(mapLegacyLevel(Number(legacyProgress)), 3, LEVELS.length) : 3;
  });
  const [caughtLevels, setCaughtLevels] = useState<number[]>(() => {
    try {
      const saved = safeStorageGet(CAUGHT_LEVELS_KEY);
      if (saved !== null) return sanitizeCaughtLevels(JSON.parse(saved), LEVELS.length);
    } catch { /* 기존 진행도에서 복구 */ }
    return readLegacyCaughtLevels();
  });
  const [position, setPosition] = useState(START_POSITION);
  const [pose, setPose] = useState<CatPose>('wiggle');
  const [bossHits, setBossHits] = useState(0);
  const [taunt, setTaunt] = useState('잡을 수 있으면.');
  const [tauntKey, setTauntKey] = useState(0);
  const [aim, setAim] = useState<Aim | null>(null);
  const [remainingMs, setRemainingMs] = useState(() => getLevel(selectedLevel).roundMs);
  const [feedback, setFeedback] = useState<{ key: number; text: string; near: boolean } | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [lossResult, setLossResult] = useState<GameLoss | null>(null);
  const [collectionTab, setCollectionTab] = useState<'levels' | 'memes'>('levels');
  const [collection, setCollection] = useState<string[]>(() => { try { return sanitizeRewardIds(JSON.parse(safeStorageGet(COLLECTION_KEY) ?? '[]')); } catch { return []; } });
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [mode, setMode] = useState<GameMode>('campaign');
  const [phaseBehavior, setPhaseBehavior] = useState<CatBehavior>(() => getLevel(selectedLevel).behavior);
  const [phaseKey, setPhaseKey] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => safeStorageGet(SOUND_KEY) !== 'off');
  const [dailyBest, setDailyBest] = useState(readDailyBest);
  const [dailyHistory, setDailyHistory] = useState(() => {
    const history = readDailyHistory();
    const legacyBest = readDailyBest();
    return history.length || !legacyBest ? history : [legacyBest];
  });
  const [leaderboardStatus, setLeaderboardStatus] = useState<'idle' | 'submitting' | 'submitted' | 'local'>('idle');
  const [toast, setToast] = useState('');
  const [attention, setAttention] = useState<'idle' | 'watch' | 'danger'>('idle');
  const [dodgeFx, setDodgeFx] = useState<{ key: number; x: number; y: number; label: string } | null>(null);
  const [dodgeOpening, setDodgeOpening] = useState(false);
  const [showGameGuide, setShowGameGuide] = useState(false);
  const [tutorialRetry, setTutorialRetry] = useState(false);
  const [levelBests, setLevelBests] = useState(readLevelBests);
  const [isNewBest, setIsNewBest] = useState(false);
  const [bestMessage, setBestMessage] = useState('');
  const [incomingChallenge, setIncomingChallenge] = useState<ChallengeTarget | null>(() => parseChallengeTarget(window.location.search));
  const [activeChallenge, setActiveChallenge] = useState<ChallengeTarget | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const [duelLobbyPhase, setDuelLobbyPhase] = useState<'connecting' | 'waiting' | 'ghost' | 'error'>('connecting');
  const [activeDuel, setActiveDuel] = useState<DuelMatch | null>(() => DEV_DUEL_PREVIEW === 'ready' || DEV_DUEL_PREVIEW === 'result' ? DEV_DUEL_MATCH : null);
  const [duelOutcome, setDuelOutcome] = useState<DuelOutcome | null>(() => DEV_DUEL_PREVIEW === 'result' ? { match: DEV_DUEL_MATCH, localElapsedMs: 4280, localAttempts: 2, localAccuracy: 91, reason: 'caught' } : null);
  const [duelCountdown, setDuelCountdown] = useState(3);
  const [duelProfile, setDuelProfile] = useState<DuelProfile | null>(() => DEV_DUEL_PREVIEW ? DEV_DUEL_PROFILE : null);
  const [duelLeague, setDuelLeague] = useState<DuelLeagueData | null>(() => DEV_DUEL_PREVIEW === 'league' ? DEV_DUEL_LEAGUE : null);
  const [duelLeagueStatus, setDuelLeagueStatus] = useState<'loading' | 'ready' | 'error'>(() => DEV_DUEL_PREVIEW === 'league' ? 'ready' : 'loading');
  const [duelInviteToken, setDuelInviteToken] = useState(INITIAL_BATTLE_TOKEN);
  const [duelInvite, setDuelInvite] = useState<DuelInvite | null>(() => DEV_DUEL_PREVIEW === 'invite-lobby' ? DEV_DUEL_INVITE : null);
  const [duelInvitePreview, setDuelInvitePreview] = useState<DuelInvitePreview>(() => DEV_DUEL_PREVIEW === 'invite' ? DEV_DUEL_INVITE_PREVIEW : { state: 'loading', hostName: '', expiresAt: 0, invite: null });
  const [duelInvitePhase, setDuelInvitePhase] = useState<'creating' | 'waiting' | 'expired' | 'error'>(() => DEV_DUEL_PREVIEW === 'invite-lobby' ? 'waiting' : 'creating');
  const [duelInviteBusy, setDuelInviteBusy] = useState(false);
  const [duelInviteRemaining, setDuelInviteRemaining] = useState(0);
  const [duelInviteShareOutcome, setDuelInviteShareOutcome] = useState<DuelOutcome | null>(null);
  const duelNickname = useMemo(getDuelNickname, []);
  const daily = useMemo(() => getDailyChallenge(), []);

  const fieldRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<Screen>('home');
  const nestedHistoryRef = useRef(false);
  const headRef = useRef<SVGRectElement>(null);
  const startedAt = useRef(Date.now());
  const moveStep = useRef(0);
  const aimRef = useRef<Aim | null>(null);
  const positionRef = useRef(START_POSITION);
  const attemptsRef = useRef(0);
  const missesRef = useRef(0);
  const bossHitsRef = useRef(0);
  const hitAccuracyTotalRef = useRef(0);
  const finishedRef = useRef(false);
  const nearMissesRef = useRef(0);
  const closestDistanceRef = useRef(Number.POSITIVE_INFINITY);
  const hiddenAtRef = useRef<number | null>(null);
  const reactedToAimRef = useRef(false);
  const practiceAttemptRef = useRef(false);
  const urgencySecondRef = useRef(0);
  const dodgeOpeningUntilRef = useRef(0);
  const dodgeOpeningTimerRef = useRef(0);
  const toastTimerRef = useRef(0);
  const duelRequestRef = useRef(0);
  const duelUnsubscribeRef = useRef<(() => void) | null>(null);
  const duelGhostTimerRef = useRef(0);
  const duelSettlementTimerRef = useRef(0);
  const duelInvitePollRef = useRef(0);
  const duelInviteUnsubscribeRef = useRef<(() => void) | null>(null);
  const duelInviteRefreshRef = useRef(false);
  const duelInviteWatchIdRef = useRef('');
  const duelResolvedRef = useRef(false);
  const activeDuelRef = useRef<DuelMatch | null>(null);
  const lastTrackedScreenRef = useRef('');
  const difficulty = getLevel(activeLevel);
  const selectedDifficulty = getLevel(selectedLevel);

  useEffect(() => { safeStorageSet(COLLECTION_KEY, JSON.stringify(collection)); }, [collection]);
  useEffect(() => { safeStorageSet(CAUGHT_LEVELS_KEY, JSON.stringify(caughtLevels)); }, [caughtLevels]);
  useEffect(() => {
    setCollection((current) => Array.from(new Set([...current, ...caughtLevels.flatMap((id) => REWARDS[id - 1]?.id ?? [])])));
  }, [caughtLevels]);
  useEffect(() => { safeStorageSet(PROGRESS_KEY, String(unlockedLevel)); }, [unlockedLevel]);
  useEffect(() => { safeStorageSet(SELECTED_LEVEL_KEY, String(selectedLevel)); }, [selectedLevel]);
  useEffect(() => { safeStorageSet(SOUND_KEY, soundEnabled ? 'on' : 'off'); }, [soundEnabled]);
  useEffect(() => { safeStorageSet(LEVEL_BESTS_KEY, JSON.stringify(levelBests)); }, [levelBests]);
  useEffect(() => { safeStorageSet(DAILY_HISTORY_KEY, JSON.stringify(dailyHistory)); }, [dailyHistory]);
  useEffect(() => { activeDuelRef.current = activeDuel; }, [activeDuel]);
  useLayoutEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [screen]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    const timer = window.setTimeout(() => window.scrollTo(0, 0), 80);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [screen]);
  useEffect(() => {
    if (!duelInviteToken) return;
    storeBattleInviteToken(duelInviteToken);
    stripBattleInviteFromUrl();
  }, [duelInviteToken]);
  useEffect(() => {
    if (screen !== 'duelInvite' || !duelInviteToken || DEV_DUEL_PREVIEW === 'invite') return;
    void inspectDuelInvite(duelInviteToken);
  }, [screen, duelInviteToken]);
  useEffect(() => {
    if (screen !== 'duelInvite' && screen !== 'duelInviteLobby') return;
    const expiresAt = screen === 'duelInvite' ? duelInvitePreview.expiresAt : duelInvite?.expiresAt ?? 0;
    if (!expiresAt) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setDuelInviteRemaining(seconds);
      if (seconds === 0) {
        if (screen === 'duelInvite' && ['ready', 'waiting'].includes(duelInvitePreview.state)) setDuelInvitePreview((current) => ({ ...current, state: 'expired' }));
        if (screen === 'duelInviteLobby' && duelInvitePhase === 'waiting') setDuelInvitePhase('expired');
      }
    };
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [screen, duelInvite?.expiresAt, duelInvitePreview.expiresAt, duelInvitePreview.state, duelInvitePhase]);
  useEffect(() => {
    let disposed = false;
    let disconnect: () => void = () => undefined;
    void duelApi().then(async (api) => {
      if (disposed) return;
      disconnect = api.connectDuelPresence(setOnlineCount);
      try { const profile = await api.getDuelProfile(); if (!disposed) setDuelProfile(profile); } catch { /* 첫 화면 전적은 부가 정보다. */ }
    });
    return () => { disposed = true; disconnect(); };
  }, []);
  useEffect(() => {
    screenRef.current = screen;
    if (screen === 'home') {
      if (nestedHistoryRef.current) { nestedHistoryRef.current = false; window.history.back(); }
      return;
    }
    if (!nestedHistoryRef.current) {
      nestedHistoryRef.current = true;
      window.history.pushState({ hachanApp: true }, '', window.location.href);
    }
  }, [screen]);
  useEffect(() => {
    const key = screen === 'game' || screen === 'result' || screen === 'loss' ? `${screen}:${mode}:${activeLevel}` : screen;
    if (lastTrackedScreenRef.current === key) return;
    lastTrackedScreenRef.current = key;
    trackScreen(screen, screen === 'game' || screen === 'result' || screen === 'loss' ? { mode, level: activeLevel } : {});
  }, [screen, mode, activeLevel]);
  useEffect(() => {
    window.history.replaceState({ hachanRoot: true }, '', window.location.href);
    const handleBack = () => {
      const previousScreen = screenRef.current;
      nestedHistoryRef.current = false;
      if (previousScreen === 'home') return;
      if (previousScreen === 'duelLobby' || previousScreen === 'duelReady' || previousScreen === 'duelResult' || previousScreen === 'duelInvite' || previousScreen === 'duelInviteLobby' || (previousScreen === 'game' && activeDuelRef.current)) {
        void abandonDuel('home');
        track('native_back', { from: previousScreen });
        return;
      }
      finishedRef.current = true;
      aimRef.current = null;
      setAim(null); setAttention('idle'); setScreen('home');
      track('native_back', { from: previousScreen });
    };
    window.addEventListener('popstate', handleBack);
    return () => window.removeEventListener('popstate', handleBack);
  }, []);
  useEffect(() => { aimRef.current = aim; }, [aim]);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        const wasPractice = practiceAttemptRef.current;
        practiceAttemptRef.current = false;
        aimRef.current = null;
        reactedToAimRef.current = false;
        setAim(null); setAttention('idle');
        if ((screen === 'game' || screen === 'duelReady') && activeDuelRef.current && !duelResolvedRef.current) {
          finishedRef.current = true;
          void resolveDuelFailure('time');
        } else if (screen === 'duelLobby') {
          void abandonDuel('home');
        }
        if (wasPractice && screen === 'game') setShowGameGuide(true);
        pauseAudio();
      } else if (hiddenAtRef.current) {
        if (screen === 'game') startedAt.current += Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [screen, mode]);
  useEffect(() => {
    if (screen !== 'ending') return;
    const timer = window.setTimeout(() => setScreen('result'), 2600);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'duelReady' || !activeDuel) return;
    if (DEV_DUEL_PREVIEW === 'ready') return;
    const update = () => setDuelCountdown(Math.max(0, Math.ceil((activeDuel.startsAt - Date.now()) / 1000)));
    update();
    const ticker = window.setInterval(update, 100);
    const launch = window.setTimeout(() => startGame(activeDuel.level, 'duel'), Math.max(0, activeDuel.startsAt - Date.now()));
    return () => { window.clearInterval(ticker); window.clearTimeout(launch); };
  }, [screen, activeDuel]);

  useEffect(() => {
    window.clearTimeout(duelGhostTimerRef.current);
    if (screen !== 'game' || mode !== 'duel' || activeDuel?.opponentKind !== 'ghost' || !activeDuel.ghostElapsedMs) return;
    const delay = Math.max(0, activeDuel.startsAt + activeDuel.ghostElapsedMs - Date.now());
    duelGhostTimerRef.current = window.setTimeout(async () => {
      if (duelResolvedRef.current || finishedRef.current) return;
      try {
        const match = await (await duelApi()).finishGhostDuel(activeDuel.id);
        if (match.status === 'finished') finishDuel(match, 'opponent');
      } catch { /* 다른 판정이 먼저 끝났으면 실시간 이벤트가 처리한다. */ }
    }, delay + 30);
    return () => window.clearTimeout(duelGhostTimerRef.current);
  }, [screen, mode, activeDuel]);

  useEffect(() => {
    if (screen !== 'game') return;
    if (showGameGuide) {
      setRemainingMs(difficulty.roundMs);
      return;
    }
    const clock = window.setInterval(() => {
      const left = Math.max(0, difficulty.roundMs - (Date.now() - startedAt.current));
      setRemainingMs(left);
      const urgencySecond = urgencySecondFor(left);
      if (!finishedRef.current && urgencySecond && urgencySecondRef.current !== urgencySecond) {
        urgencySecondRef.current = urgencySecond;
        playSound('countdown', soundEnabled);
        void haptic(urgencySecond === 1 ? 'tickMedium' : 'tickWeak');
      }
      if (left === 0 && !finishedRef.current) {
        finishedRef.current = true;
        if (mode === 'duel') { void resolveDuelFailure('time'); return; }
        setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'time', elapsedMs: difficulty.roundMs, attempts: attemptsRef.current, nearMisses: nearMissesRef.current, closestDistance: closestDistanceRef.current, mode });
        track('game_loss', { level: difficulty.id, reason: 'time', mode });
        void haptic('error'); playSound('miss', soundEnabled);
        setTaunt('끝났네.');
        setScreen('loss');
      }
    }, 60);

    let moveTimer = 0;
    const stepsPerPhase = phaseStepsFor(difficulty.moveDelay);
    const move = () => {
      if (finishedRef.current) return;
      const recoveryLeft = dodgeOpeningUntilRef.current - Date.now();
      if (recoveryLeft > 0) {
        moveTimer = window.setTimeout(move, Math.min(80, recoveryLeft));
        return;
      }
      const step = moveStep.current++;
      const activeBehavior = Math.floor(step / stepsPerPhase) % 2 === 0 ? difficulty.behavior : difficulty.secondaryBehavior;
      if (step % stepsPerPhase === 0) {
        setPhaseBehavior(activeBehavior); setPhaseKey((value) => value + 1);
        if (step > 0) { playSound('phase', soundEnabled); void haptic('tickWeak'); track('pattern_phase_seen', { level: difficulty.id, behavior: activeBehavior, mode }); }
      }
      const next = movementFor(activeBehavior, step, positionRef.current, aimRef.current, mode === 'daily' ? daily.seed : mode === 'duel' ? activeDuelRef.current?.seed ?? difficulty.id * 1009 : difficulty.id * 1009);
      positionRef.current = next;
      setPosition(next);
      setPose(step % stepsPerPhase === 0 ? BEHAVIOR_GUIDES[activeBehavior].pose : difficulty.poses[step % difficulty.poses.length]);
      if (step > 0 && step % stepsPerPhase === 0) { setTaunt(LEVEL_TAUNTS[(step + difficulty.id) % LEVEL_TAUNTS.length]); setTauntKey((value) => value + 1); }
      const hasRage = [difficulty.behavior, difficulty.secondaryBehavior].some((behavior) => behavior === 'rage' || behavior === 'overlord');
      const rageFactor = hasRage ? Math.max(.55, 1 - (Date.now() - startedAt.current) / difficulty.roundMs * .38) : 1;
      const tempoFactor = activeBehavior === 'tempo' && step % 3 === 0 ? 1.75 : 1;
      moveTimer = window.setTimeout(move, difficulty.moveDelay * rageFactor * tempoFactor);
    };
    moveTimer = window.setTimeout(move, 260);
    return () => { window.clearInterval(clock); window.clearTimeout(moveTimer); };
  }, [screen, difficulty, daily.seed, mode, soundEnabled, showGameGuide]);

  const collectionCount = useMemo(() => new Set(caughtLevels).size, [caughtLevels]);
  const isFreshPlayer = caughtLevels.length === 0 && Object.keys(levelBests).length === 0;
  const homeLevelLabel = isFreshPlayer ? selectedLevel === DEFAULT_START_LEVEL ? '추천 시작' : '선택한 상대' : '이어서 도전';
  const rewardCount = useMemo(() => new Set(collection.filter((id) => REWARDS.some((reward) => reward.id === id))).size, [collection]);
  const timeProgress = Math.round((remainingMs / difficulty.roundMs) * 100);
  const resultChallengeComparison = result ? compareChallengeResult(result.elapsedMs, result.attempts, activeChallenge) : null;
  const resultPrimaryAction = result ? getResultPrimaryAction(result.mode, result.level, LEVELS.length, resultChallengeComparison?.outcome ?? null) : 'share';
  const resultMoment = result ? getCatchMoment(result, getLevel(result.level).hitsRequired ?? 1) : null;
  const weeklyBest = getWeeklyBest(dailyHistory, daily.date);
  const dailyStreak = getDailyStreak(dailyHistory, daily.date);
  const completedToday = dailyHistory.some((entry) => entry.date === daily.date);

  function clearInviteWatch() {
    duelInviteUnsubscribeRef.current?.();
    duelInviteUnsubscribeRef.current = null;
    window.clearTimeout(duelInvitePollRef.current);
    duelInviteRefreshRef.current = false;
    duelInviteWatchIdRef.current = '';
  }

  function clearInviteLocal() {
    clearInviteWatch();
    clearBattleInviteToken();
    setDuelInviteToken('');
    setDuelInvite(null);
    setDuelInviteShareOutcome(null);
    setDuelInviteRemaining(0);
  }

  async function inspectDuelInvite(token = duelInviteToken) {
    if (!token || !isDuelConfigured) {
      setDuelInvitePreview({ state: 'error', hostName: '', expiresAt: 0, invite: null });
      return;
    }
    setDuelInvitePreview((current) => ({ ...current, state: 'loading' }));
    try {
      const preview = await (await duelApi()).previewDuelInvite(token);
      if (preview.invite?.isHost && preview.invite.status === 'waiting') {
        setDuelInvite(preview.invite);
        setDuelInvitePhase('waiting');
        watchDuelInvite(preview.invite);
        return;
      }
      if (preview.invite?.match && preview.invite.status === 'matched') {
        if (preview.invite.match.status === 'ready') { prepareDuel(preview.invite.match); return; }
        clearInviteLocal();
        setScreen('home');
        showNotice('이미 끝난 초대전이에요. 새 배틀을 열어주세요.');
        return;
      }
      setDuelInvitePreview(preview);
    } catch {
      setDuelInvitePreview({ state: 'error', hostName: '', expiresAt: 0, invite: null });
      track('duel_invite_preview_error');
    }
  }

  async function refreshDuelInvite(inviteId: string) {
    if (duelInviteRefreshRef.current) return;
    duelInviteRefreshRef.current = true;
    try {
      const room = await (await duelApi()).getDuelInvite(inviteId);
      setDuelInvite(room);
      if (room.status === 'matched' && room.match) {
        clearInviteWatch();
        if (room.match.status === 'ready') prepareDuel(room.match);
        else {
          clearInviteLocal();
          setScreen('home');
          showNotice('친구전이 이미 끝났어요. 새 초대장을 만들어주세요.');
        }
      } else if (room.status === 'expired' || room.status === 'cancelled') {
        clearInviteWatch();
        setDuelInvitePhase('expired');
      }
    } catch {
      // 다음 폴링이나 Realtime 이벤트가 다시 복구한다.
    } finally {
      duelInviteRefreshRef.current = false;
    }
  }

  function watchDuelInvite(room: DuelInvite) {
    clearInviteWatch();
    duelInviteWatchIdRef.current = room.id;
    setDuelInvite(room);
    setDuelInvitePhase(room.status === 'waiting' ? 'waiting' : room.status === 'expired' || room.status === 'cancelled' ? 'expired' : 'waiting');
    setScreen('duelInviteLobby');
    void duelApi().then(({ subscribeToDuelInvite }) => {
      if (duelInviteWatchIdRef.current !== room.id) return;
      duelInviteUnsubscribeRef.current = subscribeToDuelInvite(room.id, () => { void refreshDuelInvite(room.id); });
    });
    const poll = async () => {
      await refreshDuelInvite(room.id);
      if (duelInviteWatchIdRef.current === room.id) duelInvitePollRef.current = window.setTimeout(poll, 900);
    };
    duelInvitePollRef.current = window.setTimeout(poll, 700);
  }

  async function shareCurrentDuelInvite() {
    if (!duelInviteToken || duelInviteBusy) return;
    setDuelInviteBusy(true);
    try {
      const channel = await shareBattleInvite(duelInviteToken, duelNickname, duelInviteShareOutcome);
      showNotice(channel === 'clipboard' ? '배틀 링크를 복사했어요. 친구에게 붙여넣기!' : '초대장을 열었어요. 이제 친구 고르기.');
      track('duel_invite_share', { source: duelInviteShareOutcome ? 'result' : 'home', channel });
    } catch (error) {
      showNotice(isShareCancellation(error) ? '공유는 취소됐지만 방은 열어뒀어요.' : '공유창을 못 열었어요. 다시 보내기를 눌러주세요.');
    } finally { setDuelInviteBusy(false); }
  }

  async function startFriendDuelInvite(outcome: DuelOutcome | null = null) {
    if (!isDuelConfigured || duelInviteBusy) { if (!isDuelConfigured) showNotice('온라인 대전 서버를 연결 중이에요.'); return; }
    ++duelRequestRef.current;
    clearDuelRealtime();
    clearInviteWatch();
    setDuelInvite(null);
    setDuelInviteShareOutcome(outcome);
    setDuelInvitePhase('creating');
    setDuelInviteBusy(true);
    setScreen('duelInviteLobby');
    track('duel_invite_create_start', { source: outcome ? 'result' : 'home' });
    try {
      const created = await (await duelApi()).createDuelInvite(duelNickname);
      setDuelInviteToken(created.token);
      storeBattleInviteToken(created.token);
      setDuelInvite(created.invite);
      setDuelInvitePhase('waiting');
      watchDuelInvite(created.invite);
      const channel = await shareBattleInvite(created.token, duelNickname, outcome);
      showNotice(channel === 'clipboard' ? '배틀 링크를 복사했어요.' : '친구에게 초대장을 보내세요.');
      track('duel_invite_created', { channel, source: outcome ? 'result' : 'home' });
    } catch (error) {
      if (isShareCancellation(error) && duelInvite) {
        showNotice('공유는 취소됐지만 방은 열어뒀어요.');
      } else if (isShareCancellation(error)) {
        showNotice('공유는 취소됐지만 초대방은 유지됩니다.');
      } else {
        setDuelInvitePhase('error');
        showNotice('초대장을 만들지 못했어요. 랜덤 대전은 바로 됩니다.');
        track('duel_invite_create_error');
      }
    } finally { setDuelInviteBusy(false); }
  }

  async function acceptFriendDuelInvite() {
    if (!duelInviteToken || duelInviteBusy) return;
    setDuelInviteBusy(true);
    try {
      const accepted = await (await duelApi()).acceptDuelInvite(duelInviteToken, duelNickname);
      if (accepted.state === 'matched' && accepted.match) {
        track('duel_invite_accepted');
        prepareDuel(accepted.match);
        return;
      }
      if (accepted.state === 'own' && accepted.invite) {
        setDuelInvite(accepted.invite);
        watchDuelInvite(accepted.invite);
        return;
      }
      setDuelInvitePreview({ state: accepted.state, hostName: accepted.hostName, expiresAt: accepted.expiresAt, invite: accepted.invite });
    } catch {
      setDuelInvitePreview((current) => ({ ...current, state: 'error' }));
      track('duel_invite_accept_error');
    } finally { setDuelInviteBusy(false); }
  }

  async function closeFriendDuelInvite(goHome = true) {
    const room = duelInvite;
    clearInviteWatch();
    if (room?.isHost && room.status === 'waiting') {
      try { await (await duelApi()).cancelDuelInvite(room.id); } catch { /* 만료된 방은 이미 닫혀 있다. */ }
    }
    clearInviteLocal();
    if (goHome) setScreen('home');
  }

  async function switchInviteToRandom() {
    await closeFriendDuelInvite(false);
    await beginDuel();
  }

  async function createInviteFromInviteScreen() {
    await closeFriendDuelInvite(false);
    await startFriendDuelInvite();
  }

  function clearDuelRealtime() {
    duelUnsubscribeRef.current?.();
    duelUnsubscribeRef.current = null;
    window.clearTimeout(duelGhostTimerRef.current);
    window.clearTimeout(duelSettlementTimerRef.current);
  }

  function finishDuel(match: DuelMatch, reason: DuelOutcome['reason'], localElapsedMs: number | null = null, localAttempts = attemptsRef.current, localAccuracy = 0) {
    if (duelResolvedRef.current) return;
    duelResolvedRef.current = true;
    finishedRef.current = true;
    clearDuelRealtime();
    clearInviteLocal();
    setActiveDuel(match);
    setDuelOutcome({ match, localElapsedMs, localAttempts, localAccuracy, reason });
    setScreen('duelResult');
    void haptic(match.didWin ? 'success' : 'error');
    playSound(match.didWin ? 'catch' : 'miss', soundEnabled);
    track('duel_finish', { kind: match.opponentKind, source: match.matchSource, won: match.didWin === true, reason, level: match.level });
    void duelApi().then((api) => api.getDuelProfile()).then(setDuelProfile).catch(() => undefined);
  }

  function prepareDuel(match: DuelMatch) {
    clearDuelRealtime();
    clearInviteWatch();
    duelResolvedRef.current = false;
    activeDuelRef.current = match;
    setActiveDuel(match);
    setDuelOutcome(null);
    setDuelCountdown(Math.max(0, Math.ceil((match.startsAt - Date.now()) / 1000)));
    void duelApi().then(({ subscribeToDuel }) => {
      if (activeDuelRef.current?.id !== match.id || duelResolvedRef.current) return;
      duelUnsubscribeRef.current = subscribeToDuel(match.id, (updated) => {
      activeDuelRef.current = updated;
      setActiveDuel(updated);
      if (updated.status === 'finished' && !duelResolvedRef.current) finishDuel(updated, updated.isDraw ? 'draw' : 'opponent');
      });
    });
    setScreen('duelReady');
    playSound('phase', soundEnabled);
    void haptic('tickMedium');
    track('duel_matched', { kind: match.opponentKind, source: match.matchSource, level: match.level });
  }

  async function beginDuel() {
    if (!isDuelConfigured) { showNotice('온라인 대전 서버를 연결 중이에요. 일반 도전은 바로 할 수 있어요.'); return; }
    const request = ++duelRequestRef.current;
    clearDuelRealtime();
    duelResolvedRef.current = false;
    setActiveDuel(null); setDuelOutcome(null); setDuelLobbyPhase('connecting'); setScreen('duelLobby');
    track('duel_matchmaking_start');
    try {
      const deadline = Date.now() + 3000;
      while (request === duelRequestRef.current && Date.now() < deadline) {
        const joined = await (await duelApi()).findOrJoinDuel(duelNickname);
        if (request !== duelRequestRef.current) return;
        if (joined.state === 'matched') { prepareDuel(joined.match); return; }
        setOnlineCount((count) => Math.max(count, joined.onlineCount));
        setDuelLobbyPhase('waiting');
        await new Promise((resolve) => window.setTimeout(resolve, 650));
      }
      if (request !== duelRequestRef.current) return;
      setDuelLobbyPhase('ghost');
      const ghost = await (await duelApi()).startGhostDuel(duelNickname);
      if (request !== duelRequestRef.current) return;
      if (ghost.state === 'matched') prepareDuel(ghost.match);
      else throw new Error('GHOST_MATCH_FAILED');
    } catch {
      if (request === duelRequestRef.current) setDuelLobbyPhase('error');
      track('duel_matchmaking_error');
    }
  }

  async function abandonDuel(goTo: Screen = 'home') {
    ++duelRequestRef.current;
    const match = activeDuelRef.current;
    const room = duelInvite;
    clearDuelRealtime();
    clearInviteWatch();
    if (match?.status === 'ready' && (screenRef.current === 'game' || screenRef.current === 'duelReady')) {
      void duelApi().then((api) => api.forfeitDuel(match.id)).catch(() => undefined);
    } else {
      void duelApi().then((api) => api.leaveDuel()).catch(() => undefined);
    }
    if (room?.isHost && room.status === 'waiting') {
      void duelApi().then((api) => api.cancelDuelInvite(room.id)).catch(() => undefined);
    }
    clearInviteLocal();
    finishedRef.current = true;
    activeDuelRef.current = null;
    setActiveDuel(null); setDuelOutcome(null); setScreen(goTo);
  }

  async function resolveDuelCatch(elapsedMs: number, duelAttempts: number, accuracy: number) {
    const match = activeDuelRef.current;
    if (!match) return;
    try {
      const resolved = await (await duelApi()).claimDuel(match.id, elapsedMs, duelAttempts, accuracy);
      finishDuel(resolved, resolved.didWin ? 'caught' : 'opponent', elapsedMs, duelAttempts, accuracy);
    } catch {
      const fallback = { ...match, status: 'finished' as const, didWin: false };
      finishDuel(fallback, 'connection', elapsedMs, duelAttempts, accuracy);
    }
  }

  async function resolveDuelFailure(reason: 'time' | 'misses') {
    const match = activeDuelRef.current;
    if (!match) return;
    try {
      const api = await duelApi();
      const marked = await api.markDuelFailure(match.id);
      if (marked.status === 'finished') { finishDuel(marked, marked.isDraw ? 'draw' : reason, null, attemptsRef.current, 0); return; }
      setFeedback({ key: Date.now(), text: '상대 판정 확인 중…', near: true });
      duelSettlementTimerRef.current = window.setTimeout(async () => {
        if (duelResolvedRef.current) return;
        try {
          const settled = await api.settleDuelFailure(match.id);
          finishDuel(settled, settled.isDraw ? 'draw' : reason, null, attemptsRef.current, 0);
        } catch { finishDuel({ ...match, status: 'finished', isDraw: false, didWin: false }, 'connection', null, attemptsRef.current, 0); }
      }, 760);
    } catch { finishDuel({ ...match, status: 'finished', isDraw: false, didWin: false }, 'connection', null, attemptsRef.current, 0); }
  }

  async function openDuelLeague() {
    if (!isDuelConfigured) { showNotice('온라인 대전 서버를 연결 중이에요.'); return; }
    setDuelLeagueStatus('loading'); setScreen('duelLeague');
    try {
      const api = await duelApi();
      const [league, profile] = await Promise.all([api.getDuelWeeklyLeague(), api.getDuelProfile()]);
      setDuelLeague(league); setDuelProfile(profile); setDuelLeagueStatus('ready');
    } catch { setDuelLeagueStatus('error'); }
  }

  function startGame(levelId = selectedLevel, nextMode: GameMode = 'campaign') {
    const safeLevel = nextMode === 'daily' || nextMode === 'challenge' || nextMode === 'duel' ? clamp(levelId, 1, LEVELS.length) : Math.min(levelId, unlockedLevel, LEVELS.length);
    const isFirstPlay = nextMode === 'campaign' && safeStorageGet(FIRST_PLAY_KEY) !== 'seen';
    setActiveLevel(safeLevel);
    if (nextMode === 'campaign') setSelectedLevel(safeLevel);
    setMode(nextMode);
    setActiveChallenge(nextMode === 'challenge' ? incomingChallenge : null);
    startedAt.current = nextMode === 'duel' && activeDuelRef.current ? activeDuelRef.current.startsAt : Date.now();
    window.clearTimeout(dodgeOpeningTimerRef.current);
    moveStep.current = 0; attemptsRef.current = 0; missesRef.current = 0; bossHitsRef.current = 0; hitAccuracyTotalRef.current = 0; urgencySecondRef.current = 0; dodgeOpeningUntilRef.current = 0; finishedRef.current = false; aimRef.current = null; positionRef.current = START_POSITION; reactedToAimRef.current = false; practiceAttemptRef.current = false;
    nearMissesRef.current = 0; closestDistanceRef.current = Number.POSITIVE_INFINITY;
    setAttempts(0); setMisses(0); setNearMisses(0); setBossHits(0); setPose('wiggle'); setPosition(START_POSITION);
    setPhaseBehavior(getLevel(safeLevel).behavior); setPhaseKey((value) => value + 1);
    setTaunt(nextMode === 'duel' ? '상대 손도 뛰는 중.' : '잡을 수 있으면.'); setTauntKey((value) => value + 1); setAim(null); setFeedback(null); setAttention('idle'); setDodgeFx(null); setDodgeOpening(false);
    setShowGameGuide(isFirstPlay); setTutorialRetry(false);
    setRemainingMs(getLevel(safeLevel).roundMs); setResult(null); setLossResult(null); setIsNewBest(false); setBestMessage(''); setScreen('game');
    setLeaderboardStatus('idle');
    track('game_start', { level: safeLevel, mode: nextMode, firstPlay: isFirstPlay });
    if (isFirstPlay) track('tutorial_impression', { level: safeLevel });
  }

  function pointInField(clientX: number, clientY: number) {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clamp(clientX - rect.left, 0, rect.width);
    const y = clamp(clientY - rect.top, 0, rect.height);
    return { x, y, fieldX: x / rect.width * 100, fieldY: y / rect.height * 100 };
  }

  function moveCatAway(clientX: number, clientY: number, forcedPose?: CatPose) {
    const field = fieldRef.current?.getBoundingClientRect();
    const head = headRef.current?.getBoundingClientRect();
    if (!field || !head) return;
    const catX = head.left + head.width / 2;
    const catY = head.top + head.height / 2;
    const dx = catX - clientX;
    const dy = catY - clientY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const dash = 120 + difficulty.id * 4;
    const next = {
      x: clamp(((catX - field.left + dx / length * dash) / field.width) * 100, 15, 85),
      y: clamp(((catY - field.top + dy / length * dash * .82) / field.height) * 100, 23, 77),
      tilt: dx > 0 ? 14 : -14,
    };
    positionRef.current = next;
    setPosition(next);
    setPose(forcedPose ?? (difficulty.id >= 9 ? 'butt' : difficulty.id >= 5 ? 'matrix' : 'paddle'));
  }

  function triggerReactiveDodge(clientX: number, clientY: number) {
    const poseIndex = clamp(difficulty.id - 1, 0, REACTIVE_POSES.length - 1);
    const forcedPose = REACTIVE_POSES[poseIndex];
    setDodgeFx({ key: Date.now(), x: positionRef.current.x, y: positionRef.current.y, label: DODGE_WORDS[poseIndex] });
    setPose(forcedPose);
    setTaunt(difficulty.id >= 8 ? ['늦었어.', '그 손 다 보여.', '그것밖에 안되냐?', '한 번 더 와봐.'][moveStep.current % 4] : NEAR_TAUNTS[(moveStep.current + difficulty.id) % NEAR_TAUNTS.length]);
    setTauntKey((value) => value + 1);
    moveCatAway(clientX, clientY, forcedPose);
    const openingMs = dodgeOpeningMs(difficulty.id);
    dodgeOpeningUntilRef.current = Date.now() + openingMs;
    setDodgeOpening(true);
    window.clearTimeout(dodgeOpeningTimerRef.current);
    dodgeOpeningTimerRef.current = window.setTimeout(() => { dodgeOpeningUntilRef.current = 0; setDodgeOpening(false); }, openingMs);
    setAttention('watch');
    void haptic('wiggle'); playSound('near', soundEnabled);
    track('reactive_dodge', { level: difficulty.id, behavior: phaseBehavior, mode, openingMs });
  }

  function handleAimStart(event: React.PointerEvent<HTMLDivElement>) {
    if (finishedRef.current) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextAim = { ...point, clientX: event.clientX, clientY: event.clientY, startedAt: Date.now(), traveledPx: 0, dx: 0, dy: 0 };
    reactedToAimRef.current = false; aimRef.current = nextAim; setAim(nextAim); setAttention('watch');
    if (showGameGuide) {
      practiceAttemptRef.current = true;
      startedAt.current = Date.now();
      moveStep.current = 0;
      setShowGameGuide(false); setTutorialRetry(false);
      track('tutorial_start', { level: difficulty.id });
    }
    void haptic('tickWeak'); playSound('aim', soundEnabled);
  }

  function handleAimMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = aimRef.current;
    if (!previous) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    const nextAim = { ...previous, ...point, clientX: event.clientX, clientY: event.clientY, traveledPx: previous.traveledPx + Math.hypot(point.x - previous.x, point.y - previous.y), dx: point.fieldX - previous.fieldX, dy: point.fieldY - previous.fieldY };
    aimRef.current = nextAim; setAim(nextAim);
    const head = headRef.current?.getBoundingClientRect();
    if (!head) return;
    const catX = head.left + head.width / 2;
    const catY = head.top + head.height / 2;
    const distance = Math.hypot(event.clientX - catX, event.clientY - catY);
    const visualRadius = Math.min(head.width, head.height) * .48;
    const hitRadius = Math.min(difficulty.hitRadius, visualRadius);
    const heldMs = Date.now() - nextAim.startedAt;
    const canCatch = canReleaseToCatch(distance, hitRadius, heldMs, nextAim.traveledPx);
    setAttention(canCatch ? 'danger' : 'watch');
    if (isWithinReactiveRange(distance, hitRadius) && !reactedToAimRef.current && heldMs >= difficulty.dodgeDelay) {
      reactedToAimRef.current = true;
      triggerReactiveDodge(event.clientX, event.clientY);
    }
  }

  function clearAim() { aimRef.current = null; setAim(null); setAttention('idle'); }

  function cancelAim() {
    const wasPractice = practiceAttemptRef.current;
    practiceAttemptRef.current = false;
    clearAim();
    window.clearTimeout(dodgeOpeningTimerRef.current); dodgeOpeningUntilRef.current = 0; setDodgeOpening(false);
    if (wasPractice) setShowGameGuide(true);
  }

  function handleAimRelease(event: React.PointerEvent<HTMLDivElement>) {
    const currentAim = aimRef.current;
    const head = headRef.current?.getBoundingClientRect();
    if (!currentAim || !head || finishedRef.current) { clearAim(); return; }
    const isPracticeAttempt = practiceAttemptRef.current;
    practiceAttemptRef.current = false;
    const nextAttempts = attemptsRef.current + 1;
    const catX = head.left + head.width / 2;
    const catY = head.top + head.height / 2;
    const distance = Math.hypot(event.clientX - catX, event.clientY - catY);
    const visualRadius = Math.min(head.width, head.height) * .48;
    const hitRadius = Math.min(difficulty.hitRadius, visualRadius);
    const missDistance = distanceFromCatch(distance, hitRadius);
    const direction = missDirection(event.clientX, event.clientY, catX, catY);
    const directionPast = direction === '위' || direction === '아래' ? `${direction}였어` : `${direction}이었어`;
    closestDistanceRef.current = Math.min(closestDistanceRef.current, missDistance);
    const accuracy = clamp(Math.round(100 - Math.max(0, distance - 8) * .85), 0, 100);
    const elapsedMs = Date.now() - startedAt.current;
    const heldMs = Date.now() - currentAim.startedAt;
    const validCatchGesture = isCatchGesture(heldMs, currentAim.traveledPx);
    clearAim();
    window.clearTimeout(dodgeOpeningTimerRef.current); dodgeOpeningUntilRef.current = 0; setDodgeOpening(false);

    if (!validCatchGesture) {
      if (isPracticeAttempt) {
        startedAt.current = Date.now();
        setRemainingMs(difficulty.roundMs);
        setShowGameGuide(true);
        setTutorialRetry(true);
      }
      setTaunt('탭 말고, 쫓아와.'); setTauntKey((value) => value + 1);
      setFeedback({ key: Date.now(), text: isPracticeAttempt ? '괜찮아, 다시 연습!' : '꾹 누르고 쫓아와!', near: true });
      void haptic('basicWeak'); playSound('miss', soundEnabled);
      track('invalid_tap', { level: difficulty.id, heldMs, traveledPx: Math.round(currentAim.traveledPx), mode, tutorial: isPracticeAttempt });
      return;
    }

    if (isPracticeAttempt) safeStorageSet(FIRST_PLAY_KEY, 'seen');

    if (distance <= hitRadius) {
      attemptsRef.current = nextAttempts; setAttempts(nextAttempts);
      const requiredHits = difficulty.hitsRequired ?? 1;
      const nextBossHits = bossHitsRef.current + 1;
      if (nextBossHits < requiredHits) {
        hitAccuracyTotalRef.current += accuracy;
        bossHitsRef.current = nextBossHits; setBossHits(nextBossHits); setPose('panic');
        setFeedback({ key: Date.now(), text: `${nextBossHits}/${requiredHits} 명중 · ${requiredHits - nextBossHits}번 더!`, near: true });
        setTaunt(nextBossHits + 1 === requiredHits ? '어, 다음은 좀 위험한데.' : '아직 남았어.'); setTauntKey((value) => value + 1);
        moveCatAway(event.clientX, event.clientY);
        void haptic('tickMedium'); playSound('hit', soundEnabled);
        return;
      }
      finishedRef.current = true;
      const averageAccuracy = averageHitAccuracy(hitAccuracyTotalRef.current, accuracy, requiredHits);
      if (mode === 'duel') {
        setFeedback({ key: Date.now(), text: '잡았다 · 서버 판정 중', near: true });
        void haptic('success'); playSound('catch', soundEnabled);
        void resolveDuelCatch(elapsedMs, nextAttempts, averageAccuracy);
        return;
      }
      const reward = chooseReward(difficulty.id);
      const [grade, verdict] = getGrade(averageAccuracy, elapsedMs, nextAttempts, requiredHits);
      const score = mode === 'daily' ? calculateDailyScore(elapsedMs, nextAttempts, difficulty.id, difficulty.hitsRequired ?? 1) : undefined;
      const nextResult: GameResult = { attempts: nextAttempts, misses: missesRef.current, elapsedMs, accuracy: averageAccuracy, nearMisses: nearMissesRef.current, level: difficulty.id, levelName: difficulty.name, grade, verdict, reward, mode, score };
      setResult(nextResult); setCollection((current) => [...current, reward.id]);
      const previousBest = levelBests[difficulty.id];
      const recorded = recordLevelBest(levelBests, nextResult);
      setLevelBests(recorded.bests); setIsNewBest(recorded.isNewBest);
      setBestMessage(recorded.isNewBest ? previousBest
        ? previousBest.elapsedMs > elapsedMs
          ? `이전보다 ${formatSeconds(previousBest.elapsedMs - elapsedMs)} 단축`
          : previousBest.attempts > nextAttempts ? `같은 시간 · 시도 ${nextAttempts}회로 갱신` : `같은 시간 · 정확도 ${averageAccuracy}%로 갱신`
        : '첫 개인 기록 등록' : '');
      setCaughtLevels((current) => current.includes(difficulty.id) ? current : [...current, difficulty.id]);
      setUnlockedLevel((current) => nextUnlockedLevel(current, difficulty.id, mode, LEVELS.length));
      setFeedback({ key: Date.now(), text: `잡았다 · ${averageAccuracy}%`, near: true });
      if (mode === 'daily' && score !== undefined) {
        const nextDailyEntry = { date: daily.date, score, elapsedMs, attempts: nextAttempts, level: difficulty.id };
        setDailyHistory((current) => recordDailyScore(current, nextDailyEntry));
        const best = readDailyBest();
        if (!best || best.date !== daily.date || score > best.score) {
          safeStorageSet(DAILY_BEST_KEY, JSON.stringify(nextDailyEntry)); setDailyBest(nextDailyEntry);
        }
        void syncLeaderboardScore(score, 'game_end');
      }
      track('game_catch', { level: difficulty.id, mode, elapsedMs, attempts: nextAttempts, score: score ?? 0, tutorial: isPracticeAttempt });
      void haptic(difficulty.id === LEVELS.length ? 'confetti' : 'success'); playSound('catch', soundEnabled);
      window.setTimeout(() => setScreen(difficulty.id === LEVELS.length && mode === 'campaign' ? 'ending' : 'result'), 500);
      return;
    }

    const nearRadius = hitRadius + 42;
    const isNear = distance <= nearRadius;
    if (isPracticeAttempt) {
      startedAt.current = Date.now();
      setRemainingMs(difficulty.roundMs);
      setTaunt('연습은 끝. 이제 진짜야.'); setTauntKey((value) => value + 1);
      setFeedback({ key: Date.now(), text: isNear ? `${direction} ${Math.ceil(missDistance)}px · 기회 유지` : `${directionPast} · 기회 유지`, near: isNear });
      moveCatAway(event.clientX, event.clientY);
      void haptic(isNear ? 'wiggle' : 'basicWeak'); playSound(isNear ? 'near' : 'miss', soundEnabled);
      track('practice_attempt', { level: difficulty.id, near: isNear, direction, distance: Math.ceil(missDistance) });
      return;
    }
    attemptsRef.current = nextAttempts; setAttempts(nextAttempts);
    if (isNear) { nearMissesRef.current += 1; setNearMisses(nearMissesRef.current); }
    const nextMisses = missesRef.current + 1;
    missesRef.current = nextMisses; setMisses(nextMisses);
    const pool = isNear ? NEAR_TAUNTS : MISS_TAUNTS;
    setTaunt(pool[nextAttempts % pool.length]); setTauntKey((value) => value + 1);
    setFeedback({ key: Date.now(), text: isNear ? `${direction} ${Math.ceil(missDistance)}px만 더!` : `${directionPast}!`, near: isNear });
    moveCatAway(event.clientX, event.clientY);
    void haptic(isNear ? 'wiggle' : 'basicWeak'); playSound(isNear ? 'near' : 'miss', soundEnabled);
    track('miss', { level: difficulty.id, near: isNear, mode, direction, distance: Math.ceil(missDistance) });
    if (nextMisses >= difficulty.attemptsAllowed) {
      finishedRef.current = true;
      if (mode === 'duel') { void resolveDuelFailure('misses'); return; }
      setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'misses', elapsedMs, attempts: nextAttempts, nearMisses: nearMissesRef.current, closestDistance: closestDistanceRef.current, mode });
      track('game_loss', { level: difficulty.id, reason: 'misses', mode });
      window.setTimeout(() => setScreen('loss'), 480);
    }
  }

  function showNotice(message: string) {
    window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2600);
  }

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    track('sound_toggle', { enabled: next });
    void haptic('tickWeak');
    playSound('aim', next);
  }

  async function handleSave() {
    if (!result || busy) return;
    setBusy('save');
    try { const channel = await saveMemeCard(result); showNotice(channel === 'native' ? '사진에 밈 카드 저장 완료.' : '밈 카드 다운로드를 시작했어요.'); track('meme_save', { level: result.level, result: 'success', channel }); }
    catch { showNotice('카드를 저장하지 못했어요. 한 번 더 눌러주세요.'); track('meme_save', { level: result.level, result: 'error' }); }
    finally { setBusy(null); }
  }
  async function handleShare() {
    if (!result || busy) return;
    setBusy('share');
    try { const channel = await shareChallenge(result); showNotice(channel === 'clipboard' ? '도전 링크 복사 완료. 친구에게 붙여넣기!' : '공유창을 열었어요. 이제 친구 고르기.'); track('meme_share', { level: result.level, result: 'opened', channel }); }
    catch (error) { const cancelled = isShareCancellation(error); showNotice(cancelled ? '공유를 취소했어요.' : '공유창을 열지 못했어요. 다시 시도해주세요.'); track('meme_share', { level: result.level, result: cancelled ? 'cancel' : 'error' }); }
    finally { setBusy(null); }
  }
  async function handleLossSave() {
    if (!lossResult || busy) return;
    setBusy('save');
    try { const channel = await saveLossMemeCard(lossResult); showNotice(channel === 'native' ? '패배 카드도 사진에 저장했어요.' : '패배 카드 다운로드를 시작했어요.'); track('loss_meme_save', { level: lossResult.level, result: 'success', channel }); }
    catch { showNotice('카드를 저장하지 못했어요. 한 번 더 눌러주세요.'); track('loss_meme_save', { level: lossResult.level, result: 'error' }); }
    finally { setBusy(null); }
  }
  async function handleLossShare() {
    if (!lossResult || busy) return;
    setBusy('share');
    try { const channel = await shareLossChallenge(lossResult); showNotice(channel === 'clipboard' ? '복수 링크 복사 완료. 친구에게 붙여넣기!' : '공유창을 열었어요. 복수할 친구 고르기.'); track('loss_meme_share', { level: lossResult.level, result: 'opened', channel }); }
    catch (error) { const cancelled = isShareCancellation(error); showNotice(cancelled ? '공유를 취소했어요.' : '공유창을 열지 못했어요. 다시 시도해주세요.'); track('loss_meme_share', { level: lossResult.level, result: cancelled ? 'cancel' : 'error' }); }
    finally { setBusy(null); }
  }
  async function syncLeaderboardScore(score: number, source: 'game_end' | 'leaderboard_open') {
    setLeaderboardStatus('submitting');
    const success = await submitDailyScore(score);
    setLeaderboardStatus(success ? 'submitted' : 'local');
    track('leaderboard_submit', { score, success, source });
    return success;
  }
  async function handleLeaderboard() {
    if (result?.mode === 'daily' && result.score !== undefined && leaderboardStatus === 'local') {
      await syncLeaderboardScore(result.score, 'leaderboard_open');
    }
    track('leaderboard_open', { source: screen });
    if (!await openLeaderboard()) showNotice('토스 앱 5.221 이상에서 전체 랭킹을 볼 수 있어요.');
  }

  const character = (caught = false) => <CatCharacter ref={caught ? undefined : headRef} caught={caught} reward={caught ? result?.reward : undefined} pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} attention={caught ? 'idle' : attention} />;
  const isDuelFlowScreen = ['duelLobby', 'duelReady', 'duelResult', 'duelInvite', 'duelInviteLobby'].includes(screen) || (screen === 'game' && mode === 'duel');

  return (
    <main className="app-shell">
      <header className="app-header"><button className="wordmark" onClick={() => isDuelFlowScreen ? void abandonDuel('home') : setScreen('home')} aria-label="홈으로">하찮냥<span>˙</span></button><div className="header-actions"><button className="sound-toggle" onClick={toggleSound} aria-label={soundEnabled ? '소리 끄기' : '소리 켜기'} aria-pressed={soundEnabled}>{soundEnabled ? '♪' : '×'}</button><button className="collection-link" onClick={() => isDuelFlowScreen ? void abandonDuel('collection') : setScreen('collection')} aria-label={`도감, 잡은 고양이 ${collectionCount}마리`}>도감 <strong>{collectionCount}</strong></button></div></header>

      {screen === 'home' && <section className="home-screen page-enter">
        <div className="home-copy"><span className="kicker">{incomingChallenge ? incomingChallenge.source === 'loss' ? '친구가 복수를 부탁함' : '피할 수 없는 기록 도착' : '잡으면 이기고, 놓치면 놀림받음'}</span><h1>{incomingChallenge ? <>친구 기록이,<br /><em>좀 건방지네?</em></> : <>이 고양이,<br /><em>한 번 잡아볼래?</em></>}</h1><p>{incomingChallenge ? '같은 고양이, 같은 규칙. 이번엔 당신 차례입니다.' : '꾹 누른 채 쫓아가세요. 머리에 닿았을 때 손을 떼면 성공.'}</p></div>
        <div className="home-character-wrap"><div className="speech-bubble">{incomingChallenge ? '남의 기록 깨는 게 제일 재밌지.' : '난 가만히 있을 생각 없는데.'}</div><CatCharacter pose={incomingChallenge ? 'taunt' : 'paddle'} evil={incomingChallenge ? getLevel(incomingChallenge.level).evil : 2} fur={incomingChallenge ? getLevel(incomingChallenge.level).fur : undefined} accent={incomingChallenge ? getLevel(incomingChallenge.level).accent : undefined} /><span className="floor-shadow" /></div>
        <div className="play-rule" aria-label="게임 방법"><span>☝</span><strong>꾹 누르고 쫓다가</strong><em>머리에서 손 떼기</em></div>
        {incomingChallenge ? <><div className="challenge-card"><div><span>{incomingChallenge.source === 'loss' ? '친구의 복수 요청' : '친구 기록 도착'}</span><strong>Lv.{incomingChallenge.level} {getLevel(incomingChallenge.level).name}</strong><p>{incomingChallenge.elapsedMs ? `친구 기록 ${formatSeconds(incomingChallenge.elapsedMs)} · ${incomingChallenge.attempts}회. 더 빠르게 잡기` : '친구가 놓친 고양이, 대신 잡아주기'}</p></div><button onClick={() => startGame(incomingChallenge.level, 'challenge')}>기록 깨기</button></div><button className="text-button" onClick={() => setIncomingChallenge(null)}>일단 내 게임부터 하기</button></> : <><DuelHomeCard configured={isDuelConfigured} onlineCount={onlineCount} profile={duelProfile} onPlay={() => void beginDuel()} onInvite={() => void startFriendDuelInvite()} onLeague={() => void openDuelLeague()} /><button className="level-select-button" onClick={() => setScreen('levels')}><span>{homeLevelLabel}</span><strong>Lv.{selectedDifficulty.id} {selectedDifficulty.name}</strong><i>10마리 보기 ›</i></button><div className="daily-card"><div><span>{daily.label}</span><strong>Lv.{daily.level.id} {daily.level.name}</strong><p>오늘은 모두 같은 움직임 · 오늘 최고 {dailyBest?.date === daily.date ? `${dailyBest.score.toLocaleString()}점` : '없음'}</p><small>{completedToday ? `${dailyStreak}일 연속 완료` : dailyStreak ? `오늘 잡으면 ${dailyStreak + 1}일 연속` : '오늘부터 연속 도전'} · 이번 주 내 최고 {weeklyBest ? `${weeklyBest.score.toLocaleString()}점` : '없음'}</small></div><button onClick={() => startGame(daily.level.id, 'daily')}>{completedToday ? '기록 단축' : '한 판 하기'}</button></div><button className="primary-button wobble-button" onClick={() => startGame()}>혼자 도전하기 <span>→</span></button><button className="rank-link" onClick={handleLeaderboard}>🏆 토스 전체 랭킹</button><p className="tiny-caption">모든 모드 15초 · 기회 5번 · 머리만 정답</p></>}
      </section>}

      {screen === 'duelLobby' && <DuelLobby nickname={duelNickname} onlineCount={onlineCount} phase={duelLobbyPhase} onCancel={() => void abandonDuel('home')} onPractice={() => { void abandonDuel('home'); startGame(); }} />}
      {screen === 'duelInvite' && <DuelInviteAccept preview={duelInvitePreview} remainingSeconds={duelInviteRemaining} busy={duelInviteBusy} onAccept={() => void acceptFriendDuelInvite()} onDecline={() => { clearInviteLocal(); setScreen('home'); }} onCreate={() => void createInviteFromInviteScreen()} onRetry={() => void inspectDuelInvite()} />}
      {screen === 'duelInviteLobby' && <DuelInviteLobby invite={duelInvite} phase={duelInvitePhase} remainingSeconds={duelInviteRemaining} nickname={duelNickname} busy={duelInviteBusy} onShare={() => void shareCurrentDuelInvite()} onRandom={() => void switchInviteToRandom()} onCancel={() => void closeFriendDuelInvite()} onCreate={() => void createInviteFromInviteScreen()} />}
      {screen === 'duelReady' && activeDuel && <DuelReady match={activeDuel} nickname={duelNickname} countdown={duelCountdown} />}
      {screen === 'duelResult' && duelOutcome && <DuelResult outcome={duelOutcome} profile={duelProfile} busy={duelInviteBusy} onRematch={() => void beginDuel()} onInvite={() => void startFriendDuelInvite(duelOutcome)} onHome={() => void abandonDuel('home')} />}
      {screen === 'duelLeague' && <DuelLeague league={duelLeague} profile={duelProfile} status={duelLeagueStatus} onPlay={() => void beginDuel()} onBack={() => setScreen('home')} onRetry={() => void openDuelLeague()} />}

      {screen === 'levels' && <section className="levels-screen page-enter">
        <div className="levels-heading"><span className="kicker">쉬운 척하는 10마리</span><h1>오늘은 누구부터?</h1><p>잡을수록 다음 고양이가 열려요. 회피법은 한 마리당 두 가지.</p></div>
        <div className="level-map">{LEVELS.map((level) => { const locked = level.id > unlockedLevel; const selected = level.id === selectedLevel; const best = levelBests[level.id]; return <button key={level.id} className={`level-card ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''}`} onClick={() => !locked && startGame(level.id)} disabled={locked} style={{ '--level-accent': level.accent } as React.CSSProperties}><span>{locked ? '🔒' : isFreshPlayer && level.id === DEFAULT_START_LEVEL ? `추천 · LV.${DEFAULT_START_LEVEL}` : `LV.${level.id}`}</span><strong>{locked ? '아직 숨어 있음' : level.name}</strong><p>{locked ? '앞 고양이를 먼저 잡아주세요.' : level.description}</p><i>{level.chapter}</i>{best && <small>BEST {formatSeconds(best.elapsedMs)} · {best.attempts}회</small>}</button>; })}</div>
        <button className="text-button" onClick={() => setScreen('home')}>홈으로</button>
      </section>}

      {screen === 'game' && <section className={`game-screen page-enter behavior-${phaseBehavior} phase-${phaseKey % 2} ${remainingMs <= 3000 ? 'is-urgent' : ''}`}>
        {mode === 'duel' && activeDuel && <div className="duel-game-strip"><span><i />{activeDuel.matchSource === 'invite' ? '친구 초대전' : activeDuel.opponentKind === 'live' ? '실시간 승부' : '고스트 승부'}</span><strong>VS {activeDuel.opponentName}</strong><small>{activeDuel.matchSource === 'invite' ? '친구전은 주간 리그 점수 제외' : '먼저 잡으면 즉시 승'}</small></div>}
        <div className="game-hud"><div className="attempt-counter"><span>Lv.{difficulty.id} {difficulty.name}</span><strong>시도 {attempts}회</strong></div>
          <div className="game-resources"><div className="chance-status"><span>기회 {difficulty.attemptsAllowed - misses}</span><div className="chance-lives" aria-label={`남은 기회 ${difficulty.attemptsAllowed - misses}`}>{Array.from({ length: difficulty.attemptsAllowed }, (_, index) => <i key={index} className={index < misses ? 'is-broken' : ''}>●</i>)}</div></div>
          {(difficulty.hitsRequired ?? 1) > 1 && <div className="boss-status"><span>명중 {bossHits}/{difficulty.hitsRequired}</span><div className="boss-lives" aria-label={`남은 명중 ${(difficulty.hitsRequired ?? 1) - bossHits}`}>{Array.from({ length: difficulty.hitsRequired ?? 1 }, (_, index) => <i key={index} className={index < bossHits ? 'is-broken' : ''}>♛</i>)}</div></div>}</div>
          <div className="round-status"><div><span>남은 시간</span><strong>{(remainingMs / 1000).toFixed(1)}s</strong></div><div className="fatigue-track" role="progressbar" aria-label="남은 시간" aria-valuemin={0} aria-valuemax={15} aria-valuenow={Math.ceil(remainingMs / 1000)}><i style={{ width: `${timeProgress}%` }} /></div></div>
        </div>
        <div ref={fieldRef} className={`game-field ${aim ? 'is-aiming' : ''} ${attention === 'danger' ? 'is-danger' : ''} ${result ? 'is-captured' : ''}`} onPointerDown={handleAimStart} onPointerMove={handleAimMove} onPointerUp={handleAimRelease} onPointerCancel={cancelAim} onLostPointerCapture={cancelAim} aria-label="고양이 잡기 구역">
          <div key={`phase-${phaseKey}`} className="phase-badge"><span>{mode === 'daily' ? '오늘의 움직임' : mode === 'challenge' ? '친구가 본 움직임' : mode === 'duel' ? '둘이 보는 움직임' : '지금은'}</span><strong>{BEHAVIOR_GUIDES[phaseBehavior].label}</strong><small>{BEHAVIOR_GUIDES[phaseBehavior].hint}</small></div>
          <div key={`flash-${phaseKey}`} className="phase-flash" aria-hidden="true" />
          {!dodgeOpening && <div key={`taunt-${tauntKey}`} className="taunt-bubble" style={{ left: `${position.x}%`, top: `calc(${position.y}% - 134px)` }}>{taunt}</div>}
          <div className={`cat-target attention-${attention} ${dodgeOpening ? 'has-opening' : ''} ${result ? 'is-caught' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.tilt}deg)`, '--move-ms': `${Math.max(135, difficulty.moveDelay * .72)}ms` } as React.CSSProperties}>
            {dodgeOpening && <span className="opening-badge" role="status">빈틈! 지금 쫓아</span>}
            {['clone', 'overlord'].some((behavior) => [difficulty.behavior, difficulty.secondaryBehavior].includes(behavior as typeof difficulty.behavior)) && <><span className="cat-afterimage one"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span><span className="cat-afterimage two"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span></>}
            {character(Boolean(result))}
          </div>
          {aim && <div className={`catch-reticle ${attention === 'danger' ? 'is-danger' : ''} ${[difficulty.behavior, difficulty.secondaryBehavior].some((behavior) => ['blink', 'mirror', 'overlord'].includes(behavior)) ? 'is-warped' : ''}`} style={{ left: aim.x, top: aim.y }}><span>{attention === 'danger' ? '지금 떼면 잡는다' : '머리까지 쫓기'}</span></div>}
          {dodgeFx && <div key={`dodge-${dodgeFx.key}`} className="dodge-fx" style={{ left: `${dodgeFx.x}%`, top: `${dodgeFx.y}%` }}><i /><i /><strong>{dodgeFx.label}</strong></div>}
          {feedback && <div key={`feedback-${feedback.key}`} className={`catch-feedback ${feedback.near ? 'is-near' : ''}`} role="status" aria-live="polite">{feedback.text}</div>}
          {showGameGuide && <div className="gesture-coach" aria-label="첫 플레이 안내"><span>☝</span><strong>{tutorialRetry ? <>짧게 탭하면 안 잡혀요<br />꾹 누른 채 머리까지 쫓기</> : <>여기부터 꾹 누른 채<br />고양이 머리를 쫓아가세요</>}</strong><small>{tutorialRetry ? '다시 해도 시간·기회 차감 없음' : '첫 실패는 시간·기회 차감 없음'}</small></div>}
          <div className="field-dots" aria-hidden="true"><i /><i /><i /><i /></div>
        </div><p className={`game-tip ${(difficulty.hitsRequired ?? 1) > 1 ? 'is-boss-tip' : ''}`}>{mode === 'duel' ? '상대와 같은 냥이 · 잡는 순간 서버가 선착순 판정' : (difficulty.hitsRequired ?? 1) > 1 ? `보스전 · 머리를 ${difficulty.hitsRequired}번 잡아야 승리 · 빗나가면 기회 차감` : '꾹 누르고 쫓다가 머리에서 떼기 · 놓치면 기회 1개 차감'}</p>
      </section>}

      {screen === 'ending' && result && <section className="ending-screen page-enter">
        <div className="ending-burst" aria-hidden="true"><i>✦</i><b>♛</b><em>✦</em></div>
        <div className="broken-crown">♛</div><CatCharacter caught pose="butt" fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} />
        <span className="ending-stamp">왕관 반납</span><h1>대마왕 하찮냥<br /><em>오늘부로 퇴임</em></h1><p>왕관은 잃었지만 밈 카드는 얻었습니다.</p>
        <button className="text-button ending-skip" onClick={() => setScreen('result')}>받은 카드 보기 ›</button>
      </section>}

      {screen === 'loss' && lossResult && <section className="loss-screen page-enter">
        <div className="loss-heading"><span className="loss-stamp">CAT WINS</span><h1>{lossResult.reason === 'time' ? '이번 판은 고양이 승.' : '기회 끝. 고양이 승.'}</h1><p>{lossResult.mode === 'challenge' ? '친구 기록은 아직 살아 있습니다. 바로 다시 가죠.' : '바로 다시 하면 잡힐지도 몰라요.'}</p></div>
        <LossCard loss={lossResult} />
        <div className="loss-actions"><button className="primary-button" onClick={() => startGame(lossResult.level, lossResult.mode ?? 'campaign')}>바로 다시 잡기 <span>→</span></button><button className="secondary-button" onClick={handleLossShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '패배 카드 보내기'}</button><div className="minor-actions"><button onClick={handleLossSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '카드 저장'}</button><button onClick={() => setScreen('levels')}>다른 고양이</button></div></div>
      </section>}

      {screen === 'result' && result && <section className="result-screen page-enter">
        <div className="confetti" aria-hidden="true">✦ <i>●</i> ◆ <b>✦</b> <em>●</em></div>
        <div className="result-heading">
          <span>{result.mode === 'daily' ? `${daily.label} 완료` : result.mode === 'challenge' ? '친구 기록 도전 완료' : `Lv.${result.level} ${result.levelName} 잡기 성공`}</span>
          <h1>{resultChallengeComparison ? resultChallengeComparison.outcome === 'won' ? resultChallengeComparison.timeDelta < 0 ? <>기록 격파!<br />친구보다 {formatSeconds(Math.abs(resultChallengeComparison.timeDelta))} 빠름</> : <>같은 시간, 판정승!<br />시도 {Math.abs(resultChallengeComparison.attemptDelta)}회 덜 씀</> : resultChallengeComparison.outcome === 'tied' ? <>완벽한 동률.<br />한 판 더 해야 끝나겠는데?</> : resultChallengeComparison.timeDelta > 0 ? <>잡긴 잡았는데…<br />친구보다 {formatSeconds(resultChallengeComparison.timeDelta)} 늦음</> : <>같은 시간, 판정패.<br />시도 {resultChallengeComparison.attemptDelta}회 더 씀</> : result.mode === 'challenge' ? <>복수 성공!<br />이제 친구에게 보고할 차례.</> : result.level === LEVELS.length ? '마왕도 결국 고양이였습니다.' : <>잡았다!<br />이번 판은 네가 이겼어.</>}</h1>
          <div className="result-badges">{resultMoment && <p className="catch-moment-badge">{resultMoment.label}</p>}{isNewBest && <p className="new-best-badge">{bestMessage}</p>}</div>
          {result.score !== undefined && <p className="daily-score"><strong>{result.score.toLocaleString()}점</strong> · 오늘 최고 {dailyBest?.score.toLocaleString()}점<small>{dailyStreak}일 연속 · 이번 주 내 최고 {weeklyBest?.score.toLocaleString()}점</small><em className={`leaderboard-state is-${leaderboardStatus}`}>{leaderboardStatus === 'submitting' ? '토스 랭킹 등록 중…' : leaderboardStatus === 'submitted' ? '토스 랭킹 등록 완료' : leaderboardStatus === 'local' ? '기기 기록 저장 · 토스 랭킹 미등록' : '기기 기록 저장 완료'}</em></p>}
        </div><RewardCard result={result} compact />
        <div className="result-actions">
          {resultPrimaryAction === 'next' && <button className="primary-button next-level-button" onClick={() => startGame(result.level + 1)} disabled={Boolean(busy)}>다음 상대 · {getLevel(result.level + 1).name} <span>→</span></button>}
          {resultPrimaryAction === 'retry' && <button className="primary-button" onClick={() => startGame(result.level, result.mode ?? 'campaign')} disabled={Boolean(busy)}>{result.mode === 'daily' ? '기록 단축 · 한 판 더' : '친구 기록 다시 깨기'} <span>→</span></button>}
          <button className={resultPrimaryAction === 'share' ? 'primary-button' : 'secondary-button'} onClick={handleShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : result.mode === 'challenge' ? '새 기록으로 도발하기' : '밈 카드로 자랑하기'}</button>
          {resultPrimaryAction === 'share' && <button className="secondary-button" onClick={() => startGame(result.level, result.mode ?? 'campaign')} disabled={Boolean(busy)}>{result.mode === 'challenge' ? '한 번 더 기록 단축' : '같은 냥이 다시 잡기'}</button>}
          <div className="minor-actions"><button onClick={handleSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '카드 저장'}</button>{result.mode === 'daily' ? <button onClick={handleLeaderboard} disabled={Boolean(busy) || leaderboardStatus === 'submitting'}>{leaderboardStatus === 'submitting' ? '랭킹 등록 중…' : leaderboardStatus === 'local' ? '랭킹 재등록·보기' : '토스 전체 랭킹'}</button> : resultPrimaryAction === 'next' ? <button onClick={() => startGame(result.level, result.mode ?? 'campaign')} disabled={Boolean(busy)}>다시 잡기</button> : <button onClick={() => setScreen('levels')} disabled={Boolean(busy)}>다른 고양이</button>}</div>
        </div>
      </section>}

      {screen === 'collection' && <section className="collection-screen page-enter">
        <div className="collection-heading"><span className="kicker">잡은 고양이는 여기로</span><h1>잡은 냥이들</h1><p>지금까지 잡은 고양이와 받은 카드를 모아뒀어요.</p></div>
        <div className="collection-tabs"><button className={collectionTab === 'levels' ? 'is-active' : ''} onClick={() => setCollectionTab('levels')}>고양이 <strong>{collectionCount}/{LEVELS.length}</strong></button><button className={collectionTab === 'memes' ? 'is-active' : ''} onClick={() => setCollectionTab('memes')}>결과 카드 <strong>{rewardCount}/{REWARDS.length}</strong></button></div>
        {collectionTab === 'levels' ? <div className="collection-grid level-collection-grid">{LEVELS.map((level) => { const caught = caughtLevels.includes(level.id); const best = levelBests[level.id]; return <article key={level.id} className={`collection-card level-collection-card ${caught ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: caught ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{caught ? <CatCharacter caught pose={level.poses[0]} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{level.id}</span><strong>{caught ? level.name : '아직 숨어 있음'}</strong><p>{caught ? level.description : '직접 잡으면 정체가 보여요.'}</p>{best && <small className="collection-best">BEST {formatSeconds(best.elapsedMs)} · {best.grade}</small>}</article>; })}</div>
          : <div className="collection-grid meme-collection-grid">{REWARDS.map((cat, index) => { const unlocked = collection.includes(cat.id); const level = LEVELS[index]; return <article key={cat.id} className={`collection-card ${unlocked ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: unlocked ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{unlocked ? <CatCharacter caught reward={cat} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{index + 1}</span><strong>{unlocked ? cat.name : '아직 빈칸'}</strong><p>{unlocked ? cat.description : '이 레벨을 잡으면 카드가 열려요.'}</p></article>; })}</div>}
        <button className="primary-button" onClick={() => startGame()}>한 마리 더 잡기</button>
      </section>}
      {toast && <div className="app-toast" role="status">{toast}</div>}
    </main>
  );
}

export default App;
