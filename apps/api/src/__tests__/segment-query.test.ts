import { describe, it, expect } from 'vitest';
import { buildSegmentWhere } from '@arcade/lib';

const tenant = '00000000-0000-0000-0000-000000000001';

describe('buildSegmentWhere', () => {
  it('always includes tenant + deleted_at filters', () => {
    const { sql, params } = buildSegmentWhere({}, tenant);
    expect(sql).toContain('c.tenant_id =');
    expect(sql).toContain('c.deleted_at IS NULL');
    expect(params[0]).toBe(tenant);
  });

  it('builds opt-in filter via consent_events subquery', () => {
    const { sql, params } = buildSegmentWhere({ whatsappOptIn: true }, tenant);
    expect(sql).toContain('consent_events');
    expect(params).toContain('opt_in');
  });

  it('builds opt-out filter', () => {
    const { params } = buildSegmentWhere({ whatsappOptIn: false }, tenant);
    expect(params).toContain('opt_out');
  });

  it('builds membership type filter with ANY array', () => {
    const { sql, params } = buildSegmentWhere({ membershipTypes: ['vip', 'premium'] }, tenant);
    expect(sql).toContain('ANY(');
    expect(params).toContainEqual(['vip', 'premium']);
  });

  it('builds birthday window filter using doy arithmetic', () => {
    const { sql } = buildSegmentWhere({ birthdayWithinDays: 7 }, tenant);
    expect(sql).toContain("DATE_PART('doy'");
  });

  it('builds lapsed-customer filter', () => {
    const { sql, params } = buildSegmentWhere({ lastVisitOlderThanDays: 60 }, tenant);
    expect(sql).toContain('last_visit_date');
    expect(params).toContain(60);
  });

  it('combines multiple filters with AND', () => {
    const { sql } = buildSegmentWhere({
      whatsappOptIn: true,
      membershipTypes: ['premium'],
      birthdayWithinDays: 7,
    }, tenant);
    expect((sql.match(/AND/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('produces distinct parameter placeholders for each filter', () => {
    const { sql } = buildSegmentWhere({
      whatsappOptIn: true,
      membershipTypes: ['premium'],
      lifetimeSpendGte: 1000,
    }, tenant);
    // $1, $2, $3, $4 should all appear distinctly
    expect(sql).toMatch(/\$1/);
    expect(sql).toMatch(/\$2/);
    expect(sql).toMatch(/\$3/);
    expect(sql).toMatch(/\$4/);
  });
});
