# اجرای اتوتریدر و رادار پامپ در Termux

این راهنما برای شاخهٔ `arena/01a10c56-main-arena-conn` و پوشه‌های رسمی فعلی نوشته شده است. دو برنامهٔ Node.js مستقل‌اند و برای اجرا به کامپیوتر یا `npm install` نیاز ندارند.

## ۱. نصب پیش‌نیازها

Termux را از F-Droid یا منبع رسمی نصب کن، سپس:

```bash
pkg update -y
pkg install -y git nodejs
node -v   # Node.js 18 یا جدیدتر
```

## ۲. کلون شاخه

```bash
git clone --depth 1 --branch arena/01a10c56-main-arena-conn https://github.com/HaadiTaba111/Main_Arena_conn.git
cd Main_Arena_conn
```

اگر ریپو خصوصی است، اول GitHub CLI را نصب و با جریان ورود مرورگری احراز هویت کن؛ نیازی به فرستادن یا ذخیرهٔ دستی توکن نیست:

```bash
pkg install -y gh
gh auth login
gh auth setup-git
```

سپس دستور `git clone` بالا را اجرا کن.

## ۳. اجرای دو برنامه

در نشست اول Termux:

```bash
cd ~/Main_Arena_conn
bash 1-AUTOTRADE.sh
```

برای اجرای هم‌زمان رادار، یک نشست تازه باز کن و بزن:

```bash
cd ~/Main_Arena_conn
bash 2-PUMP-RADAR.sh
```

صفحه‌ها را در مرورگر همان گوشی باز کن:

- اتوتریدر فیوچرز PWA: `http://localhost:8787`
- رادار پامپ/دامپ: `http://localhost:8790`

مسیرهای برنامه‌ها:

- `apps/1-AUTOTRADE-FUTURES-PWA/`
- `apps/2-PUMP-DUMP-RADAR/`

هر دو سرور روی `0.0.0.0` گوش می‌دهند. برای توقف هر سرور در نشست مربوطه `Ctrl+C` بزن. اگر می‌خواهی Termux هنگام خاموش‌شدن صفحه متوقف نشود، اختیاری `termux-wake-lock` را اجرا کن و محدودیت باتری Termux را بردار.

## ۴. تست و به‌روزرسانی

تست‌ها و بررسی نحو جاوااسکریپت، بدون نصب وابستگی خارجی:

```bash
cd ~/Main_Arena_conn/apps/1-AUTOTRADE-FUTURES-PWA
npm test && npm run check

cd ~/Main_Arena_conn/apps/2-PUMP-DUMP-RADAR
npm test && npm run check
```

برای دریافت نسخهٔ بعدی:

```bash
cd ~/Main_Arena_conn
git pull --ff-only origin arena/01a10c56-main-arena-conn
```

## عیب‌یابی کوتاه

- `node: command not found`: `pkg install -y nodejs` را اجرا کن.
- صفحه باز نمی‌شود: مطمئن شو سرور در نشست Termux هنوز در حال اجراست و آدرس/پورت درست است.
- `destination path already exists`: وارد پوشهٔ موجود شو و `git pull --ff-only origin arena/01a10c56-main-arena-conn` بزن؛ برای حفظ فایل‌های گوشی پوشه را پاک نکن.
- خطای احراز هویت برای ریپوی خصوصی: از `gh auth login` و `gh auth setup-git` استفاده کن؛ رمز یا توکن را در چت نفرست.

> **امنیت و ریسک مالی:** هر دو سرور بدون احراز هویت‌اند؛ فقط روی شبکهٔ مورداعتماد اجرا کن و پورت را عمومی نکن. اتوتریدر به‌صورت پیش‌فرض Paper است. تست و بک‌تست، سودآوری را تضمین نمی‌کنند. سفارش واقعی فقط از طریق Backend امنی که خودت پیکربندی کرده‌ای قابل تنظیم است؛ کلید خصوصی صرافی را در کد یا مرورگر قرار نده.
