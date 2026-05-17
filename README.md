# ClassroomAI Monitor 🎓

> AI-powered classroom engagement monitoring system — BYTEHACK 2026 (PS13)

## What It Does

- 📷 Detects students via YOLOv8 object detection
- 🧠 Calculates Focus Score using head pose estimation (MediaPipe)
- 🙋 Detects hand raises and sleeping via pose estimation  
- 📱 Detects phone usage and penalizes focus score
- 🎙️ Transcribes teacher speech every 30 seconds (OpenAI Whisper)
- 📊 Shows everything on a live React dashboard
- 📡 Anyone on the same WiFi can open the dashboard on their phone
- 🎬 Supports both live webcam tracking and pre-recorded video uploads directly from the dashboard

## Tech Stack

| Layer | Technology |
|---|---|
| Person Detection | YOLOv8 (Ultralytics) |
| Face Landmarks | MediaPipe FaceLandmarker |
| Head Pose Estimation | OpenCV solvePnP |
| Pose Estimation | MediaPipe PoseLandmarker |
| Speech Recognition | OpenAI Whisper (tiny model) |
| Backend API | FastAPI + Uvicorn |
| Database | SQLite |
| Frontend | React + Vite + Recharts |

## Requirements

- Python 3.13+
- Node.js 18+
- Webcam
- Microphone

## Setup (First Time Only)

1. Clone the repo:
```
git clone https://github.com/Pr1nce-Raj/ClassroomAI-Monitor.git
cd ClassroomAI-Monitor
```

2. Double-click `setup.bat` and wait for it to finish (5-10 minutes)

That's it. Setup only needs to be done once.

## Running the System

**Live Session (Camera Required)**
Double-click `START.bat`
* Starts the AI vision pipeline and live dashboard.
* Open your browser and go to: `http://localhost:8000`
* To share with others on the same WiFi, use the IP link printed in the terminal.

**Session Analysis (Offline Mode)**
Double-click `DASHBOARD.bat`
* Starts only the backend and dashboard to view past session data. No camera or AI pipeline runs.
* Open your browser and navigate to the **Session Analysis** tab.

## Demo Guide

| Action | What Happens |
|---|---|
| **Click "Upload Video"** | Switches pipeline from live webcam to pre-recorded video file |
| Look at camera | Focus score goes up (green) |
| Look away | Focus score drops (red) |
| Raise hand | HAND RAISED alert on dashboard |
| Hold phone | ON PHONE alert, score penalized |
| Slump head forward | SLEEPING detected |
| Speak into mic | Transcript + Q-ratio after 30s |

## Privacy

All processing happens on-device. Raw video never leaves the machine. Only numerical scores are stored in the database. Face blur mode available via `PRIVACY_MODE = True` in `vision/detect.py`.

## Project Structure
```
ByteHack_AI/
├── vision/          ← Camera, YOLO, focus score, pose detection
├── audio/           ← Whisper transcription
├── database/        ← SQLite database functions
├── api/             ← FastAPI backend
├── dashboard/       ← React frontend
├── start.py         ← Main launcher
├── setup.bat        ← First time setup
├── START.bat        ← Run the live system
└── DASHBOARD.bat    ← View past sessions (no camera needed)
```

## Screenshots

> Dashboard screenshots and demo video coming soon.
