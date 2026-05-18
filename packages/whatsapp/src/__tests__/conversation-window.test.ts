import { describe, it, expect } from 'vitest';
import { isWithinWindow, computeWindowExpiry } from '../conversation-window.js';

describe('isWithinWindow', () => {
  const now = new Date('2026-05-18T10:00:00Z');

  it('returns false when no inbound recorded', () => {
    expect(isWithinWindow(null, now)).toBe(false);
  });

  it('returns true if inbound was 23h ago', () => {
    expect(isWithinWindow(new Date('2026-05-17T11:00:00Z'), now)).toBe(true);
  });

  it('returns false if inbound was 25h ago', () => {
    expect(isWithinWindow(new Date('2026-05-17T09:00:00Z'), now)).toBe(false);
  });
});

describe('computeWindowExpiry', () => {
  it('returns inbound+24h when still in window', () => {
    const inbound = new Date('2026-05-18T08:00:00Z');
    const exp = computeWindowExpiry(inbound, new Date('2026-05-18T09:00:00Z'));
    expect(exp?.toISOString()).toBe('2026-05-19T08:00:00.000Z');
  });
});
