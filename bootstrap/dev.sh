#!/usr/bin/env bash
# اجرای خودکار پروژه (داخل خود ریپو): داشبورد :8000 + سرویس چشم‌ودست :8765
set -e; cd "$(dirname "$0")/.."
echo "==> آپدیت کد (اگر گیت تمیز باشد)"; git pull --ff-only 2>/dev/null || echo "آپدیت رد شد (تغییر محلی دارید) — ادامه با همین نسخه"
pkill -f "http.server 8000" 2>/dev/null || true; pkill -f "eye-hand-service/app.py" 2>/dev/null || true; sleep .5
cd agent-router-dashboard
nohup python3 -m http.server 8000 --bind 0.0.0.0 >/tmp/dashboard.log 2>&1 &
(cd eye-hand-service && nohup python3 app.py >/tmp/eyehand.log 2>&1 &)
sleep 1
echo "✅ داشبورد:  http://127.0.0.1:8000"
echo "✅ سرویس چشم‌ودست: http://127.0.0.1:8765/health"
curl -s http://127.0.0.1:8765/health || true; echo
