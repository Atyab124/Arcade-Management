import { randomBytes } from 'node:crypto';

/**
 * Generate a URL-safe random token for machine QR codes.
 * 16 bytes → 22 char base64url string. Collision risk is negligible at our scale.
 */
export function generateQrToken(bytes = 16): string {
  return randomBytes(bytes).toString('base64url');
}
