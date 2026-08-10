import type { CatBehavior } from './levels';

export type Position = { x: number; y: number; tilt: number };
export type MovementAim = { fieldX: number; fieldY: number; dx: number; dy: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wave = (step: number, speed = 1) => Math.sin(step * speed);
const seeded = (seed: number, step: number, salt: number) => {
  const value = Math.sin((seed + 1) * 12.9898 + (step + 1) * 78.233 + salt * 37.719) * 43758.5453;
  return value - Math.floor(value);
};
const randomPosition = (step: number, seed = Math.random() * 10_000): Position => ({
  x: 17 + seeded(seed, step, 1) * 66,
  y: 25 + seeded(seed, step, 2) * 51,
  tilt: -12 + seeded(seed, step, 3) * 24,
});

export function movementFor(behavior: CatBehavior, step: number, current: Position, aim: MovementAim | null, seed = 0): Position {
  const theta = step * .92;
  const aimX = aim?.fieldX ?? 50;
  const aimY = aim?.fieldY ?? 50;
  const oppositeAim = { x: clamp(100 - aimX, 17, 83), y: clamp(100 - aimY, 24, 77) };
  switch (behavior) {
    case 'patrol': return { x: step % 2 ? 72 : 28, y: 48 + wave(step) * 12, tilt: step % 2 ? 7 : -7 };
    case 'watch': return aim ? { ...oppositeAim, tilt: aimX < 50 ? 8 : -8 } : { x: 24 + (step % 4) * 17, y: 38 + (step % 2) * 22, tilt: wave(step) * 7 };
    case 'dodge': return aim ? { ...oppositeAim, tilt: aimX < 50 ? 12 : -12 } : randomPosition(step, seed + 11);
    case 'zigzag': return { x: step % 2 ? 78 : 22, y: 27 + ((step * 17) % 48), tilt: step % 2 ? 14 : -14 };
    case 'moonwalk': return { x: 18 + ((step * 23) % 65), y: 55 + wave(step, 1.7) * 16, tilt: step % 2 ? -10 : 5 };
    case 'fake': return step % 2 ? { x: 100 - current.x, y: clamp(100 - current.y, 25, 76), tilt: -current.tilt } : { x: clamp(current.x + (current.x < 50 ? 9 : -9), 17, 83), y: current.y, tilt: current.x < 50 ? -12 : 12 };
    case 'wall': return { x: step % 2 ? 84 : 16, y: 27 + ((step * 21) % 48), tilt: step % 2 ? 18 : -18 };
    case 'orbit': return { x: 50 + Math.cos(theta) * 31, y: 51 + Math.sin(theta) * 24, tilt: Math.sin(theta) * 15 };
    case 'tempo': return step % 3 === 0 ? current : { x: step % 2 ? 80 : 20, y: 29 + ((step * 19) % 44), tilt: step % 2 ? 16 : -16 };
    case 'clone': return { x: 50 + Math.sin(theta * 1.4) * 31, y: 50 + Math.sin(theta * 2.8) * 22, tilt: wave(step, 1.5) * 12 };
    case 'predict': return aim ? { x: clamp(100 - aimX - aim.dx * .22, 16, 84), y: clamp(100 - aimY - aim.dy * .18, 23, 77), tilt: aim.dx > 0 ? -14 : 14 } : randomPosition(step, seed + 23);
    case 'magnet': {
      if (!aim) return randomPosition(step, seed + 37);
      const distance = Math.hypot(current.x - aimX, current.y - aimY);
      const direction = distance > 38 ? .34 : -1.25;
      return { x: clamp(current.x + (aimX - current.x) * direction, 16, 84), y: clamp(current.y + (aimY - current.y) * direction, 23, 77), tilt: direction > 0 ? 6 : -13 };
    }
    case 'crab': return { x: step % 2 ? 84 : 16, y: 34 + ((Math.floor(step / 2) * 17) % 38), tilt: 90 };
    case 'blink': return randomPosition(step, seed + 41);
    case 'mirror': return aim ? { ...oppositeAim, tilt: aim.dx > 0 ? -18 : 18 } : { x: 50 + wave(step) * 32, y: 50 + wave(step, 2) * 20, tilt: wave(step) * 12 };
    case 'spiral': {
      const radius = 34 - (step % 7) * 3;
      return { x: 50 + Math.cos(theta * 1.25) * radius, y: 50 + Math.sin(theta * 1.25) * radius * .72, tilt: theta * 12 % 24 - 12 };
    }
    case 'chaos': return movementFor((['wall', 'orbit', 'predict', 'blink', 'mirror'] as CatBehavior[])[step % 5], step, current, aim, seed);
    case 'guard': return aim ? { x: clamp(100 - aimX, 15, 85), y: clamp(92 - aimY, 23, 77), tilt: aimX > 50 ? -22 : 22 } : movementFor('fake', step, current, aim, seed);
    case 'rage': return randomPosition(step, seed + 53);
    case 'overlord': return movementFor((['clone', 'predict', 'blink', 'spiral', 'wall'] as CatBehavior[])[step % 5], step, current, aim, seed);
  }
}
