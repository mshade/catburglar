# Cat Burglar — First-Person Cat-Catching Game (Design Spec)

**Date:** 2026-06-09
**Status:** Approved pending review

## Concept

A first-person 3D game playable in a macOS browser. The player is dropped into a
procedurally generated, deliberately convoluted single-story house containing 5 cats.
Cats wander, hide under furniture, and flee when spooked. The player finds them,
sneaks up, and grabs them with E. Catching all 5 ends the game; elapsed time is the
score.

## Goals / Non-Goals

**Goals**

- Playable on macOS in a stock browser (Chrome/Safari) with no install.
- Procedural house: different layout every run, always fully connected.
- Cats with real hide-and-flee behavior — finding and catching them must take skill.
- Simple sound effects: cat meows (positional — they double as a "find me" cue),
  hisses when spooked, and a "gotcha" sting on a successful grab.
- Pure-logic core (generation, pathfinding, AI) that is unit-testable headlessly.

**Non-Goals (v1)**

- Music, footsteps, ambient audio.
- Multiple floors, stairs, crouching.
- Skeletal animation (cats are articulated primitives with simple procedural motion).
- Mobile/touch support, gamepad.
- Saving, settings, difficulty levels.

## Tech Stack

- **Three.js** for rendering, **vanilla JS (ES modules)**, **Vite** for dev server and
  static build, **vitest** for unit tests.
- `npm run dev` → play locally; `npm run build` → static site in `dist/`.

## Architecture

Pure-logic modules know nothing about Three.js; render modules consume their output.

| Module | Responsibility | Pure logic? |
|---|---|---|
| `src/gen/house.js` | BSP room partition, doors, furniture & hide-spot placement; emits a cell grid | yes |
| `src/gen/grid.js` | Grid model, A* pathfinding, line-of-sight raycast | yes |
| `src/sim/cat.js` | Cat state machine (WANDER / HIDE / FLEE / CAUGHT), perception | yes |
| `src/sim/player.js` | Player kinematics, circle-vs-grid wall collision, grab check | yes |
| `src/render/world.js` | Builds Three.js meshes from the grid (walls, floors, furniture) | no |
| `src/render/catMesh.js` | Low-poly cat meshes + procedural bobbing/tail motion | no |
| `src/main.js` | Game loop, pointer-lock input, state (menu / playing / won) | no |
| `src/hud.js` | DOM overlay: counter, timer, grab prompt, start/win screens | no |
| `src/audio.js` | WebAudio-synthesized SFX: meow, hiss, gotcha; distance attenuation + stereo pan | no |

### Data flow

`house.js` generates a `Grid` (cell types: WALL, FLOOR, FURNITURE, HIDE_SPOT, DOOR).
The grid is the single source of truth: `world.js` meshes it, `player.js` collides
against it, cats path on it. Each frame: input → player sim → cat sim (perception,
state transitions, path following) → copy sim positions into meshes → render → HUD.

## House Generation

- Footprint: rectangular grid, ~40×30 cells at 1 m/cell (tunable).
- **BSP partition** into rooms with a minimum room size; thin (1-cell) walls between.
- Doors: spanning tree over the room-adjacency graph guarantees connectivity; add
  ~30% extra doors to create loops. Small leaf rooms with one door become dead-end
  closets — loops + dead ends = "convoluted."
- Furniture: per-room boxes (bed, table, sofa, crate) sized to the room, never
  blocking a door. A subset of furniture cells are HIDE_SPOTS (cat can tuck under).
- Invariants (unit-tested): every floor cell reachable from spawn; every room has
  ≥1 door; ≥8 hide spots; spawn and cat starts on FLOOR cells.

## Cats

5 cats, distinct colors. Per-cat state machine running on the grid:

- **WANDER** — pick a random reachable cell, A* there at slow speed, idle briefly.
- **HIDE** — triggered when player is within *notice radius* or has line of sight
  within a longer range. Path to the best hide spot scoring distance-from-player;
  tuck under furniture. Ears/tail remain visible — spotting hidden cats is the
  "find" gameplay. Calms back to WANDER if player stays far away.
- **FLEE** — triggered when player closes within *panic radius* (even while hidden).
  Run at ~player sprint speed away from the player, repathing frequently; with small
  probability take a suboptimal turn (panic). Dead-end rooms allow cornering.
  Drops back to HIDE when far enough away.
- **CAUGHT** — player presses E within grab range (~1.5 m) and rough facing; cat is
  removed from sim, counter increments.

**Sneak mechanic:** detection radii scale with player speed — sprinting is loud
(large notice radius), slow walking is quiet (small radius). Sneak up for the grab,
or flush and corner.

## Sound

All SFX are synthesized at runtime with the WebAudio API (oscillators + gain/filter
envelopes) — no audio asset files, nothing to download or license.

- **Meow** — wandering cats meow at random intervals (~every 6–15 s). Volume falls
  off with distance and pans left/right by direction, so meows are a sonar for
  finding hidden cats. Hidden cats meow rarely; fleeing cats don't.
- **Hiss** — played once when a cat transitions into FLEE (filtered noise burst).
- **Gotcha** — short rising two-note chime on a successful grab.
- Audio context unlocks on the start-screen click (browser autoplay policy). A mute
  toggle (M key) is included since synthesized SFX can grate.

## Player

- Pointer lock on click; mouse look, WASD move, Shift sprint, E grab.
- Capsule-as-circle vs grid AABB collision with wall sliding.
- Eye height ~1.6 m; walk ~3 m/s, sprint ~6 m/s.

## HUD & Game Flow

- **Start screen** (DOM): title, controls, "click to play" → pointer lock, timer starts.
- **Playing:** caught counter (🐱 3/5), elapsed timer, contextual "Press E to grab"
  prompt when a cat is in range.
- **Win screen:** final time, "Play again" → regenerate house, respawn cats.
- Pointer-lock loss (Esc) pauses with a resume overlay.

## Error Handling

- Generation runs invariant checks; on failure, retry with a new seed (bounded
  retries, then throw — surfaced as a console error and on-screen message).
- A* on a connected grid cannot fail between floor cells; cat targets are validated
  reachable before pathing.
- WebGL unavailable → plain DOM message instead of a crash.

## Testing

- **vitest** on pure-logic modules:
  - Generation invariants (connectivity, doors, hide-spot count) across many seeds.
  - A* correctness and LOS raycast cases on hand-built grids.
  - Cat state transitions driven by scripted player positions.
  - Player collision resolution against wall cells.
- Rendering, input, and game feel verified by manual playtesting.
