@echo off
chcp 65001 >nul
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap_pc.ps1"
if errorlevel 1 (
    echo.
    echo Setup or startup failed. Review the error above.
    pause
    exit /b 1
)
endlocal
