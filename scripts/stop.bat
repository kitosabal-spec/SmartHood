@echo off
setlocal EnableDelayedExpansion

set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%"

if exist ".server.pid" (
  set /p SERVER_PID=<".server.pid"
  tasklist /FI "PID eq !SERVER_PID!" 2>NUL | find "!SERVER_PID!" >NUL
  if errorlevel 1 (
    echo Saved server PID !SERVER_PID! is not running.
    set "SERVER_PID="
  ) else (
    echo Stopping server process tree with PID !SERVER_PID!...
    taskkill /PID !SERVER_PID! /T /F
    del ".server.pid" >NUL 2>&1
    pause
    exit /b 0
  )
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  set "SERVER_PID=%%P"
)
if defined SERVER_PID (
  echo Stopping server process tree with PID !SERVER_PID! from port 3000...
  taskkill /PID !SERVER_PID! /T /F
  del ".server.pid" >NUL 2>&1
  pause
  exit /b 0
)

echo No .server.pid file was found.
echo If the server is still running, close its terminal window or stop the process using port 3000.
pause
