@echo off
setlocal EnableDelayedExpansion

set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%"

if exist ".server.pid" (
  set /p OLD_PID=<".server.pid"
  tasklist /FI "PID eq !OLD_PID!" 2>NUL | find "!OLD_PID!" >NUL
  if not errorlevel 1 (
    echo Server appears to already be running with PID !OLD_PID!.
    echo Run stop.bat first if you want to restart it.
    pause
    exit /b 0
  )
  del ".server.pid" >NUL 2>&1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do (
  set "PORT_PID=%%P"
)
if defined PORT_PID (
  echo Server is already listening on http://localhost:3000 with PID !PORT_PID!.
  echo !PORT_PID!>".server.pid"
  pause
  exit /b 0
)

if not exist "node_modules" (
  echo node_modules was not found. Install dependencies first with:
  echo npm install
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = Start-Process -FilePath 'cmd.exe' -ArgumentList '/k','npm start' -WorkingDirectory (Get-Location).Path -PassThru; Set-Content -Path '.server.pid' -Value $p.Id; Write-Host ('Started server window with PID ' + $p.Id)"

echo.
echo SmartHood should be available at http://localhost:3000
pause
