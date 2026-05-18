# iFun City — Arcade Management System

Web-based arcade management platform: CRM, POS, party booking, WhatsApp marketing,
loyalty rewards, machine maintenance, and reporting.

See [`docs/PLAN.md`](./docs/PLAN.md) for the architectural plan and research-backed
design decisions.

## Stack

- **API**: Node.js 20 + Express + TypeScript + Prisma
- **Database**: PostgreSQL 16 with Row-Level Security for multi-tenant isolation
- **Cache / queue**: Redis + BullMQ
- **Frontend**: React + Vite + Tailwind CSS
- **Sync worker**: dedicated process that polls Google Sheets every 15 minutes
- **Scheduler**: BullMQ consumer + cron jobs for reminders, feedback, expiry

## Repository layout

```
apps/
  api/           Express HTTP API
  web/           React SPA
  sync-worker/   Google Sheets → Postgres sync
  scheduler/     Reminders, feedback, points expiry, WhatsApp send worker
packages/
  db/            Prisma schema, migrations, seed
  types/         Shared Zod schemas and TS types
  lib/           Phone normalization, money, hashing, pricing, segments
  whatsapp/      Trengo client, template rendering, conversation window
infra/
  docker-compose.yml   Local Postgres + Redis
docs/
  PLAN.md        Full implementation plan with research synthesis
```

## Local development

```sh
# 1. boot Postgres + Redis
docker compose -f infra/docker-compose.yml up -d

# 2. install + generate Prisma client
pnpm install
pnpm --filter @arcade/db generate

# 3. apply migrations + seed
cp .env.example .env
pnpm db:migrate
pnpm db:seed

# 4. run everything in parallel
pnpm dev
```

API will be on `http://localhost:4000`, web on `http://localhost:5173`.

Demo accounts (created by seed):
- `admin@ifuncity.test` / `admin12345`
- `manager@ifuncity.test` / `manager123`
- `staff@ifuncity.test` / `staff1234`

## Security & compliance posture

- Postgres RLS enforces tenant isolation; the API connects as `arcade_app` which has no
  `BYPASSRLS` attribute.
- `audit_log`, `consent_events`, and `points_ledger` are append-only at both the policy
  and privilege layer.
- WhatsApp marketing sends are gated on an explicit `opt_in` event in `consent_events`;
  opt-outs detected via inbound message keywords are honored within one webhook cycle.
- Marketing sends respect a 22:00–08:00 local quiet-hours window.
- Customer erasure soft-deletes and anonymizes PII while preserving transactional history.

See `docs/PLAN.md` § 6 for the full checklist.
