import { useEffect, useMemo, useRef, useState } from 'react';
import { CatCharacter } from './components/CatCharacter';
import { RewardCard } from './components/RewardCard';
import { REWARDS, chooseReward, getGrade } from './data';
import { saveMemeCard, shareChallenge } from './share';
import type { GameResult } from './types';

type Screen = 'home' | 'game' | 'result' | 'collection';
type Position = { x: number; y: number; tilt: number };
type Aim = { x: number; y: number; clientX: number; clientY: number; startedAt: number };

const START_POSITION: Position = { x: 50, y: 48, tilt: 0 };
const COLLECTION_KEY = 'hachan-cat-collection-v1';
const ROUND_MS = 15_000;
const HIT_RADIUS = 78;
const NEAR_MISS_RADIUS = 126;

const MOVE_PATTERNS: Position[][] = [
  [
    { x: 24, y: 34, tilt: -7 }, { x: 72, y: 38, tilt: 8 },
    { x: 64, y: 68, tilt: -5 }, { x: 31, y: 65, tilt: 7 },
    { x: 52, y: 45, tilt: -3 },
  ],
  [
    { x: 50, y: 29, tilt: 2 }, { x: 76, y: 58, tilt: -8 },
    { x: 49, y: 72, tilt: 5 }, { x: 22, y: 54, tilt: -5 },
    { x: 35, y: 36, tilt: 8 },
  ],
  [
    { x: 25, y: 69, tilt: 7 }, { x: 35, y: 31, tilt: -6 },
    { x: 75, y: 63, tilt: 5 }, { x: 66, y: 33, tilt: -8 },
    { x: 49, y: 53, tilt: 3 },
  ],
];

const MISS_TAUNTS = ['거긴 나 방금 살던 곳', '화면만 억울하게 맞았네', '손가락이 길을 잃었어요'];
const NEAR_TAUNTS = ['방금 수염은 잡았어', '오, 그건 좀 위험했다', '털 한 가닥 드릴까요?'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [attempts, setAttempts] = useState(0);
  const [nearMisses, setNearMisses] = useState(0);
  const [position, setPosition] = useState(START_POSITION);
  const [taunt, setTaunt] = useState('누르고 조준해 보시지');
  const [tauntKey, setTauntKey] = useState(0);
  const [aim, setAim] = useState<Aim | null>(null);
  const [remainingMs, setRemainingMs] = useState(ROUND_MS);
  const [overtime, setOvertime] = useState(false);
  const [feedback, setFeedback] = useState<{ key: number; text: string; near: boolean } | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [collection, setCollection] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? '[]'); } catch { return []; }
  });
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);

  const fieldRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(Date.now());
  const patternIndex = useRef(0);
  const moveStep = useRef(0);
  const aimRef = useRef<Aim | null>(null);
  const overtimeRef = useRef(false);
  const attemptsRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  }, [collection]);

  useEffect(() => { aimRef.current = aim; }, [aim]);
  useEffect(() => { overtimeRef.current = overtime; }, [overtime]);

  useEffect(() => {
    if (screen !== 'game') return;

    const clock = window.setInterval(() => {
      const left = Math.max(0, ROUND_MS - (Date.now() - startedAt.current));
      setRemainingMs(left);
      if (left === 0 && !overtimeRef.current) {
        overtimeRef.current = true;
        setOvertime(true);
        setTaunt('잠깐, 나도 허리 좀…');
        setTauntKey((value) => value + 1);
      }
    }, 80);

    let moveTimer = 0;
    const move = () => {
      const pattern = MOVE_PATTERNS[patternIndex.current];
      const next = pattern[moveStep.current % pattern.length];
      moveStep.current += 1;
      setPosition(next);
      const elapsed = Date.now() - startedAt.current;
      const delay = overtimeRef.current ? 1180 : Math.max(520, 920 - elapsed / 28);
      moveTimer = window.setTimeout(move, delay);
    };
    moveTimer = window.setTimeout(move, 700);

    return () => {
      window.clearInterval(clock);
      window.clearTimeout(moveTimer);
    };
  }, [screen]);

  useEffect(() => {
    if (!aim || screen !== 'game') return;
    const dodgeTimer = window.setTimeout(() => {
      if (!aimRef.current) return;
      moveCatAway(aimRef.current.clientX, aimRef.current.clientY);
      setTaunt(overtimeRef.current ? '지쳤다고 멈춘 건 아님' : '조준하는 거 다 보임');
      setTauntKey((value) => value + 1);
    }, overtime ? 760 : 480);
    return () => window.clearTimeout(dodgeTimer);
  }, [aim?.startedAt, overtime, screen]);

  const collectionCount = useMemo(() => new Set(collection).size, [collection]);
  const fatigue = Math.round((1 - remainingMs / ROUND_MS) * 100);

  function startGame() {
    startedAt.current = Date.now();
    patternIndex.current = Math.floor(Math.random() * MOVE_PATTERNS.length);
    moveStep.current = 0;
    attemptsRef.current = 0;
    overtimeRef.current = false;
    aimRef.current = null;
    setAttempts(0);
    setNearMisses(0);
    setPosition(START_POSITION);
    setTaunt('누르고 조준해 보시지');
    setAim(null);
    setFeedback(null);
    setRemainingMs(ROUND_MS);
    setOvertime(false);
    setResult(null);
    setScreen('game');
  }

  function pointInField(clientX: number, clientY: number) {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: clamp(clientX - rect.left, 0, rect.width),
      y: clamp(clientY - rect.top, 0, rect.height),
    };
  }

  function moveCatAway(clientX: number, clientY: number) {
    const field = fieldRef.current?.getBoundingClientRect();
    const cat = catRef.current?.getBoundingClientRect();
    if (!field || !cat) return;
    const catX = cat.left + cat.width / 2;
    const catY = cat.top + cat.height * 0.45;
    const dx = catX - clientX;
    const dy = catY - clientY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nextX = clamp(((catX - field.left + (dx / length) * 135) / field.width) * 100, 18, 82);
    const nextY = clamp(((catY - field.top + (dy / length) * 120) / field.height) * 100, 25, 76);
    setPosition({ x: nextX, y: nextY, tilt: dx > 0 ? 8 : -8 });
  }

  function handleAimStart(event: React.PointerEvent<HTMLDivElement>) {
    if (result) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const nextAim = { ...point, clientX: event.clientX, clientY: event.clientY, startedAt: Date.now() };
    aimRef.current = nextAim;
    setAim(nextAim);
    if ('vibrate' in navigator) navigator.vibrate?.(8);
  }

  function handleAimMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!aimRef.current) return;
    const point = pointInField(event.clientX, event.clientY);
    if (!point) return;
    const nextAim = { ...aimRef.current, ...point, clientX: event.clientX, clientY: event.clientY };
    aimRef.current = nextAim;
    setAim(nextAim);
  }

  function clearAim() {
    aimRef.current = null;
    setAim(null);
  }

  function handleAimRelease(event: React.PointerEvent<HTMLDivElement>) {
    const currentAim = aimRef.current;
    const cat = catRef.current?.getBoundingClientRect();
    if (!currentAim || !cat || result) {
      clearAim();
      return;
    }

    const nextAttempts = attemptsRef.current + 1;
    attemptsRef.current = nextAttempts;
    setAttempts(nextAttempts);

    const catX = cat.left + cat.width / 2;
    const catY = cat.top + cat.height * 0.45;
    const distance = Math.hypot(event.clientX - catX, event.clientY - catY);
    const hitRadius = overtimeRef.current ? HIT_RADIUS + 15 : HIT_RADIUS;
    const accuracy = clamp(Math.round(100 - Math.max(0, distance - 12) * 0.72), 0, 100);
    const elapsedMs = Date.now() - startedAt.current;
    clearAim();

    if (distance <= hitRadius) {
      const reward = chooseReward(accuracy, nextAttempts, elapsedMs);
      const [grade, verdict] = getGrade(accuracy, elapsedMs, nextAttempts);
      const nextResult: GameResult = {
        attempts: nextAttempts,
        elapsedMs,
        accuracy,
        nearMisses,
        overtime: overtimeRef.current,
        grade,
        verdict,
        reward,
      };
      setResult(nextResult);
      setCollection((current) => [...current, reward.id]);
      setFeedback({ key: Date.now(), text: `${accuracy}% 정확 포획!`, near: true });
      if ('vibrate' in navigator) navigator.vibrate?.([45, 30, 110]);
      window.setTimeout(() => setScreen('result'), 520);
      return;
    }

    const isNear = distance <= NEAR_MISS_RADIUS;
    if (isNear) setNearMisses((value) => value + 1);
    const pool = isNear ? NEAR_TAUNTS : MISS_TAUNTS;
    const message = pool[nextAttempts % pool.length];
    setTaunt(message);
    setTauntKey((value) => value + 1);
    setFeedback({ key: Date.now(), text: isNear ? '털끝 차이!' : '헛손질!', near: isNear });
    moveCatAway(event.clientX, event.clientY);
    if ('vibrate' in navigator) navigator.vibrate?.(isNear ? [18, 20, 18] : 14);
  }

  async function handleSave() {
    if (!result || busy) return;
    setBusy('save');
    try { await saveMemeCard(result); } finally { setBusy(null); }
  }

  async function handleShare() {
    if (!result || busy) return;
    setBusy('share');
    try { await shareChallenge(result); } finally { setBusy(null); }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <button className="wordmark" onClick={() => setScreen('home')} aria-label="홈으로">하찮냥<span>˙</span></button>
        <button className="collection-link" onClick={() => setScreen('collection')}>도감 <strong>{collectionCount}</strong></button>
      </header>

      {screen === 'home' && (
        <section className="home-screen page-enter">
          <div className="home-copy">
            <span className="kicker">세상에서 제일 쓸데없는 승부</span>
            <h1>이 고양이,<br /><em>잡을 수 있겠어?</em></h1>
            <p>누르고 조준한 뒤, 손을 떼어 직접 덮치세요.</p>
          </div>
          <div className="home-character-wrap">
            <div className="speech-bubble">손가락은 준비됐고?</div>
            <CatCharacter />
            <span className="floor-shadow" />
          </div>
          <button className="primary-button wobble-button" onClick={startGame}>잡으러 가기 <span>→</span></button>
          <p className="tiny-caption">확률 없음 · 놓친 건 전부 내 손가락 탓</p>
        </section>
      )}

      {screen === 'game' && (
        <section className={`game-screen page-enter ${overtime ? 'is-overtime' : ''}`}>
          <div className="game-hud">
            <div className="attempt-counter"><span>덮치기</span><strong>{attempts}</strong></div>
            <div className="round-status">
              <div><span>{overtime ? '지침 타임' : '남은 시간'}</span><strong>{overtime ? 'NOW' : `${(remainingMs / 1000).toFixed(1)}s`}</strong></div>
              <div className="fatigue-track"><i style={{ width: `${overtime ? 100 : fatigue}%` }} /></div>
            </div>
          </div>
          <div
            ref={fieldRef}
            className={`game-field ${aim ? 'is-aiming' : ''}`}
            onPointerDown={handleAimStart}
            onPointerMove={handleAimMove}
            onPointerUp={handleAimRelease}
            onPointerCancel={clearAim}
            aria-label="고양이 포획 구역"
          >
            <div key={tauntKey} className="taunt-bubble" style={{ left: `${position.x}%`, top: `calc(${position.y}% - 132px)` }}>{taunt}</div>
            <div
              ref={catRef}
              className={`cat-target ${overtime ? 'is-tired' : ''} ${result ? 'is-caught' : ''}`}
              style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.tilt}deg)` }}
            >
              <CatCharacter caught={Boolean(result)} reward={result?.reward} />
            </div>
            {aim && (
              <div className={`catch-reticle ${overtime ? 'is-wide' : ''}`} style={{ left: aim.x, top: aim.y }}>
                <span>놓기!</span>
              </div>
            )}
            {feedback && <div key={feedback.key} className={`catch-feedback ${feedback.near ? 'is-near' : ''}`}>{feedback.text}</div>}
            <div className="field-dots" aria-hidden="true"><i /><i /><i /><i /></div>
          </div>
          <p className="game-tip">누른 채 쫓아가다가, 고양이 위에서 손을 떼세요</p>
        </section>
      )}

      {screen === 'result' && result && (
        <section className="result-screen page-enter">
          <div className="confetti" aria-hidden="true">✦ <i>●</i> ◆ <b>✦</b> <em>●</em></div>
          <div className="result-heading">
            <span>실력으로 포획 성공!</span>
            <h1>잡힌 게 아니라<br />제대로 잡힌 겁니다.</h1>
          </div>
          <RewardCard result={result} compact />
          <div className="result-actions">
            <button className="primary-button" onClick={handleShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '친구 도발하기'}</button>
            <button className="secondary-button" onClick={handleSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '밈 카드 저장'}</button>
            <button className="text-button" onClick={startGame}>기록 줄이러 다시 가기</button>
          </div>
        </section>
      )}

      {screen === 'collection' && (
        <section className="collection-screen page-enter">
          <div className="collection-heading">
            <span className="kicker">아무 쓸모 없는 수집품</span>
            <h1>고양이 도감</h1>
            <p>{collectionCount}/{REWARDS.length}마리를 괜히 모았어요.</p>
          </div>
          <div className="collection-grid">
            {REWARDS.map((cat) => {
              const unlocked = collection.includes(cat.id);
              return (
                <article key={cat.id} className={`collection-card ${unlocked ? '' : 'is-locked'}`}>
                  <div className="collection-cat" style={{ background: unlocked ? cat.color : '#E8E5DF' }}>
                    {unlocked ? <CatCharacter caught reward={cat} /> : <span>?</span>}
                  </div>
                  <strong>{unlocked ? cat.name : '아직 모름냥'}</strong>
                  <p>{unlocked ? cat.description : '잡다 보면 쓸데없이 나타나요.'}</p>
                </article>
              );
            })}
          </div>
          <button className="primary-button" onClick={startGame}>더 잡으러 가기</button>
        </section>
      )}
    </main>
  );
}

export default App;
