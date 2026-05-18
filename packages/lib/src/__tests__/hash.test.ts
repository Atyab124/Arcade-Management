import { describe, it, expect } from 'vitest';
import { rowHash } from '../hash.js';

describe('rowHash', () => {
  it('is stable across key ordering', () => {
    const a = rowHash({ a: 1, b: 2 });
    const b = rowHash({ b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it('changes when a value changes', () => {
    expect(rowHash({ a: 1 })).not.toBe(rowHash({ a: 2 }));
  });

  it('returns 64-char hex', () => {
    expect(rowHash({ x: 1 })).toMatch(/^[a-f0-9]{64}$/);
  });
});
