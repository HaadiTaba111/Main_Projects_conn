# ☁️ بسته اختصاصی استقرار روی PythonAnywhere و هاست‌های ابری (Clean Deploy)

این بسته کاملاً سبک، پاک و ایزوله است و فقط شامل دو پروژه زیر برای اجرای ۲۴ ساعته ابری است (فاقد هرگونه فایل محرمانه DSA):

1. **🎬 LyraX Clip Studio Pro (`apps/clip-studio`):** وب‌اپلیکیشن ساخت کلیپ و لیریکس
2. **🎣 Net Fishing Auto-Trader (`apps/futures-scalp-lab`):** ربات اتوترید تور ماهیگیری با اتصال به CoinGecko

---

## 🚀 دستور استقرار فوق‌سریع در PythonAnywhere:
```bash
git clone -b arena/578b8ae6-main-projects-conn https://github.com/HaadiTaba111/Main_Projects_conn.git
cd Main_Projects_conn
# پاکسازی فایل‌های DSA برای امنیت ۱۰۰٪:
rm -rf cl_*.py dsa_*.py benchmark_*.py apps/dsa-command-dashboard
```
