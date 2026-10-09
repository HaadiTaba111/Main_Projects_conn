@echo off
chcp 65001 >nul
echo ═════════════════════════════════════════════════════════════════
echo  🎛️ اتاق فرمان مرکزی و لانچر پروژه‌ها (Master Launcher)
echo  سازگار با ویندوز و محیط WSL2 اوبونتو
echo ═════════════════════════════════════════════════════════════════
echo.

where wsl >nul 2>nul
if %errorlevel% equ 0 (
    echo 🐧 در حال اجرا درون محیط WSL2 اوبونتو...
    wsl bash -c "cd '$(wslpath -a '%~dp0')' && ./start.sh"
    pause
    exit /b 0
)

python launcher.py --port 9000
pause
