#!/usr/bin/env bash
set -e
echo "==> نصب پیش‌نیازهای اوبونتو 22.04 (Python داخلی + xdotool)"
sudo apt-get update && sudo apt-get install -y python3 xdotool
mkdir -p ~/page-logs /tmp
DIR="$(cd "$(dirname "$0")" && pwd)"
echo "==> ساخت سرویس systemd کاربر (بدون sudo دائمی)"
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/eye-hand.service <<EOF
[Unit]
Description=AgentRouter Eye (log) & Hand (shortcut) service
After=graphical-session.target
[Service]
ExecStart=/usr/bin/python3 $DIR/app.py
Environment=DISPLAY=:0
Environment=EH_LOG_ROOTS=/tmp:$HOME/page-logs:/var/log
Restart=on-failure
[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now eye-hand.service
sleep 1; curl -s http://127.0.0.1:8765/health; echo
echo "✅ آماده است: داشبورد را باز کنید → تب «چشم و دست» → بررسی اتصال"
echo "لاگ نمونه:  python3 ../tools/make_sample_page_log.py"
