# Main_Projects_conn — مرکز فرماندهی پروژه‌ها

ریپوی یکپارچهٔ پنج پروژه، با یک گاوصندوق محرمانهٔ DSA که **خارج از Git** است.

| # | پروژه | مسیر | نقطهٔ ورود | پورت | ادامهٔ کار |
|---|---|---|---|---|---|
| 1 | ⚡ اتوتریدر فیوچرز مجازی (PWA) | `apps/1-AUTOTRADE-FUTURES-PWA/` | `bash 1-AUTOTRADE.sh` | 8787 | [CONTINUE-FA.md](apps/1-AUTOTRADE-FUTURES-PWA/CONTINUE-FA.md) |
| 2 | 🚀 رادار پامپ/دامپ | `apps/2-PUMP-DUMP-RADAR/` | `bash 2-PUMP-RADAR.sh` | 8790 | [CONTINUE-FA.md](apps/2-PUMP-DUMP-RADAR/CONTINUE-FA.md) |
| 3 | 🎬 لیراکس (LyraX Clip Studio) | `apps/3-LYRAX-CLIP-STUDIO/` | `start_clip_studio.sh` | 5000 | [CONTINUE-FA.md](apps/3-LYRAX-CLIP-STUDIO/CONTINUE-FA.md) |
| 4 | 🧠 مغز شاعر فارسی | `apps/4-PERSIAN-POET-BRAIN/` | `python3 persian_living_brain.py` | — | [CONTINUE-FA.md](apps/4-PERSIAN-POET-BRAIN/CONTINUE-FA.md) |
| 5 | 👁️🖐️ چشم و دست (Qwen Hands & Eyes) | `apps/5-QWEN-HANDS-EYES/` | `python3 main.py` | 8765 | [CONTINUE-FA.md](apps/5-QWEN-HANDS-EYES/CONTINUE-FA.md) |

## تست همهٔ پروژه‌ها
```bash
cd apps/1-AUTOTRADE-FUTURES-PWA && npm test && npm run check
cd apps/2-PUMP-DUMP-RADAR && npm test && npm run check
cd apps/3-LYRAX-CLIP-STUDIO && python3 -m unittest tests.test_cube_preview tests.test_effect_plugins
cd apps/4-PERSIAN-POET-BRAIN && python3 -m unittest discover -s tests
cd apps/5-QWEN-HANDS-EYES && python3 -m unittest discover -s tests
```

## 🔒 DSA و داده‌های محرمانه
- پوشهٔ `.dsa_vault/` (مستندات، هستهٔ DSA، بنچمارک‌ها، پشتیبان) در `.gitignore` است و **نباید** وارد Git یا GitHub شود. جزئیات در `.dsa_vault/README-FA.md`.
- یکپارچگی فایل‌های گاوصندوق: `cd .dsa_vault && sha256sum -c MANIFEST.sha256`.
- کلیدهای API و `.env` هرگز commit نشوند (در `.gitignore` پوشش داده شده‌اند).

## آرشیو و منابع
- `Main_Arena_conn_current.zip`: بستهٔ کامل مبدأ (شامل پشتیبان‌های `Backup_zip/`).
- `futures-pwa-v2.1.zip`، `lyrax-*.zip`: بسته‌های منبع؛ محتوای آن‌ها در `apps/` و `archive/` / `experiments/` پوشه شده است.
- راهنمای کلی قبلی: [README-FA.md](README-FA.md)، [START-HERE.md](START-HERE.md)، [PROJECTS_MAP_FA.md](PROJECTS_MAP_FA.md).

> ⚠️ معاملات این ریپو Paper/آزمایشی هستند؛ سفارش واقعی فقط با درک ریسک و Backend امن فعال شود.
