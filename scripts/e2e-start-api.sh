#!/usr/bin/env bash
# 啟動 E2E 所需的 PostgreSQL 與 API，供 Playwright webServer 使用。
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose up -d postgres

until docker compose exec -T postgres pg_isready -U booking_scheduler -d booking_scheduler >/dev/null 2>&1; do
  sleep 1
done

npm run db:migrate

export DATABASE_URL="${DATABASE_URL:-postgres://booking_scheduler:booking_scheduler@localhost:5432/booking_scheduler}"
export PORT="${PORT:-3001}"

exec npm run start:dev -w apps/api
