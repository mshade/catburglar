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
