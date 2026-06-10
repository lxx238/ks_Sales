@echo off
setlocal
chcp 65001 > nul
cd /d %~dp0

set RULE_NAME=KS-BOM-Quotation-5000

echo ================================================
echo Windows Firewall setup
echo ================================================
echo.

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Please run this script as Administrator.
    pause
    exit /b 1
)

echo Creating inbound rule: %RULE_NAME%
netsh advfirewall firewall delete rule name="%RULE_NAME%" >nul 2>&1
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localport=5000

if %errorlevel% neq 0 (
    echo [ERROR] Firewall rule setup failed.
    pause
    exit /b 1
)

echo.
echo [OK] TCP 5000 is now allowed.
echo Intranet users can access: http://YOUR-LAN-IP:5000
pause
