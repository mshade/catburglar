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
