# Cat Burglar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser-playable first-person game where the player hunts and grabs 5 cats hiding in a procedurally generated house.

**Architecture:** Pure-logic modules (`src/gen/`, `src/sim/`) know nothing about Three.js and are unit-tested with vitest; render modules (`src/render/`) turn sim state into meshes; `src/main.js` wires input, sim, render, HUD, and audio. The procedural grid (cell types WALL/FLOOR/DOOR/FURN/HIDE) is the single source of truth for rendering, collision, and cat AI.

**Tech Stack:** Three.js, vanilla JS ES modules, Vite (dev/build), vitest (tests), WebAudio (synthesized SFX).

**Spec:** `docs/superpowers/specs/2026-06-09-cat-catcher-fps-design.md`

**Conventions used throughout:**
- Sim coordinates are `(x, z)` floats matching Three.js world x/z; grid cell coords are `(x, y)` ints where cell `y` = world `z`. Cell `(cx, cy)` spans world `[cx, cx+1) × [cy, cy+1)`; its center is `(cx + 0.5, cy + 0.5)`.
- Yaw 0 faces −z. Forward vector = `(−sin yaw, −cos yaw)`; right = `(cos yaw, −sin yaw)`.
- All randomness in gen/sim goes through the seeded RNG (Task 2) so tests are deterministic.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `index.html`, `src/main.js`, `.gitignore`

- [ ] **Step 1: Write package.json**

```json
{
  "name": "cat-burglar",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install three && npm install -D vite vitest`
Expected: both commands succeed; `package.json` gains `dependencies.three` and `devDependencies.vite`/`vitest`.

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
```

- [ ] **Step 4: Write minimal index.html**

(The HUD task replaces this with the full overlay version.)

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cat Burglar</title>
  <style>html, body { margin: 0; height: 100%; overflow: hidden; } #game { display: block; width: 100%; height: 100%; }</style>
</head>
<body>
  <canvas id="game"></canvas>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 5: Write smoke-test src/main.js (spinning cube)**

```js
import * as THREE from 'three';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
camera.position.z = 3;
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshNormalMaterial()
);
scene.add(cube);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  cube.rotation.set(t / 1000, t / 700, 0);
  renderer.render(scene, camera);
});
```

- [ ] **Step 6: Verify dev server**

Run: `npm run dev` (background), then `curl -s http://localhost:5173 | grep -q 'main.js' && echo OK`
Expected: `OK`. If verifying interactively: open http://localhost:5173 — spinning cube. Stop the server after.

- [ ] **Step 7: Verify vitest runs**

Run: `npx vitest run`
Expected: "No test files found" exit message (acceptable at this stage) — confirms vitest is installed and runnable.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore index.html src/main.js
git commit -m "chore: scaffold vite + three + vitest project with render smoke test"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/gen/rng.js`
- Test: `tests/rng.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/rng.test.js
import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/gen/rng.js';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces values in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int stays within inclusive bounds and is an integer', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('pick returns elements of the array', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 50; i++) expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
  });

  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/rng.test.js`
Expected: FAIL — cannot resolve `../src/gen/rng.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/gen/rng.js
// mulberry32 — small, fast, seedable PRNG; good enough for gameplay.
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    range: (min, max) => min + next() * (max - min),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/rng.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/gen/rng.js tests/rng.test.js
git commit -m "feat: seeded RNG (mulberry32) with int/range/pick/chance helpers"
```

---

### Task 3: Grid, A* pathfinding, line of sight, reachability

**Files:**
- Create: `src/gen/grid.js`
- Create: `tests/helpers.js`
- Test: `tests/grid.test.js`

- [ ] **Step 1: Write the ASCII-grid test helper**

```js
// tests/helpers.js
import { Grid, WALL, FLOOR, DOOR, FURN, HIDE } from '../src/gen/grid.js';

const CH = { '#': WALL, '.': FLOOR, D: DOOR, F: FURN, H: HIDE };

// Build a Grid from rows of '#'. 'D' door, 'F' furniture, 'H' hide spot.
export function fromAscii(rows) {
  const g = new Grid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => g.set(x, y, CH[ch])));
  return g;
}
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/grid.test.js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/grid.test.js`
Expected: FAIL — cannot resolve `../src/gen/grid.js`.

- [ ] **Step 4: Write the implementation**

```js
// src/gen/grid.js
export const WALL = 0, FLOOR = 1, DOOR = 2, FURN = 3, HIDE = 4;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.cells = new Uint8Array(w * h); // WALL = 0 by default
  }
  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) { return this.inBounds(x, y) ? this.cells[this.idx(x, y)] : WALL; }
  set(x, y, v) { if (this.inBounds(x, y)) this.cells[this.idx(x, y)] = v; }
  walkable(x, y, cat = false) {
    const c = this.get(x, y);
    return c === FLOOR || c === DOOR || (cat && c === HIDE);
  }
  transparent(x, y) {
    const c = this.get(x, y);
    return c === FLOOR || c === DOOR;
  }
}

// 4-directional A*. Returns [[x,y], ...] including start and target, or null.
// opts.cat: may traverse HIDE cells. opts.blocked: Set of (y*w+x) keys to avoid.
export function findPath(grid, sx, sy, tx, ty, opts = {}) {
  const { cat = false, blocked } = opts;
  if (sx === tx && sy === ty) return [[sx, sy]];
  if (!grid.walkable(tx, ty, cat)) return null;
  const w = grid.w;
  const key = (x, y) => y * w + x;
  const open = [{ x: sx, y: sy, g: 0, f: 0 }];
  const gScore = new Map([[key(sx, sy), 0]]);
  const came = new Map();
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.x === tx && cur.y === ty) {
      const path = [[cur.x, cur.y]];
      let k = key(cur.x, cur.y);
      while (came.has(k)) {
        k = came.get(k);
        path.push([k % w, Math.floor(k / w)]);
      }
      return path.reverse();
    }
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!grid.walkable(nx, ny, cat)) continue;
      const k = key(nx, ny);
      if (blocked && blocked.has(k)) continue;
      const g = cur.g + 1;
      if (g < (gScore.get(k) ?? Infinity)) {
        gScore.set(k, g);
        came.set(k, key(cur.x, cur.y));
        open.push({ x: nx, y: ny, g, f: g + Math.abs(tx - nx) + Math.abs(ty - ny) });
      }
    }
  }
  return null;
}

// Bresenham between cell centers. Intermediate cells must be transparent;
// the endpoints themselves are not checked (a cat under furniture can be seen).
export function lineOfSight(grid, x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  while (!(x === x1 && y === y1)) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (!(x === x1 && y === y1) && !grid.transparent(x, y)) return false;
  }
  return true;
}

// BFS flood fill of walkable cells from (sx, sy). Returns Set of (y*w+x) keys,
// always including the start cell.
export function reachableCells(grid, sx, sy, cat = false) {
  const seen = new Set([sy * grid.w + sx]);
  const q = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      const k = ny * grid.w + nx;
      if (seen.has(k) || !grid.walkable(nx, ny, cat)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  return seen;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/grid.test.js`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/gen/grid.js tests/grid.test.js tests/helpers.js
git commit -m "feat: grid model with A*, line of sight, and BFS reachability"
```

---

### Task 4: Procedural house generation

**Files:**
- Create: `src/gen/house.js`
- Test: `tests/house.test.js`

The generator BSP-splits the footprint into leaves, carves room floors with 2-cell shared walls, knocks doors (spanning tree + ~30% extra for loops), places furniture with hide spots, and validates. Internal helpers `splitLeaves` and `sharedWall` are exported for testing.

- [ ] **Step 1: Write the failing tests**

```js
// tests/house.test.js
import { describe, it, expect } from 'vitest';
import { generateHouse, splitLeaves, sharedWall } from '../src/gen/house.js';
import { FLOOR, DOOR, WALL, HIDE, reachableCells } from '../src/gen/grid.js';
import { makeRng } from '../src/gen/rng.js';

describe('splitLeaves', () => {
  it('tiles the footprint exactly with leaves of bounded size', () => {
    const rng = makeRng(1);
    const leaves = splitLeaves(rng, { x: 0, y: 0, w: 41, h: 31 });
    let area = 0;
    for (const l of leaves) {
      area += l.w * l.h;
      expect(l.w).toBeGreaterThanOrEqual(7);
      expect(l.h).toBeGreaterThanOrEqual(7);
      expect(l.w).toBeLessThanOrEqual(13);
      expect(l.h).toBeLessThanOrEqual(13);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/house.test.js`
Expected: FAIL — cannot resolve `../src/gen/house.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/gen/house.js
import { Grid, FLOOR, DOOR, FURN, HIDE, reachableCells } from './grid.js';
import { makeRng } from './rng.js';

export const HOUSE_W = 41, HOUSE_H = 31;
const MIN_LEAF = 7, MAX_LEAF = 13;
const EXTRA_DOOR_RATIO = 0.3;
const MIN_ROOMS = 8, MIN_HIDE_SPOTS = 8;
const NUM_CATS = 5, MIN_CAT_DIST = 10;

// Recursively split a rect into leaves >= MIN_LEAF on a side, <= MAX_LEAF.
export function splitLeaves(rng, rect) {
  const { x, y, w, h } = rect;
  const canW = w >= MIN_LEAF * 2, canH = h >= MIN_LEAF * 2;
  if (!canW && !canH) return [rect];
  if (w <= MAX_LEAF && h <= MAX_LEAF && rng.chance(0.2)) return [rect]; // keep an occasional big room
  let vertical;
  if (canW && canH) vertical = w === h ? rng.chance(0.5) : w > h;
  else vertical = canW;
  if (vertical) {
    const cut = rng.int(MIN_LEAF, w - MIN_LEAF);
    return [
      ...splitLeaves(rng, { x, y, w: cut, h }),
      ...splitLeaves(rng, { x: x + cut, y, w: w - cut, h }),
    ];
  }
  const cut = rng.int(MIN_LEAF, h - MIN_LEAF);
  return [
    ...splitLeaves(rng, { x, y, w, h: cut }),
    ...splitLeaves(rng, { x, y: y + cut, w, h: h - cut }),
  ];
}

// Two leaves share a wall if they touch and their interiors overlap.
// The wall between leaf interiors is 2 cells thick: columns wall and wall+1
// (or rows, for dir 'h'). lo..hi is the interior overlap a door can occupy.
export function sharedWall(a, b) {
  const [l, r] = a.x < b.x ? [a, b] : [b, a];
  if (l.x + l.w === r.x) {
    const lo = Math.max(l.y, r.y) + 1;
    const hi = Math.min(l.y + l.h, r.y + r.h) - 2;
    if (hi >= lo) return { dir: 'v', wall: l.x + l.w - 1, lo, hi };
  }
  const [t, btm] = a.y < b.y ? [a, b] : [b, a];
  if (t.y + t.h === btm.y) {
    const lo = Math.max(t.x, btm.x) + 1;
    const hi = Math.min(t.x + t.w, btm.x + btm.w) - 2;
    if (hi >= lo) return { dir: 'h', wall: t.y + t.h - 1, lo, hi };
  }
  return null;
}

function carveDoor(rng, grid, e) {
  const pos = rng.int(e.lo, e.hi);
  if (e.dir === 'v') {
    grid.set(e.wall, pos, DOOR);
    grid.set(e.wall + 1, pos, DOOR);
  } else {
    grid.set(pos, e.wall, DOOR);
    grid.set(pos, e.wall + 1, DOOR);
  }
}

function carveDoors(rng, grid, leaves) {
  const edges = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const e = sharedWall(leaves[i], leaves[j]);
      if (e) edges.push({ i, j, ...e });
    }
  }
  edges.sort(() => rng.next() - 0.5);
  // spanning tree (union-find) guarantees connectivity; extras add loops
  const parent = leaves.map((_, i) => i);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const rest = [];
  for (const e of edges) {
    const ra = find(e.i), rb = find(e.j);
    if (ra !== rb) { parent[ra] = rb; carveDoor(rng, grid, e); }
    else rest.push(e);
  }
  for (const e of rest) if (rng.chance(EXTRA_DOOR_RATIO)) carveDoor(rng, grid, e);
}

function placeFurniture(rng, grid, rooms) {
  const hideSpots = [];
  for (const r of rooms) {
    if (r.w < 4 || r.h < 4) continue;
    const count = Math.max(1, Math.floor((r.w * r.h) / 20));
    for (let n = 0; n < count; n++) {
      const fw = rng.int(1, Math.min(3, r.w - 3));
      const fh = rng.int(1, Math.min(2, r.h - 3));
      // 1-cell margin from room walls keeps doors clear and a walkable ring
      const fx = rng.int(r.x + 1, r.x + r.w - fw - 1);
      const fy = rng.int(r.y + 1, r.y + r.h - fh - 1);
      let ok = true;
      for (let yy = fy; yy < fy + fh && ok; yy++)
        for (let xx = fx; xx < fx + fw; xx++)
          if (grid.get(xx, yy) !== FLOOR) { ok = false; break; }
      if (!ok) continue;
      for (let yy = fy; yy < fy + fh; yy++)
        for (let xx = fx; xx < fx + fw; xx++) grid.set(xx, yy, FURN);
      const hx = rng.int(fx, fx + fw - 1), hy = rng.int(fy, fy + fh - 1);
      grid.set(hx, hy, HIDE);
      hideSpots.push({ x: hx, y: hy });
    }
  }
  return hideSpots;
}

function tryGenerate(seed) {
  const rng = makeRng(seed);
  const grid = new Grid(HOUSE_W, HOUSE_H);
  const leaves = splitLeaves(rng, { x: 0, y: 0, w: HOUSE_W, h: HOUSE_H });
  if (leaves.length < MIN_ROOMS) return null;
  const rooms = leaves.map((l) => ({ x: l.x + 1, y: l.y + 1, w: l.w - 2, h: l.h - 2 }));
  for (const r of rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) grid.set(x, y, FLOOR);
  carveDoors(rng, grid, leaves);
  const rawSpots = placeFurniture(rng, grid, rooms);

  // demote hide spots that ended up with no walkable neighbour
  const hideSpots = rawSpots.filter((h) => {
    const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => grid.walkable(h.x + dx, h.y + dy));
    if (!ok) grid.set(h.x, h.y, FURN);
    return ok;
  });
  if (hideSpots.length < MIN_HIDE_SPOTS) return null;

  const main = rooms.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  const spawn = { x: Math.floor(main.x + main.w / 2), y: Math.floor(main.y + main.h / 2) };
  if (!grid.walkable(spawn.x, spawn.y)) return null;

  const reach = reachableCells(grid, spawn.x, spawn.y);
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      const c = grid.get(x, y);
      if ((c === FLOOR || c === DOOR) && !reach.has(y * grid.w + x)) return null;
    }

  const floorCells = [], farCells = [];
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      if (grid.get(x, y) !== FLOOR) continue;
      floorCells.push({ x, y });
      if (Math.abs(x - spawn.x) + Math.abs(y - spawn.y) >= MIN_CAT_DIST) farCells.push({ x, y });
    }
  if (farCells.length < NUM_CATS) return null;
  const catSpawns = [];
  while (catSpawns.length < NUM_CATS) {
    const c = rng.pick(farCells);
    if (!catSpawns.some((s) => s.x === c.x && s.y === c.y)) catSpawns.push(c);
  }

  return { grid, rooms, spawn, catSpawns, hideSpots, floorCells, seed };
}

export function generateHouse(seed) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const house = tryGenerate((seed + attempt * 7919) >>> 0);
    if (house) return house;
  }
  throw new Error(`House generation failed for seed ${seed}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/house.test.js`
Expected: all tests pass (20 seeds + helpers + determinism). If a particular seed fails an invariant, that's a generator bug — fix the generator, never the invariant.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/gen/house.js tests/house.test.js
git commit -m "feat: BSP house generation with doors, furniture, hide spots, validation"
```

---

### Task 5: Player simulation

**Files:**
- Create: `src/sim/player.js`
- Test: `tests/player.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/player.test.js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/player.test.js`
Expected: FAIL — cannot resolve `../src/sim/player.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/sim/player.js
export const WALK_SPEED = 3, SPRINT_SPEED = 6;
export const PLAYER_RADIUS = 0.3, GRAB_RANGE = 1.7, EYE_HEIGHT = 1.6;
export const NOISE_IDLE = 2, NOISE_WALK = 4, NOISE_SPRINT = 12;

export function createPlayer(spawnCell) {
  return {
    x: spawnCell.x + 0.5,
    z: spawnCell.y + 0.5,
    yaw: 0,
    pitch: 0,
    speed: 0,
    noiseRadius: NOISE_IDLE,
  };
}

function blockedAt(grid, x, z, r) {
  for (let cy = Math.floor(z - r); cy <= Math.floor(z + r); cy++) {
    for (let cx = Math.floor(x - r); cx <= Math.floor(x + r); cx++) {
      if (grid.walkable(cx, cy)) continue;
      // circle vs cell AABB
      const nx = Math.max(cx, Math.min(x, cx + 1));
      const nz = Math.max(cy, Math.min(z, cy + 1));
      if ((nx - x) ** 2 + (nz - z) ** 2 < r * r) return true;
    }
  }
  return false;
}

// Per-axis resolution gives wall sliding for free.
export function resolveMove(grid, x, z, nx, nz, r = PLAYER_RADIUS) {
  const rx = blockedAt(grid, nx, z, r) ? x : nx;
  const rz = blockedAt(grid, rx, nz, r) ? z : nz;
  return { x: rx, z: rz };
}

export function updatePlayer(player, input, grid, dt) {
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let mz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    // forward = (-sin, -cos), right = (cos, -sin) in the x/z plane
    const wx = mz * -sin + mx * cos;
    const wz = mz * -cos + mx * -sin;
    const next = resolveMove(grid, player.x, player.z,
      player.x + wx * speed * dt, player.z + wz * speed * dt);
    player.x = next.x;
    player.z = next.z;
    player.speed = speed;
    player.noiseRadius = input.sprint ? NOISE_SPRINT : NOISE_WALK;
  } else {
    player.speed = 0;
    player.noiseRadius = NOISE_IDLE;
  }
}

// Nearest non-caught cat within GRAB_RANGE that the player is roughly facing.
export function grabbableCat(player, cats) {
  let best = null, bestD = GRAB_RANGE;
  const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  for (const c of cats) {
    if (c.state === 'caught') continue;
    const dx = c.x - player.x, dz = c.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > bestD) continue;
    if (d > 0.3 && (dx * fx + dz * fz) / d < 0.25) continue;
    best = c;
    bestD = d;
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/player.test.js`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.js tests/player.test.js
git commit -m "feat: player kinematics with wall sliding, noise radius, grab check"
```

---

### Task 6: Cat simulation

**Files:**
- Create: `src/sim/cat.js`
- Test: `tests/cat.test.js`

Cat behavior summary (from the spec):
- **WANDER**: amble to random floor cells. Spooked → HIDING (or FLEEING if player is already inside `panicRadius`).
- Spooked = player closer than `player.noiseRadius`, or visible (line of sight) within `sightRange`.
- **HIDING**: run to the best-scoring hide spot, tuck in (`hidden = true`). While hidden, only spooks when the player is closer than `max(hiddenSpookBase, noiseRadius * hiddenSpookNoiseFactor)` — so a slow walk (noise 4 → 1.4) lets the player get inside grab range (1.7) just barely, while sprinting (noise 12 → 4.2) flushes the cat. Calms back to WANDER if the player stays beyond `calmRadius` for `calmTime`.
- **FLEEING**: emits `'hiss'` once on entry; repaths every `repathInterval` toward sampled far cells, never pathing through the 3×3 block around the player; sometimes panics (random target). If no candidate gains distance, the cat is `cornered` and freezes — that's the player's chance. Beyond `fleeSafeDist`, goes back to HIDING.
- **CAUGHT**: terminal; `capture()` sets it.
- Meows on a timer (rarely when hidden, never reported while fleeing) — returned as events so main can play positional audio.

- [ ] **Step 1: Write the failing tests (wander, perception, hide)**

```js
// tests/cat.test.js
import { describe, it, expect } from 'vitest';
import { Cat, WANDER, HIDING, FLEEING, CAUGHT, TUNING } from '../src/sim/cat.js';
import { FLOOR, HIDE } from '../src/gen/grid.js';
import { makeRng } from '../src/gen/rng.js';
import { fromAscii } from './helpers.js';

// 13x7 arena with one hide spot on the right wall side.
const ARENA = [
  '#############',
  '#...........#',
  '#...........#',
  '#..........H#',
  '#...........#',
  '#...........#',
  '#############',
];

function makeWorld(rows, player) {
  const grid = fromAscii(rows);
  const floorCells = [], hideSpots = [];
  for (let y = 0; y < grid.h; y++)
    for (let x = 0; x < grid.w; x++) {
      if (grid.get(x, y) === FLOOR) floorCells.push({ x, y });
      if (grid.get(x, y) === HIDE) hideSpots.push({ x, y });
    }
  return {
    grid, floorCells, hideSpots,
    player: { x: 0, z: 0, noiseRadius: 4, ...player },
  };
}

// run the sim in 1/30s ticks, collecting events
function run(cat, world, seconds) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 30) events.push(...cat.update(1 / 30, world));
  return events;
}

const newCat = (x, y, seed = 5) => new Cat(0, { x, y }, makeRng(seed));

describe('Cat wandering', () => {
  it('moves to new cells when the player is far away', () => {
    const world = makeWorld(ARENA, { x: 1.5, z: 1.5, noiseRadius: 2 });
    const cat = newCat(10, 4);
    // park the player far and quiet — top-left corner, dist > sightRange irrelevant since LOS
    world.player.x = 1.5; world.player.z = 1.5;
    // place cat out of sight range? Arena is open; use noiseRadius 2 and rely on dist > sightRange
    const startX = cat.x, startZ = cat.z;
    run(cat, world, 5);
    expect(cat.state).not.toBe(CAUGHT);
    expect(Math.hypot(cat.x - startX, cat.z - startZ)).toBeGreaterThan(0.5);
  });

  it('stays within walkable cells while wandering', () => {
    const world = makeWorld(ARENA, { x: 1.5, z: 1.5, noiseRadius: 2 });
    const cat = newCat(10, 4);
    for (let t = 0; t < 5; t += 1 / 30) {
      cat.update(1 / 30, world);
      expect(world.grid.walkable(Math.floor(cat.x), Math.floor(cat.z), true)).toBe(true);
    }
  });
});

describe('Cat perception', () => {
  it('hides when it hears a sprinting player', () => {
    // wall between cat and player blocks LOS, but sprint noise (12) carries
    const rows = [
      '#########',
      '#...#...#',
      '#...#...#',
      '#...D...#',
      '#########',
    ];
    const world = makeWorld(rows, { x: 1.5, z: 1.5, noiseRadius: 12 });
    // no hide spots in this map: expect FLEEING fallback instead
    const cat = newCat(6, 1);
    cat.update(1 / 30, world);
    expect(cat.state).toBe(FLEEING);
  });

  it('does not notice a quiet player behind a wall', () => {
    const rows = [
      '#########',
      '#...#...#',
      '#...#...#',
      '#...D..H#',
      '#########',
    ];
    const world = makeWorld(rows, { x: 1.5, z: 1.5, noiseRadius: 4 });
    const cat = newCat(6, 1);
    cat.update(1 / 30, world);
    expect(cat.state).toBe(WANDER);
  });

  it('hides when it sees the player within sight range', () => {
    const world = makeWorld(ARENA, { x: 2.5, z: 3.5, noiseRadius: 2 });
    const cat = newCat(9, 3); // dist ~6.5 < sightRange 9, open LOS
    cat.update(1 / 30, world);
    expect(cat.state).toBe(HIDING);
  });

  it('flees immediately if the player is already inside panic radius', () => {
    const world = makeWorld(ARENA, { x: 8.5, z: 3.5, noiseRadius: 4 });
    const cat = newCat(9, 3); // dist ~1 < panicRadius
    const events = cat.update(1 / 30, world);
    expect(cat.state).toBe(FLEEING);
    expect(events).toContain('hiss');
  });
});

describe('Cat hiding', () => {
  function hiddenCat() {
    const world = makeWorld(ARENA, { x: 2.5, z: 3.5, noiseRadius: 2 });
    const cat = newCat(9, 3);
    cat.update(1 / 30, world);            // spook -> HIDING
    world.player.x = 1.5; world.player.z = 1.5;
    run(cat, world, 10);                  // let it reach the spot
    return { world, cat };
  }

  it('reaches the hide spot and tucks in', () => {
    const { cat } = hiddenCat();
    expect(cat.state).toBe(HIDING);
    expect(cat.hidden).toBe(true);
    expect([Math.floor(cat.x), Math.floor(cat.z)]).toEqual([11, 3]);
  });

  it('tolerates a slow, quiet approach into grab range', () => {
    const { world, cat } = hiddenCat();
    world.player = { x: 9.5, z: 3.5, noiseRadius: 4 }; // dist 2.0 > 4*0.35 = 1.4
    cat.update(1 / 30, world);
    expect(cat.state).toBe(HIDING);
    expect(cat.hidden).toBe(true);
  });

  it('bolts with a hiss when a sprinting player gets close', () => {
    const { world, cat } = hiddenCat();
    world.player = { x: 8.5, z: 3.5, noiseRadius: 12 }; // dist 3.0 < 12*0.35 = 4.2
    const events = cat.update(1 / 30, world);
    expect(cat.state).toBe(FLEEING);
    expect(events).toContain('hiss');
  });

  it('calms back to WANDER when the player stays far away', () => {
    const { world, cat } = hiddenCat();
    world.player = { x: 1.5, z: 1.5, noiseRadius: 2 }; // dist > calmRadius? ~7.8 < 11...
    // move player out beyond calmRadius using the corner-most position:
    // arena is small, so shrink calmRadius for this test
    const saved = TUNING.calmRadius;
    TUNING.calmRadius = 6;
    run(cat, world, TUNING.calmTime + 1);
    TUNING.calmRadius = saved;
    expect(cat.state).toBe(WANDER);
    expect(cat.hidden).toBe(false);
  });
});

describe('Cat fleeing', () => {
  it('gains distance from the player in the open', () => {
    const world = makeWorld(ARENA, { x: 8.5, z: 3.5, noiseRadius: 4 });
    const cat = newCat(9, 3);
    cat.update(1 / 30, world); // -> FLEEING
    const d0 = Math.hypot(cat.x - 8.5, cat.z - 3.5);
    run(cat, world, 1.5);
    const d1 = Math.hypot(cat.x - 8.5, cat.z - 3.5);
    expect(d1).toBeGreaterThan(d0 + 1);
  });

  it('becomes cornered when the player blocks the only exit', () => {
    const rows = [
      '#########',
      '#...#...#',
      '#...D...#',
      '#...#...#',
      '#########',
    ];
    // player stands in the doorway; cat in the left room's far corner
    const world = makeWorld(rows, { x: 4.5, z: 2.5, noiseRadius: 12 });
    const cat = newCat(1, 1);
    cat.state = FLEEING;
    cat.pickFleeTarget(world);
    expect(cat.cornered).toBe(true);
    expect(cat.path).toBeNull();
  });

  it('returns to hiding once it is far enough away', () => {
    const world = makeWorld(ARENA, { x: 11.5, z: 1.5, noiseRadius: 4 });
    const cat = newCat(10, 2);
    cat.update(1 / 30, world);   // close player -> FLEEING
    expect(cat.state).toBe(FLEEING);
    world.player.x = -20; world.player.z = -20; // teleport far (dist > fleeSafeDist)
    cat.update(1 / 30, world);
    expect(cat.state).toBe(HIDING);
  });
});

describe('Cat events and capture', () => {
  it('meows when the meow timer elapses', () => {
    const world = makeWorld(ARENA, { x: 1.5, z: 1.5, noiseRadius: 2 });
    const cat = newCat(10, 4);
    cat.meowTimer = 0.01;
    const events = run(cat, world, 0.5);
    expect(events).toContain('meow');
  });

  it('does not meow while fleeing', () => {
    const world = makeWorld(ARENA, { x: 9.5, z: 3.5, noiseRadius: 4 });
    const cat = newCat(9, 3);
    cat.update(1 / 30, world); // -> FLEEING
    cat.meowTimer = 0.01;
    const events = run(cat, world, 0.3);
    expect(events).not.toContain('meow');
  });

  it('capture() freezes the cat permanently', () => {
    const world = makeWorld(ARENA, { x: 1.5, z: 1.5, noiseRadius: 2 });
    const cat = newCat(10, 4);
    cat.capture();
    expect(cat.state).toBe(CAUGHT);
    const { x, z } = cat;
    expect(run(cat, world, 1)).toEqual([]);
    expect(cat.x).toBe(x);
    expect(cat.z).toBe(z);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/cat.test.js`
Expected: FAIL — cannot resolve `../src/sim/cat.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/sim/cat.js
import { findPath, lineOfSight } from '../gen/grid.js';

export const WANDER = 'wander', HIDING = 'hiding', FLEEING = 'fleeing', CAUGHT = 'caught';

// Exported (and mutable) so playtest tuning and tests can adjust in one place.
export const TUNING = {
  wanderSpeed: 1.6,
  hideSpeed: 5.0,
  fleeSpeed: 5.2,
  sightRange: 9,          // sees the player this far with LOS
  panicRadius: 3.0,       // visible cat bolts inside this
  hiddenSpookBase: 1.1,   // hidden cat always bolts inside this
  hiddenSpookNoiseFactor: 0.35, // hidden spook distance = max(base, noise * this)
  calmRadius: 11,         // player farther than this lets a hidden cat calm down
  calmTime: 4,
  fleeSafeDist: 10,       // fleeing cat re-hides beyond this
  repathInterval: 0.5,
  panicTurnChance: 0.2,
  fleeSamples: 24,
};

export class Cat {
  constructor(id, spawnCell, rng) {
    this.id = id;
    this.x = spawnCell.x + 0.5;
    this.z = spawnCell.y + 0.5;
    this.state = WANDER;
    this.rng = rng;
    this.path = null;
    this.pathI = 0;
    this.idleTimer = rng.range(0.5, 2);
    this.meowTimer = rng.range(4, 10);
    this.repathTimer = 0;
    this.calmTimer = 0;
    this.hidden = false;
    this.cornered = false;
    this.heading = 0;
  }

  cellX() { return Math.floor(this.x); }
  cellY() { return Math.floor(this.z); }
  dist(p) { return Math.hypot(p.x - this.x, p.z - this.z); }

  capture() {
    this.state = CAUGHT;
    this.path = null;
  }

  // world: { grid, hideSpots, floorCells, player: {x, z, noiseRadius} }
  // returns events: 'meow' | 'hiss'
  update(dt, world) {
    const events = [];
    if (this.state === CAUGHT) return events;
    const d = this.dist(world.player);

    this.meowTimer -= dt;
    if (this.meowTimer <= 0) {
      if (this.state !== FLEEING) events.push('meow');
      this.meowTimer = this.hidden ? this.rng.range(18, 35) : this.rng.range(6, 15);
    }

    if (this.state === WANDER) this.updateWander(dt, world, d, events);
    else if (this.state === HIDING) this.updateHiding(dt, world, d, events);
    else if (this.state === FLEEING) this.updateFleeing(dt, world, d, events);
    return events;
  }

  noticesPlayer(world, d) {
    const p = world.player;
    if (d < p.noiseRadius) return true;
    return d < TUNING.sightRange &&
      lineOfSight(world.grid, this.cellX(), this.cellY(), Math.floor(p.x), Math.floor(p.z));
  }

  updateWander(dt, world, d, events) {
    if (d < TUNING.panicRadius) { this.startFlee(events); return; }
    if (this.noticesPlayer(world, d)) { this.startHide(world, events); return; }
    if (this.path) {
      this.followPath(dt, TUNING.wanderSpeed);
    } else {
      this.idleTimer -= dt;
      if (this.idleTimer <= 0) {
        for (let i = 0; i < 10 && !this.path; i++) {
          const c = this.rng.pick(world.floorCells);
          this.setPath(findPath(world.grid, this.cellX(), this.cellY(), c.x, c.y, { cat: true }));
        }
        this.idleTimer = this.rng.range(1, 3);
      }
    }
  }

  updateHiding(dt, world, d, events) {
    const p = world.player;
    const spookDist = this.hidden
      ? Math.max(TUNING.hiddenSpookBase, p.noiseRadius * TUNING.hiddenSpookNoiseFactor)
      : TUNING.panicRadius;
    if (d < spookDist) { this.startFlee(events); return; }
    if (this.path) {
      if (this.followPath(dt, TUNING.hideSpeed)) this.hidden = true;
    } else if (this.hidden) {
      if (d > TUNING.calmRadius) {
        this.calmTimer += dt;
        if (this.calmTimer >= TUNING.calmTime) {
          this.hidden = false;
          this.state = WANDER;
          this.idleTimer = this.rng.range(0.5, 1.5);
        }
      } else {
        this.calmTimer = 0;
      }
    } else {
      this.state = WANDER; // lost the path somehow; resume wandering
    }
  }

  updateFleeing(dt, world, d, events) {
    if (d > TUNING.fleeSafeDist) {
      this.cornered = false;
      this.startHide(world, events);
      return;
    }
    this.repathTimer -= dt;
    if (this.repathTimer <= 0 || !this.path) {
      this.repathTimer = TUNING.repathInterval;
      this.pickFleeTarget(world);
    }
    if (this.path) this.followPath(dt, TUNING.fleeSpeed);
  }

  startHide(world, events) {
    const p = world.player;
    let bestScore = -Infinity, bestPath = null;
    for (const h of world.hideSpots) {
      const dp = Math.hypot(p.x - (h.x + 0.5), p.z - (h.y + 0.5));
      const dc = Math.hypot(this.x - (h.x + 0.5), this.z - (h.y + 0.5));
      const score = dp - 0.4 * dc;
      if (score <= bestScore) continue;
      const path = findPath(world.grid, this.cellX(), this.cellY(), h.x, h.y, { cat: true });
      if (!path) continue;
      bestScore = score;
      bestPath = path;
    }
    if (!bestPath) { this.startFlee(events); return; }
    this.state = HIDING;
    this.hidden = false;
    this.calmTimer = 0;
    this.setPath(bestPath);
  }

  startFlee(events) {
    if (this.state !== FLEEING) events.push('hiss'); // don't re-hiss when already fleeing
    this.state = FLEEING;
    this.hidden = false;
    this.cornered = false;
    this.repathTimer = 0;
    this.path = null;
  }

  pickFleeTarget(world) {
    const p = world.player;
    const w = world.grid.w;
    const blocked = new Set();
    const px = Math.floor(p.x), pz = Math.floor(p.z);
    for (let y = pz - 1; y <= pz + 1; y++)
      for (let x = px - 1; x <= px + 1; x++) blocked.add(y * w + x);

    const candidates = [];
    for (let i = 0; i < TUNING.fleeSamples; i++) {
      const c = this.rng.pick(world.floorCells);
      const dp = Math.hypot(p.x - (c.x + 0.5), p.z - (c.y + 0.5));
      candidates.push({ c, dp });
    }
    candidates.sort((a, b) => b.dp - a.dp);
    if (this.rng.chance(TUNING.panicTurnChance)) {
      candidates.sort(() => this.rng.next() - 0.5); // panic: bad decisions
    }
    const current = this.dist(p);
    for (const { c, dp } of candidates) {
      if (dp < current + 0.5) continue; // must actually gain ground
      const path = findPath(world.grid, this.cellX(), this.cellY(), c.x, c.y, { cat: true, blocked });
      if (path) {
        this.setPath(path);
        this.cornered = false;
        return;
      }
    }
    // nowhere to run — freeze in the corner; this is the player's chance
    this.cornered = true;
    this.path = null;
  }

  setPath(path) {
    this.path = path && path.length > 1 ? path : null;
    this.pathI = 1; // skip the start cell
  }

  // Advance along the path. Returns true when the path is finished.
  followPath(dt, speed) {
    if (!this.path) return true;
    if (this.pathI >= this.path.length) { this.path = null; return true; }
    const [cx, cy] = this.path[this.pathI];
    const tx = cx + 0.5, tz = cy + 0.5;
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      this.x = tx; this.z = tz;
      this.pathI++;
      if (this.pathI >= this.path.length) { this.path = null; return true; }
    } else {
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
      this.heading = Math.atan2(dx, dz);
    }
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/cat.test.js`
Expected: all tests pass. If the "wanders" test is flaky for the chosen seed (cat idles the whole window), bump the seed in `newCat` rather than loosening the assertion.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/sim/cat.js tests/cat.test.js
git commit -m "feat: cat AI state machine (wander/hide/flee/cornered) with meow and hiss events"
```

---

### Task 7: World rendering

**Files:**
- Create: `src/render/world.js`
- Modify: `src/main.js` (temporary house viewer, replaced in Task 11)

No unit tests — render modules are verified visually per the spec.

- [ ] **Step 1: Write the world builder**

```js
// src/render/world.js
import * as THREE from 'three';
import { WALL, FURN, HIDE } from '../gen/grid.js';

export const WALL_HEIGHT = 2.6;

export function buildWorld(house, { ceiling = true } = {}) {
  const { grid } = house;
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(grid.w, grid.h),
    new THREE.MeshLambertMaterial({ color: 0xb09a7a })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(grid.w / 2, 0, grid.h / 2);
  group.add(floor);

  if (ceiling) {
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(grid.w, grid.h),
      new THREE.MeshLambertMaterial({ color: 0xece5d8 })
    );
    top.rotation.x = Math.PI / 2;
    top.position.set(grid.w / 2, WALL_HEIGHT, grid.h / 2);
    group.add(top);
  }

  const cellsOf = (type) => {
    const out = [];
    for (let y = 0; y < grid.h; y++)
      for (let x = 0; x < grid.w; x++)
        if (grid.get(x, y) === type) out.push([x, y]);
    return out;
  };

  const addInstanced = (cells, geo, color, cy) => {
    if (!cells.length) return;
    const mesh = new THREE.InstancedMesh(
      geo, new THREE.MeshLambertMaterial({ color }), cells.length);
    const m = new THREE.Matrix4();
    cells.forEach(([x, y], i) => {
      m.makeTranslation(x + 0.5, cy, y + 0.5);
      mesh.setMatrixAt(i, m);
    });
    group.add(mesh);
  };

  addInstanced(cellsOf(WALL), new THREE.BoxGeometry(1, WALL_HEIGHT, 1), 0xd6cbb8, WALL_HEIGHT / 2);
  addInstanced(cellsOf(FURN), new THREE.BoxGeometry(0.95, 0.7, 0.95), 0x8a5f3c, 0.35);
  // hide spots render as a table top with room for a cat underneath
  addInstanced(cellsOf(HIDE), new THREE.BoxGeometry(1.0, 0.12, 1.0), 0x6e4a2e, 0.62);

  return group;
}
```

- [ ] **Step 2: Replace src/main.js with a temporary overhead house viewer**

```js
// src/main.js — TEMPORARY house viewer; replaced by the game loop in Task 11.
import * as THREE from 'three';
import { generateHouse } from './gen/house.js';
import { buildWorld } from './render/world.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xfff2dd, 0x55503f, 1.1));
const dir = new THREE.DirectionalLight(0xffffff, 0.6);
dir.position.set(1, 2, 1.5);
scene.add(dir);

const house = generateHouse(Math.floor(Math.random() * 1e9));
scene.add(buildWorld(house, { ceiling: false }));
camera.position.set(house.grid.w / 2, 38, house.grid.h * 0.95);
camera.lookAt(house.grid.w / 2, 0, house.grid.h / 2);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev`, open http://localhost:5173, reload a few times.
Expected each reload: a different multi-room layout; sealed outer border; door gaps in interior walls; brown furniture boxes with darker floating "table tops" (hide spots); no rooms sealed off from the rest.

- [ ] **Step 4: Commit**

```bash
git add src/render/world.js src/main.js
git commit -m "feat: instanced world rendering with temporary overhead house viewer"
```

---

### Task 8: Cat meshes

**Files:**
- Create: `src/render/catMesh.js`

- [ ] **Step 1: Write the cat mesh module**

```js
// src/render/catMesh.js
import * as THREE from 'three';

export const CAT_COLORS = [0xe8964a, 0x4a4a52, 0xf2ead8, 0x7d5a3c, 0xb9b3a8];

// Low-poly cat built facing +z so rotation.y = cat.heading points it along its motion.
export function createCatMesh(color) {
  const root = new THREE.Group();
  const body = new THREE.Group(); // bobbed/crouched independently of root position
  root.add(body);
  const mat = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x222222 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.55), mat);
  torso.position.y = 0.24;
  body.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.22), mat);
  head.position.set(0, 0.4, 0.32);
  body.add(head);

  const earGeo = new THREE.ConeGeometry(0.05, 0.1, 4);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, mat);
    ear.position.set(0.07 * s, 0.55, 0.3);
    body.add(ear);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.02), dark);
    eye.position.set(0.06 * s, 0.42, 0.44);
    body.add(eye);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.3), mat);
  tail.geometry.translate(0, 0, -0.15); // pivot at the base
  tail.position.set(0, 0.34, -0.27);
  tail.rotation.x = 0.7;
  body.add(tail);

  root.userData.body = body;
  root.userData.tail = tail;
  return root;
}

export function updateCatMesh(mesh, cat, time) {
  mesh.position.set(cat.x, 0, cat.z);
  mesh.rotation.y = cat.heading;
  const body = mesh.userData.body;
  body.position.y = cat.path ? Math.abs(Math.sin(time * 9)) * 0.05 : 0; // trot bob
  body.scale.y = cat.hidden ? 0.55 : 1;                                 // crouch under furniture
  mesh.userData.tail.rotation.z = Math.sin(time * 3 + cat.id) * 0.3;    // idle tail sway
}
```

- [ ] **Step 2: Verify it parses and the suite still passes**

Run: `npx vitest run && node -e "console.log('ok')"`
Expected: tests green. (Visual check happens in Task 11 when cats join the scene.)

- [ ] **Step 3: Commit**

```bash
git add src/render/catMesh.js
git commit -m "feat: low-poly articulated cat meshes with bob, crouch, and tail sway"
```

---

### Task 9: HUD

**Files:**
- Modify: `index.html` (replace entirely)
- Create: `src/hud.js`
- Test: `tests/hud.test.js` (formatTime only — DOM parts verified visually)

- [ ] **Step 1: Write the failing test**

```js
// tests/hud.test.js
import { describe, it, expect } from 'vitest';
import { formatTime } from '../src/hud.js';

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.4)).toBe('0:09');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(605)).toBe('10:05');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hud.test.js`
Expected: FAIL — cannot resolve `../src/hud.js`.

- [ ] **Step 3: Replace index.html**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Cat Burglar</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #111;
      font-family: ui-rounded, 'Trebuchet MS', system-ui, sans-serif; }
    #game { display: block; width: 100%; height: 100%; }
    .overlay { position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px; color: #fff;
      background: rgba(10, 10, 18, 0.78); text-align: center; cursor: pointer; }
    .overlay h1 { font-size: 56px; margin: 0; }
    .overlay p { font-size: 18px; line-height: 1.6; margin: 0; color: #ddd; }
    .overlay button { font-size: 20px; padding: 10px 28px; border-radius: 10px;
      border: none; cursor: pointer; background: #e8964a; color: #221; font-weight: bold; }
    .hidden { display: none !important; }
    #status { position: fixed; top: 14px; left: 0; right: 0; display: flex;
      justify-content: center; gap: 28px; color: #fff; font-size: 22px;
      text-shadow: 0 1px 3px #000; pointer-events: none; }
    #prompt { position: fixed; bottom: 18%; left: 0; right: 0; text-align: center;
      color: #ffe; font-size: 24px; text-shadow: 0 1px 3px #000; pointer-events: none; }
    #crosshair { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      color: #fff9; font-size: 20px; pointer-events: none; }
    #mute { position: fixed; top: 14px; right: 18px; color: #fff; font-size: 20px;
      pointer-events: none; }
  </style>
</head>
<body>
  <canvas id="game"></canvas>
  <div id="status" class="hidden"><span id="counter">🐱 0 / 5</span><span id="timer">0:00</span></div>
  <div id="prompt" class="hidden">Press E to grab the cat</div>
  <div id="crosshair" class="hidden">+</div>
  <div id="mute" class="hidden">🔇</div>
  <div id="start-screen" class="overlay">
    <h1>🐱 Cat Burglar</h1>
    <p>Five cats are loose in the house. Catch them all!</p>
    <p>WASD move &middot; mouse look &middot; Shift sprint &middot; E grab &middot; M mute<br/>
       Walk slowly to sneak up — cats hear you running.</p>
    <p><strong>Click to play</strong></p>
  </div>
  <div id="pause-screen" class="overlay hidden"><h1>Paused</h1><p>Click to resume</p></div>
  <div id="win-screen" class="overlay hidden">
    <h1>All cats caught! 🎉</h1>
    <p>Your time: <span id="win-time">0:00</span></p>
    <button id="play-again">Play again</button>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Write src/hud.js**

```js
// src/hud.js
export function formatTime(s) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    const id = (name) => document.getElementById(name);
    this.el = {
      start: id('start-screen'),
      pause: id('pause-screen'),
      win: id('win-screen'),
      status: id('status'),
      counter: id('counter'),
      timer: id('timer'),
      prompt: id('prompt'),
      crosshair: id('crosshair'),
      mute: id('mute'),
      winTime: id('win-time'),
    };
  }

  // name: 'start' | 'pause' | 'win' | 'none' ('none' = playing)
  showScreen(name) {
    for (const k of ['start', 'pause', 'win'])
      this.el[k].classList.toggle('hidden', k !== name);
    const playing = name === 'none';
    this.el.status.classList.toggle('hidden', !playing);
    this.el.crosshair.classList.toggle('hidden', !playing);
    if (!playing) this.setPrompt(false);
  }

  setCaught(n, total) { this.el.counter.textContent = `🐱 ${n} / ${total}`; }
  setTime(s) { this.el.timer.textContent = formatTime(s); }
  setPrompt(visible) { this.el.prompt.classList.toggle('hidden', !visible); }
  setMuted(muted) { this.el.mute.classList.toggle('hidden', !muted); }
  showWin(s) { this.el.winTime.textContent = formatTime(s); this.showScreen('win'); }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run`
Expected: all green, including the new formatTime test.

- [ ] **Step 6: Verify the viewer still loads**

Run: `npm run dev`, open the page.
Expected: house viewer renders behind the new start screen overlay (overlay click does nothing yet — wired in Task 11).

- [ ] **Step 7: Commit**

```bash
git add index.html src/hud.js tests/hud.test.js
git commit -m "feat: HUD overlay with start/pause/win screens, counter, timer, prompts"
```

---

### Task 10: Synthesized audio

**Files:**
- Create: `src/audio.js`

WebAudio cannot run in vitest's node environment; verified by ear in Task 11. Keep this module free of game logic.

- [ ] **Step 1: Write the audio module**

```js
// src/audio.js
// All SFX synthesized with WebAudio — no asset files.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Must be called from a user gesture (autoplay policy).
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  // gain -> stereo pan -> master
  out(vol, pan) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.master);
    return g;
  }

  meow(vol = 1, pan = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(620, t);
    osc.frequency.exponentialRampToValueAtTime(950, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(480, t + 0.42);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1600;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.6, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(filter).connect(env).connect(this.out(vol, pan));
    osc.start(t);
    osc.stop(t + 0.5);
  }

  hiss(vol = 1, pan = 0) {
    if (!this.ctx || this.muted || vol <= 0.01) return;
    const t = this.ctx.currentTime;
    const len = 0.4;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 4500;
    filter.Q.value = 0.7;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.5, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter).connect(env).connect(this.out(vol, pan));
    src.start(t);
  }

  gotcha() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => { // C5 E5 G5
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const env = this.ctx.createGain();
      const start = t + i * 0.09;
      env.gain.setValueAtTime(0.0001, start);
      env.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(env).connect(this.out(1, 0));
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}
```

- [ ] **Step 2: Verify the suite still passes**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/audio.js
git commit -m "feat: WebAudio-synthesized meow, hiss, and gotcha SFX with mute"
```

---

### Task 11: Game integration (main loop)

**Files:**
- Modify: `src/main.js` (replace the temporary viewer entirely)

This wires everything: pointer lock, input, sim updates, positional audio, grab/win flow. Screens are only hidden on `pointerlockchange` so a failed lock request (e.g. Chrome's relock throttle) just leaves a clickable overlay up.

- [ ] **Step 1: Replace src/main.js with the game**

```js
// src/main.js
import * as THREE from 'three';
import { generateHouse } from './gen/house.js';
import { buildWorld } from './render/world.js';
import { createCatMesh, updateCatMesh, CAT_COLORS } from './render/catMesh.js';
import { Cat, CAUGHT } from './sim/cat.js';
import { createPlayer, updatePlayer, grabbableCat, EYE_HEIGHT } from './sim/player.js';
import { makeRng } from './gen/rng.js';
import { Hud } from './hud.js';
import { AudioFX } from './audio.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a22);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 100);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xfff2dd, 0x55503f, 1.1));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(1, 2, 1.5);
scene.add(dirLight);

const hud = new Hud();
const audio = new AudioFX();

let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'won'
let house = null, worldGroup = null, player = null;
let cats = [], catMeshes = new Map();
let caught = 0, elapsed = 0;
const keys = {};

function newGame() {
  if (worldGroup) scene.remove(worldGroup);
  for (const m of catMeshes.values()) scene.remove(m);
  house = generateHouse(Math.floor(Math.random() * 1e9));
  worldGroup = buildWorld(house);
  scene.add(worldGroup);
  player = createPlayer(house.spawn);
  const rng = makeRng(house.seed + 1);
  cats = house.catSpawns.map((s, i) => new Cat(i, s, rng));
  catMeshes = new Map();
  for (const c of cats) {
    const m = createCatMesh(CAT_COLORS[c.id % CAT_COLORS.length]);
    catMeshes.set(c.id, m);
    scene.add(m);
  }
  caught = 0;
  elapsed = 0;
  hud.setCaught(0, cats.length);
  hud.setTime(0);
}

function simWorld() {
  return { grid: house.grid, hideSpots: house.hideSpots, floorCells: house.floorCells, player };
}

function tryGrab() {
  const cat = grabbableCat(player, cats);
  if (!cat) return;
  cat.capture();
  audio.gotcha();
  caught++;
  hud.setCaught(caught, cats.length);
  if (caught === cats.length) {
    state = 'won';            // set before exiting lock so the handler skips the pause screen
    document.exitPointerLock();
    hud.showWin(elapsed);
  }
}

function playCatSound(ev, cat) {
  const dx = cat.x - player.x, dz = cat.z - player.z;
  const d = Math.hypot(dx, dz);
  const vol = Math.max(0, 1 - d / 20);
  const rx = Math.cos(player.yaw), rz = -Math.sin(player.yaw); // camera right
  const pan = d > 0.01 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / d)) : 0;
  if (ev === 'meow') audio.meow(vol, pan);
  if (ev === 'hiss') audio.hiss(Math.max(vol, 0.25), pan);
}

// --- input ---
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') hud.setMuted(audio.toggleMute());
  if (e.code === 'KeyE' && state === 'playing') tryGrab();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  player.yaw -= e.movementX * 0.0022;
  player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - e.movementY * 0.0022));
});

// --- screens & pointer lock ---
document.getElementById('start-screen').addEventListener('click', () => {
  audio.init();
  if (!house) newGame();
  canvas.requestPointerLock();
});
document.getElementById('pause-screen').addEventListener('click', () => {
  canvas.requestPointerLock();
});
document.getElementById('play-again').addEventListener('click', () => {
  newGame();
  hud.showScreen('pause'); // fallback "click to resume" if the relock is throttled
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    state = 'playing';
    hud.showScreen('none');
  } else if (state === 'playing') {
    state = 'paused';
    hud.showScreen('pause');
  }
});

// --- main loop ---
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  if (state === 'playing') {
    elapsed += dt;
    updatePlayer(player, {
      forward: keys.KeyW, back: keys.KeyS, left: keys.KeyA, right: keys.KeyD,
      sprint: keys.ShiftLeft || keys.ShiftRight,
    }, house.grid, dt);
    const world = simWorld();
    for (const c of cats) {
      for (const ev of c.update(dt, world)) playCatSound(ev, c);
    }
    hud.setTime(elapsed);
    hud.setPrompt(!!grabbableCat(player, cats));
  }

  if (player) {
    camera.position.set(player.x, EYE_HEIGHT, player.z);
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    const t = now / 1000;
    for (const c of cats) {
      const m = catMeshes.get(c.id);
      if (c.state === CAUGHT) {
        if (m.visible) { // scoop-up shrink
          m.scale.multiplyScalar(0.85);
          if (m.scale.x < 0.02) m.visible = false;
        }
      } else {
        updateCatMesh(m, c, t);
      }
    }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
```

- [ ] **Step 2: Verify the full game manually**

Run: `npm run dev`, open http://localhost:5173. Checklist:
- Click to play → pointer locks, HUD shows 🐱 0 / 5 and a running timer.
- WASD walks, Shift sprints, mouse looks, walls block and slide.
- Meows are audible and louder/panned toward nearby cats.
- Approaching a cat makes it run and hide under a table (crouched, ears poking out).
- Sprinting close to a hidden cat → hiss + bolt; slow walk lets you reach it.
- E within range grabs: gotcha chime, cat shrinks away, counter increments.
- Esc → pause overlay; click resumes.
- Catch all 5 → win screen with time; Play again starts a fresh house.
- M toggles mute (🔇 indicator).

- [ ] **Step 3: Run the suite**

Run: `npx vitest run`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/main.js
git commit -m "feat: wire full game loop — pointer lock, sim, audio, grab and win flow"
```

---

### Task 12: Final verification, tuning, and build

**Files:**
- Modify (only if tuning requires): `src/sim/cat.js` (TUNING), `src/sim/player.js` (speed/noise constants)
- Create: `README.md`

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Production build**

Run: `npm run build && npm run preview` (background), then open http://localhost:4173.
Expected: build succeeds; game plays identically to dev.

- [ ] **Step 3: Playtest for difficulty**

Play 2–3 full rounds. Tuning levers, all in one place:
- Cats impossible to corner → lower `TUNING.fleeSpeed` (e.g. 5.0) or raise `TUNING.panicTurnChance`.
- Cats too easy → raise `TUNING.fleeSpeed` toward 5.8 or shrink `GRAB_RANGE`.
- Sneak-grab on hidden cats failing → confirm `NOISE_WALK * TUNING.hiddenSpookNoiseFactor < GRAB_RANGE` (4 × 0.35 = 1.4 < 1.7 ✓); widen the gap if it feels too tight.
- Cats too hard to find → shorten wander meow interval in `Cat.update` (the 6–15 s range).

If constants change, re-run `npm test` (tests reference the exported constants, not magic numbers, except the hidden-spook arithmetic test which documents the invariant — update it deliberately if the invariant changes).

- [ ] **Step 4: Write README.md**

```markdown
# 🐱 Cat Burglar

A first-person cat-catching game. Five cats are loose in a procedurally
generated house — find them, sneak up, and grab them all as fast as you can.

## Play

    npm install
    npm run dev

Open http://localhost:5173 (any modern macOS browser).

**Controls:** WASD move · mouse look · Shift sprint · E grab · M mute · Esc pause

**Tips:** Cats hear you — sprinting flushes them out, walking slowly lets you
sneak into grab range. Listen for meows to find hidden cats, and chase runners
into dead-end rooms to corner them.

## Develop

    npm test        # vitest unit tests (generation, pathfinding, AI, collision)
    npm run build   # static production build in dist/
```

- [ ] **Step 5: Final commit**

```bash
git add README.md src/sim/cat.js src/sim/player.js
git commit -m "docs: README; tune gameplay constants after playtest"
```

---

## Plan self-review notes

- **Spec coverage:** procedural house ✓ (Task 4), cat AI with hide/flee/cornered ✓ (Task 6), sneak mechanic via noise radii ✓ (Tasks 5–6), grab ✓ (Tasks 5, 11), HUD/timer/win/pause ✓ (Tasks 9, 11), meow/hiss/gotcha positional audio ✓ (Tasks 10–11), mute ✓, WebGL-less fallback is omitted as YAGNI (Three.js throws a visible console error; acceptable for v1 — deviation from spec noted here deliberately).
- **Type consistency:** cat fields used by render (`path`, `hidden`, `heading`, `id`, `x`, `z`, `state`) all defined in Task 6; `grabbableCat` matches the `'caught'` string constant; grid key formula `y * w + x` identical in `findPath`, `reachableCells`, and `pickFleeTarget`.
- **Known judgment calls:** hide-spot "table tops" float without legs (low-poly charm, revisit in Task 12 if it reads badly); cats don't collide with the player's body (blocked-cell pathing approximates it).
