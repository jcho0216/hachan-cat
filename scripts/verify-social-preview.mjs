import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const png = await readFile(new URL('../public/og-thumbnail.png', import.meta.url));
const appIcon = await readFile(new URL('../public/hachan-cat-icon.png', import.meta.url));
const shareSource = await readFile(new URL('../src/share.ts', import.meta.url), 'utf8');
const viteConfig = await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8');
const graniteConfig = await readFile(new URL('../granite.config.ts', import.meta.url), 'utf8');
const vercelConfig = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

assert.equal(png.toString('ascii', 1, 4), 'PNG', '공유 썸네일은 PNG 파일이어야 합니다.');
assert.equal(png.readUInt32BE(16), 1200, '공유 썸네일 너비는 1200px이어야 합니다.');
assert.equal(png.readUInt32BE(20), 630, '공유 썸네일 높이는 630px이어야 합니다.');
assert.equal(appIcon.toString('ascii', 1, 4), 'PNG', '앱 아이콘은 확장자만 PNG인 JPEG이면 안 됩니다.');
assert.equal(appIcon.readUInt32BE(16), 600, '앱인토스 아이콘 너비는 600px이어야 합니다.');
assert.equal(appIcon.readUInt32BE(20), 600, '앱인토스 아이콘 높이는 600px이어야 합니다.');
assert.ok(graniteConfig.includes("icon: 'https://hachan-cat.vercel.app/hachan-cat-icon.png?v=3'"), 'AIT 설정에는 비어 있지 않은 HTTPS 앱 아이콘 URL이 필요합니다.');

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
assert.ok(!html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'), '첫 화면 폰트는 외부 Google 요청에 의존하면 안 됩니다.');
assert.ok(viteConfig.includes("'https://hachan-cat.vercel.app'"), '로컬·앱 패키지의 메타데이터 기본 주소는 운영 도메인이어야 합니다.');
assert.ok(!viteConfig.includes('hachan-jinxeifk1-junjoys-projects.vercel.app'), '과거 미리보기 도메인을 메타데이터 기본값으로 남기면 안 됩니다.');
const assetCache = vercelConfig.headers.find((rule) => rule.source === '/assets/(.*)')?.headers
  .find((header) => header.key.toLowerCase() === 'cache-control')?.value;
assert.equal(assetCache, 'public, max-age=31536000, immutable', '해시 자산은 재방문 때 다시 내려받지 않도록 장기 캐시해야 합니다.');
assert.ok(shareSource.includes("shareWithFallback('하찮냥', message, webUrl, createCatchChallengeDeepLink(result))"), '승리 공유는 기록 딥링크가 포함된 공통 공유 경로를 사용해야 합니다.');
assert.ok(shareSource.includes("shareWithFallback('하찮냥 놓친 기록', message, webUrl, createLossChallengeDeepLink(loss))"), '패배 공유는 복수 딥링크가 포함된 공통 공유 경로를 사용해야 합니다.');
assert.ok(shareSource.includes('getTossShareLink(deepLink, SHARE_PREVIEW_IMAGE_URL)'), '모든 토스 공유 링크에 OG 이미지를 전달해야 합니다.');
assert.ok(shareSource.includes("https://hachan-cat.vercel.app/og-thumbnail.png?v=2"), '토스 공유 이미지는 HTTPS 절대 URL이어야 합니다.');
assert.ok(shareSource.includes('export function createMemeSvg'), '저장 카드 마크업은 독립적으로 검증 가능한 함수여야 합니다.');
assert.ok(shareSource.includes('오늘의 ${escapeXml(moment.label)}'), '저장 카드에 포획 순간 이름이 포함되어야 합니다.');
assert.ok(shareSource.includes('[${moment.label}] Lv.${result.level}'), '공유 문구에 포획 순간 이름이 포함되어야 합니다.');
assert.ok(shareSource.includes('${result.attempts}번 만에 잡음'), '친구 도전 공유 문구에 동률 판정용 시도 수가 포함되어야 합니다.');

console.log('✓ 1200×630 social preview and Open Graph metadata verified');
