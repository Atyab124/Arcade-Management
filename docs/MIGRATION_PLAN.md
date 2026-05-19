# Arcade-Management — Production Migration Plan

**Version:** 1.1 — Decisions locked in
**Date:** 2026-05-19
**Status:** Approved scope; ready to execute

---

## 0. Decisions log (resolves §8 open questions)

| # | Decision | Plan impact |
|---|---|---|
| Q1 | **Single-tenant only** at launch | Drop `user_tenants` table (C2). Token Hook reads `tenant_id` from `app_metadata` directly. No tenant-picker UI (skip C4, C8d). Workstream C reduces from 7–10 → **5–7 dev-days**. |
| Q2 | **Supabase Pro ($25/mo) for prod**, free for dev | Plan unchanged. PITR + daily backups + custom SMTP all available. |
| Q3 | **Default domains** (`arcade-api.fly.dev`, `*.vercel.app`) | Drop PF8 (DNS). Meta accepts `.fly.dev` webhook URLs. |
| Q4 | **Build receipt PDFs + CSV exports per PRD** | New **Workstream G** added below. Native ESC/POS chosen. |
| Q5 | **Hard-delete Trengo** pre-launch | A12 stays as-is. No feature flag. |
| Q6 | **Singapore-only** | No multi-region work. Defer until ~$1k MRR. |
| Q7 | **Build correct scaling pattern from day 1** | Replace `setInterval` with **BullMQ repeatable jobs**. Add `tenantId` to every job payload. +0.5 day to Workstream D. Removes "scheduler must be single-instance" constraint. |
| Q8 | **12-month audit retention + nightly partition-drop** | Added as **F6** in Workstream F. |

**Revised total effort: ~20–27 dev-days** (was 18–25; net +2 from Workstream G, –2 from Workstream C simplification, +0.5 from scheduler rework).

---

## 1. Executive summary

- Move from self-hosted Postgres/Redis with custom JWT to **Supabase Postgres + Supabase Auth + Upstash Redis + Fly.io (api/workers) + Vercel (web)**, keeping the existing Prisma schema and Express/BullMQ architecture.
- Drop Trengo; ship a **Meta WhatsApp Cloud API** client behind the existing `@arcade/whatsapp` package interface so callers (`apps/api/src/services/whatsapp.ts`, `apps/scheduler/src/jobs/whatsapp-worker.ts`, `apps/api/src/routes/webhooks.ts`) change minimally.
- Re-key RLS from `current_setting('app.tenant_id')::uuid` to `(auth.jwt() ->> 'tenant_id')::uuid` and replace `withTenant(...)` connection-GUC plumbing with **stateless JWT-based tenant scoping**. Workers continue to use a `service_role` connection (BYPASSRLS) with explicit tenant filters.
- Pre-launch (zero production users), so no user-data backfill; auth swap is breaking but acceptable. The hardest piece is the **Custom Access Token Hook** that injects `tenant_id` + `role` into JWTs by reading a new `user_tenants` table.
- Total estimated effort: **~20–27 dev-days** for a single experienced engineer, dominated by the auth swap (Workstream C: 5–7 days), deployment plumbing (Workstream D: 5.5–7.5 days), and receipt printing + exports (Workstream G: 3–4 days).

---

## 2. Target architecture

```
                                    ┌──────────────────────────┐
                                    │ Vercel (apps/web)        │
                                    │  React + Vite SPA        │
                                    │  @supabase/supabase-js   │
                                    └──────────┬───────────────┘
                                               │ HTTPS
                                  (rewrites /api/* → fly api URL)
                                               │
                                               ▼
              ┌────────────────────────────────────────────────────────────┐
              │ Fly.io  (region SIN)                                       │
              │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
              │  │ apps/api     │  │ apps/        │  │ apps/sync-   │      │
              │  │ Express      │  │ scheduler    │  │ worker       │      │
              │  │ /healthz /readyz │ BullMQ      │  │ Sheets cron  │      │
              │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
              └─────────┼─────────────────┼─────────────────┼──────────────┘
                        │                 │                 │
                  Verify JWT (JWKS)  service_role DB   service_role DB
                        │                 │                 │
            ┌───────────┴────┐    ┌───────┴─────────┐  ┌────┴──────────┐
            │ Supabase Auth  │    │ Upstash Redis   │  │ Supabase      │
            │ - magic link   │    │ (BullMQ)        │  │ Postgres      │
            │ - JWT (RS256)  │    │ TLS / TCP       │  │ +Storage      │
            │ - Access Token │    │                 │  │ +Edge fn      │
            │   Hook (PG fn) │    └─────────────────┘  │ (token hook)  │
            └────────┬───────┘                          └────┬──────────┘
                     │ reads user_tenants on token mint       │
                     └───────────────────────────────────────►┘
                                                              │
                  ┌───────────────────────────────────────────┘
                  ▼
       ┌──────────────────────┐
       │ Meta WhatsApp Cloud  │
       │ Graph API (Direct)   │
       │  +/webhooks/whatsapp │
       └──────────────────────┘

Observability: Sentry (web + api + workers), structured Pino JSON to Fly logs → Logtail/BetterStack
CI/CD: GitHub Actions → flyctl deploy (api, scheduler, sync-worker) + Vercel auto-deploy on push
```

Key shape changes from today:
- `withTenant()` (`packages/db/src/tenant-context.ts:13`) — kept only for migrations & worker compatibility; the API stops using it in favor of stateless RLS via `auth.jwt()`.
- `getServicePrisma()` (`packages/db/src/client.ts:30`) — points at the Supabase pooler **direct** connection with the service_role DB user.
- `getPrisma()` — points at Supavisor transaction-mode pooler with the `authenticated` role.

---

## 3. Workstream detail

### Workstream A — WhatsApp swap (Trengo → Meta Cloud API)

**Goal:** Replace Trengo client with direct Graph API integration. Preserve the public API surface of `@arcade/whatsapp` so callers don't need refactors.

**Effort:** 3–4 dev-days.

**Tasks**

- **A1. Spec the new client interface (kept compatible).** Update `packages/whatsapp/src/index.ts:1` to re-export a new module `meta-client` instead of `trengo-client`. Keep the type names `TrengoSendInput`/`TrengoSendResult`/`TrengoClient` either renamed (`MetaSendInput`, etc.) with deprecated type aliases, or just rename in one pass since callers are pre-launch.
- **A2. New file `packages/whatsapp/src/meta-client.ts`.** Implements:
  - `class MetaWhatsAppClient implements WhatsAppClient` with constructor `(phoneNumberId, accessToken, fetcher?)`.
  - `send(input)` → `POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages` with body shaped as `{ messaging_product: 'whatsapp', to, type: 'template', template: { name, language: { code }, components: [...] } }`.
  - `sendText(input)` for free-form messages inside the 24h window — body `{ type: 'text', text: { body } }`.
  - `uploadMedia(buffer, mime)` → `POST /{phoneNumberId}/media` returning a media id (for future receipt PDFs or QR images).
  - Throws `MetaApiError(code, subcode, message, traceId)` with mapping for the common error codes (131026 24h-window expired, 131047 message-undeliverable, 132000 template-paused, 80007 rate-limit).
  - Result type: `{ messageId: string, raw: unknown }` — Meta returns `messages[0].id` (the `wamid`).
- **A3. New file `packages/whatsapp/src/meta-template.ts`.** Maps our internal template format (stored in `wa_templates` — see `packages/db/prisma/schema.prisma:686`) to Meta's `components` payload:
  - Internal stores `body` text and a `variables` JSONB array. Meta wants positional params in `components[].parameters`. Implement `toMetaComponents(template, variables)` returning the array. Header/button params handled as the schema's `variables` entries gain a `slot: 'header' | 'body' | 'button'` field (additive only — see migration in F1).
  - Keep `renderTemplate()` (`packages/whatsapp/src/template-render.ts:11`) untouched; it remains an audit/preview helper.
- **A4. New file `packages/whatsapp/src/meta-webhook.ts`.** Exports:
  - `verifyWebhookSignature(rawBody: Buffer, header: string, appSecret: string): boolean` — computes `'sha256=' + HMAC_SHA256(appSecret, rawBody)`, timing-safe compare against `x-hub-signature-256`.
  - `verifyVerificationChallenge(query, verifyToken)` — handles Meta's GET `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...` setup ping.
  - `parseInboundEvent(payload)` returns a tagged union of `{ type: 'message', wamid, from, text? | interactive? | image?, timestamp }` / `{ type: 'status', wamid, status: 'sent'|'delivered'|'read'|'failed', recipient, timestamp, errors? }` so callers don't grovel through `entry[0].changes[0].value`.
- **A5. Rewrite `apps/api/src/routes/webhooks.ts`.** Currently keyed to Trengo (lines 23–76):
  - Add route `GET /webhooks/whatsapp` returning `req.query['hub.challenge']` after `verifyVerificationChallenge`.
  - Replace `POST /trengo` handler body with `POST /whatsapp` that captures raw body (needs `express.json({ verify: (req, res, buf) => req.rawBody = buf })` registered in `apps/api/src/app.ts:23`), calls `verifyWebhookSignature`, dedupes via `wa_webhook_events.externalId` exactly as today, and dispatches `parseInboundEvent` results to `processWhatsAppEvent()` (refactor the existing `processTrengoEvent` function name).
  - Keep the **status-rank tolerance** logic from `webhooks.ts:104–115` verbatim — it's still needed (Meta delivers at-least-once and out-of-order, see `docs/PLAN.md:30`).
  - Keep the inbound-message STOP-keyword detection from `webhooks.ts:119–149` verbatim — `@arcade/lib`'s `detectConsentKeyword` already does the right thing.
- **A6. Update `apps/scheduler/src/jobs/whatsapp-worker.ts`.** Replace the `HttpTrengoClient` / `FakeTrengoClient` factory (`whatsapp-worker.ts:17–31`) with `MetaWhatsAppClient` / `FakeWhatsAppClient`. The `client.send()` call site (`whatsapp-worker.ts:84–88`) needs minor reshape because Meta wants `components` not `params`:
  - Build `components` via `toMetaComponents(template, data.variables)`.
  - Call `client.sendTemplate({ to: phoneE164.replace(/^\+/,''), name: template.name, language: template.language, components })` — Meta wants no `+` and a templates-by-name lookup (the `wa_templates.trengoHsmId` column becomes vestigial — repurpose or drop in F2).
  - Preserve the marketing opt-in check (`whatsapp-worker.ts:64–72`), quiet-hours check (`whatsapp-worker.ts:73–80`), and the `wa_messages` insert (`whatsapp-worker.ts:90–101`) — they remain valid.
- **A7. Database additive migration `packages/db/prisma/migrations/20260520_000001_wa_meta/migration.sql`.**
  - `ALTER TABLE wa_templates ADD COLUMN meta_template_name TEXT, ADD COLUMN meta_language_code TEXT NOT NULL DEFAULT 'en'`. (`trengo_hsm_id` stays nullable, deprecated, removed in F2 post-cutover.)
  - `ALTER TABLE wa_messages ADD COLUMN meta_wamid TEXT GENERATED ALWAYS AS (external_id) STORED` — purely a name alias for ops queries; or just rename via comment. Optional.
  - No data backfill required since templates are placeholder seeds (`packages/db/src/seed.ts:150–205`).
- **A8. Update Prisma schema.** Add the two new columns to `WaTemplate` in `packages/db/prisma/schema.prisma:686–705`. Re-run `prisma generate`. Update `packages/types/src/whatsapp.ts` template registration zod schema to accept `metaTemplateName` and `metaLanguageCode`; deprecate `trengoHsmId`.
- **A9. Update `apps/api/src/routes/whatsapp.ts:17–35`** (`POST /templates`) to write the new columns instead of `trengoHsmId`. Update `packages/db/src/seed.ts:150–205` to populate `metaTemplateName` with the same placeholder names.
- **A10. Update tests in `packages/whatsapp/src/__tests__/`.** Keep `conversation-window.test.ts` and `template-render.test.ts` (still relevant). Add:
  - `meta-template.test.ts` — verifies `toMetaComponents` builds the right `components` shape for header/body/button params.
  - `meta-webhook.test.ts` — signature verification (known-good HMAC fixture from Meta docs), challenge verification, parse-inbound/status events with sample payloads from Meta's docs.
- **A11. Update `apps/api/src/config.ts:1–18`.** Remove `TRENGO_BASE_URL`, `TRENGO_TOKEN`, `TRENGO_WEBHOOK_SECRET`. Add `WHATSAPP_PHONE_NUMBER_ID` (required in prod), `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_GRAPH_BASE_URL` (default `https://graph.facebook.com/v20.0`). Keep them optional with a `FakeWhatsAppClient` fallback when unset so local dev still works (mirror current Trengo behavior at `whatsapp-worker.ts:20–28`).
- **A12. Delete `packages/whatsapp/src/trengo-client.ts`.** Pre-launch, no feature flag needed. Update `packages/whatsapp/src/index.ts:1–3` accordingly. The webhook receiver's old `/trengo` route is removed in A5.
- **A13. Update `apps/api/src/app.ts:23`** to enable raw body capture so signature verification works: replace `express.json({ limit: '1mb' })` with `express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as any).rawBody = buf; } })`. Document that downstream JSON parsing still works because Express assigns `req.body` after `verify`.

**Risks**
- Meta requires templates submitted via Business Manager and approved before send. Existing seed names are placeholders — must be re-created and approved in Meta dashboard (pre-flight item 4).
- 24h window enforcement is now stricter (`131026` errors) — verify worker catches `MetaApiError` and writes `wa_messages.errorCode` for ops visibility.
- Webhook signature verification requires raw body before `express.json` parses — A13 covers it but easy to break with future middleware reorder.

**What could break**
- Any code path that still imports from `@arcade/whatsapp` expecting `HttpTrengoClient`. Grep before final cut: `grep -rn "Trengo\|trengo" apps packages --include="*.ts"`.
- `wa_templates.trengoHsmId` is `NOT NULL` in schema — set it nullable in A7 to avoid breaking seed during transition.

**Rollback**
- Until A12 ships, `trengo-client.ts` is intact. If Meta integration breaks in prod, revert PR; environment still has Trengo creds.

**Acceptance criteria**
- `pnpm --filter @arcade/whatsapp test` passes including the new meta-* tests.
- Curling `/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$TOKEN&hub.challenge=abc` returns `abc`.
- A test send via the worker (`pnpm --filter @arcade/scheduler dev` + manually enqueueing a job) successfully calls the Graph API sandbox and persists a `wa_messages` row with status `sent` and a real `wamid` in `external_id`.
- Inbound `STOP` reply from a real phone updates `consent_events` and the customer's latest consent action is `opt_out`.

---

### Workstream B — Supabase project + DB migration

**Goal:** Move from local/self-managed Postgres to Supabase Postgres without changing the Prisma schema. Set up Storage. Pin connection strategy.

**Effort:** 2 dev-days (mostly waiting on provisioning + DNS).

**Tasks**

- **B1. Create Supabase project (manual, pre-flight).** Region `ap-southeast-1` (Singapore). Generate strong DB password; store in 1Password and Fly secrets. Enable **PITR (Point-in-Time Recovery)** on Pro plan — note free tier doesn't have it.
- **B2. Capture connection strings.** Three flavors:
  - **Transaction pooler (Supavisor, port 6543)** — for the API runtime. Safe with serverless/short-lived requests. URL ends with `?pgbouncer=true&connection_limit=1` per Prisma docs. Set as `DATABASE_URL` on `apps/api`.
  - **Session pooler (port 5432)** — for workers that hold connections (BullMQ uses long-lived pub/sub, plus Prisma's prepared statements break under transaction-mode pooling). Set as `DATABASE_URL` on `apps/sync-worker` and `apps/scheduler`.
  - **Direct connection (port 5432, no pooler hostname)** — for `prisma migrate deploy`. Used only by the Fly release command (D6). Set as `DIRECT_DATABASE_URL`.
- **B3. Update `packages/db/prisma/schema.prisma:10–13`.**
  - Add `directUrl = env("DIRECT_DATABASE_URL")` to the datasource block. Prisma uses this for migrations and introspection while `url` is used by the client (with pooler).
- **B4. Update `apps/api/src/config.ts`** to require both `DATABASE_URL` and (only at deploy time) `DIRECT_DATABASE_URL`; the workers add `DATABASE_URL` (session pooler). Document the three URL types in `.env.example`.
- **B5. Storage buckets.** Via Supabase dashboard or `supabase` CLI migration:
  - `receipts` — **private** (RLS) bucket. Access via signed URLs from the API only. Path convention `tenants/{tenant_id}/receipts/{transaction_id}.pdf`.
  - `exports` — **private**. Path `tenants/{tenant_id}/exports/{export_id}.csv`. TTL of signed URL: 1 hour.
  - **Storage RLS policy:** `(storage.foldername(name))[2] = (auth.jwt() ->> 'tenant_id')` to enforce per-tenant isolation when the client downloads via supabase-js. For server-side downloads we'll use the service_role key and not rely on RLS.
- **B6. New file `packages/lib/src/storage.ts`** — thin wrapper around `@supabase/supabase-js` storage with `uploadReceipt`, `uploadExport`, `signedUrl` helpers. Lives in `@arcade/lib` so api and workers share it. Constructor takes `(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`.
- **B7. Seed strategy on Supabase.** First boot:
  1. Apply migrations via `DIRECT_DATABASE_URL`.
  2. Run `pnpm --filter @arcade/db seed` once against Supabase (manual local run, not from Fly release). The current seed (`packages/db/src/seed.ts`) is idempotent (uses `upsert`) so it's safe.
  3. After auth migration (Workstream C), the seed's password-based user creation is replaced by Supabase Auth API calls — see C7.
- **B8. Backups.** Pro plan automatic daily backups + 7-day PITR. Document restore drill in `docs/RUNBOOK.md` (Workstream E2).
- **B9. Local dev recommendation.** **Keep local Docker Postgres for dev** (current `infra/docker-compose.yml`). Reasoning:
  - Supabase local CLI works but adds 1.2GB of containers (postgres+auth+kong+storage+studio); slow on laptops.
  - Faster iteration on schema changes — `prisma migrate dev` round-trip is seconds.
  - For Supabase Auth specifically, devs can either run Supabase local CLI when testing auth flows, or use a shared dev Supabase project (recommended).
  - Decision recorded in `docs/DEPLOY.md` and `README.md`.
- **B10. Database role strategy.** Supabase ships with these built-in roles:
  - `authenticated` — used by API requests carrying a JWT. **No BYPASSRLS.** Our `arcade_app` role from migration `20260518_000002_roles` is conceptually replaced by `authenticated`.
  - `service_role` — used by workers. **Has BYPASSRLS.** Replaces our service role.
  - The migration `20260518_000002_roles` (`packages/db/prisma/migrations/20260518_000002_roles/migration.sql`) becomes a no-op on Supabase — wrap its statements in `IF NOT EXISTS` / guard with `DO $$ ... $$` to make it idempotent; or skip it on Supabase via a `-- supabase: skip` marker and gate in the deploy script. Simplest: rewrite the migration to grant our existing append-only restrictions (REVOKE UPDATE/DELETE on `audit_log`, `consent_events`, `points_ledger`) to `authenticated` instead of `arcade_app`.

**Risks**
- Prisma + Supavisor in transaction mode requires `pgbouncer=true&connection_limit=1`. Forgetting this causes random "prepared statement does not exist" errors under load.
- BullMQ + ioredis require a Redis with `maxRetriesPerRequest: null` (already set at `apps/api/src/queues.ts:11`). Upstash supports this; ensure TLS URL (`rediss://`).
- Supabase free tier pauses projects after 7 days of inactivity — for dev shared project, schedule a keep-alive ping or upgrade to Pro for dev too.

**What could break**
- Migration `20260518_000002_roles/migration.sql` will fail on Supabase because it tries to `CREATE ROLE arcade_app` which doesn't exist there. Fix in B10.
- Decimal precision: Supabase Postgres is vanilla PG16, so no change. Verify `@db.Decimal(12, 2)` everywhere still works.

**Rollback**
- Keep self-hosted Postgres backup; flipping `DATABASE_URL` reverts. Schema-compatible.

**Acceptance criteria**
- `prisma migrate deploy` against Supabase succeeds end-to-end with zero schema diff.
- API readyz endpoint (D3) returns `{db:'ok'}` when pointed at Supabase.
- Manual upload of a 1KB blob to `receipts` via `@arcade/lib/storage` succeeds, signed URL retrieves it, public URL (no signature) returns 403.

---

### Workstream C — Auth migration (custom JWT → Supabase Auth)

**Highest-risk workstream.** Detailed plan follows.

**Goal:** Replace bcrypt+JWT in `apps/api/src/routes/auth.ts` and `apps/api/src/middleware/auth.ts` with Supabase Auth (email magic links, RS256 JWT verified via JWKS). Re-key RLS from GUC to JWT claims. Multi-tenant users handled via a new `user_tenants` table + Custom Access Token Hook.

**Effort:** 7–10 dev-days. (This is the most invasive change in the codebase.)

#### C0. Inventory of current auth surface

Touchpoints to migrate (already verified):

| File | Lines | Concern |
|---|---|---|
| `apps/api/src/routes/auth.ts` | full | Replaced — login/refresh/logout become Supabase-driven |
| `apps/api/src/middleware/auth.ts` | 16–34 | Rewrite to verify Supabase JWT via JWKS |
| `apps/api/src/middleware/auth.ts` | 36–42 | `requireRole` keeps working as long as `req.auth.role` populated |
| `apps/api/src/middleware/tenant-context.ts` | 18–35 | Stays but `withTenant` becomes a no-op on Supabase (RLS now reads JWT) |
| `apps/api/src/middleware/audit.ts` | 23–24 | Reads `req.auth.tenantId` + `req.auth.userId` — compatible |
| `apps/api/src/routes/bookings.ts` | 10 usages of `req.auth` | Compatible if middleware preserves shape |
| `apps/api/src/routes/pos.ts` | 8 usages | Compatible |
| `apps/api/src/routes/whatsapp.ts` | 6 usages | Compatible |
| `apps/api/src/routes/machines.ts` | 6 usages | Compatible |
| `apps/api/src/routes/customers.ts` | 6 usages | Compatible |
| `apps/api/src/routes/loyalty.ts` | 6 usages | Compatible |
| `apps/web/src/auth.tsx` | full | Rewrite to use `@supabase/supabase-js` |
| `apps/web/src/pages/LoginPage.tsx` | full | Rewrite to OTP / magic link UI |
| `packages/db/prisma/schema.prisma:31–65` | `User` + `RefreshToken` models | `RefreshToken` deleted; `User.passwordHash` deleted; `User` slimmed to a profile table keyed by Supabase `auth.users.id` |
| `packages/db/src/seed.ts:25–61` | bcrypt-based user upsert | Rewrite to call Supabase Admin API |
| `packages/db/prisma/migrations/20260518_000001_rls/migration.sql:12–72` | RLS policy bodies | Re-keyed in new migration to use `auth.jwt()` |
| `packages/types/src/auth.ts:4–13, 24–34` | `LoginSchema`, `RefreshSchema`, `AccessTokenPayload` | `Login/Refresh` deleted; `AuthContext` retained but populated from JWT claims |
| `apps/api/src/config.ts:9–12` | `JWT_*` secrets | Replaced by `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_AUDIENCE` |

#### C1. Supabase Auth configuration (manual)

- Enable **Email** provider in Supabase Auth settings. Disable other providers.
- Configure SMTP:
  - **Dev:** use Supabase built-in (rate-limited to 4 emails/hour but adequate).
  - **Prod:** wire a transactional provider (Resend or Postmark). Add SMTP settings in Supabase dashboard.
- **Redirect URLs:** add `https://app.ifuncity.com/auth/callback`, `https://*.vercel.app/auth/callback` (preview deploys), `http://localhost:5173/auth/callback` (dev).
- **JWT settings:** keep RS256 (default). Note the **JWKS endpoint** URL `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` for API verification.
- **Site URL:** `https://app.ifuncity.com`.
- **Magic link template:** customize subject and body to brand iFun City / arcade-management.
- **Token lifetimes:** keep defaults (access 1h, refresh 60d) — adequate for SMB SaaS.

#### C2. Database: slim `users`, no `user_tenants` (single-tenant decision)

Create new Prisma migration `packages/db/prisma/migrations/20260520_000002_supabase_auth/migration.sql`:

- `ALTER TABLE users DROP COLUMN password_hash` (Supabase owns credentials).
- Add `users.supabase_user_id UUID UNIQUE` so we can link our profile rows to `auth.users.id`.
- Decision: set `users.id := supabase_user_id` for new users so the existing `req.auth.userId` references continue to map cleanly. Document in the migration comment.
- `DROP TABLE refresh_tokens` — Supabase manages refresh on the client.
- Backfill: zero rows in prod (pre-launch). For the seed tenant, the new seed will recreate users via the Admin API (see C7).

**No `user_tenants` table** (Q1 decision). `tenant_id` + `app_role` live in `auth.users.app_metadata` and get pulled into the JWT by the Token Hook directly — no extra DB lookup, simpler hook function, no tenant-picker UI to maintain. If/when we onboard a second tenant, we add the `user_tenants` table then; the Token Hook function body changes but the JWT claim names stay stable.

Prisma schema changes in `packages/db/prisma/schema.prisma:31–65`:
- Remove `passwordHash` from `User`.
- Remove `RefreshToken` model entirely.

#### C3. Custom Access Token Hook (simplified — single tenant)

This is the keystone piece. Supabase supports a Postgres function hook that mutates the JWT claims when a token is issued.

Create migration `packages/db/prisma/migrations/20260520_000003_auth_hook/migration.sql`:

```sql
-- Reads tenant_id + app_role from auth.users.app_metadata and copies them to JWT claims.
-- No DB lookup beyond auth.users itself. When we add multi-tenancy, this function gets
-- swapped for one that reads from a user_tenants table.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims jsonb := event -> 'claims';
  app_meta jsonb := event -> 'user_metadata';
  tid text := app_meta ->> 'tenant_id';
  role text := app_meta ->> 'app_role';
BEGIN
  IF tid IS NOT NULL THEN
    claims := claims || jsonb_build_object('tenant_id', tid);
  END IF;
  IF role IS NOT NULL THEN
    claims := claims || jsonb_build_object('app_role', role);
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;
```

Then via Supabase dashboard → Authentication → Hooks → **Custom Access Token** hook: select `public.custom_access_token_hook`. (As of late 2025 this is a one-click setting; if dashboard not available, set via SQL `ALTER SYSTEM` workaround documented in Supabase community.)

Note on claim names: we use `tenant_id` and `app_role` (not `role`) — Supabase reserves the top-level `role` claim for the Postgres role (`authenticated`/`anon`). Overwriting `role` breaks RLS entirely.

#### C4. ~~Switching active tenant~~ (skipped per Q1)

Deferred until we onboard tenant #2. When that happens, add the `user_tenants` table, update the Token Hook function body, and add the picker UI. No code shipped today.

#### C5. RLS policy rekey

New migration `packages/db/prisma/migrations/20260520_000004_rls_jwt/migration.sql`:

```sql
-- Replace tenant_isolation policies on every domain table to read from auth.jwt().
-- Note: we replace the helper function, not each policy body — fewer LOC to maintain.

CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF((auth.jwt() ->> 'tenant_id'), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Helper also for role checks (used by future policies that gate admin-only writes)
CREATE OR REPLACE FUNCTION app_current_role() RETURNS text AS $$
  SELECT auth.jwt() ->> 'app_role';
$$ LANGUAGE sql STABLE;
```

Because the policies in `20260518_000001_rls` already reference `app_current_tenant_id()`, **changing the function body alone re-keys every policy.** This is the elegant payoff of having used a helper function from day one.

Add a small smoke test in `packages/db/src/__tests__/rls.test.ts` (new): connect as the `authenticated` role with a forged JWT (signed by the dev project's JWT secret), `SET request.jwt.claims = '...'`, run a SELECT — expect tenant isolation.

#### C6. API middleware rewrite

- **C6a. `apps/api/src/middleware/auth.ts` (rewrite, ~80 lines).**
  - On boot: fetch JWKS from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, cache with 10-min TTL (use `jose` library: `createRemoteJWKSet`).
  - `requireAuth` extracts `Authorization: Bearer <jwt>`, calls `jwtVerify(token, JWKS, { issuer: '${SUPABASE_URL}/auth/v1', audience: 'authenticated' })`. On success, populate `req.auth = { userId: payload.sub, tenantId: payload.tenant_id, role: payload.app_role, email: payload.email }`.
  - If `tenant_id` claim missing → return 403 with `{ error: 'no_active_tenant', message: 'Select a tenant via POST /auth/active-tenant' }`.
  - `requireRole(...roles)` unchanged from current behavior (`apps/api/src/middleware/auth.ts:36–42`) — keeps backwards compat with all routes.
- **C6b. `apps/api/src/middleware/tenant-context.ts` (simplify).**
  - **New plan: stop using `withTenant`.** Replace `tenantRoute` body so it just runs the handler with the regular `getPrisma()` client; RLS now reads from the JWT directly because the Prisma connection runs as the `authenticated` role with `request.jwt.claims` set by Supavisor. **Crucial implementation detail:** Supavisor sets the `request.jwt.claim.*` GUCs automatically when the connection presents a JWT — but Prisma using the pooler doesn't pass that JWT. So instead we explicitly `SET LOCAL request.jwt.claims = '...'` at the start of each transaction.
  - Net effect: keep `withTenant` shape but inside, instead of `SET LOCAL app.tenant_id`, do `SET LOCAL request.jwt.claims = '<json>'` where the JSON is `{ tenant_id, app_role, sub }`. Then `auth.jwt()` in policies returns this object (Supabase's `auth.jwt()` reads from this GUC). Net code change is one line (`packages/db/src/tenant-context.ts:25`). This preserves the existing `tenantRoute` pattern across all routers — zero changes to `bookings.ts`, `pos.ts`, `customers.ts`, etc.
  - Verify in C5 test that `auth.jwt() ->> 'tenant_id'` matches when set via `request.jwt.claims`.
- **C6c. `apps/api/src/routes/auth.ts` (rewrite, ~120 lines).**
  - `POST /auth/magic-link` body `{ email, redirectTo? }` — calls `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`. Returns `{ sent: true }`. Rate-limit at 5/min/IP.
  - `GET /auth/tenants` — see C4b.
  - `POST /auth/active-tenant` — see C4a.
  - `POST /auth/logout` — calls `supabase.auth.admin.signOut(userId)` (revokes all refresh tokens for that user). Or simply trust client-side `supabase.auth.signOut()` since refresh is stored client-side.
  - **Delete** `/login`, `/refresh`, password-based flow.
- **C6d. New file `apps/api/src/supabase.ts`** — exports `getSupabaseAdmin()` (service_role key, used in auth route only) and `getSupabaseAnon()` (anon key for magic-link send). Singletons.

#### C7. Seed rewrite

Rewrite `packages/db/src/seed.ts:25–61` to:

1. Create or fetch the `tenants` row (unchanged).
2. For each demo user (`admin@ifuncity.test`, etc.), call `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { active_tenant_id: tenant.id } })`. Capture the returned `user.id`.
3. Insert a `users` profile row with `id = user.id`, `tenantId = tenant.id`, etc. (No password hash.)
4. Insert a `user_tenants` row `(supabase_user_id = user.id, tenant_id, role, is_default = true)`.

Local dev: developers will receive magic-link emails to demo emails. To skip emails entirely in dev, use `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email })` — returns the link in the API response (admin-only) and we print it to the console during seed for copy-paste.

#### C8. Frontend rewrite

- **C8a. `apps/web/src/auth.tsx` (rewrite).** Replace the bespoke fetch-based `login()`/`logout()`/token store with `@supabase/supabase-js`:
  - On mount: `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`.
  - Subscribe to `onAuthStateChange` and push session into context.
  - `signInWithMagicLink(email)` → `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/auth/callback' } })`.
  - `signOut()` → `supabase.auth.signOut()`.
  - Replace `(window as any).__apiToken` global (`auth.tsx:99–106`) with `session.access_token` lookup.
- **C8b. Rewrite `apps/web/src/pages/LoginPage.tsx`** — email input + "Send magic link" button + "Check your email" state. Remove password field entirely.
- **C8c. New page `apps/web/src/pages/AuthCallbackPage.tsx`** — handles `/auth/callback` route; reads the hash params and finalizes the session, then redirects to `/`.
- **C8d.** ~~SelectTenantPage~~ — skipped per Q1.
- **C8e. New env var on Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

#### C9. Audit logging hooks

Today, `apps/api/src/middleware/audit.ts` writes `audit_log` rows for mutating routes (`req.auth!.userId`, `req.auth!.tenantId` at `audit.ts:23–24`). After C6b this still works.

Additionally, set up a Supabase **Database Webhook** on `auth.users` insert + delete to write `audit_log` rows for "user_signed_up" and "user_deleted" events with `tenant_id = NULL` (system event), captured by a new route `POST /webhooks/supabase-auth` (signature-verified via `SUPABASE_WEBHOOK_SECRET`). Defer this if not critical — the in-app audit log already covers user-facing mutations.

#### C10. Background compatibility

The workers (`apps/scheduler`, `apps/sync-worker`) talk to DB via `getServicePrisma()` (`packages/db/src/client.ts:30`) using `service_role` (BYPASSRLS). **No change needed** — they continue to filter by `tenantId` explicitly. RLS rekey in C5 is invisible to them.

#### C11. Tests

- New `apps/api/src/__tests__/auth.test.ts` — happy path (verify a mint-time-forged JWT against a stubbed JWKS) + missing tenant claim → 403 + expired token → 401.
- New `apps/api/src/__tests__/rls-isolation.test.ts` — open two parallel `tenantRoute`-wrapped transactions for different tenants, both reading `customers`; expect each only sees its own rows.
- Update `apps/api/src/__tests__/segment-query.test.ts` — currently passes; verify the segmented query still respects the tenant_id parameter after migration (no change expected because that code uses explicit `tenant_id` filter, not RLS).

#### C12. Backwards compatibility & user migration

- **Pre-launch, no production users to migrate.** State explicitly in PR description.
- For internal/dev users currently created by `seed.ts`: re-run `pnpm db:reset && pnpm db:seed` after migration. New magic-link flow active.

**Risks**

- **Token Hook misconfiguration.** If the hook function fails or isn't selected in dashboard, JWTs ship without `tenant_id` and every request returns 403. Mitigation: integration test that mints a token and asserts `tenant_id` claim presence before deploying API.
- **Claim name collision.** Using `role` would silently break RLS (Postgres reads it as `authenticated`/`anon` role). We use `app_role`. Code review checklist item.
- **JWKS caching.** A 10-min TTL means a Supabase key rotation has a 10-min propagation window. Acceptable; document in runbook.
- **Multi-tab refresh race.** `supabase-js` handles this with locks since v2.39; pin minimum version `^2.45.0`.
- **`request.jwt.claims` GUC must be set per transaction.** If a developer accidentally calls `getPrisma()` outside `withTenant`, RLS sees no JWT → returns zero rows (fails closed, good). But if they call `getServicePrisma()` inside an API request, RLS is bypassed — same risk as today. Lint rule: forbid `getServicePrisma` imports in `apps/api/src/routes/**`.

**What could break**

- Every API route (all 7 routers in `apps/api/src/routes/`). They all use `req.auth!.tenantId` which keeps working as long as middleware preserves the shape. Validate by running the existing test suite + a smoke test hitting every router.
- The `apps/web/src/auth.tsx:99–114` `api()` wrapper — token source changes from `localStorage` to `supabase.auth.getSession()`. Refactor as part of C8a.
- `packages/db/src/seed.ts` will fail until rewritten (C7) because `passwordHash` column is dropped.

**Rollback**
- Until cutover PR is merged, the old `auth.ts` and `passwordHash` column exist. Rollback = revert PR + restore from PITR snapshot taken pre-cutover.
- After cutover (no rollback feasible without restoring DB) — but since there are zero prod users, "rollback" is effectively "redeploy old build with a fresh seed."

**Acceptance criteria**

- User can sign in via magic link in <60s on iPhone Safari and reach the dashboard.
- `GET /customers` returns only the user's tenant rows; manually forging a JWT with another tenant's `tenant_id` claim (using the dev project's JWT secret) returns those tenants' rows (RLS positively works on both sides).
- `requireRole('admin')` continues to enforce role correctly; `staff` user is rejected from `POST /whatsapp/templates`.
- A user with 2 `user_tenants` rows can switch active tenant via `POST /auth/active-tenant`, then queries return the other tenant's data after `refreshSession`.
- `audit_log` rows continue to populate on mutations.

---

### Workstream D — Deployment infrastructure

**Goal:** Fly.io for backends, Vercel for web, Upstash for Redis, GitHub Actions for CI/CD, Sentry for errors. All region Singapore where possible.

**Effort:** 5–7 dev-days.

#### D1. Dockerfiles

Three Dockerfiles, all multi-stage, Alpine, non-root, with healthcheck.

- **`apps/api/Dockerfile`** (new):
  - Stage 1 `deps`: `node:20-alpine`, copy `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, all `packages/*/package.json` + `apps/api/package.json`; `corepack enable && pnpm install --frozen-lockfile --filter @arcade/api...`.
  - Stage 2 `build`: copy `deps` node_modules; copy source; `pnpm --filter @arcade/db generate && pnpm --filter @arcade/api build`.
  - Stage 3 `runtime`: `node:20-alpine`, copy `dist` + `node_modules` (prod-only via `pnpm deploy --prod --filter @arcade/api ./out`); `USER node`; `EXPOSE 4000`; `HEALTHCHECK CMD wget -qO- http://localhost:4000/healthz || exit 1`; `CMD ["node", "dist/main.js"]`.
- **`apps/scheduler/Dockerfile`** (new) — same shape, runs `node dist/main.js`, no HTTP port. Healthcheck via Fly TCP check on a sidecar HTTP server (D3b).
- **`apps/sync-worker/Dockerfile`** (new) — same shape.
- **`.dockerignore`** at repo root (new) — exclude `node_modules`, `dist`, `tsconfig.tsbuildinfo`, `.env*`, `apps/web/dist`, `infra/data`, `.git`.

#### D2. Fly configurations

- **`apps/api/fly.toml`** (new):
  - `app = "arcade-api"`, `primary_region = "sin"`.
  - `[build] dockerfile = "Dockerfile"`.
  - `[env] NODE_ENV = "production", LOG_LEVEL = "info", PORT = "4000"`.
  - `[[services]] internal_port = 4000, protocol = "tcp"`; `[[services.ports]] handlers = ["http","tls"], port = 443`.
  - `[[services.http_checks]] path = "/readyz", interval = "30s", grace_period = "20s", method = "GET", timeout = "5s"` and `path = "/healthz"` for liveness.
  - `[deploy] release_command = "pnpm --filter @arcade/db migrate"` — runs `prisma migrate deploy` against `DIRECT_DATABASE_URL` in a one-off VM before the new release boots. Critical: this requires the release command image to include the Prisma CLI and migrations folder (it does — same Dockerfile target).
  - `[scaling] min_machines_running = 1, auto_stop_machines = true` for dev; for prod `min = 1, max = 4`.
- **`apps/scheduler/fly.toml`** (new):
  - After D13 (BullMQ repeatable jobs): **safe to run 2+ instances** — Redis locks dedupe firings. Start with `min=1, max=2` for HA.
  - No HTTP service. Add `[[services]]` with internal port 3001 wired to a tiny HTTP `/healthz` handler (D3b).
  - No release_command (api's already runs migrations).
- **`apps/sync-worker/fly.toml`** (new): Single instance; similar shape; no release_command.

#### D3. Healthchecks

- **D3a. `apps/api/src/app.ts:27–28`** today returns `{ok:true}` for both. Split:
  - `GET /healthz` — liveness, returns `{ ok: true }` only (no deps). **Already correct.**
  - `GET /readyz` — readiness, pings Postgres (`SELECT 1`) and Redis (`PING`). Returns 503 if either fails. New file `apps/api/src/routes/health.ts` containing both handlers, wired in `app.ts` before any other middleware.
- **D3b. Workers** (`apps/scheduler`, `apps/sync-worker`) — add a 30-line Express server in `main.ts` listening on `process.env.PORT ?? 3001` exposing `/healthz` and `/readyz`. The `/readyz` for the scheduler pings Redis (`getRedis().ping()`). For sync-worker, pings Supabase via `getServicePrisma().$queryRaw\`SELECT 1\``.

#### D4. Vercel for `apps/web`

- **`apps/web/vercel.json`** (new):
  ```json
  {
    "buildCommand": "cd ../.. && pnpm --filter @arcade/web build",
    "outputDirectory": "dist",
    "framework": "vite",
    "rewrites": [
      { "source": "/api/:path*", "destination": "https://arcade-api.fly.dev/:path*" }
    ],
    "headers": [
      { "source": "/(.*)", "headers": [{ "key": "X-Frame-Options", "value": "DENY" }] }
    ]
  }
  ```
- **Vercel project settings:** Root directory = `apps/web`; install command = `pnpm install --frozen-lockfile` (run at repo root via the build step above); Node 20.
- **Env vars on Vercel** (Production + Preview): `VITE_API_BASE_URL = https://arcade-api.fly.dev`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

#### D5. Upstash Redis

- **D5a.** Provision Upstash Redis, region `ap-southeast-1` (Singapore). Choose Pay-As-You-Go (no min cost) for dev, Pro for prod.
- **D5b.** Capture `UPSTASH_REDIS_TLS_URL` (starts with `rediss://`). Set as `REDIS_URL` on api + scheduler Fly secrets.
- **D5c.** Verify BullMQ compatibility: Upstash supports `BLPOP`, pub/sub, sorted sets — BullMQ's requirements. Set `maxRetriesPerRequest: null` (already done at `apps/api/src/queues.ts:11` and `apps/scheduler/src/queues.ts:11`).
- **D5d.** Add `tls: { rejectUnauthorized: true }` to the ioredis options in `apps/api/src/queues.ts` and `apps/scheduler/src/queues.ts` when `REDIS_URL` starts with `rediss://` — Upstash requires TLS.

#### D6. Database migration job

- **D6a.** The Fly `release_command` (D2) handles migration. Verify the api's Dockerfile (`apps/api/Dockerfile`) includes:
  - The full `packages/db/prisma/` directory at runtime.
  - The Prisma CLI (`prisma` binary) — install as a regular dependency in `packages/db/package.json` (already there) so it lives in `node_modules/.bin`.
- **D6b.** Set `DIRECT_DATABASE_URL` Fly secret on the api. Migrations run against the direct connection (not the pooler) — pooler in transaction mode breaks Prisma migrations.
- **D6c.** If release_command fails, Fly aborts the deploy automatically. New version doesn't roll out. Same protection for db corruption.

#### D7. Sentry

- **D7a.** Create three Sentry projects: `arcade-api`, `arcade-scheduler`, `arcade-sync-worker`, `arcade-web`. (Free tier covers up to 5k errors/month.)
- **D7b.** Install `@sentry/node` in api/scheduler/sync-worker. New file `apps/api/src/sentry.ts` initializing Sentry in `main.ts:1` before `createApp()`. Capture unhandled rejections + uncaught exceptions. Inject release version from `FLY_RELEASE_VERSION`.
- **D7c.** Install `@sentry/react` in web. Initialize in `apps/web/src/main.tsx`. Tag with user id from supabase session.
- **D7d.** Add Sentry source map upload to GitHub Actions deploy (D9): `sentry-cli sourcemaps inject && sentry-cli sourcemaps upload`.

#### D8. Logging (Pino → Fly logs)

Pino is already wired (`apps/api/src/logger.ts`, `apps/scheduler/src/logger.ts`, `apps/sync-worker/src/logger.ts`). Confirm:

- **D8a.** Each logger uses `pino({ level: process.env.LOG_LEVEL ?? 'info' })` with no pretty-print transport in prod. Pino writes JSON to stdout by default — Fly's log shipper captures this.
- **D8b.** Configure Fly log drain → BetterStack/Logtail (optional, $0 free tier).
- **D8c.** Scrub PII: confirm `redact` config on the Pino loggers excludes `password`, `accessToken`, `refreshToken`, `authorization` headers. Current `apps/api/src/logger.ts` — verify; if not present, add `redact: { paths: ['req.headers.authorization', '*.password', '*.passwordHash'], remove: true }`.

#### D9. GitHub Actions

- **D9a.** New file `.github/workflows/deploy.yml`:
  ```yaml
  name: Deploy
  on:
    push:
      branches: [main]
  concurrency: { group: deploy, cancel-in-progress: false }
  jobs:
    ci:
      uses: ./.github/workflows/ci.yml   # existing
    deploy-fly:
      needs: ci
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: superfly/flyctl-actions/setup-flyctl@master
        - run: flyctl deploy --remote-only --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
          env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
        - run: flyctl deploy --remote-only --config apps/scheduler/fly.toml --dockerfile apps/scheduler/Dockerfile
          env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
        - run: flyctl deploy --remote-only --config apps/sync-worker/fly.toml --dockerfile apps/sync-worker/Dockerfile
          env: { FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }} }
    # Vercel auto-deploys from main via GitHub integration, no GH Action needed.
  ```
- **D9b.** Update `.github/workflows/ci.yml` to also build the docker images (without pushing) as a smoke check.
- **D9c.** Convert ci.yml to a reusable workflow (`workflow_call`) so deploy can call it.

#### D10. Secrets matrix

| Secret | Fly api | Fly scheduler | Fly sync-worker | Vercel | GH Actions |
|---|---|---|---|---|---|
| `DATABASE_URL` (Supavisor txn-mode) | ✓ | | | | |
| `DATABASE_URL` (Supavisor session-mode) | | ✓ | ✓ | | |
| `DIRECT_DATABASE_URL` | ✓ (release_command) | | | | |
| `SUPABASE_URL` | ✓ | ✓ | ✓ | | |
| `SUPABASE_ANON_KEY` | ✓ | | | as `VITE_SUPABASE_ANON_KEY` | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ | | |
| `SUPABASE_JWT_AUDIENCE` (=`authenticated`) | ✓ | | | | |
| `REDIS_URL` (Upstash) | ✓ | ✓ | | | |
| `WHATSAPP_PHONE_NUMBER_ID` | ✓ | ✓ | | | |
| `WHATSAPP_ACCESS_TOKEN` | ✓ | ✓ | | | |
| `WHATSAPP_APP_SECRET` | ✓ (webhook verify) | | | | |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | ✓ | | | | |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | ✓ | ✓ | | | |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | | | ✓ (as JSON string env, not file) | | |
| `SENTRY_DSN` | ✓ | ✓ | ✓ | as `VITE_SENTRY_DSN` | |
| `FLY_API_TOKEN` | | | | | ✓ |
| `VERCEL_TOKEN` (only if doing manual deploys) | | | | | optional |

For `GOOGLE_APPLICATION_CREDENTIALS`: currently `apps/sync-worker/src/main.ts:11–14` reads a file path. Update to accept either a path or an inlined JSON env var `GOOGLE_APPLICATION_CREDENTIALS_JSON` (parse directly). Add task to Workstream A/F.

#### D13. Scheduler rework — BullMQ repeatable jobs (Q7)

**Goal:** Replace `setInterval`-based cron in `apps/scheduler/src/main.ts:30–38` with BullMQ's repeatable job pattern. Adds **0.5 dev-day** but unlocks horizontal scaling and removes the single-instance constraint.

- **D13a. Refactor `apps/scheduler/src/main.ts`.** Remove `setInterval` blocks. On boot, enqueue **repeatable jobs** via `queue.add(name, payload, { repeat: { every: ms } | { pattern: cronExpr } })`. BullMQ stores these in Redis; duplicate `add` calls with the same `repeat` config are idempotent — safe to run on every scheduler boot.
- **D13b. Per-tenant job sharding (forward compatibility).** Every job payload includes `{ tenantId, ... }`. At launch this is always iFun's tenantId. When we add tenants, the same code paths shard automatically because each `tenantId` enqueues distinct repeatable jobs (distinct `jobId` = `${name}:${tenantId}`).
- **D13c. Idempotency keys.** Use `jobId: ${name}:${tenantId}:${slot}` (slot = floor(now / interval)) on `queue.add` so a duplicate enqueue from another scheduler instance is a no-op.
- **D13d. Worker side.** Existing workers (`whatsapp-worker.ts`, `sync-worker`) already consume by job name — no change needed. Add `tenantId` extraction to the start of each worker handler.
- **D13e. Tests.** Add `apps/scheduler/src/__tests__/repeatable-jobs.test.ts` — verify `jobId` collisions are deduped and the right number of jobs land in the queue after two scheduler boots.

**Acceptance:** Running two `apps/scheduler` instances locally for 5 minutes produces exactly one execution per interval per job, verified via `BullMQ`'s `getCompleted()` and timestamps.

---

#### D11. Rollback strategy

- **Fly:** `flyctl releases rollback <version>` — instant. Each release is an immutable image.
- **Vercel:** "Promote" any prior deployment as Production — instant.
- **Database:** PITR restore (Pro plan) to any second within the last 7 days. Drill once during onboarding.
- **WhatsApp:** the previous template config in `wa_templates` is preserved as long as we don't drop the column; rollback = `flyctl releases rollback` and re-enable Trengo creds.

#### D12. Cost estimate

| Service | At launch (1 tenant) | At 100 tenants | At 1000 tenants |
|---|---|---|---|
| Supabase Pro (1 project) | $25/mo | $25/mo + add-ons (~$50) | Need Team plan + read replica: $599/mo |
| Fly api (1× shared-1x 256MB) | ~$5/mo | 2× shared-1x: ~$10/mo | 4× shared-cpu-2x 1GB: ~$60/mo |
| Fly scheduler (1× shared-1x) | ~$5/mo | ~$5/mo | ~$10/mo |
| Fly sync-worker (1× shared-1x) | ~$5/mo | ~$5/mo | ~$10/mo |
| Upstash Redis | ~$0 (PAYG, <10k req/day) | ~$10/mo | ~$80/mo (Pro plan) |
| Vercel (Hobby/Pro) | Hobby $0 | Pro $20/mo | Pro $20/mo + bandwidth ~$50 |
| Sentry | Free tier $0 | Team $26/mo | Team $26/mo |
| Meta WhatsApp Cloud API | Per-conversation pricing (Marketing ~$0.06–0.10 MYR; Utility free if within 24h window) | ~$200/mo est. | ~$2000/mo |
| **Total infra** | **~$40/mo** | **~$150/mo** | **~$850/mo + WA** |

(WhatsApp variable cost dominates at scale; the multi-tenant model means each tenant pays for their own usage if they bring their own WABA — recommended pattern.)

**Acceptance criteria**

- `flyctl deploy` for all three apps succeeds end-to-end from a clean clone.
- `curl https://arcade-api.fly.dev/readyz` returns 200 with `{ db: 'ok', redis: 'ok' }`.
- Loading the Vercel-deployed web app and signing in with magic link works.
- A test booking creation enqueues a reminder job (visible in BullMQ via Upstash console) which the scheduler consumes and the api logs show a successful Meta API call.
- A deliberate error in an api route shows up in Sentry within 60s.

---

### Workstream E — Docs & ops

**Effort:** 1–2 dev-days.

- **E1.** `docs/DEPLOY.md` (new) — end-to-end deploy runbook: provision Supabase, run migrations, set Fly secrets, `flyctl deploy`, Vercel setup, smoke-test commands.
- **E2.** `docs/RUNBOOK.md` (new) — on-call playbook. Sections:
  - **DB down** — check Supabase status page; if multi-zone outage, communicate; PITR restore steps.
  - **Worker stuck** — `flyctl ssh console -a arcade-scheduler` + `redis-cli` on Upstash console; BullMQ stalled jobs (`bullmq` UI optional via separate Fly app); how to drain queue.
  - **WhatsApp template rejected by Meta** — fallback templates; how to resubmit; how to throttle marketing sends until quality rating recovers (set `WA_MARKETING_ENABLED=false` Fly secret, drop campaign worker).
  - **Number quality drop** — Meta Business Manager URL; reduce throughput; pause marketing.
  - **Webhook signature failures** — verify `WHATSAPP_APP_SECRET` matches Business Manager → App settings → Basic.
  - **Token Hook misfire** — `SELECT public.custom_access_token_hook('{"claims":{"sub":"..."}}'::jsonb)` in SQL editor to debug.
  - **Stuck migration** — release_command fails: `flyctl releases` to see; manually run `prisma migrate resolve --rolled-back <name>` if needed.
- **E3.** `docs/MIGRATION_PLAN.md` (this document).
- **E4.** Update `README.md`:
  - Replace "Postgres 16 with RLS" stack line with "Supabase Postgres with RLS via Supabase Auth JWT".
  - Replace local-setup section: still `pnpm setup` but mention requiring a Supabase project (or local CLI) and Upstash dev tier.
  - Replace "Trengo" references with "Meta WhatsApp Cloud API".
  - Update demo accounts table: passwords replaced with magic-link-only flow; show command to print magic links from seed.
- **E5.** ADRs (architecture decision records) — add `docs/adr/0001-supabase.md`, `0002-meta-direct.md`, `0003-fly.md` (one paragraph each, capturing the why for future engineers).

---

### Workstream F — Cleanup (post-cutover)

**Effort:** 0.5 dev-day.

- **F1.** Drop `wa_templates.trengo_hsm_id` column once all templates re-keyed to `meta_template_name`. New migration `20260521_000001_drop_trengo_columns/migration.sql`.
- **F2.** Delete `apps/api/src/services/whatsapp.ts` if it becomes redundant after worker handles all sends (currently both api and worker share logic; keep services thin).
- **F3.** Remove `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `JWT_REFRESH_TTL_SECONDS` from `apps/api/src/config.ts` and `.env.example`.
- **F4.** Remove `bcryptjs` from `apps/api/package.json` and `packages/db/package.json` once no longer used.
- **F5.** Remove `RefreshToken` Prisma model + its DB table via final migration.
- **F6.** **Audit log retention — 12-month partition-drop (Q8).** Convert `audit_log` to a monthly partitioned table; add a nightly BullMQ repeatable job in scheduler that drops partitions older than 12 months. Mirror the same for `wa_messages` and `consent_events` (PRD §11.3 requires 12-month minimum). Migration `20260521_000002_audit_partitions/migration.sql`. New worker `apps/scheduler/src/jobs/retention-worker.ts`. Tests: insert old rows, run worker, verify drop. **Effort: included in F's 0.5 day budget — promote to 1 day if more retention tables need partitioning.**

---

### Workstream G — Receipt PDFs + CSV exports + ESC/POS printer (Q4)

**Goal:** Ship the PRD's receipt printing and reports-export features. Uses Supabase Storage for blob persistence; ESC/POS native helper for direct thermal-printer drive.

**Effort:** 3–4 dev-days.

#### G1. Receipt PDF generation

- **G1a. Add `pdfkit` to `packages/lib`.** New file `packages/lib/src/receipts.ts` exporting `generateReceiptPdf(transaction): Promise<Buffer>`. Layout: store name, transaction id, datetime, line items table (item, qty, unit price, total), payment method, totals (subtotal, tax, grand total), QR code linking to digital receipt URL.
- **G1b. Upload to Storage.** After PDF generation, upload to `receipts/tenants/{tenantId}/{transactionId}.pdf` via the `packages/lib/src/storage.ts` wrapper from B6. Persist returned object path on the `transactions` row in a new column `receipt_storage_path`.
- **G1c. Schema migration.** `ALTER TABLE transactions ADD COLUMN receipt_storage_path TEXT;` and `ADD COLUMN receipt_generated_at TIMESTAMPTZ;`. Migration `20260520_000005_receipts/migration.sql`.
- **G1d. POS route update.** `POST /pos/transactions` (in `apps/api/src/routes/pos.ts`) — after successful transaction commit, enqueue a `generate-receipt` job to BullMQ (don't block the API). Worker generates + uploads + updates row. Response returns `{ transaction, receiptPending: true }` immediately; frontend polls `GET /pos/transactions/:id/receipt` until `receipt_storage_path` is set, then fetches signed URL.
- **G1e. Signed URL endpoint.** `GET /pos/transactions/:id/receipt-url` returns `{ url, expiresAt }` via `storage.signedUrl(path, 3600)`. Auth-checked (must belong to tenant).

#### G2. ESC/POS native printing

- **G2a. Decision: thin helper agent or embedded.** Build a small Electron-based helper app **OR** a Node.js system tray app **OR** rely on a USB-connected printer driven via the browser's WebUSB API. After research: **WebUSB has Chromium-only support and requires HTTPS + user gesture per session** — fragile for a kiosk POS that runs all day. **Decision: Node.js system tray helper** (~200 LoC) using `node-thermal-printer` or `escpos` npm package. Distributed as a signed `.exe` / `.dmg`.
- **G2b. New app `apps/printer-agent`.** Single-purpose Node.js process:
  - Listens on `localhost:7777` for `POST /print` `{ pdfUrl, copies?, drawerKick? }`.
  - Downloads the PDF from signed URL (already in `apps/web` flow).
  - Converts PDF → ESC/POS commands via `pdf2pic` + raster mode, OR renders the receipt directly via `escpos` library (faster, smaller binary). **Recommendation: render directly via `escpos` — skip PDF intermediate.**
  - Configurable printer: USB vendor/product ID, network IP, or serial port via local `~/.arcade-printer.json` config.
- **G2c. Web app integration.** `apps/web/src/pages/PosPage.tsx` — after transaction success, `POST http://localhost:7777/print` with the receipt payload. Fallback to browser print dialog if agent unreachable (`fetch` fails). Show a "Printer offline" badge in the UI when agent is down.
- **G2d. Auto-launch on Windows.** Document in `docs/PRINTER_AGENT.md`: install + add to startup folder. Mac/Linux: similar.
- **G2e. Drawer-kick support.** ESC/POS command `0x1B 0x70 0x00 0x32 0xFA` opens the cash drawer wired through the printer's RJ12 port. Toggle via `drawerKick: true` in the print payload (default true for cash transactions, false for digital).

#### G3. CSV exports

- **G3a. Async export queue.** New BullMQ queue `exports` in `apps/api/src/queues.ts`. New worker `apps/scheduler/src/jobs/export-worker.ts`.
- **G3b. New routes** in `apps/api/src/routes/reports.ts`:
  - `POST /reports/exports` body `{ type: 'transactions' | 'customers' | 'bookings' | 'wallet-ledger', from, to, filters? }` → enqueues a job, returns `{ exportId, status: 'pending' }`.
  - `GET /reports/exports/:id` → returns `{ status: 'pending' | 'ready' | 'failed', downloadUrl?, expiresAt? }`.
- **G3c. Worker logic.** Stream rows from Prisma using `findManyCursor`, format to CSV via `papaparse`, upload to `exports/tenants/{tenantId}/{exportId}.csv`. Update an `exports` table row to `ready` with the path.
- **G3d. New `exports` table.** Migration `20260520_000006_exports/migration.sql` — `id UUID PK, tenant_id UUID NOT NULL, requested_by UUID, type TEXT, status TEXT, filters JSONB, row_count INT, storage_path TEXT, error TEXT, created_at, completed_at`. RLS policies via the existing helper function.
- **G3e. Email/WhatsApp notification on ready.** Optional — for now, frontend polls `GET /reports/exports/:id` every 2s while a modal is open. Push notifications a future improvement.

#### G4. Reports UI

- **G4a. New page `apps/web/src/pages/ReportsPage.tsx`** — list past exports + "Generate new" button with filters. Polls status.
- **G4b. New page `apps/web/src/pages/DashboardPage.tsx`** (if doesn't exist) — summary cards from `GET /reports/daily` for today's metrics (already in PRD §6).

**Risks**
- ESC/POS over USB on Windows often needs WinUSB driver installation (vendor-specific) — document common printer models (Epson TM-T20, Star TSP100) and their drivers in `docs/PRINTER_AGENT.md`.
- Large CSV exports (>500k rows) could exhaust worker memory — stream rows, never `findMany` whole tables.
- Signed URLs for exports expire — frontend must regenerate if user opens an old link.

**Acceptance criteria**
- Completing a POS sale produces a receipt PDF in Storage within 5s and prints via the agent on a connected Epson TM-T20.
- Generating a transactions CSV export for a 30-day range with ~10k rows completes in <30s and downloads via signed URL.
- Agent gracefully reports offline status to the web app when the printer USB cable is disconnected.

---

## 4. Ordered execution sequence

Sequential dependencies are minimal; the critical path is C → cutover. A and B can parallelize. D depends on having a working build of A+C.

**Recommended order:**

1. **Week 1 (parallel tracks)**
   - Track 1: **Workstream B (Supabase setup)** — provision project, capture URLs, run existing migrations as-is to verify schema works on Supabase. Wire up Storage buckets.
   - Track 2: **Workstream A (WhatsApp swap)** — Meta dev account, sandbox phone number, build `meta-client.ts`, swap worker and webhook. Test against sandbox.
2. **Week 2**
   - **Workstream C (Auth migration)** — focused single-engineer track. Land in a feature branch with the new RLS migrations, middleware rewrite, frontend rewrite, seed rewrite. Run integration tests in CI against a Supabase shadow project. Simpler now (no `user_tenants`).
3. **Week 3**
   - **Workstream D (Deployment + scheduler rework)** — Dockerfiles, fly.tomls, BullMQ repeatable jobs (D13), GitHub Action, Sentry, healthchecks. Deploy api + workers to Fly dev environment first.
   - **Workstream G (Receipts + exports)** — kick off in parallel; PDF + CSV pieces don't depend on D, only the printer-agent integration needs `apps/web` deployed.
   - **Workstream E (Docs)** — in parallel.
4. **Week 4**
   - Production cutover: deploy to prod Fly + Vercel, point Meta webhook at prod URL, switch Meta WABA to production.
   - **Workstream F (Cleanup + audit retention)** — drop Trengo columns, partition `audit_log`, deploy retention worker.

Total elapsed: ~4–5 weeks for one engineer at ~70% utilization, or ~3 weeks at full focus.

---

## 5. Risk register

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | Custom Access Token Hook silently returns claims without `tenant_id` → all API requests 403 in prod | Total outage | Med | Integration test that mints a token via Admin API and asserts both claims present, runs in CI |
| 2 | Supavisor transaction-mode pooler breaks Prisma prepared statements | Random 500s | High | Use session-mode pooler for workers; use `pgbouncer=true&connection_limit=1` for API; load-test before cutover |
| 3 | Meta marketing-quality rating drops because we don't throttle properly | Number suspended | Med | Already have rate limiter (`limiter: { max: 80, duration: 60_000 }` at `whatsapp-worker.ts:106`); add a circuit breaker that pauses on `132000`/`132001` errors |
| 4 | `request.jwt.claims` GUC not honored by `auth.jwt()` from a non-PostgREST connection | RLS allows-all or denies-all | Med | The `auth.jwt()` function in Supabase is defined as `current_setting('request.jwt.claims', true)::jsonb` — works from any client. Verify in C5 with the smoke test before rollout |
| 5 | Fly release_command timing out on first deploy due to long migration | Failed deploy | Low | First migration is the existing baseline (already proven). Set `release_command_timeout = "10m"` in fly.toml |
| 6 | Webhook signature verification fails because Express parsed the JSON before raw body captured | Inbound messages dropped silently | Med | A13 + a CI test that POSTs a known fixture to `/webhooks/whatsapp` with a valid signature and asserts processing |
| 7 | Upstash Redis connection drops cause BullMQ worker to stop processing | Reminders not sent | Low | Worker auto-reconnects via ioredis defaults; add a Sentry alert on `worker.on('error')` |
| 8 | Multi-tenant user picks wrong tenant, sees data they shouldn't | Data leak | Low | RLS is the second wall — even if `active_tenant_id` is wrong, JWT claim must match a `user_tenants` row, otherwise RLS denies. Add an audit log entry on every `POST /auth/active-tenant` |

---

## 6. Pre-flight checklist (human action, lead time)

These need to be started **before** Workstream A/C, as some have multi-day delays:

- [ ] **PF1.** **Meta Business Verification** — submit business docs to Meta. Lead time: **3–14 days**. Required before WhatsApp Cloud API access leaves sandbox. (Without this, A11/A12 work but only sends to test numbers.)
- [ ] **PF2.** **WhatsApp Business Account (WABA)** — set up under iFun City's Meta Business Manager. Verify business display name. Add the phone number, complete OTP verification.
- [ ] **PF3.** **Submit WhatsApp templates** — `birthday_greeting`, `booking_confirmation`, `booking_reminder_48h`, `booking_reminder_24h`, `post_event_feedback`, `re_engagement` (all 6 in `packages/db/src/seed.ts:150–205`). Templates take **24h–7 days** for Meta approval. Submit before C-week.
- [ ] **PF4.** **Supabase organization + project** — create with billing card, region `ap-southeast-1`. Generate strong DB password, store in 1Password. Activate Pro plan if going to prod immediately.
- [ ] **PF5.** **Fly.io org** — create org `arcade-management`. Add billing card. `flyctl orgs apps create arcade-api`/`-scheduler`/`-sync-worker` in region `sin`.
- [ ] **PF6.** **Vercel project** — link the Github repo. Set root dir to `apps/web`. Add env vars (D4).
- [ ] **PF7.** **Upstash account** — create Redis DB in `ap-southeast-1`. Pay-As-You-Go for dev, Pro for prod.
- [x] ~~**PF8.** Domain + DNS~~ — **dropped per Q3.** Use default `arcade-api.fly.dev` and `*.vercel.app` for launch. Add custom domain post-launch if needed.
- [ ] **PF9.** **Sentry org** — create 4 projects, capture DSNs.
- [ ] **PF10.** **Transactional email provider for Supabase Auth** — Resend account (or Postmark). Domain verification (SPF/DKIM) — **2–24h** to propagate. SMTP creds into Supabase Auth settings.
- [ ] **PF11.** **GCP service account** — for Sheets sync (already in PRD). Generate JSON key. Will be stored as `GOOGLE_APPLICATION_CREDENTIALS_JSON` Fly secret.
- [ ] **PF12.** **GitHub repository secrets** — `FLY_API_TOKEN`, `SENTRY_AUTH_TOKEN`, optional `VERCEL_TOKEN`.
- [ ] **PF13.** **1Password vault** — `arcade-management-prod` shared with team; all secrets logged there for break-glass.

---

## 7. Cost estimates

See D12. Summary:

- **Launch (iFun City only):** ~$40/mo infra, plus per-conversation WhatsApp costs (dependent on volume; typical SMB ~$50–200/mo).
- **100 tenants:** ~$150/mo infra; WhatsApp costs are per-tenant (BYO WABA model recommended).
- **1000 tenants:** ~$850/mo infra; will require Supabase Team plan + read replica, Fly multi-region, Upstash Pro tier. At this scale, a dedicated Postgres (Crunchy/Neon Enterprise) may be cheaper than Supabase add-ons — revisit at ~500 tenants.

---

## 8. Open questions — RESOLVED (see §0 for decisions)

All 8 questions answered. Full decisions log at top of doc. Summary:

- Q1 — Single-tenant ✅ (drop `user_tenants`)
- Q2 — Supabase Pro for prod, free for dev ✅
- Q3 — Default domains ✅
- Q4 — Build receipts + exports ✅ (new Workstream G, native ESC/POS)
- Q5 — Hard-delete Trengo ✅
- Q6 — Singapore-only ✅
- Q7 — Build scaling pattern day 1 ✅ (BullMQ repeatable jobs in D13)
- Q8 — 12-month partition-drop ✅ (F6)

---

## Effort summary

| Workstream | Estimate (dev-days) | Notes |
|---|---|---|
| A — WhatsApp swap (Trengo → Meta) | 3–4 | Unchanged |
| B — Supabase setup | 2 | Unchanged |
| C — Auth migration | **5–7** | –2 days (no `user_tenants`, no tenant-picker) |
| D — Deployment infra + scheduler rework | **5.5–7.5** | +0.5 day (BullMQ repeatable jobs, D13) |
| E — Docs | 1–2 | Unchanged |
| F — Cleanup + audit retention | **1** | +0.5 (F6 partition-drop) |
| **G — Receipts + CSV exports + ESC/POS printer** | **3–4** | NEW (per Q4) |
| **Total** | **20.5–27.5** | |
