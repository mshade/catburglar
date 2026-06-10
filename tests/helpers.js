import { Grid, WALL, FLOOR, DOOR, FURN, HIDE } from '../src/gen/grid.js';

const CH = { '#': WALL, '.': FLOOR, D: DOOR, F: FURN, H: HIDE };

// Build a Grid from rows of '#'. 'D' door, 'F' furniture, 'H' hide spot.
export function fromAscii(rows) {
  const g = new Grid(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => g.set(x, y, CH[ch])));
  return g;
}
