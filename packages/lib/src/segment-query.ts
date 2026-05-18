import type { SegmentFilter } from '@arcade/types';

/**
 * Translates a SegmentFilter into a parameterized SQL WHERE clause for the `customers` table.
 * The caller is responsible for joining on `consent_events` if needed.
 *
 * We build with `$N` placeholders so this works directly with `pg` or Prisma's `$queryRaw`.
 */
export function buildSegmentWhere(
  filter: SegmentFilter,
  tenantId: string,
  paramOffset = 0,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [tenantId];
  let n = paramOffset + 1;
  const clauses: string[] = [`c.tenant_id = $${n++}`];
  // tenantId already pushed; keep n in sync
  // (we already pushed once, so n is now 2 — correct)

  clauses.push(`c.deleted_at IS NULL`);

  if (filter.whatsappOptIn !== undefined) {
    // We compute opt-in from the latest consent_event for this channel.
    // Subquery returns the latest action per customer.
    params.push(filter.whatsappOptIn ? 'opt_in' : 'opt_out');
    clauses.push(`(
      SELECT action FROM consent_events ce
      WHERE ce.tenant_id = c.tenant_id
        AND ce.customer_id = c.id
        AND ce.channel = 'whatsapp'
      ORDER BY ce.created_at DESC LIMIT 1
    ) = $${n++}`);
  }

  if (filter.membershipTypes && filter.membershipTypes.length > 0) {
    params.push(filter.membershipTypes);
    clauses.push(`c.membership_type = ANY($${n++}::text[])`);
  }

  if (filter.birthdayWithinDays !== undefined) {
    // DOB is a DATE; we want the next birthday within N days from today.
    // Compute via year-shifted comparison so it works across year boundary.
    params.push(filter.birthdayWithinDays);
    clauses.push(`(
      (DATE_PART('doy', c.date_of_birth) - DATE_PART('doy', CURRENT_DATE) + 365) % 365
      <= $${n++}
    )`);
  }

  if (filter.lastVisitOlderThanDays !== undefined) {
    params.push(filter.lastVisitOlderThanDays);
    clauses.push(`(c.last_visit_date IS NOT NULL AND c.last_visit_date < CURRENT_DATE - ($${n++} || ' days')::interval)`);
  }

  if (filter.lifetimeSpendGte !== undefined) {
    params.push(filter.lifetimeSpendGte);
    clauses.push(`c.lifetime_spend >= $${n++}`);
  }

  if (filter.loyaltyPointsGte !== undefined) {
    params.push(filter.loyaltyPointsGte);
    clauses.push(`c.loyalty_points >= $${n++}`);
  }

  if (filter.createdWithinDays !== undefined) {
    params.push(filter.createdWithinDays);
    clauses.push(`c.created_at >= NOW() - ($${n++} || ' days')::interval`);
  }

  return {
    sql: clauses.join(' AND '),
    params,
  };
}
