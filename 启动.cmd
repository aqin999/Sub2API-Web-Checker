@echo off
chcp 65001 >nul
title Sub2API Checker

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js first.
  echo Download: https://nodejs.org/
  pause
  exit /b 1
)

set "PORT=8787"
set "SUB2API_TARGET=http://156.226.173.152:8080"

echo Starting Sub2API Checker...
echo Local URL: http://127.0.0.1:%PORT%
echo Proxy target: %SUB2API_TARGET%
echo.

start "" "http://127.0.0.1:%PORT%"
node server.js

echo.
echo Server exited.
pause
