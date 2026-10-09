#!/usr/bin/env bash
# اتوتریدر فیوچرز PWA — اجرا از هر پوشه‌ای، مناسب Linux و Termux.
set -e

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT_DIR/apps/1-AUTOTRADE-FUTURES-PWA"

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
echo "🚀 اتوتریدر فیوچرز: http://localhost:8787"
echo "ℹ️ حالت Paper پیش‌فرض است؛ برای اجرای سرور Ctrl+C بزن."
exec node server.js
