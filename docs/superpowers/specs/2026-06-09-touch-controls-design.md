# Touch Controls for Cat Burglar (Design Spec)

**Date:** 2026-06-09
**Status:** Approved
**Builds on:** `2026-06-09-cat-catcher-fps-design.md`

## Goal

Make Cat Burglar playable on phones and iPads (iOS Safari and Android Chrome)
with on-screen touch controls, without changing the desktop experience or the
cat-AI stealth balance.

## Non-Goals

- Gyroscope aiming, haptics, PWA/offline install, public deployment.
- Gamepad support.
- Portrait-mode layout optimization (portrait works; landscape is recommended).

## Controls

| Surface | Gesture | Effect |
|---|---|---|
| Bottom-left joystick (fixed base) | drag knob | move; deflection magnitude sets speed (see mapping) |
| Anywhere else on screen | drag | look (yaw/pitch, same clamps as mouse) |
| 🐾 Grab button (bottom-right) | tap | grab — shown only when a cat is in range (replaces "Press E" prompt on touch) |
| ⏸ button (top-left) | tap | pause (touch replaces Esc) |
| 🔊/🔇 button (top-right) | tap | mute toggle (replaces M) |
| Start / pause / win overlays | tap | same handlers as click (click fires on tap) |

Multi-touch: the joystick claims the touch that starts inside its zone; any
other touch drives look. Touches are tracked by `identifier` so thumbs don't
steal each other's input.

## Analog speed mapping (the stealth mechanic on one thumb)

Joystick deflection magnitude `m ∈ [0, 1]` maps piecewise:

- `m ∈ (0, 0.7]`: sneak-to-walk zone — speed `lerp(0, WALK_SPEED, m/0.7)`,
  noise `lerp(NOISE_IDLE, NOISE_WALK, m/0.7)`.
- `m ∈ (0.7, 1]`: walk-to-sprint zone — speed `lerp(WALK_SPEED, SPRINT_SPEED, (m-0.7)/0.3)`,
  noise `lerp(NOISE_WALK, NOISE_SPRINT, (m-0.7)/0.3)`.

So ~70% push equals desktop walking; a full push equals sprinting; a slight
push is a slow, extra-quiet creep. The cat AI reads `player.noiseRadius` as
before — no AI changes. A small dead zone (m < 0.12) counts as idle.

## Architecture

| Unit | Responsibility |
|---|---|
| `src/touch.js` (new) | All touch DOM + events: joystick, look zone, grab/pause/mute buttons. Exposes per-frame `move` vector (camera-relative x/z, magnitude ≤ 1), `consumeLookDelta()`, and `onGrab`/`onPause`/`onMute` callbacks. Pure joystick math (`joystickVector(cx, cy, tx, ty, radius)`) is exported for unit tests. No Three.js, no game state. |
| `src/sim/player.js` (extend) | `updatePlayer` accepts `input.analog = {x, z}` (magnitude ≤ 1) as an alternative to digital flags; applies the piecewise speed/noise mapping via an exported pure function `analogSpeedNoise(m)`. Digital path (keys) is unchanged: it resolves to full magnitude + sprint flag exactly as today. |
| `src/main.js` (extend) | Touch detection (`'ontouchstart' in window`); touch game flow skips pointer lock: start tap → `playing` directly, ⏸ → `paused`, overlays resume on tap. Per frame, merges touch move/look into the existing player update. Desktop flow unchanged. |
| `index.html` (extend) | Mobile viewport meta (`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`), `touch-action: none` on game surfaces, touch HUD markup + CSS (visible only when `<body>` has class `touch`). |

## Game-flow differences on touch

- No pointer lock anywhere in the touch path (`requestPointerLock` is never
  called; iOS Safari has no pointer lock). The `pointerlockchange` handler is
  inert on touch devices.
- Start/win/pause overlays: tap → `state = 'playing'`, `hud.showScreen('none')`
  directly. Audio unlocks on that first tap (`audio.init()` in the same
  gesture).
- Mixed-input devices (e.g., iPad with keyboard): touch UI shows when touch is
  available; keyboard keys keep working in parallel.

## Error handling

- Touch events `preventDefault()` (registered `passive: false`) on game
  surfaces so iOS doesn't scroll, bounce, or double-tap-zoom mid-game.
- A touch that ends unexpectedly (`touchcancel`) resets the joystick/look
  tracking to idle rather than leaving a stuck input.

## Testing

- vitest: `joystickVector` (clamping, dead zone, identity cases) and
  `analogSpeedNoise` (boundary values m=0, 0.12, 0.7, 1.0 → exact
  speed/noise pairs; continuity at 0.7), plus updatePlayer with analog input
  (direction correctness, yaw-relative).
- Manual: on an iPhone/iPad over LAN (`npm run dev -- --host`), verify the
  control checklist above plus no-scroll/no-zoom, audio after first tap, and
  that desktop play is unchanged.

## Docs

README gains a "Play on phone/iPad" section: `npm run dev -- --host`, open
`http://<mac-lan-ip>:5173`, landscape recommended.
