import { normalizePhone, rowHash } from '@arcade/lib';

/**
 * Coerce raw string-typed Sheets values into our canonical customer record shape.
 *
 * Validation rules — fields with errors land in `customer_sync_errors`; rows with NO valid
 * phone number are rejected outright since phone_e164 is our upsert key.
 */
export interface ParsedCustomer {
  phoneE164: string;
  fullName: string;
  email: string | null;
  dateOfBirth: Date | null;
  membershipType: string;
  preferredLang: string;
  notes: string | null;
  rowHash: string;
}

export interface ParseError {
  reason: string;
  fields: string[];
}

const HEADER_MAP: Record<string, keyof Omit<ParsedCustomer, 'rowHash'>> = {
  'phone': 'phoneE164',
  'phone_number': 'phoneE164',
  'phone number': 'phoneE164',
  'mobile': 'phoneE164',
  'name': 'fullName',
  'full name': 'fullName',
  'full_name': 'fullName',
  'customer name': 'fullName',
  'email': 'email',
  'dob': 'dateOfBirth',
  'date of birth': 'dateOfBirth',
  'date_of_birth': 'dateOfBirth',
  'birthday': 'dateOfBirth',
  'membership': 'membershipType',
  'membership type': 'membershipType',
  'membership_type': 'membershipType',
  'lang': 'preferredLang',
  'language': 'preferredLang',
  'preferred_lang': 'preferredLang',
  'notes': 'notes',
};

const MEMBERSHIP_VALUES = new Set(['walk_in', 'basic', 'premium', 'vip']);

function parseDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  // Try ISO first, then DD/MM/YYYY (Malaysia common format), then MM/DD/YYYY
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (iso.test(trimmed)) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  const dmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    let yyyy = Number(dmy[3]);
    if (yyyy < 100) yyyy += 2000;
    // Heuristic: if dd > 12 it must be DD/MM/YYYY
    if (dd > 12) {
      const d = new Date(Date.UTC(yyyy, mm - 1, dd));
      return isNaN(d.getTime()) ? null : d;
    }
    // Default to DD/MM/YYYY (Malaysian convention).
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function transformRow(raw: Record<string, string>): { ok: true; data: ParsedCustomer } | { ok: false; error: ParseError } {
  const mapped: Partial<Record<keyof Omit<ParsedCustomer, 'rowHash'>, string>> = {};
  for (const [key, value] of Object.entries(raw)) {
    const target = HEADER_MAP[key.toLowerCase().trim()];
    if (target) mapped[target] = value;
  }

  const fields: string[] = [];
  const errors: string[] = [];

  const phone = normalizePhone(mapped.phoneE164 ?? '');
  if (!phone) {
    fields.push('phoneE164');
    errors.push('invalid or missing phone');
  }
  const fullName = (mapped.fullName ?? '').trim();
  if (!fullName) {
    fields.push('fullName');
    errors.push('missing name');
  }
  if (errors.length > 0) {
    return { ok: false, error: { reason: errors.join('; '), fields } };
  }

  const email = mapped.email?.trim() ? mapped.email.trim().toLowerCase() : null;
  if (email && !/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
    return { ok: false, error: { reason: 'invalid email format', fields: ['email'] } };
  }

  const dob = mapped.dateOfBirth ? parseDate(mapped.dateOfBirth) : null;
  if (mapped.dateOfBirth && !dob) {
    return { ok: false, error: { reason: 'unparseable date_of_birth', fields: ['dateOfBirth'] } };
  }

  let membership = (mapped.membershipType ?? 'walk_in').toLowerCase().trim().replace(/\s+/g, '_');
  if (!MEMBERSHIP_VALUES.has(membership)) membership = 'walk_in';

  const preferredLang = (mapped.preferredLang ?? 'en').toLowerCase().trim().slice(0, 10);
  const notes = mapped.notes?.trim() || null;

  const parsed: ParsedCustomer = {
    phoneE164: phone!,
    fullName,
    email,
    dateOfBirth: dob,
    membershipType: membership,
    preferredLang,
    notes,
    rowHash: '',
  };
  parsed.rowHash = rowHash({
    phoneE164: parsed.phoneE164,
    fullName: parsed.fullName,
    email: parsed.email,
    dateOfBirth: parsed.dateOfBirth?.toISOString() ?? null,
    membershipType: parsed.membershipType,
    preferredLang: parsed.preferredLang,
    notes: parsed.notes,
  });
  return { ok: true, data: parsed };
}
