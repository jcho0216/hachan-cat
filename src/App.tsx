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

type Screen = 'home' | 'levels' | 'game' | 'result' | 'loss' | 'collection';
type Aim = MovementAim & { x: number; y: number; clientX: number; clientY: number; startedAt: number };

const START_POSITION: Position = { x: 50, y: 50, tilt: 0 };
const COLLECTION_KEY = 'hachan-cat-collection-v1';
const CAUGHT_LEVELS_KEY = 'hachan-cat-caught-levels-v1';
const PROGRESS_KEY = 'hachan-cat-level-v1';
const SELECTED_LEVEL_KEY = 'hachan-cat-selected-level-v1';
const MISS_TAUNTS = ['거긴 나 방금 살던 곳', '화면만 억울하게 맞았네', '손가락이 길을 잃었어요', '그 속도로 모기 잡겠어?'];
const NEAR_TAUNTS = ['방금 수염은 잡았어', '오, 그건 좀 위험했다', '털 한 가닥 드릴까요?', '머리카락 스쳤다, 인정'];
const LEVEL_TAUNTS = ['손가락은 눈보다 느리다냥', '자, 이번엔 어디로?', '나 지금 한 손으로 피하는 중', '표정 보니 벌써 졌네'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [attempts, setAttempts] = useState(0);
  const [misses, setMisses] = useState(0);
  const [nearMisses, setNearMisses] = useState(0);
  const [selectedLevel, setSelectedLevel] = useState(() => Number(localStorage.getItem(SELECTED_LEVEL_KEY) ?? 1));
  const [unlockedLevel, setUnlockedLevel] = useState(() => Math.min(LEVELS.length, Number(localStorage.getItem(PROGRESS_KEY) ?? 1)));
  const [caughtLevels, setCaughtLevels] = useState<number[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CAUGHT_LEVELS_KEY) ?? '[]') as number[];
      if (saved.length) return saved;
    } catch { /* 기존 진행도에서 복구 */ }
    const progress = Math.min(LEVELS.length, Number(localStorage.getItem(PROGRESS_KEY) ?? 1));
    return Array.from({ length: Math.max(0, progress - 1) }, (_, index) => index + 1);
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
  const difficulty = getLevel(selectedLevel);

  useEffect(() => { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); }, [collection]);
  useEffect(() => { localStorage.setItem(CAUGHT_LEVELS_KEY, JSON.stringify(caughtLevels)); }, [caughtLevels]);
  useEffect(() => {
    setCollection((current) => Array.from(new Set([...current, ...caughtLevels.flatMap((id) => REWARDS[id - 1]?.id ?? [])])));
  }, [caughtLevels]);
  useEffect(() => { localStorage.setItem(PROGRESS_KEY, String(unlockedLevel)); }, [unlockedLevel]);
  useEffect(() => { localStorage.setItem(SELECTED_LEVEL_KEY, String(selectedLevel)); }, [selectedLevel]);
  useEffect(() => { aimRef.current = aim; }, [aim]);
  useEffect(() => { positionRef.current = position; }, [position]);

  useEffect(() => {
    if (screen !== 'game') return;
    const clock = window.setInterval(() => {
      const left = Math.max(0, difficulty.roundMs - (Date.now() - startedAt.current));
      setRemainingMs(left);
      if (left === 0 && !finishedRef.current) {
        finishedRef.current = true;
        setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'time', elapsedMs: difficulty.roundMs, attempts: attemptsRef.current });
        setTaunt('시간도 네 편은 아니네?');
        setScreen('loss');
      }
    }, 60);

    let moveTimer = 0;
    const move = () => {
      const step = moveStep.current++;
      const next = movementFor(difficulty.behavior, step, positionRef.current, aimRef.current);
      positionRef.current = next;
      setPosition(next);
      setPose(difficulty.poses[step % difficulty.poses.length]);
      if (step > 0 && step % 4 === 0) { setTaunt(LEVEL_TAUNTS[(step + difficulty.id) % LEVEL_TAUNTS.length]); setTauntKey((value) => value + 1); }
      const rageFactor = difficulty.behavior === 'rage' || difficulty.behavior === 'overlord' ? Math.max(.55, 1 - (Date.now() - startedAt.current) / difficulty.roundMs * .38) : 1;
      const tempoFactor = difficulty.behavior === 'tempo' && step % 3 === 0 ? 1.75 : 1;
      moveTimer = window.setTimeout(move, difficulty.moveDelay * rageFactor * tempoFactor);
    };
    moveTimer = window.setTimeout(move, 260);
    return () => { window.clearInterval(clock); window.clearTimeout(moveTimer); };
  }, [screen, difficulty]);

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
  const rewardCount = useMemo(() => new Set(collection).size, [collection]);
  const timeProgress = Math.round((remainingMs / difficulty.roundMs) * 100);

  function startGame(levelId = selectedLevel) {
    const safeLevel = Math.min(levelId, unlockedLevel, LEVELS.length);
    setSelectedLevel(safeLevel);
    startedAt.current = Date.now();
    moveStep.current = 0; attemptsRef.current = 0; missesRef.current = 0; bossHitsRef.current = 0; finishedRef.current = false; aimRef.current = null; positionRef.current = START_POSITION;
    setAttempts(0); setMisses(0); setNearMisses(0); setBossHits(0); setPose('wiggle'); setPosition(START_POSITION);
    setTaunt('잡아봐. 어디 한번.'); setTauntKey((value) => value + 1); setAim(null); setFeedback(null);
    setRemainingMs(getLevel(safeLevel).roundMs); setResult(null); setLossResult(null); setScreen('game');
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
    const dash = 120 + selectedLevel * 4;
    const next = {
      x: clamp(((catX - field.left + dx / length * dash) / field.width) * 100, 15, 85),
      y: clamp(((catY - field.top + dy / length * dash * .82) / field.height) * 100, 23, 77),
      tilt: dx > 0 ? 14 : -14,
    };
    positionRef.current = next;
    setPosition(next);
    setPose(selectedLevel >= 17 ? 'butt' : selectedLevel >= 10 ? 'matrix' : 'paddle');
  }

  function handleAimStart(event: React.PointerEvent<HTMLDivElement>) {
    if (finishedRef.current) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextAim = { ...point, clientX: event.clientX, clientY: event.clientY, startedAt: Date.now(), dx: 0, dy: 0 };
    aimRef.current = nextAim; setAim(nextAim);
    if ('vibrate' in navigator) navigator.vibrate?.(8);
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
        if ('vibrate' in navigator) navigator.vibrate?.([35, 25, 65]);
        return;
      }
      finishedRef.current = true;
      const reward = chooseReward(difficulty.id);
      const [grade, verdict] = getGrade(accuracy, elapsedMs, nextAttempts);
      const nextResult: GameResult = { attempts: nextAttempts, elapsedMs, accuracy, nearMisses, level: difficulty.id, levelName: difficulty.name, grade, verdict, reward };
      setResult(nextResult); setCollection((current) => [...current, reward.id]);
      setCaughtLevels((current) => current.includes(difficulty.id) ? current : [...current, difficulty.id]);
      setUnlockedLevel((current) => Math.max(current, Math.min(LEVELS.length, difficulty.id + 1)));
      setFeedback({ key: Date.now(), text: `${accuracy}% 정확 포획!`, near: true });
      if ('vibrate' in navigator) navigator.vibrate?.([45, 30, 110]);
      window.setTimeout(() => setScreen('result'), 500);
      return;
    }

    const nearRadius = hitRadius + 42;
    const isNear = distance <= nearRadius;
    if (isNear) setNearMisses((value) => value + 1);
    const nextMisses = missesRef.current + 1;
    missesRef.current = nextMisses; setMisses(nextMisses);
    const pool = isNear ? NEAR_TAUNTS : MISS_TAUNTS;
    setTaunt(pool[nextAttempts % pool.length]); setTauntKey((value) => value + 1);
    setFeedback({ key: Date.now(), text: isNear ? '털끝 차이!' : '헛손질!', near: isNear });
    moveCatAway(event.clientX, event.clientY);
    if ('vibrate' in navigator) navigator.vibrate?.(isNear ? [18, 20, 18] : 14);
    if (nextMisses >= difficulty.attemptsAllowed) {
      finishedRef.current = true;
      setLossResult({ level: difficulty.id, levelName: difficulty.name, reason: 'misses', elapsedMs, attempts: nextAttempts });
      window.setTimeout(() => setScreen('loss'), 480);
    }
  }

  async function handleSave() { if (!result || busy) return; setBusy('save'); try { await saveMemeCard(result); } finally { setBusy(null); } }
  async function handleShare() { if (!result || busy) return; setBusy('share'); try { await shareChallenge(result); } finally { setBusy(null); } }
  async function handleLossSave() { if (!lossResult || busy) return; setBusy('save'); try { await saveLossMemeCard(lossResult); } finally { setBusy(null); } }
  async function handleLossShare() { if (!lossResult || busy) return; setBusy('share'); try { await shareLossChallenge(lossResult); } finally { setBusy(null); } }

  const character = (caught = false) => <CatCharacter ref={caught ? undefined : headRef} caught={caught} reward={caught ? result?.reward : undefined} pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} />;

  return (
    <main className="app-shell">
      <header className="app-header"><button className="wordmark" onClick={() => setScreen('home')} aria-label="홈으로">하찮냥<span>˙</span></button><button className="collection-link" onClick={() => setScreen('collection')}>도감 <strong>{collectionCount}</strong></button></header>

      {screen === 'home' && <section className="home-screen page-enter">
        <div className="home-copy"><span className="kicker">세상에서 제일 쓸데없는 승부</span><h1>이 고양이,<br /><em>잡을 수 있겠어?</em></h1><p>누르고 쫓아가다 머리 위에서 손을 떼세요.</p></div>
        <div className="home-character-wrap"><div className="speech-bubble">20마리나 준비했는데?</div><CatCharacter pose="paddle" evil={2} /><span className="floor-shadow" /></div>
        <button className="level-select-button" onClick={() => setScreen('levels')}><span>현재 상대</span><strong>Lv.{difficulty.id} {difficulty.name}</strong><i>성깔 지도 ›</i></button>
        <button className="primary-button wobble-button" onClick={() => startGame()}>잡으러 가기 <span>→</span></button><p className="tiny-caption">확률 없음 · 시간 종료는 고양이 승 · 쉬는 타임 없음</p>
      </section>}

      {screen === 'levels' && <section className="levels-screen page-enter">
        <div className="levels-heading"><span className="kicker">20단계 킹받음</span><h1>성깔 지도</h1><p>네 단계마다 규칙이 바뀌고, 표정도 점점 못돼져요.</p></div>
        <div className="level-map">{LEVELS.map((level) => { const locked = level.id > unlockedLevel; const selected = level.id === selectedLevel; return <button key={level.id} className={`level-card ${locked ? 'is-locked' : ''} ${selected ? 'is-selected' : ''}`} onClick={() => !locked && startGame(level.id)} disabled={locked} style={{ '--level-accent': level.accent } as React.CSSProperties}><span>{locked ? '🔒' : `LV.${level.id}`}</span><strong>{locked ? '아직 모름냥' : level.name}</strong><p>{locked ? '앞 단계를 먼저 잡으세요.' : level.description}</p><i>{level.chapter}</i></button>; })}</div>
        <button className="text-button" onClick={() => setScreen('home')}>일단 홈으로</button>
      </section>}

      {screen === 'game' && <section className={`game-screen page-enter behavior-${difficulty.behavior}`}>
        <div className="game-hud"><div className="attempt-counter"><span>Lv.{difficulty.id} {difficulty.name}</span><strong>{attempts}회</strong></div>
          <div className="chance-lives" aria-label={`남은 실수 ${difficulty.attemptsAllowed - misses}`}>{Array.from({ length: difficulty.attemptsAllowed }, (_, index) => <i key={index} className={index < misses ? 'is-broken' : ''}>●</i>)}</div>
          {difficulty.hitsRequired && <div className="boss-lives" aria-label={`남은 체력 ${difficulty.hitsRequired - bossHits}`}>{Array.from({ length: difficulty.hitsRequired }, (_, index) => <i key={index} className={index < bossHits ? 'is-broken' : ''}>♛</i>)}</div>}
          <div className="round-status"><div><span>남은 시간</span><strong>{(remainingMs / 1000).toFixed(1)}s</strong></div><div className="fatigue-track"><i style={{ width: `${timeProgress}%` }} /></div></div>
        </div>
        <div ref={fieldRef} className={`game-field ${aim ? 'is-aiming' : ''}`} onPointerDown={handleAimStart} onPointerMove={handleAimMove} onPointerUp={handleAimRelease} onPointerCancel={clearAim} aria-label="고양이 포획 구역">
          <div key={tauntKey} className="taunt-bubble" style={{ left: `${position.x}%`, top: `calc(${position.y}% - 134px)` }}>{taunt}</div>
          <div className={`cat-target ${result ? 'is-caught' : ''}`} style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.tilt}deg)`, '--move-ms': `${Math.max(135, difficulty.moveDelay * .72)}ms` } as React.CSSProperties}>
            {(difficulty.behavior === 'clone' || difficulty.behavior === 'overlord') && <><span className="cat-afterimage one"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span><span className="cat-afterimage two"><CatCharacter pose={pose} fur={difficulty.fur} accent={difficulty.accent} evil={difficulty.evil} /></span></>}
            {character(Boolean(result))}
          </div>
          {aim && <div className={`catch-reticle ${['blink', 'mirror', 'overlord'].includes(difficulty.behavior) ? 'is-warped' : ''}`} style={{ left: aim.x, top: aim.y }}><span>놓기!</span></div>}
          {feedback && <div key={feedback.key} className={`catch-feedback ${feedback.near ? 'is-near' : ''}`}>{feedback.text}</div>}
          <div className="field-dots" aria-hidden="true"><i /><i /><i /><i /></div>
        </div><p className="game-tip">머리가 실제 판정 부위예요 · 실수 {difficulty.attemptsAllowed}번이면 패배</p>
      </section>}

      {screen === 'loss' && lossResult && <section className="loss-screen page-enter">
        <div className="loss-heading"><span className="loss-stamp">CAT WINS</span><h1>{lossResult.reason === 'time' ? '시간 끝. 고양이 승.' : '손이 먼저 털렸습니다.'}</h1><p>졌지만 콘텐츠는 남았습니다.</p></div>
        <LossCard loss={lossResult} />
        <div className="loss-actions"><button className="primary-button" onClick={handleLossShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '패배 자랑하기'} <span>→</span></button><button className="secondary-button" onClick={handleLossSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '패배 밈 카드 저장'}</button><button className="text-button" onClick={() => startGame(lossResult.level)}>자존심 재도전</button><button className="text-button" onClick={() => setScreen('levels')}>다른 고양이 보기</button></div>
      </section>}

      {screen === 'result' && result && <section className="result-screen page-enter">
        <div className="confetti" aria-hidden="true">✦ <i>●</i> ◆ <b>✦</b> <em>●</em></div><div className="result-heading"><span>Lv.{result.level} {result.levelName} 포획 성공!</span><h1>잡힌 게 아니라<br />제대로 잡힌 겁니다.</h1></div><RewardCard result={result} compact />
        <div className="result-actions">{result.level < LEVELS.length && <button className="primary-button next-level-button" onClick={() => startGame(result.level + 1)}>더 악랄한 {getLevel(result.level + 1).name} <span>→</span></button>}<button className={result.level < LEVELS.length ? 'secondary-button' : 'primary-button'} onClick={handleShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '친구 도발하기'}</button><button className="secondary-button" onClick={handleSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '밈 카드 저장'}</button><button className="text-button" onClick={() => startGame(result.level)}>같은 성깔 기록 줄이기</button></div>
      </section>}

      {screen === 'collection' && <section className="collection-screen page-enter">
        <div className="collection-heading"><span className="kicker">잡은 성깔은 박제됩니다</span><h1>하찮냥 수집함</h1><p>고양이와 전용 밈 카드를 한 쌍씩 모아보세요.</p></div>
        <div className="collection-tabs"><button className={collectionTab === 'levels' ? 'is-active' : ''} onClick={() => setCollectionTab('levels')}>성깔 도감 <strong>{collectionCount}/20</strong></button><button className={collectionTab === 'memes' ? 'is-active' : ''} onClick={() => setCollectionTab('memes')}>밈 카드 <strong>{rewardCount}/20</strong></button></div>
        {collectionTab === 'levels' ? <div className="collection-grid level-collection-grid">{LEVELS.map((level) => { const caught = caughtLevels.includes(level.id); return <article key={level.id} className={`collection-card level-collection-card ${caught ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: caught ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{caught ? <CatCharacter caught pose={level.poses[0]} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{level.id}</span><strong>{caught ? level.name : '아직 모름냥'}</strong><p>{caught ? level.description : '직접 잡아야 정체가 보여요.'}</p></article>; })}</div>
          : <div className="collection-grid meme-collection-grid">{REWARDS.map((cat, index) => { const unlocked = collection.includes(cat.id); const level = LEVELS[index]; return <article key={cat.id} className={`collection-card ${unlocked ? '' : 'is-locked'}`}><div className="collection-cat" style={{ background: unlocked ? `linear-gradient(145deg,#fff 55%,${level.accent})` : '#E8E5DF' }}>{unlocked ? <CatCharacter caught reward={cat} fur={level.fur} accent={level.accent} evil={level.evil} /> : <span>?</span>}</div><span className="collection-level">LV.{index + 1}</span><strong>{unlocked ? cat.name : '아직 모름냥'}</strong><p>{unlocked ? cat.description : '해당 레벨을 잡으면 확정 지급돼요.'}</p></article>; })}</div>}
        <button className="primary-button" onClick={() => startGame()}>더 잡으러 가기</button>
      </section>}
    </main>
  );
}

export default App;
