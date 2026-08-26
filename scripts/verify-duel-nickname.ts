import { strict as assert } from 'node:assert';
import { cleanDuelNickname, duelNicknameError, randomDuelNickname, withNim } from '../src/duel/nicknameRules.ts';

assert.equal(cleanDuelNickname('  준서 😼  '), '준서');
assert.equal(cleanDuelNickname('손 빠른   냥헌터'), '손 빠른 냥헌터');
assert.equal(cleanDuelNickname('12345678901'), '1234567890');
assert.equal(duelNicknameError('냥'), '두 글자 이상 적어주세요.');
assert.equal(duelNicknameError('관리자'), '이 이름은 사용할 수 없어요.');
assert.equal(duelNicknameError('준서'), '');
assert.equal(withNim('준서'), '준서님');
assert.equal(withNim('준서님'), '준서님');
assert.match(randomDuelNickname('stable-seed'), /^[가-힣]+ [가-힣]+$/);
assert.equal(randomDuelNickname('stable-seed'), randomDuelNickname('stable-seed'));

console.log('✓ battle name sanitization, reserved names, honorifics, and stable suggestions verified');
