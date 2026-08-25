import { forwardRef } from 'react';
import type { CatReward } from '../types';
import type { CatPose } from '../levels';
import { getCatFaceGeometry } from '../catAppearance';

type Props = {
  caught?: boolean;
  reward?: CatReward;
  pose?: CatPose;
  fur?: string;
  accent?: string;
  evil?: number;
  attention?: 'idle' | 'watch' | 'danger';
};

export const CatCharacter = forwardRef<SVGRectElement, Props>(function CatCharacter(
  { caught = false, reward, pose = 'wiggle', fur, accent: accentProp, evil = 0, attention = 'idle' }, headRef,
) {
  const color = fur ?? reward?.color ?? '#FFE0A8';
  const accent = accentProp ?? reward?.accent ?? '#FF8D6B';
  const appearance = getCatFaceGeometry(reward?.face, evil);

  return (
    <div className={`cat-character pose-${pose} evil-${Math.min(10, evil)} attention-${attention} ${caught ? 'is-caught' : ''}`} aria-hidden="true">
      <svg className="cat-svg" viewBox="0 0 150 215" role="img" aria-label="요리조리 피하는 졸라맨 고양이">
        <g className="cat-rig">
        <g className="upper-rig">
          <g className="cat-head">
          <path d="M31 54 24 14l35 19c10-4 22-4 32 0l35-19-7 41c8 9 12 21 12 34 0 35-25 57-56 57S19 124 19 89c0-14 4-26 12-35Z" fill={color} stroke="#202124" strokeWidth="6" strokeLinejoin="round" />
          <path d="m32 29 19 12-15 9Z" fill={accent} opacity=".8" />
          <path d="m118 29-19 12 15 9Z" fill={accent} opacity=".8" />
          {appearance.hasHorns && <><path d="M34 24 18 4l28 13" fill={accent} stroke="#202124" strokeWidth="5" /><path d="m116 23 16-19-28 13" fill={accent} stroke="#202124" strokeWidth="5" /></>}
          {appearance.eyeStyle === 'closed' ? (
            <><path d="M42 78q12 10 23 0" fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" /><path d="M87 78q12 10 23 0" fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" /></>
          ) : appearance.eyeStyle === 'round' ? (
            <><circle className="eye-left" cx="54" cy="81" r={evil >= 4 ? 6 : 5} fill="#202124" /><circle className="eye-right" cx="98" cy="81" r={evil >= 4 ? 6 : 5} fill="#202124" /><circle className="eye-glint eye-glint-left" cx="56" cy="79" r="1.7" fill="#fff" /><circle className="eye-glint eye-glint-right" cx="100" cy="79" r="1.7" fill="#fff" /></>
          ) : (
            <><path d={appearance.eyeStyle === 'angled' ? 'M41 73q12 2 23 9' : 'M42 80q11-9 22 0'} fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" /><path d={appearance.eyeStyle === 'angled' ? 'M111 73q-12 2-23 9' : 'M88 80q11-9 22 0'} fill="none" stroke="#202124" strokeWidth="6" strokeLinecap="round" /></>
          )}
          <path d="m69 96 7 6 7-6" fill={accent} stroke="#202124" strokeWidth="4" strokeLinejoin="round" />
          <path d={appearance.mouthPath} fill="none" stroke="#202124" strokeWidth="5" strokeLinecap="round" />
          {appearance.hasFangs && <><path d="m66 109 4 9 4-8M83 110l4 8 4-10" fill="#fff" stroke="#202124" strokeWidth="2" /><path d="M31 64 61 72M120 64 91 72" stroke="#202124" strokeWidth="5" strokeLinecap="round" /></>}
          {appearance.hasScar && <path d="m108 48-10 12 9 5-12 11" fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" />}
          {attention !== 'idle' && <path className="focus-brows" d="M41 66 62 70M110 66 89 70" fill="none" stroke="#202124" strokeWidth="4" strokeLinecap="round" />}
          <path d="M28 96 4 91M28 106 5 111M123 96l23-5M123 106l22 5" stroke="#202124" strokeWidth="4" strokeLinecap="round" />
          </g>
          <rect ref={headRef} className="svg-head-anchor" x="19" y="14" width="112" height="132" rx="48" fill="transparent" />
        </g>
        <g className="body-rig">
        <g className="stick-body" fill="none" stroke="#202124" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
          <path className="neck" d="M75 136Q73 146 75 155" />
          <path className="torso" d="M75 145q-10 26 0 42" />
          <g className="arm-left"><path d="M70 157 42 176" /><circle cx="41" cy="176" r="5" fill={color} /></g>
          <g className="arm-right"><path d="M79 157 108 173" /><circle cx="109" cy="173" r="5" fill={color} /></g>
          <path className="leg-left" d="M75 186 52 208" />
          <path className="leg-right" d="M75 186 100 208" />
        </g>
        </g>
        </g>
      </svg>
      {!caught && <div className="wiggle-lines"><span /><span /></div>}
      {!caught && ['taunt', 'butt'].includes(pose) && <span className="pose-mark">ㅋㅋ</span>}
      {!caught && ['paddle', 'windmill'].includes(pose) && <span className="pose-mark">삭삭</span>}
      {!caught && attention === 'danger' && <span className="danger-mark">!</span>}
      {!caught && evil >= 8 && <span className="evil-aura">✦</span>}
    </div>
  );
});
