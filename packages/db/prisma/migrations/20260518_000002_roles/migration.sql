-- Role split for proper RLS enforcement.
--
-- Background: `FORCE ROW LEVEL SECURITY` applies policies even to the table owner. However,
-- a role with `BYPASSRLS` attribute (typically the superuser or an explicit admin role) will
-- still bypass the policy. We deliberately split the two so:
--   * `arcade_app` — used by the API server. NO bypass. RLS enforces tenant isolation.
--   * Migration / admin role — runs `prisma migrate` and the background workers that need
--     cross-tenant access (sync worker for all tenants, scheduler jobs).
--
-- Operators: set the API's DATABASE_URL to authenticate as `arcade_app`. Background workers
-- continue using the admin role.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arcade_app') THEN
    CREATE ROLE arcade_app LOGIN PASSWORD 'arcade_app';
  END IF;
END $$;

-- The migration role currently owns all tables; grant DML to arcade_app.
GRANT USAGE ON SCHEMA public TO arcade_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arcade_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO arcade_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO arcade_app;

-- New objects created later should also auto-grant.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arcade_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO arcade_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO arcade_app;

-- arcade_app must NOT have BYPASSRLS. Explicitly remove it (no-op if it never had it).
ALTER ROLE arcade_app NOBYPASSRLS;

-- Tables marked append-only (audit_log, consent_events, points_ledger) deny UPDATE/DELETE
-- to arcade_app even at the privilege layer.
REVOKE UPDATE, DELETE ON audit_log FROM arcade_app;
REVOKE UPDATE, DELETE ON consent_events FROM arcade_app;
REVOKE UPDATE, DELETE ON points_ledger FROM arcade_app;
