# Touch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cat Burglar playable on phones/iPads: analog joystick (deflection = sneak→walk→sprint), drag-to-look, contextual grab button, no pointer lock on touch.

**Architecture:** A new `src/touch.js` owns all touch DOM/events and exposes per-frame state (move vector, look delta) plus button callbacks. `src/sim/player.js` gains an analog input path whose piecewise speed/noise mapping is pure and unit-tested. `src/main.js` branches the screen flow on touch detection (no pointer lock) and merges touch input into the existing loop. Desktop behavior is unchanged.

**Tech Stack:** Existing stack only (vanilla JS, Three.js, vitest). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-09-touch-controls-design.md`

**Conventions:** Sim move vector is (x = strafe right+, z = forward+), transformed by yaw inside `updatePlayer` (same as the digital path). Screen-up on the joystick = forward, so `z = -(ty - cy) / radius`.

---

### Task 1: Analog input in the player sim

**Files:**
- Modify: `src/sim/player.js`
- Test: `tests/player.test.js` (append a describe block)

- [ ] **Step 1: Write the failing tests** — append to `tests/player.test.js`:

Also extend the import at the top of the file to include the new exports:

```js
import {
  createPlayer, updatePlayer, resolveMove, grabbableCat, analogSpeedNoise,
  WALK_SPEED, SPRINT_SPEED, NOISE_IDLE, NOISE_WALK, NOISE_SPRINT,
  DEAD_ZONE, WALK_POINT,
} from '../src/sim/player.js';
```

Append:

```js
describe('analogSpeedNoise', () => {
  it('is idle inside the dead zone', () => {
    expect(analogSpeedNoise(0)).toEqual({ speed: 0, noise: NOISE_IDLE });
    expect(analogSpeedNoise(DEAD_ZONE - 0.01)).toEqual({ speed: 0, noise: NOISE_IDLE });
  });

  it('reaches exactly walk speed and walk noise at WALK_POINT', () => {
    const { speed, noise } = analogSpeedNoise(WALK_POINT);
    expect(speed).toBeCloseTo(WALK_SPEED, 5);
    expect(noise).toBeCloseTo(NOISE_WALK, 5);
  });

  it('reaches exactly sprint speed and sprint noise at full deflection', () => {
    const { speed, noise } = analogSpeedNoise(1);
    expect(speed).toBeCloseTo(SPRINT_SPEED, 5);
    expect(noise).toBeCloseTo(NOISE_SPRINT, 5);
  });

  it('interpolates within the sneak zone', () => {
    const { speed, noise } = analogSpeedNoise(0.35); // halfway to WALK_POINT
    expect(speed).toBeCloseTo(WALK_SPEED * 0.5, 5);
    expect(noise).toBeCloseTo(NOISE_IDLE + (NOISE_WALK - NOISE_IDLE) * 0.5, 5);
  });

  it('interpolates within the sprint zone', () => {
    const { speed, noise } = analogSpeedNoise(0.85); // halfway from WALK_POINT to 1
    expect(speed).toBeCloseTo(WALK_SPEED + (SPRINT_SPEED - WALK_SPEED) * 0.5, 5);
    expect(noise).toBeCloseTo(NOISE_WALK + (NOISE_SPRINT - NOISE_WALK) * 0.5, 5);
  });

  it('is continuous at the walk point', () => {
    const below = analogSpeedNoise(WALK_POINT - 1e-9);
    const above = analogSpeedNoise(WALK_POINT + 1e-9);
    expect(Math.abs(below.speed - above.speed)).toBeLessThan(1e-6);
    expect(Math.abs(below.noise - above.noise)).toBeLessThan(1e-6);
  });
});

describe('updatePlayer with analog input', () => {
  it('moves forward along -z at sprint speed on full push', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 0, z: 1 } }, g, 0.1);
    expect(p.x).toBeCloseTo(3.5);
    expect(p.z).toBeCloseTo(2.5 - SPRINT_SPEED * 0.1);
    expect(p.noiseRadius).toBe(NOISE_SPRINT);
  });

  it('creeps quietly on a slight push', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 0, z: 0.35 } }, g, 0.1);
    expect(p.z).toBeCloseTo(2.5 - WALK_SPEED * 0.5 * 0.1, 5);
    expect(p.noiseRadius).toBeLessThan(NOISE_WALK);
    expect(p.noiseRadius).toBeGreaterThan(NOISE_IDLE);
  });

  it('treats the dead zone as idle', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 0.05, z: 0.05 } }, g, 0.1);
    expect(p.x).toBe(3.5);
    expect(p.z).toBe(2.5);
    expect(p.speed).toBe(0);
    expect(p.noiseRadius).toBe(NOISE_IDLE);
  });

  it('respects yaw: strafe right at yaw 90° moves along -z', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    p.yaw = Math.PI / 2;
    updatePlayer(p, { analog: { x: 1, z: 0 } }, g, 0.1);
    expect(p.x).toBeCloseTo(3.5, 5);
    expect(p.z).toBeCloseTo(2.5 - SPRINT_SPEED * 0.1, 5);
  });

  it('clamps magnitude above 1', () => {
    const g = openRoom();
    const p = createPlayer({ x: 3, y: 2 });
    updatePlayer(p, { analog: { x: 3, z: 4 } }, g, 0.1); // mag 5 → clamped to 1
    const dist = Math.hypot(p.x - 3.5, p.z - 2.5);
    expect(dist).toBeCloseTo(SPRINT_SPEED * 0.1, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/player.test.js`
Expected: FAIL — `analogSpeedNoise` is not exported.

- [ ] **Step 3: Implement** — modify `src/sim/player.js`. Add after the existing constants:

```js
export const DEAD_ZONE = 0.12, WALK_POINT = 0.7;

// Piecewise speed/noise from analog deflection magnitude m in [0, 1]:
// (0, WALK_POINT] sneaks up to walk; (WALK_POINT, 1] runs up to sprint.
// Mirrors the desktop walk/sprint noise levels so the cat AI needs no changes.
export function analogSpeedNoise(m) {
  if (m < DEAD_ZONE) return { speed: 0, noise: NOISE_IDLE };
  if (m <= WALK_POINT) {
    const t = m / WALK_POINT;
    return {
      speed: WALK_SPEED * t,
      noise: NOISE_IDLE + (NOISE_WALK - NOISE_IDLE) * t,
    };
  }
  const t = (m - WALK_POINT) / (1 - WALK_POINT);
  return {
    speed: WALK_SPEED + (SPRINT_SPEED - WALK_SPEED) * t,
    noise: NOISE_WALK + (NOISE_SPRINT - NOISE_WALK) * t,
  };
}
```

Replace the whole `updatePlayer` function with:

```js
export function updatePlayer(player, input, grid, dt) {
  let mx, mz, speed, noise;
  if (input.analog) {
    mx = input.analog.x;
    mz = input.analog.z;
    const mag = Math.min(1, Math.hypot(mx, mz));
    ({ speed, noise } = analogSpeedNoise(mag));
    if (speed > 0) {
      const len = Math.hypot(mx, mz);
      mx /= len;
      mz /= len;
    }
  } else {
    mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    mz = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
      noise = input.sprint ? NOISE_SPRINT : NOISE_WALK;
    } else {
      speed = 0;
      noise = NOISE_IDLE;
    }
  }
  if (speed === 0) {
    player.speed = 0;
    player.noiseRadius = noise ?? NOISE_IDLE;
    return;
  }
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  // forward = (-sin, -cos), right = (cos, -sin) in the x/z plane
  const wx = mz * -sin + mx * cos;
  const wz = mz * -cos + mx * -sin;
  const next = resolveMove(grid, player.x, player.z,
    player.x + wx * speed * dt, player.z + wz * speed * dt);
  player.x = next.x;
  player.z = next.z;
  player.speed = speed;
  player.noiseRadius = noise;
}
```

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: all pass, including every pre-existing `updatePlayer` test (the digital path must be behavior-identical).

- [ ] **Step 5: Commit**

```bash
git add src/sim/player.js tests/player.test.js
git commit -m "feat: analog movement input with piecewise sneak/walk/sprint mapping"
```

---

### Task 2: Touch module and touch HUD markup

**Files:**
- Create: `src/touch.js`
- Modify: `index.html`
- Test: `tests/touch.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// tests/touch.test.js
import { describe, it, expect } from 'vitest';
import { joystickVector } from '../src/touch.js';

describe('joystickVector', () => {
  it('is zero at the center', () => {
    expect(joystickVector(100, 100, 100, 100, 60)).toEqual({ x: 0, z: 0 });
  });

  it('maps screen-right to +x and screen-up to +z (forward)', () => {
    expect(joystickVector(100, 100, 130, 100, 60).x).toBeCloseTo(0.5);
    expect(joystickVector(100, 100, 100, 70, 60).z).toBeCloseTo(0.5);
  });

  it('maps screen-down to -z (backward)', () => {
    expect(joystickVector(100, 100, 100, 160, 60).z).toBeCloseTo(-1);
  });

  it('clamps magnitude to 1 outside the radius', () => {
    const v = joystickVector(100, 100, 220, 100, 60); // 2x radius right
    expect(v.x).toBeCloseTo(1);
    expect(Math.hypot(v.x, v.z)).toBeCloseTo(1);
  });

  it('preserves direction when clamping', () => {
    const v = joystickVector(0, 0, 300, 300, 60); // far down-right
    expect(v.x).toBeCloseTo(Math.SQRT1_2, 5);
    expect(v.z).toBeCloseTo(-Math.SQRT1_2, 5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/touch.test.js`
Expected: FAIL — cannot resolve `../src/touch.js`.

- [ ] **Step 3: Write src/touch.js**

```js
// src/touch.js
// All touch input: analog joystick, drag-to-look, and on-screen buttons.
// Exposes per-frame state; contains no game logic and no Three.js.

const JOY_RADIUS = 60;       // px, matches #touch-joystick CSS (120px / 2)
const KNOB_TRAVEL = 48;      // px, max knob offset from center

export function isTouchDevice() {
  return 'ontouchstart' in window;
}

// Vector from joystick center to touch point in sim convention:
// +x = strafe right, +z = forward (screen up). Clamped to magnitude 1.
export function joystickVector(cx, cy, tx, ty, radius) {
  let x = (tx - cx) / radius;
  let z = -(ty - cy) / radius;
  const m = Math.hypot(x, z);
  if (m > 1) {
    x /= m;
    z /= m;
  }
  return { x, z };
}

export class TouchControls {
  // callbacks: { onGrab, onPause, onMute } — invoked from button taps.
  constructor({ onGrab, onPause, onMute }) {
    this.move = { x: 0, z: 0 };
    this._lookDX = 0;
    this._lookDY = 0;
    this._joyId = null;
    this._lookId = null;
    this._joyCX = 0;
    this._joyCY = 0;
    this._lastX = 0;
    this._lastY = 0;

    const joy = document.getElementById('touch-joystick');
    this._knob = document.getElementById('touch-knob');
    this._grabBtn = document.getElementById('touch-grab');
    this._muteBtn = document.getElementById('touch-mute');
    const pauseBtn = document.getElementById('touch-pause');
    const canvas = document.getElementById('game');

    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this._joyId !== null) return;
      const t = e.changedTouches[0];
      this._joyId = t.identifier;
      const r = joy.getBoundingClientRect();
      this._joyCX = r.left + r.width / 2;
      this._joyCY = r.top + r.height / 2;
      this._updateJoy(t);
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (this._lookId === null && t.identifier !== this._joyId) {
          this._lookId = t.identifier;
          this._lastX = t.clientX;
          this._lastY = t.clientY;
        }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          e.preventDefault();
          this._updateJoy(t);
        } else if (t.identifier === this._lookId) {
          e.preventDefault();
          this._lookDX += t.clientX - this._lastX;
          this._lookDY += t.clientY - this._lastY;
          this._lastX = t.clientX;
          this._lastY = t.clientY;
        }
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._joyId) {
          this._joyId = null;
          this.move = { x: 0, z: 0 };
          this._knob.style.transform = 'translate(-50%, -50%)';
        }
        if (t.identifier === this._lookId) this._lookId = null;
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    const button = (el, fn) => el.addEventListener('touchstart', (e) => {
      e.preventDefault(); // keep the touch out of the look zone, no synthetic click
      fn();
    }, { passive: false });
    button(this._grabBtn, onGrab);
    button(pauseBtn, onPause);
    button(this._muteBtn, onMute);
  }

  _updateJoy(t) {
    const v = joystickVector(this._joyCX, this._joyCY, t.clientX, t.clientY, JOY_RADIUS);
    this.move = v;
    this._knob.style.transform =
      `translate(calc(-50% + ${v.x * KNOB_TRAVEL}px), calc(-50% + ${-v.z * KNOB_TRAVEL}px))`;
  }

  // Look delta accumulated since the last call; caller applies sensitivity.
  consumeLookDelta() {
    const d = { dx: this._lookDX, dy: this._lookDY };
    this._lookDX = 0;
    this._lookDY = 0;
    return d;
  }

  setGrabVisible(visible) {
    this._grabBtn.classList.toggle('visible', visible);
  }

  setMuted(muted) {
    this._muteBtn.textContent = muted ? '🔇' : '🔊';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/touch.test.js`
Expected: 5 passed. (Importing touch.js in node is safe: `document`/`window` are only touched inside functions/constructor.)

- [ ] **Step 5: Update index.html**

Replace the viewport-less `<meta charset...>`-only head start by adding a viewport meta directly after the charset meta:

```html
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
```

Add to the `<style>` block (before the closing `</style>`):

```css
    #game { touch-action: none; }
    .touch-ui { display: none; touch-action: none; -webkit-user-select: none; user-select: none; z-index: 5; }
    #touch-joystick { position: fixed; left: 24px; bottom: 24px; width: 120px; height: 120px;
      border-radius: 50%; background: rgba(255,255,255,0.08); border: 2px solid rgba(255,255,255,0.25); }
    #touch-knob { position: absolute; left: 50%; top: 50%; width: 52px; height: 52px;
      border-radius: 50%; background: rgba(255,255,255,0.35); transform: translate(-50%, -50%); }
    #touch-grab { position: fixed; right: 28px; bottom: 40px; width: 96px; height: 96px;
      border-radius: 50%; font-size: 17px; border: none; background: #e8964a; color: #221; font-weight: bold; }
    #touch-pause { position: fixed; top: 12px; left: 14px; width: 44px; height: 44px;
      border-radius: 10px; border: none; background: rgba(255,255,255,0.15); color: #fff; font-size: 20px; }
    #touch-mute { position: fixed; top: 12px; right: 14px; width: 44px; height: 44px;
      border-radius: 10px; border: none; background: rgba(255,255,255,0.15); color: #fff; font-size: 20px; }
    body.touch.playing #touch-joystick, body.touch.playing #touch-pause, body.touch.playing #touch-mute { display: block; }
    body.touch.playing #touch-grab.visible { display: block; }
    body.touch #prompt, body.touch #mute, body.touch #crosshair { display: none !important; }
```

Add the markup before the `<script type="module">` tag:

```html
  <div id="touch-joystick" class="touch-ui"><div id="touch-knob"></div></div>
  <button id="touch-grab" class="touch-ui">🐾 Grab</button>
  <button id="touch-pause" class="touch-ui">⏸</button>
  <button id="touch-mute" class="touch-ui">🔊</button>
```

Notes: the touch widgets show only while playing (`body.touch.playing` — main.js toggles `playing` in Task 3), so overlays stay clean; the desktop `#prompt`, `#mute` indicator, and `#crosshair` are hidden on touch (grab button, mute button, and center-of-screen aim replace them).

- [ ] **Step 6: Verify the page still loads and the suite is green**

Run: `npx vitest run` then start `npm run dev` in background, `curl -s http://localhost:5173 | grep -q 'touch-joystick' && echo OK`, kill the server.
Expected: suite green, `OK`.

- [ ] **Step 7: Commit**

```bash
git add src/touch.js tests/touch.test.js index.html
git commit -m "feat: touch input module (joystick, drag look, buttons) and touch HUD"
```

---

### Task 3: Game integration and README

**Files:**
- Modify: `src/main.js`
- Modify: `README.md`

- [ ] **Step 1: Wire touch into src/main.js**

Add to the imports:

```js
import { TouchControls, isTouchDevice } from './touch.js';
```

After `const audio = new AudioFX();` add:

```js
const IS_TOUCH = isTouchDevice();
const TOUCH_LOOK_SENS = 0.005; // rad per px of drag
let touch = null;
if (IS_TOUCH) {
  document.body.classList.add('touch');
  touch = new TouchControls({
    onGrab: () => { if (state === 'playing') tryGrab(); },
    onPause: () => {
      if (state === 'playing') setPlaying(false);
    },
    onMute: () => touch.setMuted(audio.toggleMute()),
  });
}

// Single place that flips between playing and paused UI state.
function setPlaying(playing) {
  state = playing ? 'playing' : 'paused';
  hud.showScreen(playing ? 'none' : 'pause');
  document.body.classList.toggle('playing', playing);
}
```

Replace the pointerlockchange-adjacent screen handlers with a touch-aware version. The three overlay handlers become:

```js
function startOrResume() {
  if (IS_TOUCH) setPlaying(true);
  else requestLock();
}
document.getElementById('start-screen').addEventListener('click', () => {
  audio.init();
  if (!house) newGame();
  startOrResume();
});
document.getElementById('pause-screen').addEventListener('click', startOrResume);
document.getElementById('play-again').addEventListener('click', () => {
  newGame();
  if (!IS_TOUCH) hud.showScreen('pause'); // fallback "click to resume" if the relock is throttled
  startOrResume();
});
```

Update the pointerlockchange handler to be inert on touch and to route through setPlaying:

```js
document.addEventListener('pointerlockchange', () => {
  if (IS_TOUCH) return;
  if (document.pointerLockElement === canvas) {
    setPlaying(true);
  } else {
    for (const k of Object.keys(keys)) keys[k] = false; // drop held keys on any unlock
    if (state === 'playing') setPlaying(false);
  }
});
```

Note `setPlaying(false)` sets state 'paused' — the win flow still sets `state = 'won'` AFTER `setPlaying` would run, so keep `tryGrab` as is EXCEPT the win branch must also clear the body `playing` class and, on touch, skip exitPointerLock. Replace the win branch inside `tryGrab`:

```js
  if (caught === cats.length) {
    state = 'won'; // set before exiting lock so the handler skips the pause screen
    document.body.classList.remove('playing');
    if (!IS_TOUCH) document.exitPointerLock();
    hud.showWin(elapsed);
  }
```

In the frame loop's `state === 'playing'` branch, replace the `updatePlayer(...)` call with input merging (touch joystick wins while deflected; keyboard still works on mixed devices) and apply look delta:

```js
    const analogActive = touch && (touch.move.x !== 0 || touch.move.z !== 0);
    updatePlayer(player, analogActive ? { analog: touch.move } : {
      forward: keys.KeyW, back: keys.KeyS, left: keys.KeyA, right: keys.KeyD,
      sprint: keys.ShiftLeft || keys.ShiftRight,
    }, house.grid, dt);
    if (touch) {
      const { dx, dy } = touch.consumeLookDelta();
      player.yaw -= dx * TOUCH_LOOK_SENS;
      player.pitch = Math.max(-1.4, Math.min(1.4, player.pitch - dy * TOUCH_LOOK_SENS));
    }
```

And replace the `hud.setPrompt(...)` line so the grab button serves touch:

```js
    const target = grabbableCat(player, cats);
    hud.setPrompt(!!target && !IS_TOUCH);
    if (touch) touch.setGrabVisible(!!target);
```

Also: the mousemove handler stays as is (it is already guarded by pointer lock, which never engages on touch). The M-key mute handler gains the touch icon sync — replace it with:

```js
  if (e.code === 'KeyM') {
    const muted = audio.toggleMute();
    hud.setMuted(muted);
    if (touch) touch.setMuted(muted);
  }
```

- [ ] **Step 2: Verify**

Run: `npx vitest run` (green) and `npm run build` (success).
Manual structure check: `node -e "const s=require('fs').readFileSync('src/main.js','utf8'); for (const t of ['setPlaying','IS_TOUCH','TouchControls','consumeLookDelta','setGrabVisible']) if (!s.includes(t)) throw new Error('missing '+t); console.log('WIRED')"`
Expected: `WIRED`.

- [ ] **Step 3: Add phone section to README.md**

After the `## Play` section's controls line, add:

```markdown
## Play on a phone or iPad

    npm run dev -- --host

Then open `http://<your-mac-lan-ip>:5173` on the phone (same Wi-Fi network —
the dev server prints the address). Landscape is recommended.

**Touch controls:** left joystick to move — push gently to sneak quietly,
push to the edge to sprint loudly · drag anywhere else to look · tap 🐾 to
grab when it appears · ⏸ pauses · 🔊 mutes.
```

- [ ] **Step 4: Commit**

```bash
git add src/main.js README.md
git commit -m "feat: touch game flow without pointer lock; analog joystick wired into loop"
```

---

### Task 4: Final verification

**Files:** none new (fixes only if verification fails)

- [ ] **Step 1: Full suite + build**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 2: Desktop regression check (headless)**

Start `npm run dev` in background. Confirm the desktop page does NOT activate touch UI: `curl -s http://localhost:5173 | grep -c touch-joystick` returns 1 (markup present), and in a headless Chrome run the body must NOT have the `touch` class (headless Chrome has no ontouchstart by default):
`"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --dump-dom --virtual-time-budget=4000 http://localhost:5173 2>/dev/null | grep -o '<body[^>]*>'`
Expected: a body tag without `class="touch"`.

- [ ] **Step 3: Touch emulation smoke test (headless, controller-driven)**

With Chrome headless + CDP (`--remote-debugging-port`), use `Emulation.setTouchEmulationEnabled {enabled:true}` + `Emulation.setEmitTouchEventsForMouse` or `Input.dispatchTouchEvent` to: navigate, dispatchTouchEvent tap on the start screen, verify via Runtime.evaluate that `document.body.classList.contains('touch')` is true (touch emulation makes `'ontouchstart' in window` true only when enabled before navigation — enable FIRST, then navigate), the start screen is hidden, and `body.classList.contains('playing')` is true; then dispatchTouchEvent a press on the joystick (e.g. start at its center, move 40px up, hold 1s) and screenshot before/after to confirm forward movement. This step may be performed by the controller session rather than a subagent.

- [ ] **Step 4: Real-device check (user)**

On an iPhone/iPad over LAN: joystick sneak/walk/sprint feel, drag look, grab button appears near cats and works, pause/mute buttons, no page scroll/zoom/bounce, audio after first tap, win + play-again flow.

- [ ] **Step 5: Commit any tuning**

If TOUCH_LOOK_SENS or joystick sizes change after device testing:
```bash
git add src/main.js src/touch.js index.html
git commit -m "tune: touch look sensitivity and joystick sizing from device playtest"
```

---

## Plan self-review notes

- **Spec coverage:** analog mapping + dead zone (Task 1), joystick/look/buttons + multi-touch by identifier + touchcancel reset (Task 2), no-pointer-lock touch flow + overlay taps + audio unlock + mixed-input merge (Task 3), viewport/touch-action/no-zoom (Task 2 Step 5), README LAN instructions (Task 3), desktop unchanged (Task 1 Step 4 digital-path tests + Task 4 Step 2).
- **Type consistency:** `touch.move {x,z}` feeds `input.analog {x,z}`; `consumeLookDelta() → {dx,dy}`; `setGrabVisible(bool)`, `setMuted(bool)` used in Task 3 match Task 2 definitions; `setPlaying` defined and used only in Task 3.
- **Judgment calls:** grab button taps use `touchstart` (not click) for latency and to avoid the look-zone claiming the touch; `body.touch.playing` CSS gating keeps widgets off the overlays without JS show/hide of each widget.
