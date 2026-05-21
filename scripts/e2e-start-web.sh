#!/usr/bin/env bash
# 啟動 E2E 所需的前端 dev server，API 位址由環境變數指向本機後端。
set -euo pipefail

cd "$(dirname "$0")/.."

export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:3001}"

exec npm run dev -w apps/web
