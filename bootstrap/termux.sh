#!/data/data/com.termux/files/usr/bin/bash
# ===== نصب و اجرای خودکار در Termux — فقط همین یک فایل را اجرا کنید =====
set -e
REPO="https://github.com/HaadiTaba111/Main_Projects_conn.git"
BRANCH="arena/2f3dab30-main-projects-conn"; DIR="$HOME/Main_Projects_conn"
pkg update -y && pkg install -y git python
if [ -d "$DIR/.git" ]; then cd "$DIR" && git pull --ff-only || true
else git clone -b "$BRANCH" "$REPO" "$DIR"; cd "$DIR"; fi
bash bootstrap/dev.sh
echo "==> بازکردن داشبورد در مرورگر گوشی..."
termux-open-url http://127.0.0.1:8000 2>/dev/null || echo "خودتان باز کنید: http://127.0.0.1:8000"
echo "نکته: در ترموکس xdotool نیست؛ دست در حالت شبیه‌سازی کار می‌کند. برای دست واقعی، سرویس را روی اوبونتو اجرا کنید."
