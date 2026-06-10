import { describe, it, expect } from 'vitest';
import {
  createPlayer, updatePlayer, resolveMove, grabbableCat, analogSpeedNoise,
  WALK_SPEED, SPRINT_SPEED, NOISE_IDLE, NOISE_WALK, NOISE_SPRINT,
  DEAD_ZONE, WALK_POINT,
} from '../src/sim/player.js';
import { fromAscii } from './helpers.js';

const openRoom = () => fromAscii([
  '#######',
  '#.....#',
  '#.....#',
  '#.....#',
  '#######',
]);

describe('resolveMove', () => {
  it('moves freely in open space', () => {
    const g = openRoom();
    expect(resolveMove(g, 2.5, 2.5, 3.0, 2.5)).toEqual({ x: 3.0, z: 2.5 });
  });

  it('stops at walls', () => {
    const g = openRoom();
    // wall row is y=0; radius 0.3 means z can't go below 1.3
    const r = resolveMove(g, 2.5, 1.5, 2.5, 1.1);
    expect(r.z).toBe(1.5);
  });

  it('slides along a wall on diagonal moves', () => {
    const g = openRoom();
    const r = resolveMove(g, 2.5, 1.5, 3.0, 1.1);
    expect(r.x).toBe(3.0); // free axis moves
    expect(r.z).toBe(1.5); // blocked axis stays
  });
});

describe('updatePlayer', () => {
  it('moves forward along -z when yaw is 0', () => {
    const g = openRoom();
    const p = createPlayer({ x: 2, y: 2 }); // starts at (2.5, 2.5)
    updatePlayer(p, { forward: true }, g, 0.1);
    expect(p.x).toBeCloseTo(2.5);
    expect(p.z).toBeCloseTo(2.5 - WALK_SPEED * 0.1);
  });

  it('sets speed and noise radius: idle, walk, sprint', () => {
    const g = openRoom();
    const p = createPlayer({ x: 2, y: 2 });
    updatePlayer(p, {}, g, 0.016);
    expect(p.speed).toBe(0);
    expect(p.noiseRadius).toBe(NOISE_IDLE);
    updatePlayer(p, { forward: true }, g, 0.016);
    expect(p.speed).toBe(WALK_SPEED);
    expect(p.noiseRadius).toBe(NOISE_WALK);
    updatePlayer(p, { forward: true, sprint: true }, g, 0.016);
    expect(p.speed).toBe(SPRINT_SPEED);
    expect(p.noiseRadius).toBe(NOISE_SPRINT);
  });

  it('normalizes diagonal movement', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 }); // center-ish (3.5, 2.5)
    updatePlayer(p, { forward: true, right: true }, g, 0.1);
    const dist = Math.hypot(p.x - 3.5, p.z - 2.5);
    expect(dist).toBeCloseTo(WALK_SPEED * 0.1, 5);
  });
});

describe('grabbableCat', () => {
  const at = (x, z) => ({ x, z, state: 'wander' });

  it('returns a close cat in front of the player', () => {
    const p = { x: 2, z: 5, yaw: 0 }; // facing -z
    expect(grabbableCat(p, [at(2, 4)])).not.toBeNull();
  });

  it('ignores cats behind the player', () => {
    const p = { x: 2, z: 5, yaw: 0 };
    expect(grabbableCat(p, [at(2, 6.2)])).toBeNull();
  });

  it('ignores cats out of range and caught cats', () => {
    const p = { x: 2, z: 5, yaw: 0 };
    expect(grabbableCat(p, [at(2, 1)])).toBeNull();
    expect(grabbableCat(p, [{ x: 2, z: 4, state: 'caught' }])).toBeNull();
  });

  it('returns the nearest of several grabbable cats', () => {
    const p = { x: 2, z: 5, yaw: 0 };
    const near = at(2, 4.2), far = at(2, 3.6);
    expect(grabbableCat(p, [far, near])).toBe(near);
  });
});

describe('analogSpeedNoise', () => {
  it('is idle inside the dead zone', () => {
    expect(analogSpeedNoise(0)).toEqual({ speed: 0, noise: NOISE_IDLE });
    expect(analogSpeedNoise(DEAD_ZONE - 0.01)).toEqual({ speed: 0, noise: NOISE_IDLE });
  });

  it('reaches exactly walk speed and walk noise at WALK_POINT', () => {
    const { speed, noise } = analogSpeedNoise(WALK_POINT);
    expect(speed).toBeCloseTo(WALK_SPEED, 5);
    expect(noise).toBeCloseTo(NOISE_WALK, 5);
  });

  it('reaches exactly sprint speed and sprint noise at full deflection', () => {
    const { speed, noise } = analogSpeedNoise(1);
    expect(speed).toBeCloseTo(SPRINT_SPEED, 5);
    expect(noise).toBeCloseTo(NOISE_SPRINT, 5);
  });

  it('interpolates within the sneak zone', () => {
    const { speed, noise } = analogSpeedNoise(0.35); // halfway to WALK_POINT
    expect(speed).toBeCloseTo(WALK_SPEED * 0.5, 5);
    expect(noise).toBeCloseTo(NOISE_IDLE + (NOISE_WALK - NOISE_IDLE) * 0.5, 5);
  });

  it('interpolates within the sprint zone', () => {
    const { speed, noise } = analogSpeedNoise(0.85); // halfway from WALK_POINT to 1
    expect(speed).toBeCloseTo(WALK_SPEED + (SPRINT_SPEED - WALK_SPEED) * 0.5, 5);
    expect(noise).toBeCloseTo(NOISE_WALK + (NOISE_SPRINT - NOISE_WALK) * 0.5, 5);
  });

  it('is continuous at the walk point', () => {
    const below = analogSpeedNoise(WALK_POINT - 1e-9);
    const above = analogSpeedNoise(WALK_POINT + 1e-9);
    expect(Math.abs(below.speed - above.speed)).toBeLessThan(1e-6);
    expect(Math.abs(below.noise - above.noise)).toBeLessThan(1e-6);
  });
});

describe('updatePlayer with analog input', () => {
  it('moves forward along -z at sprint speed on full push', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 0, z: 1 } }, g, 0.1);
    expect(p.x).toBeCloseTo(3.5);
    expect(p.z).toBeCloseTo(2.5 - SPRINT_SPEED * 0.1);
    expect(p.noiseRadius).toBe(NOISE_SPRINT);
  });

  it('creeps quietly on a slight push', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 0, z: 0.35 } }, g, 0.1);
    expect(p.z).toBeCloseTo(2.5 - WALK_SPEED * 0.5 * 0.1, 5);
    expect(p.noiseRadius).toBeLessThan(NOISE_WALK);
    expect(p.noiseRadius).toBeGreaterThan(NOISE_IDLE);
  });

  it('treats the dead zone as idle', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 0.05, z: 0.05 } }, g, 0.1);
    expect(p.x).toBe(3.5);
    expect(p.z).toBe(2.5);
    expect(p.speed).toBe(0);
    expect(p.noiseRadius).toBe(NOISE_IDLE);
  });

  it('respects yaw: strafe right at yaw 90° moves along -z', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    p.yaw = Math.PI / 2;
    updatePlayer(p, { analog: { x: 1, z: 0 } }, g, 0.1);
    expect(p.x).toBeCloseTo(3.5, 5);
    expect(p.z).toBeCloseTo(2.5 - SPRINT_SPEED * 0.1, 5);
  });

  it('clamps magnitude above 1', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 3, z: 4 } }, g, 0.1); // mag 5 → clamped to 1
    const dist = Math.hypot(p.x - 3.5, p.z - 2.5);
    expect(dist).toBeCloseTo(SPRINT_SPEED * 0.1, 5);
  });
});
