import { describe, it, expect } from 'vitest';
import { isInQuietHours } from '../quiet-hours.js';

describe('isInQuietHours', () => {
  const tz = 'Asia/Kuala_Lumpur';

  it('returns true at 23:00 local', () => {
    // 23:00 KL = 15:00 UTC
    expect(isInQuietHours(new Date('2026-05-18T15:00:00Z'), tz)).toBe(true);
  });

  it('returns true at 02:00 local', () => {
    // 02:00 KL = 18:00 UTC previous day
    expect(isInQuietHours(new Date('2026-05-17T18:00:00Z'), tz)).toBe(true);
  });

  it('returns false at 09:00 local', () => {
    // 09:00 KL = 01:00 UTC
    expect(isInQuietHours(new Date('2026-05-18T01:00:00Z'), tz)).toBe(false);
  });

  it('returns false at 21:00 local (just before window)', () => {
    expect(isInQuietHours(new Date('2026-05-18T13:00:00Z'), tz)).toBe(false);
  });

  it('returns true at 22:00 exactly (window start)', () => {
    expect(isInQuietHours(new Date('2026-05-18T14:00:00Z'), tz)).toBe(true);
  });
});
