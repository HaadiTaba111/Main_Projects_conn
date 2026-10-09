@echo off
chcp 65001 > nul
echo ====================================================================
echo    🚀 SkyGround Mobile & APK Hub (Crypto Scalp Lab & LyraX Studio)
echo ====================================================================
echo.

python tools/build_mobile_apks.py

echo.
echo برای مطالعه راهنمای کامل ساخت APK و نصب روی گوشی فایل زیر را باز کنید:
echo docs\MOBILE_APK_SETUP_GUIDE_FA.md
echo.
pause
