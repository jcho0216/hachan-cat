import assert from 'node:assert/strict';
import { LEVELS } from '../src/levels.ts';
import { movementFor } from '../src/movement.ts';

const start = { x: 50, y: 50, tilt: 0 };
const key = (position) => `${position.x.toFixed(2)}:${position.y.toFixed(2)}:${position.tilt.toFixed(2)}`;

for (const level of LEVELS) {
  for (const behavior of [level.behavior, level.secondaryBehavior]) {
    for (const aiming of [false, true]) {
    let current = { ...start };
    const positions = [];
    let consecutiveSame = 0;
    let maxConsecutiveSame = 0;

    for (let step = 0; step < 80; step += 1) {
      const aim = aiming ? {
        fieldX: 50 + Math.sin(step * .71) * 39,
        fieldY: 50 + Math.cos(step * .53) * 34,
        dx: Math.cos(step * .71) * 5,
        dy: -Math.sin(step * .53) * 4,
      } : null;
      const next = movementFor(behavior, step, current, aim);
      assert.ok(Number.isFinite(next.x) && Number.isFinite(next.y) && Number.isFinite(next.tilt), `Lv.${level.id} ${level.name}: invalid number`);
      assert.ok(next.x >= 15 && next.x <= 85, `Lv.${level.id} ${level.name}: x out of bounds (${next.x})`);
      assert.ok(next.y >= 23 && next.y <= 77, `Lv.${level.id} ${level.name}: y out of bounds (${next.y})`);
      consecutiveSame = key(next) === key(current) ? consecutiveSame + 1 : 0;
      maxConsecutiveSame = Math.max(maxConsecutiveSame, consecutiveSame);
      positions.push(key(next));
      current = next;
    }

    assert.ok(new Set(positions).size >= 3, `Lv.${level.id} ${level.name}: stuck in one position (${aiming ? 'aiming' : 'idle'})`);
    assert.ok(maxConsecutiveSame <= 1, `Lv.${level.id} ${level.name}: repeated one position too long (${aiming ? 'aiming' : 'idle'})`);
    }
  }
}

for (const behavior of ['watch', 'dodge', 'predict', 'magnet', 'mirror', 'guard']) {
  const left = movementFor(behavior, 5, start, { fieldX: 15, fieldY: 25, dx: 4, dy: 2 });
  const right = movementFor(behavior, 5, start, { fieldX: 85, fieldY: 75, dx: -4, dy: -2 });
  assert.notEqual(key(left), key(right), `${behavior}: pointer position does not affect movement`);
}

console.log(`✓ ${LEVELS.length} cats × 2 patterns × idle/aiming 80 steps verified`);
