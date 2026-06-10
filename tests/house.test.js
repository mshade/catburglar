import { describe, it, expect } from 'vitest';
import { generateHouse, splitLeaves, sharedWall } from '../src/gen/house.js';
import { FLOOR, DOOR, WALL, HIDE, reachableCells } from '../src/gen/grid.js';
import { makeRng } from '../src/gen/rng.js';

describe('splitLeaves', () => {
  // Leaf dims: min 7 (MIN_LEAF), max 18 (BIG_ROOM_MAX — occasional big rooms may be kept unsplit).
  // Each seed must tile the footprint exactly (area == 41*31).
  const seeds = Array.from({ length: 10 }, (_, i) => i + 1);
  it.each(seeds)('seed %i: tiles 41x31 with leaves of bounded size', (seed) => {
    const rng = makeRng(seed);
    const leaves = splitLeaves(rng, { x: 0, y: 0, w: 41, h: 31 });
    let area = 0;
    for (const l of leaves) {
      area += l.w * l.h;
      expect(l.w).toBeGreaterThanOrEqual(7);
      expect(l.h).toBeGreaterThanOrEqual(7);
      expect(l.w).toBeLessThanOrEqual(18);
      expect(l.h).toBeLessThanOrEqual(18);
    }
    expect(area).toBe(41 * 31);
  });
});

describe('sharedWall', () => {
  it('detects a vertical shared wall with interior overlap', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 10, y: 0, w: 10, h: 10 };
    const e = sharedWall(a, b);
    expect(e).toEqual({ dir: 'v', wall: 9, lo: 1, hi: 8 });
  });

  it('returns null for non-adjacent leaves', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 20, y: 0, w: 10, h: 10 };
    expect(sharedWall(a, b)).toBeNull();
  });
});

describe('generateHouse', () => {
  const seeds = Array.from({ length: 20 }, (_, i) => i + 1);

  it.each(seeds)('seed %i produces a valid, fully connected house', (seed) => {
    const h = generateHouse(seed);
    const { grid, spawn } = h;

    // border fully sealed
    for (let x = 0; x < grid.w; x++) {
      expect(grid.get(x, 0)).toBe(WALL);
      expect(grid.get(x, grid.h - 1)).toBe(WALL);
    }
    for (let y = 0; y < grid.h; y++) {
      expect(grid.get(0, y)).toBe(WALL);
      expect(grid.get(grid.w - 1, y)).toBe(WALL);
    }

    // every FLOOR and DOOR cell reachable by the player from spawn
    expect(grid.walkable(spawn.x, spawn.y)).toBe(true);
    const reach = reachableCells(grid, spawn.x, spawn.y);
    for (let y = 0; y < grid.h; y++) {
      for (let x = 0; x < grid.w; x++) {
        const c = grid.get(x, y);
        if (c === FLOOR || c === DOOR) expect(reach.has(y * grid.w + x)).toBe(true);
      }
    }

    expect(h.rooms.length).toBeGreaterThanOrEqual(8);

    // hide spots: enough of them, on HIDE cells, each adjacent to player-walkable floor
    expect(h.hideSpots.length).toBeGreaterThanOrEqual(8);
    for (const s of h.hideSpots) {
      expect(grid.get(s.x, s.y)).toBe(HIDE);
      const touchesFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .some(([dx, dy]) => grid.walkable(s.x + dx, s.y + dy));
      expect(touchesFloor).toBe(true);
    }

    // cat spawns: 5 distinct floor cells far from the player
    expect(h.catSpawns).toHaveLength(5);
    const keys = new Set(h.catSpawns.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(5);
    for (const c of h.catSpawns) {
      expect(grid.get(c.x, c.y)).toBe(FLOOR);
      expect(Math.abs(c.x - spawn.x) + Math.abs(c.y - spawn.y)).toBeGreaterThanOrEqual(10);
    }

    expect(h.floorCells.length).toBeGreaterThan(100);
  });

  it('is deterministic for the same seed', () => {
    const a = generateHouse(99), b = generateHouse(99);
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(a.catSpawns).toEqual(b.catSpawns);
  });
});
