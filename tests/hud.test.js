import { describe, it, expect } from 'vitest';
import { formatTime } from '../src/hud.js';

describe('formatTime', () => {
  it('formats seconds as m:ss', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9.4)).toBe('0:09');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(605)).toBe('10:05');
  });
});
