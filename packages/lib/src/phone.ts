import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Normalize a phone number to E.164. Returns null if invalid.
 * Default country is Malaysia (MY) since iFun City is Malaysia-based.
 */
export function normalizePhone(input: string | null | undefined, defaultCountry: CountryCode = 'MY'): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function isE164(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(value);
}
