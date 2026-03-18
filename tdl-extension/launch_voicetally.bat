@echo off
REM VoiceTally NLP Query Tool Launcher
REM Called from TDL extension or can be double-clicked directly

cd /d "d:\Projects\chopped\VoiceTally\tdl-extension"
start "" "d:\Projects\chopped\VoiceTally\venv\Scripts\pythonw.exe" "d:\Projects\chopped\VoiceTally\tdl-extension\voicetally_query.py"
