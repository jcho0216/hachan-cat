import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const png = await readFile(new URL('../public/og-thumbnail.png', import.meta.url));
const shareSource = await readFile(new URL('../src/share.ts', import.meta.url), 'utf8');

assert.equal(png.toString('ascii', 1, 4), 'PNG', '공유 썸네일은 PNG 파일이어야 합니다.');
assert.equal(png.readUInt32BE(16), 1200, '공유 썸네일 너비는 1200px이어야 합니다.');
assert.equal(png.readUInt32BE(20), 630, '공유 썸네일 높이는 630px이어야 합니다.');

for (const marker of [
  'property="og:title"',
  'property="og:description"',
  'property="og:image"',
  'property="og:image:width" content="1200"',
  'property="og:image:height" content="630"',
  'name="twitter:card" content="summary_large_image"',
]) {
  assert.ok(html.includes(marker), `공유 메타 태그가 필요합니다: ${marker}`);
}

assert.ok(html.includes('/og-thumbnail.png?v=2'), '카카오 이미지 캐시를 갱신할 버전 URL이 필요합니다.');
assert.ok(shareSource.includes('getTossShareLink(createCatchChallengeDeepLink(result), SHARE_PREVIEW_IMAGE_URL)'), '승리 공유 링크에 기록과 OG 이미지를 전달해야 합니다.');
assert.ok(shareSource.includes('getTossShareLink(createLossChallengeDeepLink(loss), SHARE_PREVIEW_IMAGE_URL)'), '패배 공유 링크에 복수 대상과 OG 이미지를 전달해야 합니다.');
assert.ok(shareSource.includes("https://hachan-cat.vercel.app/og-thumbnail.png?v=2"), '토스 공유 이미지는 HTTPS 절대 URL이어야 합니다.');
assert.ok(shareSource.includes('export function createMemeSvg'), '저장 카드 마크업은 독립적으로 검증 가능한 함수여야 합니다.');
assert.ok(shareSource.includes('오늘의 ${escapeXml(moment.label)}'), '저장 카드에 포획 순간 이름이 포함되어야 합니다.');
assert.ok(shareSource.includes('[${moment.label}] Lv.${result.level}'), '공유 문구에 포획 순간 이름이 포함되어야 합니다.');

console.log('✓ 1200×630 social preview and Open Graph metadata verified');
