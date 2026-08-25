import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const png = await readFile(new URL('../public/og-thumbnail.png', import.meta.url));

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

console.log('✓ 1200×630 social preview and Open Graph metadata verified');
