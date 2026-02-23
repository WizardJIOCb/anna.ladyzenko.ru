@echo off
cd /d "%~dp0"

echo === Installing server dependencies ===
cd server
if not exist node_modules (
    call npm install
)
cd ..

echo === Starting API server on http://localhost:3000 ===
start "mama-insta-api" cmd /c "cd /d "%~dp0server" && node server.js"

echo === Starting static server on http://localhost:8000 ===
start "mama-insta-static" cmd /c "cd /d "%~dp0" && python -m http.server 8000"

timeout /t 2 /nobreak >nul
start "" http://localhost:8000

echo.
echo Static server: http://localhost:8000
echo API server:    http://localhost:3000
echo.
echo Close this window or run stop-dev.bat to stop both servers.
