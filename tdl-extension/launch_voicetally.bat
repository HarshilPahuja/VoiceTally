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

:: 1. Check for Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Python is not installed or not in PATH! Please install Python 3.
    pause
    exit /b 1
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

:: 4. Install Dependencies
echo [SETUP] Installing and verifying Python dependencies...
"%PYTHON_EXE%" -m pip install --upgrade pip >nul 2>&1
if exist "%PROJECT_ROOT%\requirements.txt" (
    "%PYTHON_EXE%" -m pip install -r "%PROJECT_ROOT%\requirements.txt" >nul 2>&1
)
echo [OK] All dependencies are satisfied.

:: 5. Launch Application and Backend Servers
echo.
echo [MAINTENANCE] Closing any stale background servers...
powershell -Command "Get-NetTCPConnection -LocalPort 8000,8001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"


echo [LAUNCHING] Starting Backend API Servers...
pushd "%PROJECT_ROOT%\extracting_tally_data"
start "VoiceTally-DataAPI" /MIN "%PYTHON_EXE%" -m uvicorn tally_api:app --port 8000
popd
start "VoiceTally-NLP" /MIN /D "%PROJECT_ROOT%" "%PYTHON_EXE%" -m uvicorn app.main:app --port 8001
timeout /t 3 /nobreak >nul


echo [LAUNCHING] Starting VoiceTally System Tray Application...
echo The window will appear momentarily.
echo Press Ctrl+Shift+V to open the query window from anywhere.
echo.

:: Fix for Python 3.13 venv Tcl/Tk path issue on Windows:
:: The venv loses the TCL_LIBRARY/TK_LIBRARY paths, causing tkinter to crash silently.
:: We detect the system Python's tcl/tk folder and export the env vars before launch.
FOR /F "delims=" %%P IN ('python -c "import sys,os; base=os.path.dirname(sys.executable); print(base)"') DO set "SYS_PYTHON_BASE=%%P"
FOR /D %%D IN ("%SYS_PYTHON_BASE%\tcl\tcl8.*") DO set "TCL_LIBRARY=%%D"
FOR /D %%D IN ("%SYS_PYTHON_BASE%\tcl\tk8.*")  DO set "TK_LIBRARY=%%D"

:: Launch the UI — use pythonw for silent background, with TCL paths now set
start "" "%PYTHONW_EXE%" "%SCRIPT_DIR%voicetally_query.py" --show

exit /b 0
