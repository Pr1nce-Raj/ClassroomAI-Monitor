@echo off
echo Starting dashboard (analysis mode — no camera required)...
call .venv\Scripts\activate.bat
uvicorn api.main:app --host 0.0.0.0 --port 8000
pause