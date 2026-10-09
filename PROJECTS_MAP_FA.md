# 🗺️ نقشهٔ پروژه‌های TaHa111

مخزن: `HaadiTaba111/Main_Arena_conn`

شاخهٔ این انتشار: `arena/01a10c56-main-arena-conn`

## برنامه‌های شاخص

| برنامه | مسیر رسمی | توضیح / پورت |
|---|---|---|
| ⚡ اتوتریدر فیوچرز PWA | `apps/1-AUTOTRADE-FUTURES-PWA/` | دیتای عمومی بازار، Paper پیش‌فرض، داشبورد روی `8787` |
| 🚀 رادار پامپ/دامپ | `apps/2-PUMP-DUMP-RADAR/` | رادار مستقل و Paper trading روی `8790` |
| 🎬 LyraX Clip Studio | `apps/3-LYRAX-CLIP-STUDIO/` | استودیو تولید کلیپ |
| 🧠 Persian Poet Brain | `apps/4-PERSIAN-POET-BRAIN/` | مغز و مجموعه‌دادهٔ شاعر فارسی |
| 👁️🖐️ Qwen Hands & Eyes | `apps/5-QWEN-HANDS-EYES/` | ایجنت Qwen با زیرسامانه‌های چشم و دست |

هر دو برنامهٔ بازار مستقل‌اند و برای اجرا فقط به Node.js 18+ نیاز دارند؛ `npm install` لازم نیست.

## اجرای سریع در Termux

```bash
pkg update -y && pkg install -y git nodejs
git clone --depth 1 --branch arena/01a10c56-main-arena-conn https://github.com/HaadiTaba111/Main_Arena_conn.git
cd Main_Arena_conn
bash 1-AUTOTRADE.sh       # پورت 8787؛ نشست اول
bash 2-PUMP-RADAR.sh      # پورت 8790؛ در نشست دوم
```

جزئیات و تست‌ها در [`START-HERE.md`](START-HERE.md) و [`docs/TERMUX_MOBILE_GUIDE_FA.md`](docs/TERMUX_MOBILE_GUIDE_FA.md) هستند.
