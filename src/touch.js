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
  return { x: x || 0, z: z || 0 };
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
