@echo off
setlocal enabledelayedexpansion
title VoiceTally Installer ^& Launcher

echo ===================================================
echo     VoiceTally Auto-Installer ^& Launcher
echo ===================================================
echo.

:: Get the directory of the batch file and the project root
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

cd /d "%SCRIPT_DIR%"

:: 1. Check for Python (needed for core NLP/extraction backend)
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH! Please install Python 3.
    pause
    exit /b 1
)

:: 1b. Check for Node.js (Only if compiled proxy is missing)
if not exist "%PROJECT_ROOT%\voicetally-proxy.exe" (
    node --version >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Node.js is not installed and compiled proxy was not found!
        echo Please install Node.js or ensure voicetally-proxy.exe is in the application folder.
        pause
        exit /b 1
    )
)

:: 2. Check for ffmpeg (Required for Whisper Mic Input)
ffmpeg -version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [SETUP] ffmpeg is missing. Attempting to install via winget...
    winget install --id=Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to install ffmpeg automatically via winget. 
        echo Please install it manually from https://ffmpeg.org/download.html
        pause
    ) else (
        echo [SUCCESS] ffmpeg installed successfully!
    )
) else (
    echo [OK] ffmpeg is already installed.
)

:: 3. Setup Virtual Environment
set "VENV_DIR=%PROJECT_ROOT%\venv"
set "PYTHON_EXE=%VENV_DIR%\Scripts\python.exe"
set "PYTHONW_EXE=%VENV_DIR%\Scripts\pythonw.exe"

if not exist "%VENV_DIR%" (
    echo [SETUP] Creating Python Virtual Environment...
    python -m venv "%VENV_DIR%"
)

:: 4. Install Python Dependencies
echo [SETUP] Installing and verifying Python dependencies...
"%PYTHON_EXE%" -m pip install --upgrade pip >nul 2>&1
if exist "%PROJECT_ROOT%\requirements.txt" (
    "%PYTHON_EXE%" -m pip install -r "%PROJECT_ROOT%\requirements.txt" >nul 2>&1
)
echo [OK] Python dependencies are satisfied.

:: 4b. Install Node.js Dependencies (Only if running from source)
if not exist "%PROJECT_ROOT%\voicetally-proxy.exe" (
    if not exist "%PROJECT_ROOT%\voicetally-backend\node_modules" (
        echo [SETUP] Installing Node.js dependencies...
        pushd "%PROJECT_ROOT%\voicetally-backend"
        call npm install
        popd
    )
    echo [OK] Node.js dependencies are satisfied.
)

:: 5. Launch Application and Backend Servers
echo.
echo [MAINTENANCE] Closing any stale background servers...
powershell -Command "Get-NetTCPConnection -LocalPort 3000,8000,8001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"


echo [LAUNCHING] Starting Backend API Servers...
pushd "%PROJECT_ROOT%\extracting_tally_data"
start "VoiceTally-DataAPI" /MIN "%PYTHON_EXE%" -m uvicorn tally_api:app --port 8000
popd

if exist "%PROJECT_ROOT%\voicetally-proxy.exe" (
    start "VoiceTally-ProxyAPI" /MIN "%PROJECT_ROOT%\voicetally-proxy.exe"
) else (
    pushd "%PROJECT_ROOT%\voicetally-backend"
    start "VoiceTally-ProxyAPI" /MIN npm run start
    popd
)

start "VoiceTally-NLP" /MIN /D "%PROJECT_ROOT%" "%PYTHON_EXE%" -m uvicorn app.main:app --port 8001
ping 127.0.0.1 -n 4 >nul



echo [LAUNCHING] Starting VoiceTally System Tray Application...
echo The window will appear momentarily.
echo Press Ctrl+Shift+V to open the query window from anywhere.
echo.


if exist "%PROJECT_ROOT%\VoiceTally.exe" (
    start "" "%PROJECT_ROOT%\VoiceTally.exe" --show
) else (
    :: Fix for Python 3.13 venv Tcl/Tk path issue on Windows:
    :: The venv loses the TCL_LIBRARY/TK_LIBRARY paths, causing tkinter to crash silently.
    :: We detect the system Python's tcl/tk folder and export the env vars before launch.
    FOR /F "delims=" %%P IN ('python -c "import sys,os; base=os.path.dirname(sys.executable); print(base)"') DO set "SYS_PYTHON_BASE=%%P"
    FOR /D %%D IN ("%SYS_PYTHON_BASE%\tcl\tcl8.*") DO set "TCL_LIBRARY=%%D"
    FOR /D %%D IN ("%SYS_PYTHON_BASE%\tcl\tk8.*")  DO set "TK_LIBRARY=%%D"
    
    :: Launch the UI — use pythonw for silent background, with TCL paths now set
    start "" "%PYTHONW_EXE%" "%SCRIPT_DIR%voicetally_query.py" --show
)

exit /b 0
