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
  it('flees when it hears a sprinting player and no hide spot exists', () => {
    // wall between cat and player blocks LOS, but sprint noise (12) carries
    const rows = [
      '#########',
      '#...#...#',
      '#...#...#',
      '#...D...#',
      '#########',
    ];
    const world = makeWorld(rows, { x: 1.5, z: 1.5, noiseRadius: 12 });
    // no hide spots in this map: expect FLEEING fallback instead of HIDING
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
    world.player = { x: 1.5, z: 1.5, noiseRadius: 2 };
    // the arena is small, so shrink calmRadius for this test
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
