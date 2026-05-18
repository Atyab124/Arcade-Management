import { createHash } from 'node:crypto';

/**
 * Stable SHA-256 hash of a record's fields. Used by the Sheets sync worker to detect
 * row-level changes without doing a full column-by-column diff in SQL.
 *
 * Keys are sorted to ensure stability regardless of property order.
 */
export function rowHash(record: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}
