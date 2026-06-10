@echo off
setlocal
chcp 65001 > nul
cd /d %~dp0

echo ================================================
echo BOM quotation system - PORT 5000
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

set KS_SERVER_PORT=5000
set KS_SECRET_KEY=ks-bom-intranet-5000
set KS_DATABASE_PATH=
set KS_UPLOAD_FOLDER=
set KS_OUTPUT_FOLDER=

python -c "from pathlib import Path; p = Path('data'); p.mkdir(exist_ok=True)"
set KS_DATABASE_PATH=%cd%\data\database.db
set KS_UPLOAD_FOLDER=%cd%\uploads
set KS_OUTPUT_FOLDER=%cd%\output

echo ================================================
echo Port: 5000
echo Database: data\database.db
echo Uploads: uploads\
echo Output:  output\
echo ================================================
echo.

python -m backend.serve

pause
