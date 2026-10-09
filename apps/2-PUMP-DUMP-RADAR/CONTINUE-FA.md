# 🚀 رادار پامپ/دامپ (Pump & Dump Radar) — نقطهٔ ادامهٔ کار

**وضعیت:** آماده برای ادامه. تست و `check` سبز هستند.

## اجرا
```bash
bash 2-PUMP-RADAR.sh                      # از ریشهٔ ریپو، پورت 8790
# یا:
cd apps/2-PUMP-DUMP-RADAR && node server.js
```
- داشبورد: `http://localhost:8790`
- Node.js 18+؛ بدون `npm install`.

## تست
```bash
cd apps/2-PUMP-DUMP-RADAR && npm test && npm run check
```

## ساختار مهم
| مسیر | کار |
|---|---|
| `server.js` | سرور و API رادار |
| `src/js/services/radar.js` | اسکن کل بازار و کشف لیست‌های جدید |
| `src/js/services/ignition.js` | ورود بر اساس Momentum Ignition |
| `src/js/services/paper-broker.js` | Paper trading با کارمزد |
| `src/js/ui/grid-tools.js`, `view.js` | رابط کاربری |
| `test/selftest.mjs` | تست‌های خودکار |

## گام‌های بعدی پیشنهادی
- تنظیم آستانه‌های پامپ/دامپ در `src/js/core/config.js`.
- افزودن گزارش عملکرد Paper و ذخیرهٔ تاریخچه.
- بررسی تأخیر و محدودیت نرخ درخواست‌ها هنگام اسکن کل بازار.

> ⚠️ این پروژه از اتوتریدر مستقل است و runtime مشترک ندارد.
