@echo off
echo Starting dashboard (analysis mode — no camera required)...
if exist active_session.txt del active_session.txt
call .venv\Scripts\activate.bat
uvicorn api.main:app --host 0.0.0.0 --port 8000
pause