@echo off
chcp 65001 > nul
echo ====================================================================
echo    📦 در حال ساخت بسته زیپ ASP.NET برای هاست Somee.com
echo ====================================================================
echo.

python tools\create_somee_zip.py

echo.
pause
