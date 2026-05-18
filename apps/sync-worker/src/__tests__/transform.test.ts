import { describe, it, expect } from 'vitest';
import { transformRow } from '../transform.js';

describe('transformRow', () => {
  it('parses a happy-path row', () => {
    const result = transformRow({
      phone_number: '0123456789',
      full_name: 'Alice Tan',
      email: 'alice@example.com',
      date_of_birth: '1990-05-18',
      membership_type: 'premium',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phoneE164).toBe('+60123456789');
      expect(result.data.fullName).toBe('Alice Tan');
      expect(result.data.email).toBe('alice@example.com');
      expect(result.data.membershipType).toBe('premium');
    }
  });

  it('parses DD/MM/YYYY dates (Malaysian format)', () => {
    const result = transformRow({
      phone: '0123456789',
      name: 'Bob',
      birthday: '18/05/1990',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dateOfBirth?.getUTCFullYear()).toBe(1990);
      expect(result.data.dateOfBirth?.getUTCMonth()).toBe(4);
      expect(result.data.dateOfBirth?.getUTCDate()).toBe(18);
    }
  });

  it('rejects rows with no valid phone', () => {
    const result = transformRow({ name: 'No phone', email: 'x@y.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields).toContain('phoneE164');
  });

  it('rejects rows with no name', () => {
    const result = transformRow({ phone: '0123456789' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.fields).toContain('fullName');
  });

  it('downgrades unknown membership types to walk_in', () => {
    const r = transformRow({ phone: '0123456789', name: 'Carol', membership_type: 'platinum' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.membershipType).toBe('walk_in');
  });

  it('produces stable row hash for unchanged data', () => {
    const a = transformRow({ phone: '0123456789', name: 'Dee', email: 'd@e.com' });
    const b = transformRow({ phone: '0123456789', name: 'Dee', email: 'd@e.com' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data.rowHash).toBe(b.data.rowHash);
  });

  it('produces different hash when name changes', () => {
    const a = transformRow({ phone: '0123456789', name: 'Dee' });
    const b = transformRow({ phone: '0123456789', name: 'Dee Smith' });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.data.rowHash).not.toBe(b.data.rowHash);
  });

  it('handles malformed email gracefully', () => {
    const r = transformRow({ phone: '0123456789', name: 'Eve', email: 'not-an-email' });
    expect(r.ok).toBe(false);
  });
});
