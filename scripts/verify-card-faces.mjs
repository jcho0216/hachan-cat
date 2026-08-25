import assert from 'node:assert/strict';
import { createCardCatSvg, getCatFaceGeometry } from '../src/catAppearance.ts';
import { REWARDS } from '../src/data.ts';
import { LEVELS } from '../src/levels.ts';

assert.equal(REWARDS.length, LEVELS.length, '레벨과 보상 얼굴 수가 같아야 합니다.');

LEVELS.forEach((level, index) => {
  const rewardAppearance = getCatFaceGeometry(REWARDS[index].face, level.evil);
  const lossAppearance = getCatFaceGeometry(undefined, level.evil);
  const rewardSvg = createCardCatSvg(level, REWARDS[index].face);
  const lossSvg = createCardCatSvg(level);

  assert.equal(rewardAppearance.face, REWARDS[index].face, `Lv.${level.id} 보상 얼굴이 유지되어야 합니다.`);
  assert.equal(rewardAppearance.hasHorns, level.evil >= 8, `Lv.${level.id} 뿔 단계가 일치해야 합니다.`);
  assert.equal(rewardAppearance.hasFangs, level.evil >= 6, `Lv.${level.id} 송곳니 단계가 일치해야 합니다.`);
  assert.equal(rewardAppearance.hasScar, level.evil >= 4, `Lv.${level.id} 흉터 단계가 일치해야 합니다.`);
  assert.equal(lossAppearance.face, level.evil >= 6 ? 'grumpy' : level.evil >= 3 ? 'smug' : 'blank', `Lv.${level.id} 패배 카드 얼굴이 일치해야 합니다.`);
  assert.ok(rewardSvg.includes(rewardAppearance.mouthPath), `Lv.${level.id} 보상 PNG 입 모양이 일치해야 합니다.`);
  assert.ok(lossSvg.includes(lossAppearance.mouthPath), `Lv.${level.id} 패배 PNG 입 모양이 일치해야 합니다.`);
  assert.equal(rewardSvg.includes('M34 24 18 4l28 13'), level.evil >= 8, `Lv.${level.id} PNG 뿔이 일치해야 합니다.`);
  assert.equal(rewardSvg.includes('m66 109 4 9'), level.evil >= 6, `Lv.${level.id} PNG 송곳니가 일치해야 합니다.`);
  assert.equal(rewardSvg.includes('m108 48-10 12'), level.evil >= 4, `Lv.${level.id} PNG 흉터가 일치해야 합니다.`);
});

console.log('✓ 10 reward/loss card faces share the in-game appearance rules');
