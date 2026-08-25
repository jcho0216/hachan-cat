import type { CatReward } from './types';

export type CatFace = CatReward['face'];
export type CatEyeStyle = 'closed' | 'round' | 'arched' | 'angled';

export type CatFaceGeometry = {
  face: CatFace;
  eyeStyle: CatEyeStyle;
  mouthPath: string;
  hasHorns: boolean;
  hasFangs: boolean;
  hasScar: boolean;
};

export type CardCatLevel = {
  fur: string;
  accent: string;
  evil: number;
};

export function resolveCatFace(face: CatFace | undefined, evil: number): CatFace {
  return face ?? (evil >= 6 ? 'grumpy' : evil >= 3 ? 'smug' : 'blank');
}

export function getCatFaceGeometry(face: CatFace | undefined, evil: number): CatFaceGeometry {
  const resolvedFace = resolveCatFace(face, evil);
  const eyeStyle: CatEyeStyle = resolvedFace === 'tired' || resolvedFace === 'sleepy'
    ? 'closed'
    : resolvedFace === 'blank' || resolvedFace === 'proud'
      ? 'round'
      : evil >= 5
        ? 'angled'
        : 'arched';

  return {
    face: resolvedFace,
    eyeStyle,
    mouthPath: resolvedFace === 'grumpy' ? 'M63 113q13-9 26 0' : resolvedFace === 'blank' ? 'M69 113h14' : 'M64 108q12 14 25 0',
    hasHorns: evil >= 8,
    hasFangs: evil >= 6,
    hasScar: evil >= 4,
  };
}

export function createCardCatSvg(level: CardCatLevel, face?: CatFace) {
  const appearance = getCatFaceGeometry(face, level.evil);
  const eyes = appearance.eyeStyle === 'closed'
    ? '<path d="M42 78q12 10 23 0M87 78q12 10 23 0" fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"/>'
    : appearance.eyeStyle === 'round'
      ? `<circle cx="54" cy="81" r="${level.evil >= 4 ? 6 : 5}" fill="#202124"/><circle cx="98" cy="81" r="${level.evil >= 4 ? 6 : 5}" fill="#202124"/><circle cx="56" cy="79" r="1.7" fill="#fff"/><circle cx="100" cy="79" r="1.7" fill="#fff"/>`
      : appearance.eyeStyle === 'angled'
        ? '<path d="M41 73q12 2 23 9M111 73q-12 2-23 9" fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"/>'
        : '<path d="M42 80q11-9 22 0M88 80q11-9 22 0" fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"/>';

  return `
    <g transform="translate(310 220) scale(3.05)">
      <path d="M31 54 24 14l35 19c10-4 22-4 32 0l35-19-7 41c8 9 12 21 12 34 0 35-25 57-56 57S19 124 19 89c0-14 4-26 12-35Z" fill="${level.fur}" stroke="#202124" stroke-width="5" stroke-linejoin="round"/>
      <path d="m32 29 19 12-15 9ZM118 29l-19 12 15 9Z" fill="${level.accent}"/>
      ${appearance.hasHorns ? `<path d="M34 24 18 4l28 13M116 23l16-19-28 13" fill="${level.accent}" stroke="#202124" stroke-width="5"/>` : ''}
      ${eyes}
      <path d="m69 96 7 6 7-6" fill="${level.accent}" stroke="#202124" stroke-width="3" stroke-linejoin="round"/>
      <path d="${appearance.mouthPath}" fill="none" stroke="#202124" stroke-width="5" stroke-linecap="round"/>
      ${appearance.hasFangs ? '<path d="m66 109 4 9 4-8M83 110l4 8 4-10" fill="#fff" stroke="#202124" stroke-width="2"/><path d="M31 64 61 72M120 64 91 72" fill="none" stroke="#202124" stroke-width="5" stroke-linecap="round"/>' : ''}
      ${appearance.hasScar ? `<path d="m108 48-10 12 9 5-12 11" fill="none" stroke="${level.accent}" stroke-width="4" stroke-linecap="round"/>` : ''}
      <path d="M28 96 4 91M28 106 5 111M123 96l23-5M123 106l22 5" fill="none" stroke="#202124" stroke-width="4" stroke-linecap="round"/>
      <g fill="none" stroke="#202124" stroke-width="6" stroke-linecap="round"><path d="M75 145q-10 26 0 42"/><path d="M70 157 42 176M79 157l29 16M75 186l-23 22M75 186l25 22"/></g>
    </g>`;
}
