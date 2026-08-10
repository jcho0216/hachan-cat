import type { CatReward } from '../types';
import type { CatPose } from '../levels';

type Props = {
  caught?: boolean;
  reward?: CatReward;
  pose?: CatPose;
};

export function CatCharacter({ caught = false, reward, pose = 'wiggle' }: Props) {
  const color = reward?.color ?? '#FFE0A8';
  const accent = reward?.accent ?? '#FF8D6B';
  const face = reward?.face ?? 'smug';

  return (
    <div className={`cat-character pose-${pose} ${caught ? 'is-caught' : ''}`} aria-hidden="true">
      <svg className="cat-svg" viewBox="0 0 150 215" role="img" aria-label="씰룩거리는 졸라맨 고양이">
        <g className="cat-head">
          <path d="M31 54 24 14l35 19c10-4 22-4 32 0l35-19-7 41c8 9 12 21 12 34 0 35-25 57-56 57S19 124 19 89c0-14 4-26 12-35Z" fill={color} stroke="#202124" strokeWidth="6" strokeLinejoin="round" />
          <path d="m32 29 19 12-15 9Z" fill={accent} opacity=".8" />
          <path d="m118 29-19 12 15 9Z" fill={accent} opacity=".8" />
          {face === 'tired' || face === 'sleepy' ? (
            <>
              <path d="M42 78q12 10 23 0" fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" />
              <path d="M87 78q12 10 23 0" fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" />
            </>
          ) : face === 'blank' || face === 'proud' ? (
            <>
              <circle cx="54" cy="81" r="5" fill="#202124" />
              <circle cx="98" cy="81" r="5" fill="#202124" />
            </>
          ) : (
            <>
              <path d="M42 80q11-9 22 0" fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" />
              <path d="M88 80q11-9 22 0" fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" />
            </>
          )}
          <path d="m69 96 7 6 7-6" fill={accent} stroke="#202124" strokeWidth="4" strokeLinejoin="round" />
          <path d={face === 'grumpy' ? 'M63 112q13-8 26 0' : face === 'blank' ? 'M69 113h14' : 'M64 108q12 14 25 0'} fill="none" stroke="#202124" strokeWidth="5" strokeLinecap="round" />
          <path d="M28 96 4 91M28 106 5 111M123 96l23-5M123 106l22 5" stroke="#202124" strokeWidth="4" strokeLinecap="round" />
          {!caught && <path d="M114 62q10 5 10 17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".75" />}
        </g>
        <g className="stick-body" fill="none" stroke="#202124" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path className="torso" d="M75 145q-10 26 0 42" />
          <path className="arm-left" d="M70 157 42 176" />
          <path className="arm-right" d="M79 157 108 173" />
          <path className="leg-left" d="M75 186 52 208" />
          <path className="leg-right" d="M75 186 100 208" />
        </g>
      </svg>
      {!caught && <div className="wiggle-lines"><span /><span /></div>}
      {!caught && pose === 'taunt' && <span className="pose-mark">♪</span>}
      {!caught && pose === 'panic' && <span className="pose-mark">!</span>}
      {!caught && pose === 'tired' && <span className="pose-mark">헥</span>}
    </div>
  );
}
