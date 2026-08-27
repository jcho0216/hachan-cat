import { CatCharacter } from './CatCharacter';

type Props = {
  onNext: () => void;
};

export function WelcomeTutorial({ onNext }: Props) {
  return (
    <section className="tutorial-screen page-enter" aria-labelledby="tutorial-title">
      <div className="tutorial-heading">
        <div>
          <span className="kicker">FIRST CATCH</span>
          <span className="tutorial-progress">1 / 1</span>
        </div>
        <h1 id="tutorial-title">손가락 하나면<br /><em>충분해요.</em></h1>
        <p>딱 한 번만 알려드릴게요. 누르고, 쫓고, 떼면 끝!</p>
      </div>

      <div className="tutorial-card">
        <div className="tutorial-demo" aria-hidden="true">
          <span className="tutorial-hold">① 꾹 누르기</span>
          <CatCharacter pose="paddle" evil={1} />
          <span className="tutorial-release">② 머리에서 떼기</span>
          <i className="tutorial-path" />
          <b className="tutorial-finger">☝</b>
        </div>
        <div className="tutorial-instruction">
          <strong>빈 곳을 꾹 누른 채 고양이를 쫓아가세요.</strong>
          <span>손가락이 머리에 닿았을 때 떼면 잡기 성공!</span>
        </div>
      </div>

      <button className="primary-button tutorial-next" onClick={onNext}>
        다음 · 바로 시작 <span>→</span>
      </button>
      <p className="tutorial-once">이 안내는 지금 한 번만 보여요.</p>
    </section>
  );
}
