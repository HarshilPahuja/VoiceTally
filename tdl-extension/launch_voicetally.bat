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
"%PYTHON_EXE%" -m pip install pystray Pillow keyboard sounddevice soundfile requests httpx >nul 2>&1
echo [OK] All dependencies are satisfied.

:: 5. Launch Application and Backend Servers
echo.
echo [MAINTENANCE] Closing any stale background servers...
FOR /F "tokens=5" %%T IN ('netstat -ano ^| findstr :8000') DO taskkill /PID %%T /F >nul 2>&1
FOR /F "tokens=5" %%T IN ('netstat -ano ^| findstr :8001') DO taskkill /PID %%T /F >nul 2>&1

echo [LAUNCHING] Starting Backend API Servers...
start "VoiceTally Data API" /MIN cmd /c "cd /d "%PROJECT_ROOT%\extracting_tally_data" && "%PYTHON_EXE%" -m uvicorn tally_api:app --port 8000"
start "VoiceTally Intelligence API" /MIN cmd /c "cd /d "%PROJECT_ROOT%" && "%PYTHON_EXE%" -m uvicorn app.main:app --port 8001"

echo [LAUNCHING] Starting VoiceTally System Tray Application...
echo The window will appear momentarily.
echo Press Ctrl+Shift+V to open the query window from anywhere.
echo.

:: Start silently using pythonw, parsing relative paths perfectly!
start "" "%PYTHONW_EXE%" "%SCRIPT_DIR%voicetally_query.py" --show

exit /b 0
