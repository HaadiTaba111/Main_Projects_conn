# 🧠 مغز شاعر فارسی (Persian Poet Brain) — نقطهٔ ادامهٔ کار

**وضعیت:** آماده برای ادامه. تست‌ها (۱۳ مورد) سبز هستند و سنجهٔ ACC نمونه ۰٫۸۷۲۵ است.

## اجرا
```bash
cd apps/4-PERSIAN-POET-BRAIN
python3 persian_living_brain.py          # چت زنده (فقط کتابخانهٔ استاندارد)
bash continual/run_poet_continual.sh     # آموزش پیوسته (نیاز به PC با GPU برای گام ۳)
```

## تست
```bash
cd apps/4-PERSIAN-POET-BRAIN && python3 -m unittest discover -s tests
python3 continual/continual_eval.py
```

## ساختار مهم
| مسیر | کار |
|---|---|
| `persian_living_brain.py` | چت، بازخورد، RAG موقت و تقطیر به دیتاست |
| `datasets/persian_poet_satire_sft.jsonl` | دیتاست اصلی SFT |
| `generate_persian_poet_dataset.py` | تولید دیتاست |
| `continual/` | خط لولهٔ یادگیری پیوسته (تسک‌ها، آموزش، ارزیابی) |
| `train_qwen_poet_dsa.py` | اسکریپت آموزش Qwen+QLoRA (RTX 3060) |

## گام‌های بعدی پیشنهادی
- افزودن تسک‌های بیشتر به `continual/data/` و اجرای کامل ماتریس R.
- نگه‌داشتن `datasets/` و `results.json` به‌عنوان خروجی قابل بازتولید.

> 🔒 پارامترهای محرمانهٔ DSA (λ، γ، w_min) در کد نیستند. `dsa_params.py` آن‌ها را از متغیرهای محیطی `DSA_LAMBDA` / `DSA_GAMMA` / `DSA_MIN_WEIGHT` یا از `.dsa_vault/params/dsa_params.json` می‌خواند؛ اگر هیچ‌کدام نباشد، اجرا با خطای صریح متوقف می‌شود. `train_qwen_poet_dsa.py` از Git بیرون است (`.gitignore`). مستندات کامل DSA در `.dsa_vault/` نگهداری می‌شود.
