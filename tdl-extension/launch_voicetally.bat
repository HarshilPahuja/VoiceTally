@echo off
REM VoiceTally NLP Query Tool — System Tray Launcher
REM Double-click this to start VoiceTally in the system tray.
REM Press Ctrl+Shift+V anytime to open the query window.

cd /d "d:\Projects\chopped\VoiceTally\tdl-extension"
start "" "d:\Projects\chopped\VoiceTally\venv\Scripts\pythonw.exe" "d:\Projects\chopped\VoiceTally\tdl-extension\voicetally_query.py" --show
