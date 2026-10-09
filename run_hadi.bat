@echo off
chcp 65001 > nul
cls
echo ===============================================================================
echo     👑 سامانه فرماندهی و اجرای ۱-کلیکه پروژه‌های داداش هادی (TaHa111)
echo ===============================================================================
echo  کدام پروژه را می‌خواهی اجرا کنی داداش جان؟
echo.
echo  [1] ➔ ⚡ اتوترید فیوچرز v2.7 (چارت TradingView + بریک‌ایون بالغ) [Port 8787]
echo  [2] ➔ 🚀 رادار شکار پامپ و دامپ (Ignition Radar) [Port 8790]
echo  [3] ➔ 🎬 استودیو تولید ویدیوی LyraX Pro [Port 5000]
echo  [4] ➔ 🧠 مغز زنده و سخن‌گوی شاعر و طنزگوی فارسی (چت زنده + RAG)
echo  [5] ➔ 🔒 آزمون مهار فراموشی DSA برای دانشگاه شریف
echo  [6] ➔ 🔄 به‌روزرسانی و دریافت آخرین کدهای گیت‌هاب (Git Sync)
echo  [0] ➔ 🚪 خروج
echo.
set /p choice=" شماره گزینه را وارد کن: "

if "%choice%"=="1" (
    echo.
    echo 🚀 در حال اجرای اتوترید فیوچرز روی پورت 8787...
    start http://localhost:8787
    cd apps\1-AUTOTRADE-FUTURES-PWA && node server.js
)
if "%choice%"=="2" (
    echo.
    echo 🚀 در حال اجرای رادار پامپ و دامپ روی پورت 8790...
    start http://localhost:8790
    cd apps\2-PUMP-DUMP-RADAR && node server.js
)
if "%choice%"=="3" (
    echo.
    echo 🚀 در حال اجرای استودیو LyraX روی پورت 5000...
    start http://localhost:5000
    python apps\3-LYRAX-CLIP-STUDIO\app.py
)
if "%choice%"=="4" (
    echo.
    echo 🧠 در حال بیدار کردن مغز زنده شاعر فارسی...
    python apps\4-PERSIAN-POET-BRAIN\persian_living_brain.py
)
if "%choice%"=="5" (
    echo.
    echo 🔒 در حال اجرای بنچمارک DSA برای دانشگاه شریف...
    python dsa-security\dsa_sharif_evaluator_kit.py
)
if "%choice%"=="6" (
    echo.
    echo 🔄 در حال دریافت آخرین آپدیت‌ها از گیت‌هاب...
    git pull --ff-only origin arena/578b8ae6-main-projects-conn
    echo ✅ همه‌چیز به‌روزرسانی شد!
    pause
)
if "%choice%"=="0" (
    exit
)
