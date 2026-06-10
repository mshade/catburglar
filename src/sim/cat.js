// src/sim/cat.js
import { findPath, lineOfSight } from '../gen/grid.js';

export const WANDER = 'wander', HIDING = 'hiding', FLEEING = 'fleeing', CAUGHT = 'caught';

// Exported (and mutable) so playtest tuning and tests can adjust in one place.
// Design invariant — sneak-grab must stay possible:
//   max(hiddenSpookBase, NOISE_WALK * hiddenSpookNoiseFactor) < GRAB_RANGE
//   currently max(1.1, 4 * 0.35) = 1.4 < 1.7
// If you tune these (or NOISE_SPRINT/GRAB_RANGE), keep a hidden cat
// grabbable on a slow approach and flushable by a sprint.
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
