# iFun City — Arcade Management System

Web-based arcade management platform: CRM, POS, party booking, WhatsApp marketing,
loyalty rewards, machine maintenance, and reporting.

Architecture and design decisions: [`docs/PLAN.md`](./docs/PLAN.md).
Original product requirement: [`docs/PRD.md`](./docs/PRD.md).

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
scripts/
  setup.sh             One-shot local-dev bootstrap
docs/
  PLAN.md        Architectural plan with research synthesis
  PRD.md         Original product requirement (v2.0)
```

## Prerequisites

- Node.js ≥ 20.10 (`node -v`)
- pnpm ≥ 9 (`npm install -g pnpm`)
- Docker + Docker Compose (`docker --version`, `docker compose version`)
- Free ports: **5432** (Postgres), **6379** (Redis), **4000** (API), **5173** (web)

## Quick start

```sh
git clone <repo>
cd Arcade-Management
pnpm setup     # one command — boots docker, installs, migrates, seeds, runs checks
pnpm dev       # starts api + web + sync-worker + scheduler in parallel
```

`pnpm setup` is idempotent — safe to re-run after a code update or stash.

Once running:
- API: <http://localhost:4000>  (try `curl http://localhost:4000/healthz`)
- Web: <http://localhost:5173>

Demo accounts (created by seed):

| Role    | Email                    | Password    |
| ------- | ------------------------ | ----------- |
| admin   | admin@ifuncity.test      | admin12345  |
| manager | manager@ifuncity.test    | manager123  |
| staff   | staff@ifuncity.test      | staff1234   |

## Manual setup (if `pnpm setup` fails)

```sh
# 1. boot Postgres + Redis
docker compose -f infra/docker-compose.yml up -d

# 2. install dependencies + generate Prisma client
pnpm install --frozen-lockfile
pnpm --filter @arcade/db generate

# 3. configure env
cp .env.example .env

# 4. apply migrations (init schema → RLS policies → role grants)
pnpm db:migrate

# 5. seed demo tenant + accounts + sample data
pnpm db:seed

# 6. verify everything compiles + tests pass
pnpm typecheck
pnpm test

# 7. run all services in parallel
pnpm dev
```

## Daily commands

```sh
pnpm dev                                  # all 4 apps in parallel
pnpm --filter @arcade/api dev             # just the API
pnpm --filter @arcade/web dev             # just the SPA
pnpm typecheck                            # type-check all packages
pnpm test                                 # 65+ unit tests
pnpm build                                # production build of everything
pnpm db:reset                             # ⚠️ drop + re-migrate + re-seed
```

## Optional integrations

**Trengo (WhatsApp)** — leave `TRENGO_TOKEN` blank to use `FakeTrengoClient`,
which records sends in memory without calling the real API. Useful for dev/CI.

**Google Sheets** — leave `GOOGLE_APPLICATION_CREDENTIALS` unset (or pointing to
a missing file) to use `FakeSheetsSource`. The sync worker still runs but reads
from an empty in-memory source.

For real integrations:
1. Create a GCP service account, download the JSON key, save it at
   `infra/secrets/gcp-service-account.json`. Enable Sheets API + Drive API.
2. Share the customer sheet with the service-account email (Viewer access).
3. Set `tenants.settings.sheetsId` to the sheet's file ID.
4. Set `TRENGO_TOKEN` and `TRENGO_WEBHOOK_SECRET` (see Trengo settings → API).
5. Register your Meta-approved templates in `wa_templates` with the correct
   `trengoHsmId` (look it up in Trengo's template settings URL).

## Verifying the install

```sh
# health checks
curl http://localhost:4000/healthz       # → {"ok":true}
curl http://localhost:4000/readyz        # → {"ready":true}

# sign in & list customers
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@ifuncity.test","password":"admin12345"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
curl http://localhost:4000/customers -H "Authorization: Bearer $TOKEN"
```

Or open <http://localhost:5173>, log in with the admin account, and click around.

## Troubleshooting

**`pnpm db:migrate` fails: "role 'arcade_app' already exists"** — safe to ignore;
the migration is idempotent (DO $$ … IF NOT EXISTS).

**Port 5432 already in use** — another Postgres is running locally. Either stop
it (`brew services stop postgresql`) or change the host port in
`infra/docker-compose.yml`.

**`prisma generate` complains it can't find schema** — make sure you ran
`pnpm install` from the repo root (not inside a sub-package).

**Webhook signature errors during testing** — leave `TRENGO_WEBHOOK_SECRET`
blank in `.env`; the receiver logs a warning but accepts the payload. Set it
when you wire up the real Trengo webhook.

**Booking creation fails with "capacity check failed"** — the seed creates
4 resources but no availability events; check the booking falls inside a
resource's time window and doesn't overlap an existing booking.

## Security & compliance posture

- Postgres RLS enforces tenant isolation; the API connects as `arcade_app`
  which has no `BYPASSRLS` attribute. Background workers use the admin role.
- `audit_log`, `consent_events`, and `points_ledger` are append-only at both
  the policy and privilege layer.
- WhatsApp marketing sends are gated on an explicit `opt_in` event;
  STOP-keyword opt-outs are honored within one webhook cycle.
- Marketing sends respect a 22:00–08:00 local quiet-hours window.
- Customer erasure soft-deletes and anonymizes PII while preserving
  transactional history.

See `docs/PLAN.md` § 6 for the full checklist.

## CI

GitHub Actions runs typecheck + tests on every push to `main` and any
`claude/**` branch (see `.github/workflows/ci.yml`). The workflow boots
Postgres + Redis as service containers; it does NOT need real Trengo / Google
credentials.
