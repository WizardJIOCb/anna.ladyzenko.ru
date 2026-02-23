@echo off
cd /d "%~dp0"
echo Starting dev server at http://localhost:8000
echo Press Ctrl+C to stop
start "" http://localhost:8000
python -m http.server 8000
