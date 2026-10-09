#!/usr/bin/env bash
# داشبورد سیستم‌ها — Linux / WSL2 / Termux
set -e
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js نصب نیست. در Termux: pkg install -y nodejs | در WSL: نسخهٔ 18+ نصب کن."
  exit 1
fi
cd "$ROOT_DIR/dashboard"
echo "🧭 داشبورد: http://localhost:${DASHBOARD_PORT:-8700}  (برای شبکه/گوشی: HOST=0.0.0.0 bash dashboard.sh)"
exec node server.js
