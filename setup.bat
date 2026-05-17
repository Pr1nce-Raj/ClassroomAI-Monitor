@echo off
echo ================================================
echo    ClassroomAI Monitor - First Time Setup
echo ================================================
echo.

echo [1/6] Checking Python...
python --version
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.13 from https://python.org
    pause
    exit /b
)

echo [2/6] Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install from https://nodejs.org
    pause
    exit /b
)

echo [3/6] Creating virtual environment...
python -m venv .venv

echo [4/6] Installing Python libraries (this takes 3-5 minutes)...
call .venv\Scripts\activate.bat
pip install ultralytics mediapipe openai-whisper sounddevice scipy fastapi uvicorn opencv-contrib-python aiofiles numpy torch torchvision

echo [5/6] Downloading AI models...
python -c "import whisper; whisper.load_model('tiny')"
python -c "import urllib.request; urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', 'face_landmarker.task'); print('Face model downloaded')"
python -c "import urllib.request; urllib.request.urlretrieve('https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', 'pose_landmarker.task'); print('Pose model downloaded')"

echo [6/6] Building dashboard...
cd dashboard
npm install
npm run build
cd ..

echo.
echo ================================================
echo    Setup Complete! 
echo    Run START.bat to launch the system
echo ================================================
pause