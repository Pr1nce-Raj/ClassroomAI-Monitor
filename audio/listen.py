import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import re
import time
import tempfile
from datetime import datetime
import numpy as np
import sounddevice as sd
import scipy.io.wavfile as wav
import whisper
from database.db import get_connection

print("Loading Whisper model...")
model = whisper.load_model("tiny")
print("Whisper ready.")

SAMPLE_RATE = 16000
CHUNK_SECONDS = 30
DEVICE_INDEX = None


def record_chunk(seconds=CHUNK_SECONDS):
    print(f"Recording {seconds}s audio chunk...")
    audio = sd.rec(
        int(seconds * SAMPLE_RATE),
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="int16",
        device=DEVICE_INDEX,
    )
    sd.wait()
    return audio


def transcribe(audio_array):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name

    wav.write(tmp_path, SAMPLE_RATE, audio_array)
    result = model.transcribe(tmp_path, language="en", fp16=False)
    os.unlink(tmp_path)

    return result["text"].strip()


def analyze_transcript(text):
    if not text:
        return {"q_ratio": 0.0, "word_count": 0, "question_count": 0, "transcript": ""}

    cleaned = " ".join(text.split())
    sentences = [s.strip() for s in re.split(r'[.!?]+', cleaned) if s.strip()]
    word_count = len(cleaned.split())

    question_starters = (
        "what", "how", "why", "who", "where", "when", "which",
        "can", "could", "would", "will", "should", "did", "do", "does",
        "is", "are", "am", "was", "were", "have", "has", "had"
    )

    questions = []
    for s in sentences:
        s_clean = s.strip()
        s_lower = s_clean.lower()

        is_explicit_question = "?" in text and s_clean in cleaned
        starts_like_question = any(s_lower.startswith(q + " ") for q in question_starters)
        short_question_like = starts_like_question and len(s_clean.split()) <= 12

        if is_explicit_question or short_question_like:
            questions.append(s_clean)

    total = max(len(sentences), 1)
    q_ratio = round(len(questions) / total, 2)

    return {
        "q_ratio": q_ratio,
        "word_count": word_count,
        "question_count": len(questions),
        "transcript": cleaned,
    }

def save_transcript(session_id, analysis):
    conn = get_connection()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER,
            timestamp TEXT,
            transcript TEXT,
            q_ratio REAL,
            word_count INTEGER,
            question_count INTEGER
        )
    """)

    local_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn.execute("""
        INSERT INTO transcripts
            (session_id, timestamp, transcript, q_ratio, word_count, question_count)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        local_timestamp,
        analysis["transcript"],
        analysis["q_ratio"],
        analysis["word_count"],
        analysis["question_count"],
    ))
    conn.commit()
    conn.close()
    print(f"Transcript saved — q_ratio: {analysis['q_ratio']} | words: {analysis['word_count']} | time: {local_timestamp}")

def is_noise_transcript(text):
    cleaned = " ".join(text.split()).strip()
    words = [w.strip(".,?!:;\"'`()[]{}").lower() for w in cleaned.split() if w.strip(".,?!:;\"'`()[]{}")]

    if not words:
        return True

    unique_words = set(words)

    if len(words) < 4:
        return True

    if len(unique_words) <= 1:
        return True

    if len(words) <= 6 and len(unique_words) <= 2:
        return True

    filler_words = {"you", "uh", "um", "hmm", "mmm", "ah", "oh", "huh", "hey", "ha"}
    if all(w in filler_words for w in words):
        return True

    weird_char_count = sum(1 for ch in cleaned if ord(ch) > 127 and ch not in "’“”–—")
    if weird_char_count >= 3:
        return True

    alpha_words = [w for w in words if any(c.isalpha() for c in w)]
    if len(alpha_words) < max(3, len(words) // 2):
        return True

    repeated_short = len(words) <= 8 and len(unique_words) <= max(2, len(words) // 3)
    if repeated_short:
        return True

    return False

def run_audio_pipeline(session_id, stop_event):
    print(f"Audio pipeline started for session {session_id}")

    while not stop_event.is_set():
        try:
            audio = record_chunk(CHUNK_SECONDS)

            rms = np.sqrt(np.mean(audio.astype(np.float32) ** 2))
            print(f"[AUDIO] RMS energy: {rms:.1f}")

            if rms < 200:
                print("[AUDIO] Silence detected — skipping Whisper.")
                continue

            text = transcribe(audio)
            text = " ".join(text.split())

            if text:
                if is_noise_transcript(text):
                    print(f"[AUDIO] Skipping noise transcript: '{text}'")
                    continue

                print(f"Transcript: {text[:100]}...")
                analysis = analyze_transcript(text)
                save_transcript(session_id, analysis)
            else:
                print("No speech detected in this chunk.")

        except Exception as e:
            print(f"Audio pipeline error: {e}")
            time.sleep(5)

    print("Audio pipeline stopped.")