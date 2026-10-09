#!/usr/bin/env bash
# ═════════════════════════════════════════════════════════════════
#  🚀 لانچر و اتاق فرمان ۱ کلیکه اوبونتو / WSL2 ویندوز
# ═════════════════════════════════════════════════════════════════

cd "$(dirname "$0")"

# باز کردن خودکار داشبورد در مرورگر ویندوز یا لینوکس
if grep -qi microsoft /proc/version 2>/dev/null || [ -f /proc/sys/fs/binfmt_misc/WSLInterop ]; then
    # محیط WSL2 ویندوز: باز کردن در مرورگر اصلی ویندوز (Chrome / Edge / Firefox)
    (sleep 1 && cmd.exe /c start "http://localhost:9000" > /dev/null 2>&1) &
elif command -v xdg-open > /dev/null; then
    (sleep 1 && xdg-open "http://localhost:9000" > /dev/null 2>&1) &
elif command -v wslview > /dev/null; then
    (sleep 1 && wslview "http://localhost:9000" > /dev/null 2>&1) &
fi

# اجرای لانچر جامع پایتون ۳
python3 launcher.py --port 9000 "$@"
