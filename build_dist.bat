@echo off
title VoiceTally Release Builder
echo ===================================================
echo     VoiceTally Executable Build Script
echo ===================================================
echo.

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

:: 1. Ensure output directory exists
if not exist "dist_build" mkdir "dist_build"

:: 2. Compile Python System Tray UI using PyInstaller
echo [BUILD] Installing PyInstaller...
python -m pip install pyinstaller >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install PyInstaller. Is Python installed and in PATH?
    pause
    exit /b 1
)

echo [BUILD] Compiling VoiceTally Desktop Client (voicetally_query.py)...
python -m PyInstaller --clean --onefile --noconsole --name="VoiceTally" --distpath="dist_build" "tdl-extension/voicetally_query.py"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] PyInstaller compilation failed!
    pause
    exit /b 1
)
echo [SUCCESS] VoiceTally.exe compiled in dist_build/

:: 3. Compile NodeJS Proxy Server using pkg
echo [BUILD] Checking for Node.js pkg compiler...
call npm list -g pkg >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [BUILD] Installing pkg compiler globally...
    call npm install -g pkg >nul 2>&1
)

echo [BUILD] Compiling NodeJS Proxy Server (server.js)...
call pkg "voicetally-backend/server.js" --target node18-win-x64 --output "dist_build/voicetally-proxy.exe"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] pkg compilation failed!
    pause
    exit /b 1
)
echo [SUCCESS] voicetally-proxy.exe compiled in dist_build/
echo.
echo ===================================================
echo     Build Completed Successfully!
echo     Find executables in: %SCRIPT_DIR%dist_build
echo ===================================================
pause
