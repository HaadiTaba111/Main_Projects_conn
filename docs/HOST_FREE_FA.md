# تست رایگان چند روزه: هسته روی ابر + داشبورد روی گوشی

هدف: بدون VPS و بدون روشن ماندن PC، «هسته» روی اینترنت اجرا شود و از گوشی
وضعیت را ببینی. ترکیب رایگان:

- **هسته (اجرای لب):** GitHub Actions — رایگان، هر ۶ ساعت یا دستی (`ci/scalplab-cloud.yml`).
  خروجی: Artifact (jsonl کامل، ۹۰ روز) + commit گزارش‌ها + به‌روزرسانی
  `apps/dsa-command-dashboard/public/scalp-report.json`.
- **داشبورد (نمایش روی گوشی):** Vercel — رایگان. با هر commit جدید خودکار
  redeploy می‌شود و آخرین گزارشِ commit‌شده را از `public/scalp-report.json`
  می‌خواند (بدون نیاز به فایل لوکال یا توکن).

## راه‌اندازی Vercel (یک‌بار، چند کلیک)
1. برو به vercel.com و با GitHub لاگین کن.
2. **Add New → Project** و ریپوی `Main_Arena_conn` را انتخاب کن.
3. در تنظیمات، **Root Directory** را بگذار: `apps/dsa-command-dashboard`
4. **Framework Preset** = Next.js (خودش تشخیص می‌دهد). Build/Install را دست نزن.
5. Deploy کن. آدرس `*.vercel.app` را روی گوشی باز کن → صفحهٔ `/scalp-lab`.

از این به بعد: Actions اجرا می‌کند → گزارش commit می‌شود → Vercel خودکار
redeploy → روی گوشی وضعیتِ تازه را می‌بینی. همه رایگان، بدون VPS.

## محدودیت‌ها (شفاف)
- این فقط **نمایش/تست** است؛ دادهٔ نمایشی یا گزارشِ Actions است، نه معاملهٔ زنده.
- Actions «daemon دائمی» نیست؛ هر چند ساعت یک batch اجرا می‌کند.
- برای اجرای دائمی و زنده، در نهایت VPS لازم است (`deploy/ROADMAP_VPS_GO_FA.md`).
