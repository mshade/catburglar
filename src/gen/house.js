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
