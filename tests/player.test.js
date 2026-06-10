import { describe, it, expect } from 'vitest';
import {
  createPlayer, updatePlayer, resolveMove, grabbableCat,
  WALK_SPEED, SPRINT_SPEED, NOISE_IDLE, NOISE_WALK, NOISE_SPRINT,
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
