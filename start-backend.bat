@echo off
setlocal
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo NOVA's Python environment is missing. Follow README.md setup step 2 first.
  pause
  exit /b 1
)

".venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
