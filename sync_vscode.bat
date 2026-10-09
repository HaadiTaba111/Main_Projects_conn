@echo off
chcp 65001 >nul
echo ═════════════════════════════════════════════════════════════════
echo  🚀 دستیار همگام‌سازی و پوش خودکار VS Code به Arena
echo  سازگار با ویندوز و WSL2
echo ═════════════════════════════════════════════════════════════════
echo.

where wsl >nul 2>nul
if %errorlevel% equ 0 (
    echo 🐧 در حال اجرا درون محیط WSL2 اوبونتو...
    wsl bash -c "cd '$(wslpath -a '%~dp0')' && ./sync_vscode.sh"
    pause
    exit /b 0
)

echo 📥 [1/4] در حال دریافت آخرین تغییرات از گیت‌هاب...
git fetch origin refs/heads/arena/01a10c56-main-arena-conn
git pull origin arena/01a10c56-main-arena-conn --no-rebase

echo.
echo 💻 [2/4] باز کردن پروژه در VS Code...
code .

echo.
echo ─────────────────────────────────────────────────────────────────
echo  کار خود را در VS Code انجام دهید.
echo  پس از اتمام کار، هر کلیدی را در این پنجره فشار دهید تا
echo  تمام تغییرات به صورت اتوماتیک کامیت و پوش شود!
echo ─────────────────────────────────────────────────────────────────
pause

echo.
echo 📦 [3/4] در حال استیج کردن تمام فایل‌های تغییر یافته...
git add -A

set COMMIT_MSG=update: synced work from local VS Code on %date% %time%
git commit -m "%COMMIT_MSG%" 2>nul
if %errorlevel% neq 0 (
    echo ℹ️ تغییری برای ذخیره وجود نداشت.
) else (
    echo ✅ تغییرات با موفقیت کامیت شد.
)

echo.
echo 🚀 [4/4] در حال ارسال خودکار (Push) به شاخه اصلی Arena...
git push origin arena/01a10c56-main-arena-conn

echo.
echo ═════════════════════════════════════════════════════════════════
echo  🎉 همه‌چیز با موفقیت همگام و ذخیره شد داداش!
echo ═════════════════════════════════════════════════════════════════
pause
