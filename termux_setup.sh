#!/data/data/com.termux/files/usr/bin/bash
# پیش‌نیازهای Termux برای کلون و اجرای اتوتریدر و رادار پامپ.
set -e

BRANCH="arena/01a10c56-main-arena-conn"

echo "به‌روزرسانی Termux و نصب Git و Node.js..."
pkg update -y
pkg install -y git nodejs

node -v
git --version

echo
echo "✅ پیش‌نیازها آماده‌اند. برای دریافت شاخهٔ پروژه اجرا کن:"
echo "git clone --depth 1 --branch $BRANCH https://github.com/HaadiTaba111/Main_Arena_conn.git"
echo "اگر ریپو خصوصی است: pkg install gh && gh auth login && gh auth setup-git"
echo "سپس از ریشهٔ ریپو: bash 1-AUTOTRADE.sh یا bash 2-PUMP-RADAR.sh"
