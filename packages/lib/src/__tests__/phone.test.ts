import { describe, it, expect } from 'vitest';
import { normalizePhone, isE164 } from '../phone.js';

describe('normalizePhone', () => {
  it('normalizes Malaysian local format to E.164', () => {
    expect(normalizePhone('0123456789', 'MY')).toBe('+60123456789');
  });

  it('preserves an already-E.164 number', () => {
    expect(normalizePhone('+60123456789')).toBe('+60123456789');
  });

  it('returns null for invalid input', () => {
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizePhone('  0123456789  ')).toBe('+60123456789');
  });
});

describe('isE164', () => {
  it('accepts valid E.164', () => {
    expect(isE164('+60123456789')).toBe(true);
  });
  it('rejects local format', () => {
    expect(isE164('0123456789')).toBe(false);
  });
});
