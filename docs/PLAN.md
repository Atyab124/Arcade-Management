# iFun City Arcade Management System — Implementation Plan

**Version**: 1.0 · **Date**: 2026-05-18 · **Status**: Approved for build

This plan synthesizes the v2.0 architecture document with five parallel research streams
covering competing arcade platforms (Roller, Centeredge, Semnox, Embed, Sacoa, Intercard),
WhatsApp/CRM platforms (Trengo, Meta Cloud API, WATI, Twilio, 360dialog), party-booking
platforms (Roller, Checkfront, Resy, FareHarbor, Peek Pro), Google Sheets sync patterns,
and Malaysia PDPA / multi-tenant SaaS / loyalty ledger industry standards.

---

## 1. Architectural Decisions (locked in from research)

| Decision | Choice | Why |
|---|---|---|
| Tenancy model | **Pool + Postgres RLS** from day one | Retrofitting `tenant_id` later is brutal (AWS SaaS Lens, WorkOS). Pool model is the SMB-SaaS default. |
| Tenant key in all PKs | `PRIMARY KEY (tenant_id, id)` | Enables future hash partitioning; forces tenant_id into every index. |
| Loyalty data model | **Append-only `points_ledger`** | Confirmed modern standard (Capillary, Square Books, Salesforce Loyalty DMO). Mutable counter pattern is broken under concurrent earn/redeem. |
| Booking payment state | **Computed from `payments` rows**, not stored | Avoids drift (Checkfront, Bookinglayer). `status = derived(sum(payments), invoice_total)`. |
| Booking resources | **Resource entities** with per-resource capacity | Roller-style. Blackouts are availability events, not a separate table. |
| Reminders | **Per-flag columns** (`reminder_48h_sent_at`, etc.) | Idempotent at-least-once via selector, not message bus. |
| Pricing/policy snapshots | Snapshot at booking time | Roller/Checkfront/FareHarbor pattern. Policy changes don't retroactively affect old bookings. |
| Till sessions | Expected/Actual/Variance | Universal (Centeredge, Roller, Semnox). Pay-ins/outs excluded from variance. |
| Cashless cards | **Multi-bucket** (credits, bonus, time, tickets) | Universal (Sacoa, Embed, Roller). Bonus consumed first. |
| Machine maintenance | **QR code per machine** + scan-to-log | Only Semnox does this today — clear differentiator. |
| Sheets sync change detection | Drive API `modifiedTime` gate + per-row SHA-256 hash | Fivetran pattern. Avoids no-op writes; etag is unreliable. |
| Sheets sync upsert key | `phone_e164` (E.164-normalized) | Row index is unstable. |
| Sheets validation | **Staging table → typed transforms → errors table** | Production ETL pattern. Validation lives in code, not the sheet. |
| WhatsApp opt-out detection | **Build keyword detection ourselves** | Meta Cloud API does NOT auto-handle STOP for WhatsApp (only SMS via Twilio). |
| WhatsApp webhook idempotency | Dedupe on `messages[].id` / `statuses[].id`; tolerate read-before-delivered | Meta delivers at-least-once, ordering not guaranteed. |
| Consent log | Immutable `consent_events` table; timestamp + channel + IP + notice version | PDPA Reg 3 requires recordable + retrievable; Meta can audit. |
| Erasure | **Soft-delete + anonymize**, not hard-delete | Preserve transactional integrity; PDPA allows refusal where legal retention applies. |
| Tier evaluation | **Hybrid**: on-transaction upgrade + nightly downgrade/expiry | Sephora/Starbucks UX pattern. |
| Auth | JWT (access ~15min) + refresh tokens; RBAC (admin/manager/staff) | Per spec § 11.2. |
| API gateway | Express middleware stack: auth → tenant context → RLS GUC → rate limit | Per spec § 9.1 + RLS pattern from Supabase. |

---

## 2. Monorepo Structure

```
arcade-management/
├── apps/
│   ├── api/           # Express + TypeScript backend
│   ├── web/           # React + Vite + Tailwind SPA
│   ├── sync-worker/   # Google Sheets → Postgres sync (cron)
│   └── scheduler/     # BullMQ worker: reminders, expiry, tier eval, feedback
├── packages/
│   ├── db/            # Prisma schema, migrations, seed, RLS helpers
│   ├── types/         # Shared TypeScript types (DTOs, enums)
│   ├── whatsapp/      # Trengo client, template registry, webhook verifier
│   └── lib/           # Shared utilities: phone normalize, money, dates
├── infra/
│   ├── docker-compose.yml   # Postgres 16 + Redis for local dev
│   └── github-actions/      # CI workflows
└── docs/
    └── PLAN.md        # This document
```

Package manager: **pnpm workspaces**. Lockfile checked in.

---

## 3. Database Schema (PostgreSQL 16 + RLS)

Every domain table has `(tenant_id, id)` as composite PK. Every index leads with `tenant_id`.
RLS is enabled on every domain table with a single policy:
`USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

### 3.1 Core / tenancy

- `tenants` — id, name, slug, plan, locale, timezone, settings JSONB, created_at
- `users` — id, tenant_id, email, password_hash, role ENUM(admin,manager,staff), name, phone, active, created_at
- `audit_log` — append-only: actor_user_id, action, entity_type, entity_id, before, after, ip, timestamp

### 3.2 CRM (per spec § 3 + research enrichments)

- `customers` — phone_e164 (unique per tenant), full_name, email, dob, membership_type, lifetime_spend, visit_count, last_visit_date, preferred_lang, notes, vip_flag, dietary_flags JSONB, medical_flags JSONB (Roller-style), created_at, updated_at, deleted_at, anonymized_at
- `customer_tags` — m2m: customer_id, tag
- `consent_events` — **immutable**: customer_id, channel (whatsapp/email/sms), action (opt_in/opt_out), source (pos/sheets/online/sms_reply), notice_version, ip, user_agent, timestamp, evidence JSONB

### 3.3 Sheets sync

- `sync_runs` — id, started_at, finished_at, sheet_modified_time, rows_read, rows_changed, status
- `sync_log` — sync_run_id, sheet_row, domain_key, action(insert/update/skip/soft_delete/error), before/after JSONB, changed_fields TEXT[], status, error_message
- `customers_staging` — TEXT columns mirroring sheet structure, source_row, fetched_at
- `customers_sync_errors` — staging_row_id, reason, fields, occurred_at

### 3.4 POS / Till

- `till_sessions` — id, register_id, opened_by_user_id, opened_at, opening_cash, closed_by_user_id, closed_at, expected_cash, actual_cash, variance, status(open/closed/reconciled)
- `transactions` — id, till_session_id, customer_id NULL, type(sale/refund/void/payin/payout/expense), total, tax, payment_method, receipt_no, reason_code NULL, approved_by_user_id NULL, void_of_transaction_id NULL, created_at
- `transaction_lines` — transaction_id, line_no, sku, description, qty, unit_price, line_total
- `payment_methods` — id, name, code (cash/card/qr/wallet)

### 3.5 Cashless cards

- `cards` — id, tenant_id, card_uid, customer_id NULL, status(active/lost/expired), issued_at
- `card_buckets_ledger` — append-only: card_id, bucket(credits/bonus/time/tickets), delta, balance_after, source_type, source_id, expires_at NULL, created_at
- Material view `card_balances` keyed (card_id, bucket) → sum where not expired.

### 3.6 Party booking (Roller-style)

- `resources` — id, name, capacity, color, active (zones, rooms, lanes)
- `availability_events` — resource_id, type(blackout/open), start_at, end_at, reason
- `party_packages` — id, name, description, base_price, deposit_pct, min_guests, max_guests, duration_minutes, active
- `package_variations` — package_id, name, price_override, included_addons JSONB
- `package_addons` — id, package_id NULL (NULL = global), name, price, stock_period_start NULL, stock_period_end NULL
- `bookings` — id, customer_id, package_id, variation_id, resource_id, start_at, end_at, guest_count, status_hint, notes, run_sheet_notes, wristband_color, policy_snapshot JSONB, pricing_snapshot JSONB, reminder_48h_sent_at NULL, reminder_24h_sent_at NULL, feedback_request_sent_at NULL, created_at, cancelled_at NULL, cancellation_reason NULL
- `booking_lines` — booking_id, addon_id, qty, unit_price_snapshot, line_total
- `invoices` — id, booking_id, total, tax_total
- `payments` — id, invoice_id, amount, method, type(deposit/balance/refund/gift), txn_ref, status, paid_at
- `waitlist_entries` — id, package_id, requested_date, customer_id, contact_phone, notified_at NULL, claimed_at NULL

### 3.7 Loyalty

- `loyalty_programs` — id, name, earn_rate_per_rm, tier_thresholds JSONB, expiry_months, active
- `loyalty_tiers` — program_id, name, min_qualifying_points, perks JSONB
- `points_ledger` — id, customer_id, event_type(EARN/REDEEM/ADJUST/EXPIRE/REVERSAL), points (signed), source_type, source_id, expires_at NULL, parent_ledger_id NULL, metadata JSONB, created_at
- `point_balances` — materialized view, (customer_id) → sum(points) where (event_type='EARN' AND (expires_at IS NULL OR expires_at > now())) - sum(abs(redeem))
- `redemptions` — id, customer_id, reward_id, status(pending/fulfilled/cancelled), points_cost, fulfilled_at
- `rewards_catalog` — id, name, description, points_cost, stock NULL, active

### 3.8 Machine maintenance

- `machines` — id, qr_token (unique), name, model, location_zone, install_date, status(in_service/out_of_service/decommissioned)
- `machine_revenue_events` — machine_id, period_start, period_end, plays, collection, payout_pct
- `maintenance_tasks` — id, machine_id, type(routine/repair/inspection), priority, assigned_to_user_id, scheduled_for, started_at, completed_at, notes, parts_used JSONB
- `service_requests` — id, machine_id, opened_by_user_id, status(open/in_progress/resolved/closed), description, resolved_at, resolution_notes

### 3.9 WhatsApp / Trengo

- `wa_templates` — id, name, category(marketing/utility/auth), trengo_hsm_id, language, body, variables JSONB, status, version, approved_at
- `wa_messages` — id, customer_id NULL, phone_e164, direction(in/out), template_id NULL, body, status(queued/sent/delivered/read/failed), external_id (Trengo or Meta msg id, UNIQUE), conversation_window_until, error_code, created_at, updated_at
- `wa_webhook_events` — provider, external_id (UNIQUE), event_type, raw JSONB, processed_at NULL — for idempotency
- `wa_campaigns` — id, name, template_id, segment_filter JSONB, scheduled_for, created_by_user_id, status, total_recipients, sent_count, delivered_count, failed_count

### 3.10 Staff / shifts (Phase 2 stub)

- `shifts` — id, user_id, start_at, end_at, role, notes
- `clock_events` — user_id, type(in/out), timestamp, location

---

## 4. Module Implementation Plan

### 4.1 Phase 1 — implemented in this session

**Foundation**
- Monorepo + pnpm workspaces + TypeScript + ESLint/Prettier
- Docker compose (Postgres 16 + Redis) for local dev
- Prisma schema with all tables above
- RLS migration + tenant-context middleware
- Auth: bcrypt + JWT + refresh tokens + RBAC
- Audit log: middleware writes `audit_log` rows for mutating routes

**CRM**
- Customer CRUD + search (tenant-scoped)
- Phone normalization to E.164 (libphonenumber-js)
- Consent log: explicit opt-in capture, immutable audit
- Segmentation query builder (matches doc § 7.2 segments)
- Soft-delete + anonymize endpoint for PDPA erasure

**Sheets sync worker**
- Service-account auth (env-driven JSON key)
- Drive API `modifiedTime` gate
- BatchGet via named ranges with exponential backoff
- Staging table + typed transforms + errors table
- SHA-256 row hash diff → upsert via `ON CONFLICT (tenant_id, phone_e164)` with `WHERE row_hash IS DISTINCT FROM`
- Soft-delete via diff of current vs. previous run
- Full sync_runs + sync_log audit

**POS**
- Till session open/close with expected/actual/variance
- Transaction creation with line items
- Refund flow requiring manager approval (separate role check)
- Void flow + reason codes
- Receipt number generator
- Daily reconciliation report endpoint (PDF generation deferred — JSON for now)
- Pay-in / pay-out / expense rows

**Party booking**
- Resource + availability event CRUD
- Package + variation + add-on CRUD
- Stock-period validation on add-ons
- Booking creation with capacity check (resource + headcount)
- Pricing engine: package + variation + add-ons (line items, snapshotted)
- Policy snapshot at booking time
- Invoice + payment recording
- Payment state derived (deposit_pending → deposit_paid → balance_due → fully_paid)
- Waitlist add + notify-on-cancellation
- Cancellation flow + refund computation

**Loyalty**
- Points ledger writes on transactions (EARN), redemptions (REDEEM), nightly cron (EXPIRE)
- Balance computed from ledger
- Tier evaluation on each EARN; nightly batch for downgrades
- Rewards catalog + redemption flow

**WhatsApp / Trengo**
- Trengo HTTP client (Bearer token, POST /api/v2/wa_sessions)
- Template registry (DB-backed, maps internal template name → Trengo hsm_id)
- Outbound sender: queues to BullMQ; respects opt-in; respects 24h window; rate-limited
- Inbound webhook receiver: idempotent on external_id; STOP-keyword detector → opt_out
- Status webhook handler: tolerates out-of-order delivered/read
- Automated triggers: birthday cron, booking confirm, booking reminders (48h/24h), post-event feedback, re-engagement (60-day no-visit), loyalty points update
- Campaign sender: segment query → batch enqueue with global rate cap

**Machine maintenance**
- Machine CRUD with QR token generation (cryptographically random, URL-safe)
- QR scan endpoint resolves token → machine detail + maintenance history
- Service request CRUD
- Maintenance task scheduler

**Reporting**
- Daily revenue endpoint (cash/card/cashless split)
- Per-machine performance (plays, collection, payout%)
- Customer segmentation counts
- Booking revenue per package

**Frontend (React + Vite + Tailwind)**
- Login + auth context
- Dashboard (KPI tiles + today's bookings + open service requests)
- Customer list + detail (with consent history + opt-out toggle)
- Booking calendar (week view) + new booking form
- POS screen (till open/close + new sale)
- Machines list + machine detail with QR
- Reports section (3 reports above)
- Settings: WhatsApp templates, packages, resources, loyalty config

**Cross-cutting**
- Zod validation on all API inputs
- Structured logging (pino)
- Error handler with PII scrubbing
- Health check `/healthz` and `/readyz`
- Rate limiting (express-rate-limit + Redis store)
- Vitest unit tests for: pricing engine, sheets-sync diff, opt-out detection, payment-state computation, RLS isolation, loyalty ledger math

### 4.2 Phase 2 — scaffolded but not fully implemented

- Staff shifts + clock in/out (table exists, basic endpoints, no UI)
- Mobile-responsive maintenance app for technicians (web is already responsive; native deferred)
- Direct POS-to-DB integration (sync worker already supports it — flip a flag)

### 4.3 Phase 3 — deferred (out of scope this session)

- Native mobile apps
- AI insights
- Multi-location rollup UI (DB supports it via tenant_id; one location = one tenant initially)
- Self-service customer portal
- Payment gateway live integration (stub interface exists)
- SaaS billing module

---

## 5. Integrations — concrete contracts

### 5.1 Trengo (WhatsApp)

- Outbound: `POST https://app.trengo.com/api/v2/wa_sessions` with `{ hsm_id, recipient_phone_number, params: [{ type, key, value }, ...] }`. Auth: `Bearer ${TRENGO_TOKEN}`.
- Webhook: Trengo POSTs to `/webhooks/trengo` — verify signature, dedupe on `event.id`, branch on event type. Body contains `message.text` for inbound — run through STOP-keyword detector.
- Template ID lookup: `wa_templates.trengo_hsm_id` populated manually after Trengo template approval (no API to list templates).

### 5.2 Google Sheets

- Auth: GOOGLE_APPLICATION_CREDENTIALS env points to service account JSON (mounted secret in prod).
- Sheet ID: per-tenant config in `tenants.settings.sheets_id`.
- Sheet must be shared with service account email.
- Sync schedule: BullMQ repeatable job every 15 min.

### 5.3 Payment Gateway (Phase 3 stub)

- Interface `PaymentGateway` with `createCheckout()`, `getStatus()`, `refund()`. Stub implementation returns synthetic responses. Real iPay88 / Stripe binding deferred.

---

## 6. Security & PDPA Compliance Checklist

| Requirement | Implementation |
|---|---|
| Opt-in consent recorded with timestamp | `consent_events` table; insert on every opt_in/opt_out |
| Opt-in evidence retrievable | `consent_events.evidence` JSONB includes channel, IP, UA, notice version |
| Opt-out honored immediately | Webhook handler updates customer + writes consent_event in single transaction; campaigns join on `latest_consent` view |
| Right to erasure | `DELETE /customers/:id` → soft-deletes + anonymizes PII; preserves transaction history with `customer_id = NULL` |
| 72-hour breach notification | Runbook + alert on `audit_log` filter for `bulk_export` or `unauthorized_access`; placeholder Slack webhook |
| Data encrypted in transit | HTTPS only; CORS locked; HSTS header |
| Data encrypted at rest | Postgres-level encryption (cloud provider feature); JWT signing key in secrets manager |
| Audit log | Middleware writes `audit_log` for all mutating routes; immutable (no UPDATE allowed) |
| RBAC | Express middleware enforces `requireRole('manager')` etc.; tested per route |
| Rate limiting | express-rate-limit + Redis store; per-IP + per-user; stricter on `/auth/*` |
| WhatsApp quality protection | Outbound sender checks `customer.whatsapp_opt_in`; respects 24h window; throttles via BullMQ rate limiter |
| Marketing message quiet hours | Outbound sender refuses marketing-category sends between 22:00–08:00 local time |

---

## 7. Realistic Scope Note

The full v2.0 architecture document scopes Phase 1 at 3 months and the full vision at 12 months.
This session implements:

- **Complete** for Phase 1: schema, RLS, auth, CRM, consent log, Sheets sync, POS, party booking
  (including pricing/policy snapshots), WhatsApp/Trengo integration with all automated triggers,
  loyalty ledger, machine maintenance with QR, key reports.
- **Scaffolded** for Phase 2: staff shifts (tables + basic CRUD), advanced analytics (data is there,
  more dashboards to add), direct POS-to-DB cutover (sync worker is already feature-flagged).
- **Deferred**: mobile native apps, multi-location UI rollup, AI insights, payment gateway live
  binding, SaaS billing.

What this session does NOT do (requires external setup, not code):
- Provision Trengo account, get Meta business verification, submit templates for approval
- Create the GCP project + service account JSON key
- Provision production hosting (AWS/DigitalOcean), set up CI/CD secrets
- Migrate the actual existing Excel sheet

The codebase is structured so all of those become config swaps, not refactors.
