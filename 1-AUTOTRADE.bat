@echo off
setlocal
set "APP_DIR=%~dp0apps\1-AUTOTRADE-FUTURES-PWA"
if not exist "%APP_DIR%\server.js" (
  echo Error: trading app was not found at "%APP_DIR%".
  pause
  exit /b 1
)
cd /d "%APP_DIR%" || exit /b 1
echo Futures Autotrader: http://localhost:8787
node server.js
