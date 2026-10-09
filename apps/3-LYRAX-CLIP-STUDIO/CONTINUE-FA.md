# 🎬 LyraX Clip Studio (لیراکس) — نقطهٔ ادامهٔ کار

**وضعیت:** آماده برای ادامه. تست‌های Python (۳۶ مورد) و Node (کیوب و کلمه‌به‌کلمه) سبز هستند.

## همهٔ نسخه‌های لیراکس در این پروژه
| مسیر | توضیح |
|---|---|
| `app.py` + `backend/` + `templates/` + `static/` | **نسخهٔ اصلی** استودیو (Flask) |
| `static/cube-studio/` | استودیوی مکعب سه‌بعدی |
| `skyground_project/` | نسخهٔ عامل SkyGround (ایجنت) |
| `secure_wake_prototype/` | نمونهٔ اولیهٔ امنیتی بیدارباش |
| `experiments/lyrax-optimized/` | نسخهٔ بهینه‌شده (از `lyrax-optimized.zip`) |
| `experiments/lyrax-3d-cube/` | مکعب سه‌بعدی (از `lyrax-3d-cube.zip`) |
| `experiments/lyrax-test.html`, `lightning_storm.html` | صفحات تست مستقل |

## اجرا
```bash
bash apps/3-LYRAX-CLIP-STUDIO/bootstrap_termux.sh   # یا bootstrap_pc.sh (نصب)
bash apps/3-LYRAX-CLIP-STUDIO/start_clip_studio.sh  # http://127.0.0.1:5000
```
نیازمندی‌ها: `requirements.txt` (Flask, MoviePy, Pillow, …) و FFmpeg برای رندر.

## تست
```bash
cd apps/3-LYRAX-CLIP-STUDIO
python3 -m unittest tests.test_cube_preview tests.test_effect_plugins
node tests/cube_preview.test.mjs && node tests/word_reveal.test.mjs
```

## گام‌های بعدی پیشنهادی
- یکپارچه‌سازی افکت‌ها (`backend/effects/`) و حذف کدهای تکراری بین `static/js` و `experiments/`.
- ارتقای `PROMPT_MASTER.md` به مشخصات رسمی محصول.
- پوشهٔ `projects/` کاربر در `.gitignore` است؛ فقط `sample_clip` در Git می‌ماند.
