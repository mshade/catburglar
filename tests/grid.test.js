import { describe, it, expect } from 'vitest';
import { Grid, WALL, FLOOR, DOOR, FURN, HIDE, findPath, lineOfSight, reachableCells } from '../src/gen/grid.js';
import { fromAscii } from './helpers.js';

describe('Grid', () => {
  it('defaults to WALL and stores cell types', () => {
    const g = new Grid(4, 3);
    expect(g.get(1, 1)).toBe(WALL);
    g.set(1, 1, FLOOR);
    expect(g.get(1, 1)).toBe(FLOOR);
  });

  it('treats out-of-bounds as WALL', () => {
    const g = new Grid(4, 3);
    expect(g.get(-1, 0)).toBe(WALL);
    expect(g.get(4, 0)).toBe(WALL);
  });

  it('walkable: FLOOR and DOOR for everyone; HIDE only for cats; FURN and WALL for nobody', () => {
    const g = fromAscii(['#.DFH']);
    expect(g.walkable(1, 0)).toBe(true);        // FLOOR
    expect(g.walkable(2, 0)).toBe(true);        // DOOR
    expect(g.walkable(3, 0)).toBe(false);       // FURN
    expect(g.walkable(4, 0)).toBe(false);       // HIDE, player
    expect(g.walkable(4, 0, true)).toBe(true);  // HIDE, cat
    expect(g.walkable(0, 0, true)).toBe(false); // WALL, cat
  });

  it('transparent: only FLOOR and DOOR pass sight', () => {
    const g = fromAscii(['#.DFH']);
    expect(g.transparent(1, 0)).toBe(true);
    expect(g.transparent(2, 0)).toBe(true);
    expect(g.transparent(0, 0)).toBe(false);
    expect(g.transparent(3, 0)).toBe(false);
    expect(g.transparent(4, 0)).toBe(false);
  });
});

describe('findPath', () => {
  it('finds a straight path including start and end', () => {
    const g = fromAscii(['#####', '#...#', '#####']);
    const p = findPath(g, 1, 1, 3, 1);
    expect(p).toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  it('routes around walls', () => {
    const g = fromAscii([
      '#####',
      '#.#.#',
      '#...#',
      '#####',
    ]);
    const p = findPath(g, 1, 1, 3, 1);
    expect(p[0]).toEqual([1, 1]);
    expect(p[p.length - 1]).toEqual([3, 1]);
    expect(p.length).toBe(5); // down, across, across, up
    for (const [x, y] of p) expect(g.walkable(x, y)).toBe(true);
  });

  it('returns null when the target is unreachable', () => {
    const g = fromAscii(['#####', '#.#.#', '#####']);
    expect(findPath(g, 1, 1, 3, 1)).toBeNull();
  });

  it('lets cats path onto HIDE cells but not players', () => {
    const g = fromAscii(['#####', '#..H#', '#####']);
    expect(findPath(g, 1, 1, 3, 1)).toBeNull();
    expect(findPath(g, 1, 1, 3, 1, { cat: true })).toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  it('avoids cells in the blocked set', () => {
    const g = fromAscii(['#####', '#...#', '#####']);
    const blocked = new Set([1 * g.w + 2]); // cell (2,1)
    expect(findPath(g, 1, 1, 3, 1, { blocked })).toBeNull();
  });
});

describe('lineOfSight', () => {
  it('sees along a clear corridor', () => {
    const g = fromAscii(['#####', '#...#', '#####']);
    expect(lineOfSight(g, 1, 1, 3, 1)).toBe(true);
  });

  it('is blocked by a wall between', () => {
    const g = fromAscii(['#####', '#.#.#', '#####']);
    expect(lineOfSight(g, 1, 1, 3, 1)).toBe(false);
  });

  it('is blocked by furniture but endpoints may be opaque cells', () => {
    const g = fromAscii(['######', '#.F.H#', '######']);
    expect(lineOfSight(g, 1, 1, 3, 1)).toBe(false); // F between
    expect(lineOfSight(g, 3, 1, 4, 1)).toBe(true);  // adjacent, HIDE endpoint ok
  });
});

describe('reachableCells', () => {
  it('floods only the connected region', () => {
    const g = fromAscii([
      '#####',
      '#.#.#',
      '#.#.#',
      '#####',
    ]);
    const r = reachableCells(g, 1, 1);
    expect(r.has(2 * g.w + 1)).toBe(true);  // (1,2)
    expect(r.has(1 * g.w + 3)).toBe(false); // (3,1) sealed off
    expect(r.size).toBe(2);
  });

  it('includes HIDE cells only in cat mode', () => {
    const g = fromAscii(['#####', '#.H.#', '#####']);
    expect(reachableCells(g, 1, 1).size).toBe(1);
    expect(reachableCells(g, 1, 1, true).size).toBe(3);
  });
});
