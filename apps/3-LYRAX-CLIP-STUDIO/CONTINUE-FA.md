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

## کلیدهای تریگر دستی (۵ کلید)
| کلید | افکت | توضیح |
|---|---|---|
| `1` | ⚡ رعد معمولی | tier 1 |
| `2` | ⚡ رعد کلفت‌تر | tier 2 |
| `3` | 🌩️ رعد قوی و شاخه‌دار | tier 3 |
| `4` | 🌌 رعد طبیعی | tier 4 — الگوی storm؛ پارامترهای `naturalBranches` و `naturalSpread` |
| `5` | 🎆 آتش‌بازی | fireworks «یک انفجار» |

کلیدها از `manual_triggers[].hotkey` در هر پلاگین خوانده می‌شوند (`EffectLayerHost.hotkeyMap`). اگر لایهٔ آن افکت نباشد، خودکار با حالت دستی ساخته می‌شود. نسخهٔ مستقل: `experiments/lightning_storm_5keys.html` (با پنل پارامتر).

## اجرا
```bash
bash apps/3-LYRAX-CLIP-STUDIO/bootstrap_termux.sh   # یا bootstrap_pc.sh (نصب)
bash apps/3-LYRAX-CLIP-STUDIO/start_clip_studio.sh  # http://127.0.0.1:5000
```
نیازمندی‌ها: `requirements.txt` (Flask, MoviePy, Pillow, …) و FFmpeg برای رندر.

## تست
```bash
cd apps/3-LYRAX-CLIP-STUDIO
python3 -m unittest tests.test_cube_preview tests.test_effect_plugins tests.test_lightning_natural_keys
node tests/cube_preview.test.mjs && node tests/word_reveal.test.mjs && node tests/lightning_natural.test.mjs
```
تست `lightning_natural` هندسهٔ رعد طبیعی در JS را با خروجی Python مقایسه می‌کند؛ اگر یکی را تغییر دادی، هر دو را هم‌تراز کن.

## گام‌های بعدی پیشنهادی
- یکپارچه‌سازی افکت‌ها (`backend/effects/`) و حذف کدهای تکراری بین `static/js` و `experiments/`.
- ارتقای `PROMPT_MASTER.md` به مشخصات رسمی محصول.
- پوشهٔ `projects/` کاربر در `.gitignore` است؛ فقط `sample_clip` در Git می‌ماند.
