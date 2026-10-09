@echo off
chcp 65001 > nul
echo ====================================================================
echo    📦 در حال ساخت بسته پاک کلود مخصوص PythonAnywhere
echo ====================================================================
echo.

python tools\create_clean_cloud_zip.py

echo.
pause
