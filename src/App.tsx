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
const MISS_TAUNTS = ['거긴 나 방금 살던 곳', '화면만 억울하게 맞았네', '손가락이 길을 잃었어요', '그 속도로 모기 잡겠어?'];
const NEAR_TAUNTS = ['방금 수염은 잡았어', '오, 그건 좀 위험했다', '털 한 가닥 드릴까요?', '머리카락 스쳤다, 인정'];
const LEVEL_TAUNTS = ['손가락은 눈보다 느리다냥', '자, 이번엔 어디로?', '나 지금 한 손으로 피하는 중', '표정 보니 벌써 졌네'];
const SOUND_KEY = 'hachan-cat-sound-v1';
const BEHAVIOR_LABELS: Record<CatBehavior, string> = {
  patrol: '순찰 중', watch: '눈치 보는 중', dodge: '삭삭 회피', zigzag: '갈지자 모드', moonwalk: '문워크 모드', fake: '반대 페이크', wall: '벽 타기', orbit: '뺑뺑 모드', tempo: '박자 배신', clone: '잔상 분신', predict: '손 읽는 중', magnet: '밀당 모드', crab: '게걸음 모드', blink: '깜빡 이동', mirror: '거울 회피', spiral: '소용돌이', chaos: '규칙 없음', guard: '엉덩 방패', rage: '폭주 모드', overlord: '마왕 비기',
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
    return mapLegacyLevel(Number(localStorage.getItem(LEGACY_PROGRESS_KEY) ?? 1));
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
  const [taunt, setTaunt] = useState('잡아봐. 어디 한번.');
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
    const clock = window.setInterval(() => {
      const left = Math.max(0, difficulty.roundMs - (Date.now() - startedAt.current));
      setRemainingMs(left);
      if (left === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'time', elapsedMs: difficulty.roundMs, attempts: attemptsRef.current, nearMisses: nearMissesRef.current, closestDistance: closestDistanceRef.current, mode });
        track('game_loss', { level: difficulty.id, reason: 'time', mode });
        void haptic('error'); playSound('miss', soundEnabled);
        setTaunt('시간도 네 편은 아니네?');
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
  }, [screen, difficulty, daily.seed, mode, soundEnabled]);

  useEffect(() => {
    if (!aim || screen !== 'game') return;
    const dodgeTimer = window.setTimeout(() => {
      if (!aimRef.current || finishedRef.current) return;
      moveCatAway(aimRef.current.clientX, aimRef.current.clientY);
      setPose(difficulty.poses[(moveStep.current + 1) % difficulty.poses.length]);
      setTaunt(difficulty.id >= 10 ? '생각하는 동안 이미 피했지' : '손 오는 거 다 보임');
      setTauntKey((value) => value + 1);
    }, difficulty.dodgeDelay);
    return () => window.clearTimeout(dodgeTimer);
  }, [aim?.startedAt, screen, difficulty]);

  const collectionCount = useMemo(() => new Set(caughtLevels).size, [caughtLevels]);
  const rewardCount = useMemo(() => new Set(collection.filter((id) => REWARDS.some((reward) => reward.id === id))).size, [collection]);
  const timeProgress = Math.round((remainingMs / difficulty.roundMs) * 100);

  function startGame(levelId = selectedLevel, nextMode: GameMode = 'campaign') {
    const safeLevel = nextMode === 'daily' ? clamp(levelId, 1, LEVELS.length) : Math.min(levelId, unlockedLevel, LEVELS.length);
    setActiveLevel(safeLevel);
    if (nextMode === 'campaign') setSelectedLevel(safeLevel);
    setMode(nextMode);
    startedAt.current = Date.now();
    moveStep.current = 0; attemptsRef.current = 0; missesRef.current = 0; bossHitsRef.current = 0; finishedRef.current = false; aimRef.current = null; positionRef.current = START_POSITION;
    nearMissesRef.current = 0; closestDistanceRef.current = Number.POSITIVE_INFINITY;
    setAttempts(0); setMisses(0); setNearMisses(0); setBossHits(0); setPose('wiggle'); setPosition(START_POSITION);
    setPhaseBehavior(getLevel(safeLevel).behavior); setPhaseKey((value) => value + 1);
    setTaunt('잡아봐. 어디 한번.'); setTauntKey((value) => value + 1); setAim(null); setFeedback(null);
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

  function moveCatAway(clientX: number, clientY: number) {
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
    setPose(difficulty.id >= 9 ? 'butt' : difficulty.id >= 5 ? 'matrix' : 'paddle');
  }

  function handleAimStart(event: React.PointerEvent<HTMLDivElement>) {
    if (finishedRef.current) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextAim = { ...point, clientX: event.clientX, clientY: event.clientY, startedAt: Date.now(), dx: 0, dy: 0 };
    aimRef.current = nextAim; setAim(nextAim);
    void haptic('tickWeak'); playSound('aim', soundEnabled);
  }

  function handleAimMove(event: React.PointerEvent<HTMLDivElement>) {
    const previous = aimRef.current;
    if (!previous) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    const nextAim = { ...previous, ...point, clientX: event.clientX, clientY: event.clientY, dx: point.fieldX - previous.fieldX, dy: point.fieldY - previous.fieldY };
    aimRef.current = nextAim; setAim(nextAim);
  }

  function clearAim() { aimRef.current = null; setAim(null); }

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
        setFeedback({ key: Date.now(), text: `${nextBossHits}/${requiredHits} 한 대 적중!`, near: true });
        setTaunt(nextBossHits + 1 === requiredHits ? '잠깐, 다음은 진짜 아픔!' : '그건 잔상이었거든!'); setTauntKey((value) => value + 1);
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
      setFeedback({ key: Date.now(), text: `${accuracy}% 정확 포획!`, near: true });
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
    setFeedback({ key: Date.now(), text: isNear ? '털끝 차이!' : '헛손질!', near: isNear });
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
    if (!await openLeaderboard()) { setToast('토스 앱에서 랭킹이 열려요 · 콘솔 승인 후 바로 연결됩니다'); window.setTimeout(() => setToast(''), 2600); }
  }

  const character = (caught = false) => <CatCharacter ref={caught ? undefined : headRef} caught={caught} reward={caught ? result?.reward : undefined} pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} />;

  return (
    <main className="app-shell">
      <header className="app-header"><button className="wordmark" onClick={() => setScreen('home')} aria-label="홈으로">하찮냥<span>˙</span></button><div className="header-actions"><button className="sound-toggle" onClick={() => setSoundEnabled((value) => !value)} aria-label={soundEnabled ? '소리 끄기' : '소리 켜기'}>{soundEnabled ? '♪' : '×'}</button><button className="collection-link" onClick={() => setScreen('collection')}>도감 <strong>{collectionCount}</strong></button></div></header>

      {screen === 'home' && <section className="home-screen page-enter">
        <div className="home-copy"><span className="kicker">세상에서 제일 쓸데없는 승부</span><h1>이 고양이,<br /><em>잡을 수 있겠어?</em></h1><p>누르고 쫓아가다 머리 위에서 손을 떼세요.</p></div>
        <div className="home-character-wrap"><div className="speech-bubble">정예 10마리 준비했는데?</div><CatCharacter pose="paddle" evil={2} /><span className="floor-shadow" /></div>
        <button className="level-select-button" onClick={() => setScreen('levels')}><span>현재 상대</span><strong>Lv.{selectedDifficulty.id} {selectedDifficulty.name}</strong><i>성깔 지도 ›</i></button>
        <div className="daily-card"><div><span>{daily.label}</span><strong>Lv.{daily.level.id} {daily.level.name}</strong><p>모두 같은 움직임 · 오늘 최고 {dailyBest?.date === daily.date ? `${dailyBest.score.toLocaleString()}점` : '아직 없음'}</p></div><button onClick={() => startGame(daily.level.id, 'daily')}>오늘 도전</button></div>
        <button className="primary-button wobble-button" onClick={() => startGame()}>잡으러 가기 <span>→</span></button><button className="rank-link" onClick={handleLeaderboard}>🏆 오늘의 랭킹 보기</button><p className="tiny-caption">확률 없음 · 시간 종료는 고양이 승 · 쉬는 타임 없음</p>
      </section>}

      {screen === 'levels' && <section className="levels-screen page-enter">
        <div className="levels-heading"><span className="kicker">정예 10단계 킹받음</span><h1>성깔 지도</h1><p>한 마리마다 두 가지 회피 규칙을 번갈아 써요.</p></div>
        <div className="level-map">{LEVELS.map((level) => { const locked = level.id > unlockedLevel; const selected = level.id === selectedLevel; return <button key={level.id} className={`level-card ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''}`} onClick={() => !locked && startGame(level.id)} disabled={locked} style={{ '--level-accent': level.accent } as React.CSSProperties}><span>{locked ? '🔒' : `LV.${level.id}`}</span><strong>{locked ? '아직 모름냥' : level.name}</strong><p>{locked ? '앞 단계를 먼저 잡으세요.' : level.description}</p><i>{level.chapter}</i></button>; })}</div>
        <button className="text-button" onClick={() => setScreen('home')}>일단 홈으로</button>
      </section>}

      {screen === 'game' && <section className={`game-screen page-enter behavior-${phaseBehavior} phase-${phaseKey % 2}`}>
        <div className="game-hud"><div className="attempt-counter"><span>Lv.{difficulty.id} {difficulty.name}</span><strong>{attempts}회</strong></div>
          <div className="chance-lives" aria-label={`남은 실수 ${difficulty.attemptsAllowed - misses}`}>{Array.from({ length: difficulty.attemptsAllowed }, (_, index) => <i key={index} className={index < misses ? 'is-broken' : ''}>●</i>)}</div>
          {difficulty.hitsRequired && <div className="boss-lives" aria-label={`남은 체력 ${difficulty.hitsRequired - bossHits}`}>{Array.from({ length: difficulty.hitsRequired }, (_, index) => <i key={index} className={index < bossHits ? 'is-broken' : ''}>♛</i>)}</div>}
          <div className="round-status"><div><span>남은 시간</span><strong>{(remainingMs / 1000).toFixed(1)}s</strong></div><div className="fatigue-track"><i style={{ width: `${timeProgress}%` }} /></div></div>
        </div>
        <div ref={fieldRef} className={`game-field ${aim ? 'is-aiming' : ''}`} onPointerDown={handleAimStart} onPointerMove={handleAimMove} onPointerUp={handleAimRelease} onPointerCancel={clearAim} aria-label="고양이 포획 구역">
          <div key={`phase-${phaseKey}`} className="phase-badge"><span>{mode === 'daily' ? '오늘의 패턴' : '행동 변경'}</span><strong>{BEHAVIOR_LABELS[phaseBehavior]}</strong></div>
          <div key={`flash-${phaseKey}`} className="phase-flash" aria-hidden="true" />
          <div key={`taunt-${tauntKey}`} className="taunt-bubble" style={{ left: `${position.x}%`, top: `calc(${position.y}% - 134px)` }}>{taunt}</div>
          <div className={`cat-target ${result ? 'is-caught' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.tilt}deg)`, '--move-ms': `${Math.max(135, difficulty.moveDelay * .72)}ms` } as React.CSSProperties}>
            {['clone', 'overlord'].some((behavior) => [difficulty.behavior, difficulty.secondaryBehavior].includes(behavior as typeof difficulty.behavior)) && <><span className="cat-afterimage one"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span><span className="cat-afterimage two"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span></>}
            {character(Boolean(result))}
          </div>
          {aim && <div className={`catch-reticle ${[difficulty.behavior, difficulty.secondaryBehavior].some((behavior) => ['blink', 'mirror', 'overlord'].includes(behavior)) ? 'is-warped' : ''}`} style={{ left: aim.x, top: aim.y }}><span>놓기!</span></div>}
          {feedback && <div key={`feedback-${feedback.key}`} className={`catch-feedback ${feedback.near ? 'is-near' : ''}`}>{feedback.text}</div>}
          <div className="field-dots" aria-hidden="true"><i /><i /><i /><i /></div>
        </div><p className="game-tip">머리가 실제 판정 부위예요 · 실수 {difficulty.attemptsAllowed}번이면 패배</p>
      </section>}

      {screen === 'ending' && result && <section className="ending-screen page-enter">
        <div className="ending-burst" aria-hidden="true"><i>✦</i><b>♛</b><em>✦</em></div>
        <div className="broken-crown">♛</div><CatCharacter caught pose="butt" fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} />
        <span className="ending-stamp">제국 멸망</span><h1>대마왕 하찮냥<br /><em>강제 퇴직</em></h1><p>세계 정복보다 밈 카드 모델이 적성에 맞았습니다.</p>
        <button className="text-button ending-skip" onClick={() => setScreen('result')}>결과 바로 보기 ›</button>
      </section>}

      {screen === 'loss' && lossResult && <section className="loss-screen page-enter">
        <div className="loss-heading"><span className="loss-stamp">CAT WINS</span><h1>{lossResult.reason === 'time' ? '시간 끝. 고양이 승.' : '손이 먼저 털렸습니다.'}</h1><p>졌지만 콘텐츠는 남았습니다.</p></div>
        <LossCard loss={lossResult} />
        <div className="loss-actions"><button className="primary-button" onClick={handleLossShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '패배 자랑하기'} <span>→</span></button><button className="secondary-button" onClick={handleLossSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '패배 밈 카드 저장'}</button><button className="text-button" onClick={() => startGame(lossResult.level)}>자존심 재도전</button><button className="text-button" onClick={() => setScreen('levels')}>다른 고양이 보기</button></div>
      </section>}

      {screen === 'result' && result && <section className="result-screen page-enter">
        <div className="confetti" aria-hidden="true">✦ <i>●</i> ◆ <b>✦</b> <em>●</em></div><div className="result-heading"><span>{result.mode === 'daily' ? `${daily.label} 성공!` : `Lv.${result.level} ${result.levelName} 포획 성공!`}</span><h1>{result.level === LEVELS.length ? '하찮냥 제국 멸망!' : <>잡힌 게 아니라<br />제대로 잡힌 겁니다.</>}</h1>{result.score !== undefined && <p className="daily-score"><strong>{result.score.toLocaleString()}점</strong> · 오늘 최고 {dailyBest?.score.toLocaleString()}점</p>}</div><RewardCard result={result} compact />
        <div className="result-actions">{result.mode !== 'daily' && result.level < LEVELS.length && <button className="primary-button next-level-button" onClick={() => startGame(result.level + 1)}>더 악랄한 {getLevel(result.level + 1).name} <span>→</span></button>}{result.mode === 'daily' && <button className="primary-button" onClick={handleLeaderboard}>오늘의 랭킹 확인 <span>→</span></button>}<button className={result.level < LEVELS.length ? 'secondary-button' : 'primary-button'} onClick={handleShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '친구 도발하기'}</button><button className="secondary-button" onClick={handleSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '밈 카드 저장'}</button><button className="text-button" onClick={() => startGame(result.level, result.mode ?? 'campaign')}>같은 성깔 기록 줄이기</button></div>
      </section>}

      {screen === 'collection' && <section className="collection-screen page-enter">
        <div className="collection-heading"><span className="kicker">잡은 성깔은 박제됩니다</span><h1>하찮냥 수집함</h1><p>고양이와 전용 밈 카드를 한 쌍씩 모아보세요.</p></div>
        <div className="collection-tabs"><button className={collectionTab === 'levels' ? 'is-active' : ''} onClick={() => setCollectionTab('levels')}>성깔 도감 <strong>{collectionCount}/{LEVELS.length}</strong></button><button className={collectionTab === 'memes' ? 'is-active' : ''} onClick={() => setCollectionTab('memes')}>밈 카드 <strong>{rewardCount}/{REWARDS.length}</strong></button></div>
        {collectionTab === 'levels' ? <div className="collection-grid level-collection-grid">{LEVELS.map((level) => { const caught = caughtLevels.includes(level.id); return <article key={level.id} className={`collection-card level-collection-card ${caught ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: caught ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{caught ? <CatCharacter caught pose={level.poses[0]} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{level.id}</span><strong>{caught ? level.name : '아직 모름냥'}</strong><p>{caught ? level.description : '직접 잡아야 정체가 보여요.'}</p></article>; })}</div>
          : <div className="collection-grid meme-collection-grid">{REWARDS.map((cat, index) => { const unlocked = collection.includes(cat.id); const level = LEVELS[index]; return <article key={cat.id} className={`collection-card ${unlocked ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: unlocked ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{unlocked ? <CatCharacter caught reward={cat} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{index + 1}</span><strong>{unlocked ? cat.name : '아직 모름냥'}</strong><p>{unlocked ? cat.description : '해당 레벨을 잡으면 확정 지급돼요.'}</p></article>; })}</div>}
        <button className="primary-button" onClick={() => startGame()}>더 잡으러 가기</button>
      </section>}
      {toast && <div className="app-toast" role="status">{toast}</div>}
    </main>
  );
}

export default App;
