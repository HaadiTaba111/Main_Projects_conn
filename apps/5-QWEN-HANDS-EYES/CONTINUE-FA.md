# 👁️🖐️ Qwen Hands & Eyes (چشم و دست) — نقطهٔ ادامهٔ کار

**وضعیت:** آماده برای ادامه. ۳۲ تست واحد سبز هستند.

## اجرا
```bash
cd apps/5-QWEN-HANDS-EYES
bash install.sh                          # نصب نیازمندی‌های اختیاری (mss، pyautogui، …)
python3 main.py --config config/config.json --port 8765
```
- داشبورد: `http://localhost:8765`
- مدل‌ها از طریق Ollama (`http://localhost:11434`) تنظیم می‌شوند؛ کلیدهای API را در `config.json` ننویس — از متغیر محیطی استفاده کن.

## تست
```bash
cd apps/5-QWEN-HANDS-EYES && python3 -m unittest discover -s tests
```

## ساختار مهم
| مسیر | کار |
|---|---|
| `main.py` | ورودی اصلی (ایجنت + داشبورد + API) |
| `core/brain_router.py` | مسیریاب دو مغز (Qwen و DeepSeek-R1) |
| `core/approval_guard.py` | دروازهٔ تأیید برای عملیات حساس |
| `eyes/` | ضبط صفحه، VLM، مکان‌یاب بصری |
| `hands/` | ماوس/کیبورد، اجرای فرمان، ویرایش فایل، عملیات وب |
| `feet/` | API موبایل (REST/WebSocket) |
| `core/memory_engine.py` | حافظهٔ SQLite با مدل فراموشی-نه (Fade-Not-Forget) |

## گام‌های بعدی پیشنهادی
- تست end-to-end با Ollama روی سیستم واقعی.
- سخت‌سازی `approval_guard` قبل از فعال‌سازی `hands/` روی شبکهٔ عمومی.

> ⚠️ هیچ‌وقت سرور را روی اینترنت عمومی باز نکن؛ دست‌ها (کنترل کامپیوتر) نیاز به تأیید دارند.
