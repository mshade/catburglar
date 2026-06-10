import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/gen/rng.js';

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces values in [0, 1)', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int stays within inclusive bounds and is an integer', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('pick returns elements of the array', () => {
    const rng = makeRng(1);
    for (let i = 0; i < 50; i++) expect(['a', 'b', 'c']).toContain(rng.pick(['a', 'b', 'c']));
  });

  it('chance(0) is never true and chance(1) is always true', () => {
    const rng = makeRng(3);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});
