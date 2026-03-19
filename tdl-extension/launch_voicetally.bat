@echo off
REM VoiceTally NLP Query Tool — System Tray Launcher
REM Double-click this to start VoiceTally in the system tray.
REM Press Ctrl+Shift+V anytime to open the query window.

@REM need ffmpeg for whisper

echo Checking and installing required audio packages...
pip install sounddevice soundfile --quiet

cd /d "%~dp0"
start "" pythonw "%~dp0voicetally_query.py" --show
