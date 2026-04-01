@echo off
:: Check if already admin
net session >nul 2>&1
if %errorlevel% == 0 (
    cd /d "%~dp0"
    npx electron .
    exit /b
)

:: Not admin — re-launch this script elevated
powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
