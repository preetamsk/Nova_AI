@echo off
setlocal
cd /d "%~dp0frontend"

if not exist "node_modules" (
  echo Frontend packages are missing. Run npm install in the frontend folder first.
  pause
  exit /b 1
)

rem Stay private on this laptop; Tailscale Funnel is the only public entry point.
npm run dev -- --hostname 127.0.0.1
