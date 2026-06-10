@echo off
setlocal
chcp 65001 > nul
cd /d %~dp0

echo ================================================
echo BOM quotation system - intranet production start
echo ================================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.8+ was not found.
    pause
    exit /b 1
)

echo [1/3] Checking Python...
python --version

echo.
echo [2/3] Installing/updating dependencies...
python -m pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Starting intranet server on port 5000...
echo.
echo ================================================
echo The server will print local and intranet access URLs.
echo Port: 5000
echo If needed, run setup_firewall.bat as Administrator first.
echo ================================================
echo.

set KS_SERVER_PORT=5000
echo [INFO] Starting on port %KS_SERVER_PORT% ...
python -c "import os; os.environ['KS_SERVER_PORT']='5000'; from backend.serve import run_server; run_server()"

pause
