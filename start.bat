@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 20 or newer, then try again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js with npm included.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [INFO] First run: installing dependencies...
  call npm.cmd install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting the local web page at http://127.0.0.1:5173
echo [INFO] This service only serves front-end files and does not proxy API requests.
call npm.cmd run dev
if errorlevel 1 pause
