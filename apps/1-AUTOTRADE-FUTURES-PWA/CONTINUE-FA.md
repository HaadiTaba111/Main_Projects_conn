# ⚡ اتوتریدر فیوچرز مجازی (Virtual Auto-Trade) — نقطهٔ ادامهٔ کار

**وضعیت:** آماده برای ادامه. تست‌ها و `check` سبز هستند (بررسی‌شده در ۹ اکتبر ۲۰۲۶).

## اجرا
```bash
bash 1-AUTOTRADE.sh                       # از ریشهٔ ریپو، پورت 8787
# یا:
cd apps/1-AUTOTRADE-FUTURES-PWA && node server.js
```
- داشبورد: `http://localhost:8787`
- Node.js 18+ کافی است؛ `npm install` لازم نیست (وابستگی خارجی ندارد).

## تست
```bash
cd apps/1-AUTOTRADE-FUTURES-PWA && npm test && npm run check
```

## ساختار مهم
| مسیر | کار |
|---|---|
| `server.js` | سرور HTTP و پروکسی دادهٔ بازار (Bybit V5) |
| `src/js/services/strategy.js`, `formula-engine.js` | منطق استراتژی و فرمول‌ها |
| `src/js/services/paper-broker.js` | معامله‌گر Paper (پیش‌فرض) |
| `src/js/services/real-broker.js` | معامله‌گر واقعی — **غیرفعال به‌صورت پیش‌فرض، فقط با Backend امن** |
| `data/*.jsonl` | کندل‌های تاریخی BTCUSDT (1h/6h/1d) و `data/legacy/` |
| `results/` | خروجی بک‌تست‌ها |
| `archive/futures-pwa-v2.1/` | نسخهٔ قدیمی v2.1 برای مقایسه |
| `tools/` | ابزارهای کمکی |

## گام‌های بعدی پیشنهادی
- بازبینی `real-broker.js` و امنیت کلیدها (کلید API هرگز در کد یا مرورگر نباشد).
- مقایسهٔ منطق ورودی/خروجی با `archive/futures-pwa-v2.1`.
- اجرای بک‌تست جدید روی `data/` و ذخیرهٔ خروجی در `results/`.

> ⚠️ بک‌تست و Paper سودآوری آینده را تضمین نمی‌کنند.
