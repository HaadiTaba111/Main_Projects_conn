@echo off
REM داشبورد سیستم‌ها — Windows (Node.js 18+ لازم است)
cd /d "%~dp0dashboard"
echo داشبورد: http://localhost:8700
node server.js
pause
