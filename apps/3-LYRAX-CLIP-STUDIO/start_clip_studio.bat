@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0"
echo ================================================================
echo  LyraX Clip Studio - http://127.0.0.1:5000
echo  Keep this window open; press Ctrl+C to stop the server.
echo ================================================================
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" app.py
) else (
    py -3 app.py
)
set EXIT_CODE=%ERRORLEVEL%
popd
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
