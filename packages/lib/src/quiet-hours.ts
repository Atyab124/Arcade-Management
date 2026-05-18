import { DateTime } from 'luxon';

/**
 * Marketing-category messages must not be sent during the customer's local night hours.
 * Spec: 22:00–08:00 local. We accept the customer's tenant timezone since the per-customer
 * timezone is typically unknown for a regional arcade.
 */
export function isInQuietHours(
  at: Date,
  timezone: string,
  startHour = 22,
  endHour = 8,
): boolean {
  const dt = DateTime.fromJSDate(at, { zone: timezone });
  const hour = dt.hour;
  if (startHour < endHour) {
    return hour >= startHour && hour < endHour;
  }
  // Wraps midnight (e.g. 22 → 8): true if hour >= start OR hour < end
  return hour >= startHour || hour < endHour;
}
