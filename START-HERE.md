# شروع سریع: اتوتریدر و رادار پامپ روی Termux

هر دو برنامه مستقل و بدون وابستگی npm هستند؛ فقط Node.js 18+ لازم است.

| برنامه | مسیر رسمی | پورت |
|---|---|---:|
| اتوتریدر فیوچرز PWA (Paper پیش‌فرض) | `apps/1-AUTOTRADE-FUTURES-PWA/` | 8787 |
| رادار پامپ/دامپ | `apps/2-PUMP-DUMP-RADAR/` | 8790 |

## کلون در Termux

```bash
pkg update -y && pkg install -y git nodejs
node -v   # نسخهٔ 18 یا جدیدتر

git clone --depth 1 --branch arena/01a10c56-main-arena-conn https://github.com/HaadiTaba111/Main_Arena_conn.git
cd Main_Arena_conn
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
cd ~/Main_Arena_conn
bash 2-PUMP-RADAR.sh
```

مرورگر همان گوشی را باز کن:

- اتوتریدر: `http://localhost:8787`
- رادار پامپ/دامپ: `http://localhost:8790`

هر دو سرور روی `0.0.0.0` گوش می‌دهند و صفحه را از مرورگر گوشی باز می‌کنند. برای توقف، در نشست مربوطه `Ctrl+C` بزن.

## تست و به‌روزرسانی

```bash
cd ~/Main_Arena_conn/apps/1-AUTOTRADE-FUTURES-PWA && npm test && npm run check
cd ~/Main_Arena_conn/apps/2-PUMP-DUMP-RADAR && npm test && npm run check
cd ~/Main_Arena_conn && git pull --ff-only origin arena/01a10c56-main-arena-conn
```

برای تست‌ها `npm install` لازم نیست؛ پروژه‌ها به پکیج خارجی نیاز ندارند.

> **توجه:** اتوتریدر در حالت Paper شروع می‌شود. آزمون‌های خودکار و بک‌تست، سودآوری آینده را تضمین نمی‌کنند. سفارش واقعی را فقط با درک ریسک و Backend امنی که خودت پیکربندی کرده‌ای فعال کن؛ کلیدهای API را در کد یا مرورگر قرار نده. هر دو سرور بدون احراز هویت‌اند؛ فقط روی شبکهٔ مورداعتماد اجرا کن و پورت‌ها را عمومی نکن.
