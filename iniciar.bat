@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b
)
if not exist node_modules npm install
start "" http://localhost:3000
node server.js
pause
