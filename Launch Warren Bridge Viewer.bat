@echo off
setlocal

rem Double-click launcher for Windows: installs dependencies the first time (skipped on
rem later runs once node_modules exists), then starts the dev server. Vite itself opens the
rem browser automatically once the server is ready (see vite.config.mts's server.open).
rem This file is meant to be shared alongside the whole project folder - it only works once
rem copied to a computer that also has Node.js installed (https://nodejs.org).

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on this computer.
    echo Install it from https://nodejs.org ^(the LTS version^), then run this file again.
    pause
    exit /b 1
)

if not exist ".env" (
    echo No .env file found - this project cannot start without one.
    echo See README.md for the required configuration.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies - this only happens once and may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo.
        echo npm install failed - see the errors above.
        pause
        exit /b 1
    )
)

echo Starting the Warren Bridge viewer...
echo Your browser will open automatically once it's ready.
echo Close this window to stop the app.
echo.
call npm start

pause
