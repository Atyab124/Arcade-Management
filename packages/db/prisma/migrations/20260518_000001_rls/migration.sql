-- Enable Row-Level Security on every tenant-scoped table.
--
-- Pattern: each policy permits rows where tenant_id = current_setting('app.tenant_id')::uuid.
-- The application MUST `SET LOCAL app.tenant_id = '<uuid>'` at the start of every request.
-- Background jobs that need cross-tenant access connect with a role that has BYPASSRLS — those
-- jobs are responsible for their own scoping.
--
-- We use FORCE ROW LEVEL SECURITY so that the table OWNER is also subject to the policy.
-- The migration role itself runs before policies are applied; subsequent app connections use
-- a non-owner role.

-- Single helper function so policy bodies remain DRY and the GUC fetch is cached per query
-- (initPlan optimization — Supabase reports 100x+ improvement vs. inline current_setting calls).
CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
  -- All tables with a tenant_id column
  tables text[] := ARRAY[
    'users',
    'refresh_tokens',
    'audit_log',
    'customers',
    'consent_events',
    'sync_runs',
    'sync_log',
    'customer_sync_errors',
    'till_sessions',
    'transactions',
    'transaction_lines',
    'cards',
    'card_bucket_ledger',
    'resources',
    'availability_events',
    'party_packages',
    'package_variations',
    'package_addons',
    'bookings',
    'booking_lines',
    'invoices',
    'payments',
    'waitlist_entries',
    'loyalty_programs',
    'loyalty_tiers',
    'points_ledger',
    'rewards',
    'redemptions',
    'machines',
    'machine_revenue_events',
    'service_requests',
    'maintenance_tasks',
    'wa_templates',
    'wa_messages',
    'wa_campaigns',
    'shifts',
    'clock_events'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format($p$
      DROP POLICY IF EXISTS tenant_isolation ON %I;
      CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app_current_tenant_id())
        WITH CHECK (tenant_id = app_current_tenant_id());
    $p$, t, t);
  END LOOP;
END $$;

-- Audit log: deny UPDATE/DELETE so it remains append-only.
-- (We rely on policy filter for SELECT/INSERT and revoke modify privileges below.)
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;

-- Consent events: same — immutable for PDPA compliance.
REVOKE UPDATE, DELETE ON consent_events FROM PUBLIC;

-- Points ledger: append-only ledger pattern (Square Books, Capillary, Salesforce Loyalty DMO).
REVOKE UPDATE, DELETE ON points_ledger FROM PUBLIC;
