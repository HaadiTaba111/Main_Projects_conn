# شروع سریع: اتوتریدر و رادار پامپ روی Termux

هر دو برنامه مستقل و بدون وابستگی npm هستند؛ فقط Node.js 18+ لازم است.

| برنامه | مسیر رسمی | پورت |
|---|---|---:|
| اتوتریدر فیوچرز PWA (Paper پیش‌فرض) | `apps/1-AUTOTRADE-FUTURES-PWA/` | 8787 |
| رادار پامپ/دامپ | `apps/2-PUMP-DUMP-RADAR/` | 8790 |

## داشبورد (راه سریع برای همهٔ سیستم‌ها)

```bash
bash dashboard.sh          # Termux / Linux / WSL2   →  http://localhost:8700
dashboard.bat              # Windows (داخل پوشهٔ ریپو دابل‌کلیک کن)
```

روی شمارهٔ هر سیستم (۱ تا ۵) بزن تا اجرا شود؛ کلیدهای ۱ تا ۵ هم همین کار را می‌کنند. دکمه‌های ■ توقف، 📜 لاگ و «اجرای تست‌ها» هم روی هر کارت هست.

- پیش‌فرض فقط روی همین دستگاه باز است. برای گوشی یا شبکه: `HOST=0.0.0.0 bash dashboard.sh`
- داشبورد فقط دستورهای تعریف‌شده در `dashboard/systems.json` را اجرا می‌کند.
- برای اپ‌های ۴ و ۵ پوشهٔ `.dsa_vault` را دستی کپی کن (وارد Git نمی‌شود).

## کلون در Termux

```bash
pkg update -y && pkg install -y git nodejs
node -v   # نسخهٔ 18 یا جدیدتر

git clone --depth 1 --branch arena/578b8ae6-main-projects-conn https://github.com/HaadiTaba111/Main_Projects_conn.git
cd Main_Projects_conn
```

اگر ریپو خصوصی است، پیش از `git clone` با GitHub CLI وارد شو؛ توکن را در فایل یا چت ذخیره نکن:

```bash
pkg install -y gh
gh auth login
gh auth setup-git
```

## اجرا

در نشست اول Termux:

```bash
bash 1-AUTOTRADE.sh
```

در نشست دوم (برای اجرای هم‌زمان هر دو برنامه):

```bash
cd ~/Main_Projects_conn
bash 2-PUMP-RADAR.sh
```

مرورگر همان گوشی را باز کن:

- اتوتریدر: `http://localhost:8787`
- رادار پامپ/دامپ: `http://localhost:8790`

هر دو سرور روی `0.0.0.0` گوش می‌دهند و صفحه را از مرورگر گوشی باز می‌کنند. برای توقف، در نشست مربوطه `Ctrl+C` بزن.

## تست و به‌روزرسانی

```bash
cd ~/Main_Projects_conn/apps/1-AUTOTRADE-FUTURES-PWA && npm test && npm run check
cd ~/Main_Projects_conn/apps/2-PUMP-DUMP-RADAR && npm test && npm run check
cd ~/Main_Projects_conn && git pull --ff-only origin arena/578b8ae6-main-projects-conn
```

برای تست‌ها `npm install` لازم نیست؛ پروژه‌ها به پکیج خارجی نیاز ندارند.

> **توجه:** اتوتریدر در حالت Paper شروع می‌شود. آزمون‌های خودکار و بک‌تست، سودآوری آینده را تضمین نمی‌کنند. سفارش واقعی را فقط با درک ریسک و Backend امنی که خودت پیکربندی کرده‌ای فعال کن؛ کلیدهای API را در کد یا مرورگر قرار نده. هر دو سرور بدون احراز هویت‌اند؛ فقط روی شبکهٔ مورداعتماد اجرا کن و پورت‌ها را عمومی نکن.
