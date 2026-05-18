#!/usr/bin/env bash
# One-shot local setup. Idempotent — safe to re-run.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ 1/6  Checking prerequisites..."
command -v pnpm >/dev/null || { echo "✗ pnpm not installed. Install with: npm install -g pnpm"; exit 1; }
command -v docker >/dev/null || { echo "✗ docker not installed."; exit 1; }
node_major=$(node -e 'console.log(process.versions.node.split(".")[0])')
[ "$node_major" -ge 20 ] || { echo "✗ Node >=20 required (have $node_major)"; exit 1; }

echo "▶ 2/6  Starting Postgres + Redis..."
docker compose -f infra/docker-compose.yml up -d
# Wait for Postgres to be ready
for i in {1..30}; do
  if docker compose -f infra/docker-compose.yml exec -T postgres pg_isready -U arcade -d arcade >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "▶ 3/6  Installing dependencies..."
pnpm install --frozen-lockfile

echo "▶ 4/6  Generating Prisma client + applying migrations..."
pnpm --filter @arcade/db generate
[ -f .env ] || cp .env.example .env
pnpm --filter @arcade/db migrate

echo "▶ 5/6  Seeding demo data..."
pnpm --filter @arcade/db seed

echo "▶ 6/6  Running checks..."
pnpm typecheck
pnpm test

cat <<'BANNER'

✅  Setup complete.

Start everything in dev mode:
    pnpm dev

Or individually:
    pnpm --filter @arcade/api dev          # http://localhost:4000
    pnpm --filter @arcade/web dev          # http://localhost:5173
    pnpm --filter @arcade/sync-worker dev
    pnpm --filter @arcade/scheduler dev

Demo accounts:
    admin@ifuncity.test    / admin12345
    manager@ifuncity.test  / manager123
    staff@ifuncity.test    / staff1234

BANNER
