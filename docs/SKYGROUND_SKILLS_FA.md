# اتصال «مامور چشم و دست» (SkyGround) به پروژهٔ فیوچرز

«مامور چشم و دست و مغز آفلاین» = ایجنت **SkyGround** در `archive/raw/hand_eye.zip`:
- **مغز** = مدل آفلاین Ollama
- **دست** = اجرای دستور (`agent.py` / `reflex_engine.py`)
- **چشم** = دیدن دسکتاپ (`desktop_io.py`)
- **skill ها** = `skill_registry.py` با فرمت `SkillDefinition` (name/description/parameters/steps/…)

## نام‌گذاری به نام پروژه (درخواست تو)
همهٔ skill های این پروژه با پیشوند **`futures-scalp-lab.`** شروع می‌شن تا راحت
پیدا بشن: `selftest`, `auto-paper`, `sweep`, `update`.
فایل آماده: `apps/futures-scalp-lab/skyground/futures.skills.json`.

## فعال‌سازی
1. Ollama رو روشن کن.
2. توی `config.json` ایجنت، مسیر `skills_file` رو بذار روی:
   `apps/futures-scalp-lab/skyground/futures.skills.json`
   (یا محتوای اون رو با skill های فعلی‌ات merge کن).
3. اجرا: `python agent.py --config config.json`
4. جلوی `You>` بنویس: «skill Futures-scalp-lab.sweep رو اجرا کن» — ایجنت با
   سطح امنیتیِ تعریف‌شده (approval برای اجرا/سویپ) ازت تأیید می‌گیره و انجام می‌ده.

## نکتهٔ امنیت
skill های اجرایی (`auto-paper`, `sweep`, `update`) روی `safety_level=approval`
تنظیم شدن تا ایجنت بدون تأیید تو چیزی اجرا نکنه — همون مدل ایمنی خود SkyGround.
همهٔ اجرای فیوچرز هنوز **PAPER** است؛ LIVE فعال نیست.
