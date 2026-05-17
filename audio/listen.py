import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
import time
import threading
import tempfile
import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wav
import whisper
from database.db import get_connection

# ── Load Whisper model ────────────────────────────────────────────
# 'tiny' = fastest, good enough for classroom speech
# Downloads ~75MB on first run
print("Loading Whisper model...")
model = whisper.load_model("tiny")
print("Whisper ready.")

# Audio settings
SAMPLE_RATE   = 16000   # Whisper expects 16kHz
CHUNK_SECONDS = 30      # record 30 seconds then transcribe
DEVICE_INDEX  = None    # Realtek microphone


def record_chunk(seconds=CHUNK_SECONDS):
    """Record audio for N seconds, return as numpy array."""
    print(f"Recording {seconds}s audio chunk...")
    audio = sd.rec(
        int(seconds * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        device=DEVICE_INDEX,
    )
    sd.wait()   # block until recording is done
    return audio


def transcribe(audio_array):
    """
    Save audio to a temp WAV file and run Whisper on it.
    Returns the transcript text.
    """
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name

    wav.write(tmp_path, SAMPLE_RATE, audio_array)

    result = model.transcribe(tmp_path, language="en", fp16=False)
    os.unlink(tmp_path)   # delete temp file immediately

    return result["text"].strip()


def analyze_transcript(text):
    """
    Analyze transcript for teacher effectiveness metrics.
    Returns a dict with q_ratio, word_count, question_count.
    """
    if not text:
        return {"q_ratio": 0.0, "word_count": 0, "question_count": 0, "transcript": ""}

    # Split into sentences
    sentences = [s.strip() for s in re.split(r'[.!?]+', text) if s.strip()]

    # Detect questions — ends with ? OR starts with question word
    question_words = r'\b(what|how|why|who|where|when|which|can|does|do|is|are|would|could)\b'
    questions = [
        s for s in sentences
        if '?' in s or re.search(question_words, s, re.IGNORECASE)
    ]

    total     = max(len(sentences), 1)
    q_ratio   = round(len(questions) / total, 2)
    word_count = len(text.split())

    return {
        "q_ratio":        q_ratio,
        "word_count":     word_count,
        "question_count": len(questions),
        "transcript":     text,
    }


def save_transcript(session_id, analysis):
    """Save transcript analysis to database."""
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transcripts (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id     INTEGER,
            timestamp      TEXT,
            transcript     TEXT,
            q_ratio        REAL,
            word_count     INTEGER,
            question_count INTEGER
        )
    """)
    conn.execute("""
        INSERT INTO transcripts
            (session_id, timestamp, transcript, q_ratio, word_count, question_count)
        VALUES (?, datetime('now'), ?, ?, ?, ?)
    """, (
        session_id,
        analysis["transcript"],
        analysis["q_ratio"],
        analysis["word_count"],
        analysis["question_count"],
    ))
    conn.commit()
    conn.close()
    print(f"Transcript saved — q_ratio: {analysis['q_ratio']} | words: {analysis['word_count']}")


def run_audio_pipeline(session_id, stop_event):
    """
    Main loop — runs in a background thread.
    Records → transcribes → analyzes → saves every 30 seconds.
    stop_event: threading.Event — set it to stop the loop.
    """
    print(f"Audio pipeline started for session {session_id}")
    while not stop_event.is_set():
        try:
            audio    = record_chunk(CHUNK_SECONDS)
            text     = transcribe(audio)

            if text:
                print(f"Transcript: {text[:100]}...")
                analysis = analyze_transcript(text)
                save_transcript(session_id, analysis)
            else:
                print("No speech detected in this chunk.")

        except Exception as e:
            print(f"Audio pipeline error: {e}")
            time.sleep(5)   # wait before retrying

    print("Audio pipeline stopped.")