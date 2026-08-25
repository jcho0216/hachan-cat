import { useEffect, useMemo, useRef, useState } from 'react';
import { CatCharacter } from './components/CatCharacter';
import { LossCard } from './components/LossCard';
import { RewardCard } from './components/RewardCard';
import { REWARDS, chooseReward, getGrade } from './data';
import { LEVELS, getLevel } from './levels';
import { movementFor } from './movement';
import { saveLossMemeCard, saveMemeCard, shareChallenge, shareLossChallenge } from './share';
import type { CatPose } from './levels';
import type { MovementAim, Position } from './movement';
import type { GameLoss, GameResult } from './types';
import { calculateDailyScore, DAILY_BEST_KEY, getDailyChallenge, readDailyBest } from './daily';
import { haptic, pauseAudio, playSound } from './feedback';
import { openLeaderboard, submitDailyScore } from './gameCenter';
import { track } from './telemetry';
import type { CatBehavior } from './levels';

type Screen = 'home' | 'levels' | 'game' | 'ending' | 'result' | 'loss' | 'collection';
type GameMode = 'campaign' | 'daily';
type Aim = MovementAim & { x: number; y: number; clientX: number; clientY: number; startedAt: number };

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
const BEHAVIOR_LABELS: Record<CatBehavior, string> = {
  patrol: '천천히 순찰', watch: '손끝 관찰', dodge: '반사 회피', zigzag: '지그재그', moonwalk: '되감기', fake: '반대로', wall: '벽 타기', orbit: '원 그리기', tempo: '엇박자', clone: '잔상 남기기', predict: '다음 손 읽기', magnet: '밀고 당기기', crab: '옆걸음', blink: '순간이동', mirror: '반대편', spiral: '소용돌이', chaos: '마음대로', guard: '엉덩이 방어', rage: '점점 빠르게', overlord: '전부 다',
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mapLegacyLevel = (id: number) => clamp(Math.ceil(id / 2), 1, LEVELS.length);
const readLegacyCaughtLevels = () => {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_CAUGHT_LEVELS_KEY) ?? '[]') as number[];
    return Array.from(new Set(legacy.map(mapLegacyLevel)));
  } catch { return []; }
};

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [attempts, setAttempts] = useState(0);
  const [misses, setMisses] = useState(0);
  const [nearMisses, setNearMisses] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState(() => {
    const saved = localStorage.getItem(SELECTED_LEVEL_KEY);
    return saved ? clamp(Number(saved), 1, LEVELS.length) : mapLegacyLevel(Number(localStorage.getItem(LEGACY_SELECTED_LEVEL_KEY) ?? 1));
  });
  const [activeLevel, setActiveLevel] = useState(selectedLevel);
  const [unlockedLevel, setUnlockedLevel] = useState(() => {
    const saved = localStorage.getItem(PROGRESS_KEY);
    if (saved) return clamp(Number(saved), 1, LEVELS.length);
    const migratedCaught = readLegacyCaughtLevels();
    if (migratedCaught.length) return Math.min(LEVELS.length, Math.max(...migratedCaught) + 1);
    const legacyProgress = localStorage.getItem(LEGACY_PROGRESS_KEY);
    return legacyProgress ? mapLegacyLevel(Number(legacyProgress)) : 3;
  });
  const [caughtLevels, setCaughtLevels] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CAUGHT_LEVELS_KEY) ?? '[]') as number[];
      if (saved.length) return saved;
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
  const [collection, setCollection] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? '[]'); } catch { return []; } });
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [mode, setMode] = useState<GameMode>('campaign');
  const [phaseBehavior, setPhaseBehavior] = useState<CatBehavior>(() => getLevel(selectedLevel).behavior);
  const [phaseKey, setPhaseKey] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const [dailyBest, setDailyBest] = useState(readDailyBest);
  const [toast, setToast] = useState('');
  const [attention, setAttention] = useState<'idle' | 'watch' | 'danger'>('idle');
  const [dodgeFx, setDodgeFx] = useState<{ key: number; x: number; y: number; label: string } | null>(null);
  const [showGameGuide, setShowGameGuide] = useState(false);
  const daily = useMemo(() => getDailyChallenge(), []);

  const fieldRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<SVGRectElement>(null);
  const startedAt = useRef(Date.now());
  const moveStep = useRef(0);
  const aimRef = useRef<Aim | null>(null);
  const positionRef = useRef(START_POSITION);
  const attemptsRef = useRef(0);
  const missesRef = useRef(0);
  const bossHitsRef = useRef(0);
  const finishedRef = useRef(false);
  const nearMissesRef = useRef(0);
  const closestDistanceRef = useRef(Number.POSITIVE_INFINITY);
  const hiddenAtRef = useRef<number | null>(null);
  const reactedToAimRef = useRef(false);
  const difficulty = getLevel(activeLevel);
  const selectedDifficulty = getLevel(selectedLevel);

  useEffect(() => { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); }, [collection]);
  useEffect(() => { localStorage.setItem(CAUGHT_LEVELS_KEY, JSON.stringify(caughtLevels)); }, [caughtLevels]);
  useEffect(() => {
    setCollection((current) => Array.from(new Set([...current, ...caughtLevels.flatMap((id) => REWARDS[id - 1]?.id ?? [])])));
  }, [caughtLevels]);
  useEffect(() => { localStorage.setItem(PROGRESS_KEY, String(unlockedLevel)); }, [unlockedLevel]);
  useEffect(() => { localStorage.setItem(SELECTED_LEVEL_KEY, String(selectedLevel)); }, [selectedLevel]);
  useEffect(() => { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); track('sound_toggle', { enabled: soundEnabled }); }, [soundEnabled]);
  useEffect(() => { aimRef.current = aim; }, [aim]);
  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        pauseAudio();
      } else if (hiddenAtRef.current && screen === 'game') {
        startedAt.current += Date.now() - hiddenAtRef.current;
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [screen]);
  useEffect(() => {
    if (screen !== 'ending') return;
    const timer = window.setTimeout(() => setScreen('result'), 2600);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'game') return;
    if (showGameGuide) {
      setRemainingMs(difficulty.roundMs);
      return;
    }
    const clock = window.setInterval(() => {
      const left = Math.max(0, difficulty.roundMs - (Date.now() - startedAt.current));
      setRemainingMs(left);
      if (left === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'time', elapsedMs: difficulty.roundMs, attempts: attemptsRef.current, nearMisses: nearMissesRef.current, closestDistance: closestDistanceRef.current, mode });
        track('game_loss', { level: difficulty.id, reason: 'time', mode });
        void haptic('error'); playSound('miss', soundEnabled);
        setTaunt('끝났네.');
        setScreen('loss');
      }
    }, 60);

    let moveTimer = 0;
    const move = () => {
      const step = moveStep.current++;
      const activeBehavior = Math.floor(step / 4) % 2 === 0 ? difficulty.behavior : difficulty.secondaryBehavior;
      if (step % 4 === 0) {
        setPhaseBehavior(activeBehavior); setPhaseKey((value) => value + 1);
        if (step > 0) { playSound('phase', soundEnabled); void haptic('tickWeak'); track('pattern_phase_seen', { level: difficulty.id, behavior: activeBehavior, mode }); }
      }
      const next = movementFor(activeBehavior, step, positionRef.current, aimRef.current, mode === 'daily' ? daily.seed : difficulty.id * 1009);
      positionRef.current = next;
      setPosition(next);
      setPose(difficulty.poses[step % difficulty.poses.length]);
      if (step > 0 && step % 4 === 0) { setTaunt(LEVEL_TAUNTS[(step + difficulty.id) % LEVEL_TAUNTS.length]); setTauntKey((value) => value + 1); }
      const hasRage = [difficulty.behavior, difficulty.secondaryBehavior].some((behavior) => behavior === 'rage' || behavior === 'overlord');
      const rageFactor = hasRage ? Math.max(.55, 1 - (Date.now() - startedAt.current) / difficulty.roundMs * .38) : 1;
      const tempoFactor = activeBehavior === 'tempo' && step % 3 === 0 ? 1.75 : 1;
      moveTimer = window.setTimeout(move, difficulty.moveDelay * rageFactor * tempoFactor);
    };
    moveTimer = window.setTimeout(move, 260);
    return () => { window.clearInterval(clock); window.clearTimeout(moveTimer); };
  }, [screen, difficulty, daily.seed, mode, soundEnabled, showGameGuide]);

  const collectionCount = useMemo(() => new Set(caughtLevels).size, [caughtLevels]);
  const rewardCount = useMemo(() => new Set(collection.filter((id) => REWARDS.some((reward) => reward.id === id))).size, [collection]);
  const timeProgress = Math.round((remainingMs / difficulty.roundMs) * 100);

  function startGame(levelId = selectedLevel, nextMode: GameMode = 'campaign') {
    const safeLevel = nextMode === 'daily' ? clamp(levelId, 1, LEVELS.length) : Math.min(levelId, unlockedLevel, LEVELS.length);
    setActiveLevel(safeLevel);
    if (nextMode === 'campaign') setSelectedLevel(safeLevel);
    setMode(nextMode);
    startedAt.current = Date.now();
    moveStep.current = 0; attemptsRef.current = 0; missesRef.current = 0; bossHitsRef.current = 0; finishedRef.current = false; aimRef.current = null; positionRef.current = START_POSITION; reactedToAimRef.current = false;
    nearMissesRef.current = 0; closestDistanceRef.current = Number.POSITIVE_INFINITY;
    setAttempts(0); setMisses(0); setNearMisses(0); setBossHits(0); setPose('wiggle'); setPosition(START_POSITION);
    setPhaseBehavior(getLevel(safeLevel).behavior); setPhaseKey((value) => value + 1);
    setTaunt('잡을 수 있으면.'); setTauntKey((value) => value + 1); setAim(null); setFeedback(null); setAttention('idle'); setDodgeFx(null);
    setShowGameGuide(localStorage.getItem(FIRST_PLAY_KEY) !== 'seen');
    setRemainingMs(getLevel(safeLevel).roundMs); setResult(null); setLossResult(null); setScreen('game');
    track('game_start', { level: safeLevel, mode: nextMode });
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
    void haptic('wiggle'); playSound('near', soundEnabled);
    track('reactive_dodge', { level: difficulty.id, behavior: phaseBehavior, mode });
  }

  function handleAimStart(event: React.PointerEvent<HTMLDivElement>) {
    if (finishedRef.current) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextAim = { ...point, clientX: event.clientX, clientY: event.clientY, startedAt: Date.now(), dx: 0, dy: 0 };
    reactedToAimRef.current = false; aimRef.current = nextAim; setAim(nextAim); setAttention('watch');
    if (showGameGuide) {
      startedAt.current = Date.now();
      moveStep.current = 0;
      localStorage.setItem(FIRST_PLAY_KEY, 'seen');
      setShowGameGuide(false);
    }
    void haptic('tickWeak'); playSound('aim', soundEnabled);
  }

  function handleAimMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = aimRef.current;
    if (!previous) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    const nextAim = { ...previous, ...point, clientX: event.clientX, clientY: event.clientY, dx: point.fieldX - previous.fieldX, dy: point.fieldY - previous.fieldY };
    aimRef.current = nextAim; setAim(nextAim);
    const head = headRef.current?.getBoundingClientRect();
    if (!head) return;
    const catX = head.left + head.width / 2;
    const catY = head.top + head.height / 2;
    const distance = Math.hypot(event.clientX - catX, event.clientY - catY);
    const visualRadius = Math.min(head.width, head.height) * .48;
    const dangerRadius = Math.min(difficulty.hitRadius, visualRadius) + 74;
    const isDanger = distance <= dangerRadius;
    setAttention(isDanger ? 'danger' : 'watch');
    if (isDanger && !reactedToAimRef.current && Date.now() - previous.startedAt >= difficulty.dodgeDelay) {
      reactedToAimRef.current = true;
      triggerReactiveDodge(event.clientX, event.clientY);
    }
  }

  function clearAim() { aimRef.current = null; setAim(null); setAttention('idle'); }

  function handleAimRelease(event: React.PointerEvent<HTMLDivElement>) {
    const currentAim = aimRef.current;
    const head = headRef.current?.getBoundingClientRect();
    if (!currentAim || !head || finishedRef.current) { clearAim(); return; }
    const nextAttempts = attemptsRef.current + 1;
    attemptsRef.current = nextAttempts; setAttempts(nextAttempts);
    const catX = head.left + head.width / 2;
    const catY = head.top + head.height / 2;
    const distance = Math.hypot(event.clientX - catX, event.clientY - catY);
    closestDistanceRef.current = Math.min(closestDistanceRef.current, distance);
    const visualRadius = Math.min(head.width, head.height) * .48;
    const hitRadius = Math.min(difficulty.hitRadius, visualRadius);
    const accuracy = clamp(Math.round(100 - Math.max(0, distance - 8) * .85), 0, 100);
    const elapsedMs = Date.now() - startedAt.current;
    clearAim();

    if (distance <= hitRadius) {
      const requiredHits = difficulty.hitsRequired ?? 1;
      const nextBossHits = bossHitsRef.current + 1;
      if (nextBossHits < requiredHits) {
        bossHitsRef.current = nextBossHits; setBossHits(nextBossHits); setPose('panic');
        setFeedback({ key: Date.now(), text: `${nextBossHits}/${requiredHits} 명중`, near: true });
        setTaunt(nextBossHits + 1 === requiredHits ? '어, 다음은 좀 위험한데.' : '아직 남았어.'); setTauntKey((value) => value + 1);
        moveCatAway(event.clientX, event.clientY);
        void haptic('tickMedium'); playSound('hit', soundEnabled);
        return;
      }
      finishedRef.current = true;
      const reward = chooseReward(difficulty.id);
      const [grade, verdict] = getGrade(accuracy, elapsedMs, nextAttempts);
      const score = mode === 'daily' ? calculateDailyScore(elapsedMs, nextAttempts, nearMissesRef.current) : undefined;
      const nextResult: GameResult = { attempts: nextAttempts, elapsedMs, accuracy, nearMisses: nearMissesRef.current, level: difficulty.id, levelName: difficulty.name, grade, verdict, reward, mode, score };
      setResult(nextResult); setCollection((current) => [...current, reward.id]);
      setCaughtLevels((current) => current.includes(difficulty.id) ? current : [...current, difficulty.id]);
      setUnlockedLevel((current) => Math.max(current, Math.min(LEVELS.length, difficulty.id + 1)));
      setFeedback({ key: Date.now(), text: `잡았다 · ${accuracy}%`, near: true });
      if (mode === 'daily' && score !== undefined) {
        const best = readDailyBest();
        if (!best || best.date !== daily.date || score > best.score) {
          const nextBest = { date: daily.date, score, elapsedMs, attempts: nextAttempts, level: difficulty.id };
          localStorage.setItem(DAILY_BEST_KEY, JSON.stringify(nextBest)); setDailyBest(nextBest);
        }
        void submitDailyScore(score);
      }
      track('game_catch', { level: difficulty.id, mode, elapsedMs, attempts: nextAttempts, score: score ?? 0 });
      void haptic(difficulty.id === LEVELS.length ? 'confetti' : 'success'); playSound('catch', soundEnabled);
      window.setTimeout(() => setScreen(difficulty.id === LEVELS.length && mode === 'campaign' ? 'ending' : 'result'), 500);
      return;
    }

    const nearRadius = hitRadius + 42;
    const isNear = distance <= nearRadius;
    if (isNear) { nearMissesRef.current += 1; setNearMisses(nearMissesRef.current); }
    const nextMisses = missesRef.current + 1;
    missesRef.current = nextMisses; setMisses(nextMisses);
    const pool = isNear ? NEAR_TAUNTS : MISS_TAUNTS;
    setTaunt(pool[nextAttempts % pool.length]); setTauntKey((value) => value + 1);
    setFeedback({ key: Date.now(), text: isNear ? '아깝다!' : '빗나감', near: isNear });
    moveCatAway(event.clientX, event.clientY);
    void haptic(isNear ? 'wiggle' : 'basicWeak'); playSound(isNear ? 'near' : 'miss', soundEnabled);
    track('miss', { level: difficulty.id, near: isNear, mode });
    if (nextMisses >= difficulty.attemptsAllowed) {
      finishedRef.current = true;
      setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'misses', elapsedMs, attempts: nextAttempts, nearMisses: nearMissesRef.current, closestDistance: closestDistanceRef.current, mode });
      track('game_loss', { level: difficulty.id, reason: 'misses', mode });
      window.setTimeout(() => setScreen('loss'), 480);
    }
  }

  async function handleSave() { if (!result || busy) return; setBusy('save'); try { await saveMemeCard(result); } finally { setBusy(null); } }
  async function handleShare() { if (!result || busy) return; setBusy('share'); try { await shareChallenge(result); } finally { setBusy(null); } }
  async function handleLossSave() { if (!lossResult || busy) return; setBusy('save'); try { await saveLossMemeCard(lossResult); } finally { setBusy(null); } }
  async function handleLossShare() { if (!lossResult || busy) return; setBusy('share'); try { await shareLossChallenge(lossResult); } finally { setBusy(null); } }
  async function handleLeaderboard() {
    track('leaderboard_open', { source: screen });
    if (!await openLeaderboard()) { setToast('랭킹은 토스 앱에서 볼 수 있어요'); window.setTimeout(() => setToast(''), 2600); }
  }

  const character = (caught = false) => <CatCharacter ref={caught ? undefined : headRef} caught={caught} reward={caught ? result?.reward : undefined} pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} attention={caught ? 'idle' : attention} />;

  return (
    <main className="app-shell">
      <header className="app-header"><button className="wordmark" onClick={() => setScreen('home')} aria-label="홈으로">하찮냥<span>˙</span></button><div className="header-actions"><button className="sound-toggle" onClick={() => setSoundEnabled((value) => !value)} aria-label={soundEnabled ? '소리 끄기' : '소리 켜기'}>{soundEnabled ? '♪' : '×'}</button><button className="collection-link" onClick={() => setScreen('collection')}>도감 <strong>{collectionCount}</strong></button></div></header>

      {screen === 'home' && <section className="home-screen page-enter">
        <div className="home-copy"><span className="kicker">잡으면 이기고, 놓치면 놀림받음</span><h1>이 고양이,<br /><em>한 번 잡아볼래?</em></h1><p>꾹 누른 채 쫓아가세요. 머리에 닿았을 때 손을 떼면 성공.</p></div>
        <div className="home-character-wrap"><div className="speech-bubble">난 가만히 있을 생각 없는데.</div><CatCharacter pose="paddle" evil={2} /><span className="floor-shadow" /></div>
        <div className="play-rule" aria-label="게임 방법"><span>☝</span><strong>꾹 누르고 쫓다가</strong><em>머리에서 손 떼기</em></div>
        <button className="level-select-button" onClick={() => setScreen('levels')}><span>이어서 도전</span><strong>Lv.{selectedDifficulty.id} {selectedDifficulty.name}</strong><i>10마리 보기 ›</i></button>
        <div className="daily-card"><div><span>{daily.label}</span><strong>Lv.{daily.level.id} {daily.level.name}</strong><p>오늘은 모두 같은 움직임 · 최고 {dailyBest?.date === daily.date ? `${dailyBest.score.toLocaleString()}점` : '기록 없음'}</p></div><button onClick={() => startGame(daily.level.id, 'daily')}>한 판 하기</button></div>
        <button className="primary-button wobble-button" onClick={() => startGame()}>도전하기 <span>→</span></button><button className="rank-link" onClick={handleLeaderboard}>🏆 오늘의 랭킹</button><p className="tiny-caption">15초 · 기회 5번 · 머리만 정답</p>
      </section>}

      {screen === 'levels' && <section className="levels-screen page-enter">
        <div className="levels-heading"><span className="kicker">쉬운 척하는 10마리</span><h1>오늘은 누구부터?</h1><p>잡을수록 다음 고양이가 열려요. 회피법은 한 마리당 두 가지.</p></div>
        <div className="level-map">{LEVELS.map((level) => { const locked = level.id > unlockedLevel; const selected = level.id === selectedLevel; return <button key={level.id} className={`level-card ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''}`} onClick={() => !locked && startGame(level.id)} disabled={locked} style={{ '--level-accent': level.accent } as React.CSSProperties}><span>{locked ? '🔒' : `LV.${level.id}`}</span><strong>{locked ? '아직 숨어 있음' : level.name}</strong><p>{locked ? '앞 고양이를 먼저 잡아주세요.' : level.description}</p><i>{level.chapter}</i></button>; })}</div>
        <button className="text-button" onClick={() => setScreen('home')}>홈으로</button>
      </section>}

      {screen === 'game' && <section className={`game-screen page-enter behavior-${phaseBehavior} phase-${phaseKey % 2}`}>
        <div className="game-hud"><div className="attempt-counter"><span>Lv.{difficulty.id} {difficulty.name}</span><strong>시도 {attempts}회</strong></div>
          <div className="chance-lives" aria-label={`남은 기회 ${difficulty.attemptsAllowed - misses}`}>{Array.from({ length: difficulty.attemptsAllowed }, (_, index) => <i key={index} className={index < misses ? 'is-broken' : ''}>●</i>)}</div>
          {difficulty.hitsRequired && <div className="boss-lives" aria-label={`남은 체력 ${difficulty.hitsRequired - bossHits}`}>{Array.from({ length: difficulty.hitsRequired }, (_, index) => <i key={index} className={index < bossHits ? 'is-broken' : ''}>♛</i>)}</div>}
          <div className="round-status"><div><span>남은 시간</span><strong>{(remainingMs / 1000).toFixed(1)}s</strong></div><div className="fatigue-track"><i style={{ width: `${timeProgress}%` }} /></div></div>
        </div>
        <div ref={fieldRef} className={`game-field ${aim ? 'is-aiming' : ''} ${attention === 'danger' ? 'is-danger' : ''}`} onPointerDown={handleAimStart} onPointerMove={handleAimMove} onPointerUp={handleAimRelease} onPointerCancel={clearAim} aria-label="고양이 잡기 구역">
          <div key={`phase-${phaseKey}`} className="phase-badge"><span>{mode === 'daily' ? '오늘의 움직임' : '지금은'}</span><strong>{BEHAVIOR_LABELS[phaseBehavior]}</strong></div>
          <div key={`flash-${phaseKey}`} className="phase-flash" aria-hidden="true" />
          <div key={`taunt-${tauntKey}`} className="taunt-bubble" style={{ left: `${position.x}%`, top: `calc(${position.y}% - 134px)` }}>{taunt}</div>
          <div className={`cat-target attention-${attention} ${result ? 'is-caught' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.tilt}deg)`, '--move-ms': `${Math.max(135, difficulty.moveDelay * .72)}ms` } as React.CSSProperties}>
            {['clone', 'overlord'].some((behavior) => [difficulty.behavior, difficulty.secondaryBehavior].includes(behavior as typeof difficulty.behavior)) && <><span className="cat-afterimage one"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span><span className="cat-afterimage two"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span></>}
            {character(Boolean(result))}
          </div>
          {aim && <div className={`catch-reticle ${attention === 'danger' ? 'is-danger' : ''} ${[difficulty.behavior, difficulty.secondaryBehavior].some((behavior) => ['blink', 'mirror', 'overlord'].includes(behavior)) ? 'is-warped' : ''}`} style={{ left: aim.x, top: aim.y }}><span>{attention === 'danger' ? '지금 떼면 잡는다' : '머리까지 쫓기'}</span></div>}
          {dodgeFx && <div key={`dodge-${dodgeFx.key}`} className="dodge-fx" style={{ left: `${dodgeFx.x}%`, top: `${dodgeFx.y}%` }}><i /><i /><strong>{dodgeFx.label}</strong></div>}
          {feedback && <div key={`feedback-${feedback.key}`} className={`catch-feedback ${feedback.near ? 'is-near' : ''}`}>{feedback.text}</div>}
          {showGameGuide && <div className="gesture-coach" aria-label="첫 플레이 안내"><span>☝</span><strong>여기부터 꾹 누른 채<br />고양이 머리를 쫓아가세요</strong></div>}
          <div className="field-dots" aria-hidden="true"><i /><i /><i /><i /></div>
        </div><p className="game-tip">꾹 누르고 쫓다가 머리에서 떼기 · 놓치면 기회 1개 차감</p>
      </section>}

      {screen === 'ending' && result && <section className="ending-screen page-enter">
        <div className="ending-burst" aria-hidden="true"><i>✦</i><b>♛</b><em>✦</em></div>
        <div className="broken-crown">♛</div><CatCharacter caught pose="butt" fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} />
        <span className="ending-stamp">왕관 반납</span><h1>대마왕 하찮냥<br /><em>오늘부로 퇴임</em></h1><p>왕관은 잃었지만 밈 카드는 얻었습니다.</p>
        <button className="text-button ending-skip" onClick={() => setScreen('result')}>받은 카드 보기 ›</button>
      </section>}

      {screen === 'loss' && lossResult && <section className="loss-screen page-enter">
        <div className="loss-heading"><span className="loss-stamp">CAT WINS</span><h1>{lossResult.reason === 'time' ? '이번 판은 고양이 승.' : '기회 끝. 고양이 승.'}</h1><p>바로 다시 하면 잡힐지도 몰라요.</p></div>
        <LossCard loss={lossResult} />
        <div className="loss-actions"><button className="primary-button" onClick={() => startGame(lossResult.level, lossResult.mode ?? 'campaign')}>바로 다시 잡기 <span>→</span></button><button className="secondary-button" onClick={handleLossShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '패배 카드 보내기'}</button><div className="minor-actions"><button onClick={handleLossSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '카드 저장'}</button><button onClick={() => setScreen('levels')}>다른 고양이</button></div></div>
      </section>}

      {screen === 'result' && result && <section className="result-screen page-enter">
        <div className="confetti" aria-hidden="true">✦ <i>●</i> ◆ <b>✦</b> <em>●</em></div><div className="result-heading"><span>{result.mode === 'daily' ? `${daily.label} 완료` : `Lv.${result.level} ${result.levelName} 잡기 성공`}</span><h1>{result.level === LEVELS.length ? '마왕도 결국 고양이였습니다.' : <>잡았다!<br />이번 판은 네가 이겼어.</>}</h1>{result.score !== undefined && <p className="daily-score"><strong>{result.score.toLocaleString()}점</strong> · 오늘 최고 {dailyBest?.score.toLocaleString()}점</p>}</div><RewardCard result={result} compact />
        <div className="result-actions">{result.mode !== 'daily' && result.level < LEVELS.length && <button className="primary-button next-level-button" onClick={() => startGame(result.level + 1)}>다음 상대 · {getLevel(result.level + 1).name} <span>→</span></button>}{result.mode === 'daily' && <button className="primary-button" onClick={handleLeaderboard}>오늘의 랭킹 보기 <span>→</span></button>}<button className={result.level < LEVELS.length ? 'secondary-button' : 'primary-button'} onClick={handleShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '밈 카드로 자랑하기'}</button><div className="minor-actions"><button onClick={handleSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '카드 저장'}</button><button onClick={() => startGame(result.level, result.mode ?? 'campaign')}>다시 잡기</button></div></div>
      </section>}

      {screen === 'collection' && <section className="collection-screen page-enter">
        <div className="collection-heading"><span className="kicker">잡은 고양이는 여기로</span><h1>잡은 냥이들</h1><p>지금까지 잡은 고양이와 받은 카드를 모아뒀어요.</p></div>
        <div className="collection-tabs"><button className={collectionTab === 'levels' ? 'is-active' : ''} onClick={() => setCollectionTab('levels')}>고양이 <strong>{collectionCount}/{LEVELS.length}</strong></button><button className={collectionTab === 'memes' ? 'is-active' : ''} onClick={() => setCollectionTab('memes')}>결과 카드 <strong>{rewardCount}/{REWARDS.length}</strong></button></div>
        {collectionTab === 'levels' ? <div className="collection-grid level-collection-grid">{LEVELS.map((level) => { const caught = caughtLevels.includes(level.id); return <article key={level.id} className={`collection-card level-collection-card ${caught ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: caught ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{caught ? <CatCharacter caught pose={level.poses[0]} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{level.id}</span><strong>{caught ? level.name : '아직 숨어 있음'}</strong><p>{caught ? level.description : '직접 잡으면 정체가 보여요.'}</p></article>; })}</div>
          : <div className="collection-grid meme-collection-grid">{REWARDS.map((cat, index) => { const unlocked = collection.includes(cat.id); const level = LEVELS[index]; return <article key={cat.id} className={`collection-card ${unlocked ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: unlocked ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{unlocked ? <CatCharacter caught reward={cat} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{index + 1}</span><strong>{unlocked ? cat.name : '아직 빈칸'}</strong><p>{unlocked ? cat.description : '이 레벨을 잡으면 카드가 열려요.'}</p></article>; })}</div>}
        <button className="primary-button" onClick={() => startGame()}>한 마리 더 잡기</button>
      </section>}
      {toast && <div className="app-toast" role="status">{toast}</div>}
    </main>
  );
}

export default App;
