#!/usr/bin/env bash
set -e

echo "═════════════════════════════════════════════════════════════════"
echo " 🚀 دستیار همگام‌سازی و پوش خودکار VS Code به Arena"
echo " مخزن: Main_Projects_conn | شاخه: arena/578b8ae6-main-projects-conn"
echo "═════════════════════════════════════════════════════════════════"

echo "📥 [1/4] دریافت آخرین تغییرات از گیت‌هاب..."
git fetch origin refs/heads/arena/578b8ae6-main-projects-conn
git pull origin arena/578b8ae6-main-projects-conn --no-rebase

echo "💻 [2/4] باز کردن VS Code..."
code . || true

echo "─────────────────────────────────────────────────────────────────"
read -p "پس از پایان کار، اینتر را بزنید تا تغییرات خودکار Push شوند: "

echo "📦 [3/4] استیج تغییرات..."
git add -A
git commit -m "update: synced work from local VS Code on $(date)" || echo "تغییری برای کامیت وجود نداشت."

echo "🚀 [4/4] ارسال به Arena..."
git push origin arena/578b8ae6-main-projects-conn
echo "🎉 همه‌چیز ذخیره شد داداش!"
