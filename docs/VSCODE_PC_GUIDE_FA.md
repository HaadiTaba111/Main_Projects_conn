# 🖥 راهنمای اجرا و کلون روی PC با VSCode

**به‌روزرسانی: ۲ اکتبر ۲۰۲۶ | دو راه — هر دو بدون تایپ پسورد**

---

## ⚙️ پیش‌نیاز (فقط بار اول — هر دو راه)

1. **Node.js:** از [nodejs.org](https://nodejs.org) نسخهٔ **LTS** (دکمهٔ سبز سمت چپ) را نصب کن → Next → Next → Finish.
2. چک کن: یک پنجرهٔ **CMD** باز کن و بزن:
   ```
   node -v
   ```
   باید `v18` یا بالاتر نشان دهد.
3. (فقط برای روش کلون) **Git:** از [git-scm.com](https://git-scm.com/downloads/win) نصب کن — همهٔ گزینه‌ها پیش‌فرض بمانند.

---

## 🟢 روش ۱ — بدون گیت، با زیپ (سریع‌ترین — پیشنهادی برای اجرا)

> فقط دو سیستم ترید را می‌خواهی و هیچ لاگینی نمی‌خواهی؟ همین‌طور که هست!

1. فایل **`trading-labs.zip`** را دانلود کن و Extract کن (مثلاً در `C:\trading-labs`).
2. **دابل‌کلیک روی `start-trading.bat`** 🚀 — دو پنجره باز می‌شود:
   - 🎯 ترید فیوچرز → مرورگر: `http://localhost:8787`
   - 🧭 رادار پامپ/دامپ → مرورگر: `http://localhost:8790`

**با VSCode (دیدن کد + لاگ زنده):**

1. VSCode → منوی **File → Open Folder** → پوشهٔ `trading-labs` را انتخاب کن.
2. ترمینال داخلی را باز کن: کلید **Ctrl + `** (دکمهٔ زیر Esc، کنار عدد ۱).
3. برای دو سرور، ترمینال را دو نیمه کن: کنار علامت **+** فلش کوچک را بزن → **Split Terminal**. در نیمهٔ اول:
   ```
   cd apps\futures-pwa
   ```
   ```
   node server.js
   ```
   در نیمهٔ دوم:
   ```
   cd apps\pump-dump-lab
   ```
   ```
   node server.js
   ```
4. مرورگر: `http://localhost:8787` و `http://localhost:8790`

> ⚠️ هر دستور در یک خط جدا تایپ/کپی شود (نه دو تا در یک خط).

---

## 🔵 روش ۲ — کلون ریپوی خصوصی با VSCode (کل سورس + تاریخچه)

> برای وقتی که کل ریپوی `Main_Projects_conn` (همه پروژه‌ها) را روی PC می‌خواهی. توجه: فایل‌های محرمانهٔ DSA داخل ریپو نیستند؛ پوشهٔ `.dsa_vault` را جداگانه و دستی از همین سیستم کپی کن. لاگین با مرورگر انجام می‌شود — **هیچ پسوردی تایپ نمی‌شود.**

1. VSCode را باز کن → کلید **Ctrl + Shift + P** → تایپ کن:
   ```
   Git: Clone
   ```
   → Enter → این آدرس را بچسبان:
   ```
   https://github.com/HaadiTaba111/Main_Projects_conn.git
   ```
   → Enter → یک پوشه برای ذخیره انتخاب کن (مثلاً `C:\Projects`).
2. پنجرهٔ مرورگر باز می‌شود → **Sign in to GitHub** (با اکانتی که لاگینی) → **Authorize** → برمی‌گردی به VSCode → **Open** / **Yes, I trust the authors**.
3. **انتخاب برنچ درست:** پایین-چپ VSCode روی نام برنچ (مثلاً `main`) کلیک کن → از لیست `arena/01a0f214-main-arena-conn` را انتخاب کن (یا در پنجرهٔ Command Palette تایپ کن `Git: Checkout to...`).
4. اجرا (مثل بالا): ترمینال **Ctrl + `** →
   ```
   cd apps\futures-pwa
   ```
   ```
   node server.js
   ```
   مرورگر: `http://localhost:8787` ✅
   (رادار پامپ در ترمینال دوم: `cd apps\pump-dump-lab` → `node server.js` → `http://localhost:8790`)

---

## 🧪 تست سلامت (اختیاری)

در ترمینال VSCode داخل پوشهٔ `apps\futures-pwa`:
```
npm test
```
باید **۱۴۱ تست سبز** شود (pump-dump-lab: **۳۷**).

## ❓ عیب‌یابی PC

- **`node: command not found` / `node` شناخته نشد** → Node نصب نیست یا CMD قدیمی است؛ سیستم را ری‌استارت کن بعد از نصب.
- **`Authentication failed` هنگام کلون** → لاگین مرورگر انجام نشده؛ دوباره `Git: Clone` را بزن و مرحلهٔ Sign in را کامل کن. (GitHub پسورد قبول نمی‌کند — فقط لاگین مرورگر یا توکن.)
- **🔐 روش ترمینالی با ذخیرهٔ پسورد (بار اول فقط!):** اگر خواستی در CMD/PowerShell کلون کنی، اول یک‌بار بزن:
  ```
  git config --global credential.helper store
  git clone -b arena/01a0f214-main-arena-conn https://github.com/HaadiTaba111/Main_Projects_conn.git
  ```
  موقع کلون فقط **بار اول** می‌پرسد: Username = `HaadiTaba111`، Password = **توکن** (نه پسورد اکانت؛ توکن را از GitHub → Settings → Developer settings → Personal access tokens بساز — در چت برای ایجنت نفرست!). ویندوز آن را ذخیره می‌کند و از دفعهٔ بعد (`git pull` و...) دیگر نمی‌پرسد. (حذف ذخیره: `cmdkey /list | findstr git` و پاک کردن از Credential Manager، یا فایل `%USERPROFILE%\.git-credentials`.)
- **پورت مشغول (`EADDRINUSE`)** → یک `node server.js` دیگر از قبل روشن است؛ پنجرهٔ قبلی را ببند یا Ctrl+C بزن.
- **صفحه باز نمی‌شود** → مطمئن شو در ترمینال پیام `🚀 ... http://localhost:8787` را دیدی و آدرس را دقیق وارد کردی.
- **به‌روزرسانی سورس (روش ۲):** در VSCode ترمینال بزن `git pull` (روی برنچ `arena/01a0f214-main-arena-conn`) و سرورها را ری‌استارت کن.

---

> 📦 یادآوری جداسازی: بستهٔ `trading-labs` فقط دو سیستم ترید را دارد (سبک و مستقل). ریپوی اصلی برای پروژه‌های محرمانه私密 است و همان‌جا می‌ماند. هر دو روش بالا سیستم‌های ترید را یکسان اجرا می‌کنند.

طراح: هادی طباطبایی (TaHa111) 🌹
