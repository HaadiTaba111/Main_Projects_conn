# 🧠 مغز شاعر فارسی (Persian Poet Brain)

سه بخش دارد:

| بخش | فایل | وابستگی |
| --- | --- | --- |
| چت زنده + بازخورد + تقطیر | `persian_living_brain.py` | فقط کتابخانهٔ استاندارد پایتون (روی Termux هم اجرا می‌شود) |
| آموزش پیوسته (Continual SFT + QLoRA) | `continual/poet_continual_sft.py` | torch / transformers / peft — PC با GPU |
| سنجه‌های یادگیری پیوسته (ACC/BWT/Forgetting/FWT) | `continual/continual_eval.py` | فقط کتابخانهٔ استاندارد |

---

## ۱. چت زندهٔ شاعر

```bash
cd apps/4-PERSIAN-POET-BRAIN
python3 persian_living_brain.py
```

دستورهای ویژهٔ داخل چت:

| دستور | کار |
| --- | --- |
| `[like]` / `[dislike]` | ثبت بازخورد روی پاسخ قبلی |
| `[correct: جواب درست]` | تصحیح فوری + ذخیره در حافظهٔ موقت |
| `[learn_url: http://...]` | خواندن و یادگیری از لینک وب |
| `[distill]` | تقطیر آموخته‌های امروز به دیتاست آموزش دائمی |
| `[metrics]` | نمایش سنجه‌های یادگیری پیوسته از `continual/results.json` |
| `exit` | خروج |

دیتاست و بافر حافظه کنار خود برنامه و در `datasets/` ذخیره می‌شوند؛ همان جایی که آموزش پیوسته از آن می‌خواند:

```text
datasets/persian_poet_satire_sft.jsonl   # دیتاست آموزش (ورودی + خروجی بازخورد کاربر)
datasets/persian_rag_buffer.json         # بافر موقت RAG
```

## ۲. آموزش پیوسته — یک فرمان

```bash
cd apps/4-PERSIAN-POET-BRAIN
bash continual/run_poet_continual.sh
```

این اسکریپت چهار گام را پشت سر هم می‌رود:

۱. **آماده‌سازی:** `continual/prepare_poet_tasks.py` دیتاست را بر اساس `category` به تسک‌های جدا تقسیم می‌کند و `continual/config.poet.json` را می‌سازد:

```text
continual/data/classical_poetry.jsonl   # سعدی/حافظ
continual/data/mystical_rumi.jsonl       # مولانا
continual/data/proverbs_wisdom.jsonl     # ضرب‌المثل و حکمت
continual/data/satire_humor.jsonl        # طنز (عبید/دهخدا)
```

۲. **خودآزمایی:** هر دو ماژول ۱۰ آزمون داخلی دارند و بدون GPU اجرا می‌شوند.
۳. **آموزش ترتیبی:** هر تسک به‌ترتیب آموزش داده می‌شود و بعد از هر مرحله، مدل روی **همهٔ** تسک‌های دیده‌شده ارزیابی می‌شود؛ نتیجه در ماتریس R می‌نشیند (`continual/results.json`).
۴. **گزارش:** `continual_eval.py` سنجه‌ها را چاپ می‌کند.

> ⚠️ گام ۳ روی Termux اجرا نمی‌شود (نیاز به torch و حافظهٔ زیاد). گام‌های ۱، ۲ و ۴ روی گوشی هم کار می‌کنند؛ آموزش را روی PC با GPU بزن:
> ```bash
> pip install -r requirements-train.txt
> ```

### گام‌های دستی (اگر خواستی تفکیک کنی)

```bash
python3 continual/prepare_poet_tasks.py                       # ساخت تسک‌ها + config
python3 continual/poet_continual_sft.py --selftest            # آزمون بدون GPU
python3 continual/poet_continual_sft.py --config continual/config.poet.json
python3 continual/continual_eval.py continual/results.json    # گزارش ACC/BWT/Forgetting
```

### از آداپتور LoRA تا مدل نهایی

```bash
# ادغام آداپتور در وزن‌ها
python3 continual/poet_continual_sft.py --merge <base_model> continual/out/stage3_satire_humor merged_out
# ساخت فرمان تبدیل به GGUF (اجرا نمی‌کند، فقط دستور را می‌سازد)
python3 continual/poet_continual_sft.py --gguf-command merged_out model.gguf
```

> روی فایل `.gguf` آموزش داده نمی‌شود؛ GGUF فقط قالب استنتاج است. ترتیب درست: آموزش → ادغام → GGUF → استنتاج.

## ۳. جایی که مکانیزم خصوصی تو وصل می‌شود (seam)

`continual/poet_continual_sft.py` هیچ محتوایی از مکانیزم DSA ندارد؛ فقط دو درز باز گذاشته است:

| درز | کاربرد |
| --- | --- |
| `--config ... "attention_hook": "module:callable"` یا متغیر محیطی `POET_ATTENTION_HOOK` | تابعی که روی لایه‌های توجه نصب می‌شود: `hook(module, args, output, ctx) -> Optional[Tensor]`؛ خروجی `None` یعنی دست نزن |
| `--config ... "hook_layer_pattern"` | الگوی نام لایه‌های توجه (پیش‌فرض `self_attn`) |

تا وقتی هوکی وصل نشده باشد، `NoOpAttentionHook` فعال است و آموزش دقیقاً QLoRA استاندارد می‌ماند.

## ۴. تست‌ها

```bash
cd apps/4-PERSIAN-POET-BRAIN
python3 -m unittest discover -s tests -v      # ۱۳ تست، بدون GPU
```

پوشش: خودآزمایی هر دو ماژول، تقطیر دیتاست واقعی به تسک‌ها، بارگذاری فایل‌های تسک با خوانندهٔ آموزش، اعتبارسنجی ماتریس R و سنجه‌ها، گزارش `[metrics]` در مغز زنده، و اینکه بازخورد کاربر واقعاً به دیتاست آموزش می‌رسد.
