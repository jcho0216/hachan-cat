import { useEffect, useMemo, useRef, useState } from 'react';
import { CatCharacter } from './components/CatCharacter';
import { RewardCard } from './components/RewardCard';
import { REWARDS, TAUNTS, chooseReward, getGrade } from './data';
import { saveMemeCard, shareChallenge } from './share';
import type { GameResult } from './types';

type Screen = 'home' | 'game' | 'result' | 'collection';
type Position = { x: number; y: number; tilt: number };

const START_POSITION: Position = { x: 50, y: 48, tilt: 0 };
const COLLECTION_KEY = 'hachan-cat-collection-v1';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [attempts, setAttempts] = useState(0);
  const [position, setPosition] = useState(START_POSITION);
  const [taunt, setTaunt] = useState('잡을 수 있으면 잡아보시지');
  const [tauntKey, setTauntKey] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  const [collection, setCollection] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? '[]'); } catch { return []; }
  });
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const startedAt = useRef(Date.now());
  const lastTaunt = useRef(-1);

  useEffect(() => {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  }, [collection]);

  const collectionCount = useMemo(() => new Set(collection).size, [collection]);

  function startGame() {
    startedAt.current = Date.now();
    setAttempts(0);
    setPosition(START_POSITION);
    setTaunt('잡을 수 있으면 잡아보시지');
    setResult(null);
    setScreen('game');
  }

  function nextTaunt(nextAttempts: number) {
    let index = Math.floor(Math.random() * TAUNTS.length);
    if (index === lastTaunt.current) index = (index + 1) % TAUNTS.length;
    lastTaunt.current = index;
    if (nextAttempts >= 15) return '여기까지 온 게 더 무서움';
    if (nextAttempts >= 11) return TAUNTS[Math.max(9, index) % TAUNTS.length];
    return TAUNTS[index];
  }

  function shouldCatch(nextAttempts: number) {
    if (nextAttempts >= 18) return true;
    if (nextAttempts < 7) return false;
    const chance = 0.08 + (nextAttempts - 7) * 0.055;
    return Math.random() < chance;
  }

  function moveCat() {
    const x = 19 + Math.random() * 62;
    const y = 27 + Math.random() * 48;
    setPosition({ x, y, tilt: -9 + Math.random() * 18 });
  }

  function handleCatPress(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (shouldCatch(nextAttempts)) {
      const reward = chooseReward(nextAttempts);
      const [grade, verdict] = getGrade(nextAttempts);
      const nextResult = {
        attempts: nextAttempts,
        elapsedMs: Date.now() - startedAt.current,
        grade,
        verdict,
        reward,
      };
      setResult(nextResult);
      setCollection((current) => [...current, reward.id]);
      if ('vibrate' in navigator) navigator.vibrate?.([40, 35, 90]);
      window.setTimeout(() => setScreen('result'), 420);
      return;
    }

    setTaunt(nextTaunt(nextAttempts));
    setTauntKey((value) => value + 1);
    moveCat();
    if ('vibrate' in navigator) navigator.vibrate?.(18);
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
        <button className="wordmark" onClick={() => setScreen('home')} aria-label="홈으로">하찮첼<span>˙</span></button>
        <button className="collection-link" onClick={() => setScreen('collection')}>도감 <strong>{collectionCount}</strong></button>
      </header>

      {screen === 'home' && (
        <section className="home-screen page-enter">
          <div className="home-copy">
            <span className="kicker">세상에서 제일 쓸데없는 승부</span>
            <h1>이 고양이,<br /><em>잡을 수 있겠어?</em></h1>
            <p>잡으려 하면 피하고, 실패할수록 약 올려요.</p>
          </div>
          <div className="home-character-wrap">
            <div className="speech-bubble">손가락은 준비됐고?</div>
            <CatCharacter />
            <span className="floor-shadow" />
          </div>
          <button className="primary-button wobble-button" onClick={startGame}>잡으러 가기 <span>→</span></button>
          <p className="tiny-caption">주의: 생각보다 자존심이 상할 수 있음</p>
        </section>
      )}

      {screen === 'game' && (
        <section className="game-screen page-enter">
          <div className="game-hud">
            <div><span>시도</span><strong>{attempts}</strong></div>
            <p>고양이를 눌러 잡으세요</p>
          </div>
          <div className="game-field">
            <div key={tauntKey} className="taunt-bubble" style={{ left: `${position.x}%`, top: `calc(${position.y}% - 135px)` }}>{taunt}</div>
            <button
              className="cat-target"
              style={{ left: `${position.x}%`, top: `${position.y}%`, transform: `translate(-50%, -50%) rotate(${position.tilt}deg)` }}
              onPointerDown={handleCatPress}
              aria-label="고양이 잡기"
            >
              <CatCharacter caught={Boolean(result)} reward={result?.reward} />
            </button>
            <div className="field-dots" aria-hidden="true"><i /><i /><i /><i /></div>
          </div>
          <p className="game-tip">꾹 누르지 말고 빠르게 톡!</p>
        </section>
      )}

      {screen === 'result' && result && (
        <section className="result-screen page-enter">
          <div className="confetti" aria-hidden="true">✦ <i>●</i> ◆ <b>✦</b> <em>●</em></div>
          <div className="result-heading">
            <span>포획 성공!</span>
            <h1>잡힌 게 아니라<br />잡혀드린 겁니다.</h1>
          </div>
          <RewardCard result={result} compact />
          <div className="result-actions">
            <button className="primary-button" onClick={handleShare} disabled={Boolean(busy)}>{busy === 'share' ? '공유창 여는 중…' : '친구 도발하기'}</button>
            <button className="secondary-button" onClick={handleSave} disabled={Boolean(busy)}>{busy === 'save' ? '카드 만드는 중…' : '밈 카드 저장'}</button>
            <button className="text-button" onClick={startGame}>한 번 더 농락당하기</button>
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
