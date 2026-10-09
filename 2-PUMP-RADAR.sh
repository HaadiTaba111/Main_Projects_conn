#!/usr/bin/env bash
# رادار مستقل پامپ/دامپ — اجرا از هر پوشه‌ای، مناسب Linux و Termux.
set -e

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT_DIR/apps/2-PUMP-DUMP-RADAR"

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js نصب نیست. در Termux اجرا کن: pkg install -y nodejs"
  exit 1
fi
if [ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 18 ]; then
  echo "❌ این برنامه به Node.js نسخهٔ 18 یا جدیدتر نیاز دارد."
  exit 1
fi
if [ ! -f "$APP_DIR/server.js" ]; then
  echo "❌ فایل سرور پیدا نشد: $APP_DIR/server.js"
  exit 1
fi

cd "$APP_DIR"
echo "🚀 رادار پامپ/دامپ: http://localhost:8790"
echo "ℹ️ سرور مستقل است؛ برای اجرای همزمان، در نشست Termux دیگری اجرا کن."
exec node server.js
