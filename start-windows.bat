@echo off
rem Double-click to open the dashboard at http://localhost:8765. Close this window to stop it.
cd /d "%~dp0"
start "" http://localhost:8765
python -m http.server 8765 || py -m http.server 8765
pause
