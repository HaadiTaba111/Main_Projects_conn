@echo off
setlocal
set "APP_DIR=%~dp0apps\2-PUMP-DUMP-RADAR"
if not exist "%APP_DIR%\server.js" (
  echo Error: pump radar was not found at "%APP_DIR%".
  pause
  exit /b 1
)
cd /d "%APP_DIR%" || exit /b 1
echo Pump/Dump Radar: http://localhost:8790
node server.js
