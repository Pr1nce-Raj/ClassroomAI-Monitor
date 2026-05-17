import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import sqlite3
from database.db import DB_PATH, get_session_summary
from datetime import datetime

app = FastAPI(title="ByteHack Classroom Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def query(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/sessions")
def get_sessions():
    return query("SELECT * FROM sessions ORDER BY id DESC")


@app.get("/sessions/all")
def get_all_sessions():
    return query("""
        SELECT id, label, started_at, ended_at
        FROM sessions ORDER BY id DESC
    """)


@app.post("/session/start")
def start_new_session(label: str = "CS301", teacher: str = "Unknown"):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (started_at, label) VALUES (?, ?)",
        (datetime.now().isoformat(), f"{label} | {teacher}")
    )
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"session_id": session_id, "label": label}


@app.get("/session/{session_id}/info")
def get_session_info(session_id: int):
    rows = query("SELECT * FROM sessions WHERE id = ?", (session_id,))
    if not rows:
        return {"error": "not found"}
    return rows[0]


@app.get("/session/{session_id}/summary")
def get_summary(session_id: int):
    return get_session_summary(session_id)


@app.get("/session/{session_id}/events")
def get_events(session_id: int):
    return query(
        "SELECT * FROM events WHERE session_id = ? ORDER BY timestamp",
        (session_id,)
    )


@app.get("/session/{session_id}/focus_over_time")
def focus_over_time(session_id: int):
    return query("""
        SELECT
            timestamp,
            ROUND(AVG(focus_score), 1) AS avg_focus,
            COUNT(*)                   AS person_count,
            SUM(hand_raised)           AS hand_raises,
            SUM(sleeping)              AS sleeping_count
        FROM events
        WHERE session_id = ?
        GROUP BY timestamp
        ORDER BY timestamp
    """, (session_id,))


@app.get("/session/{session_id}/live")
def live_status(session_id: int):
    rows = query("""
        SELECT * FROM events
        WHERE session_id = ?
        ORDER BY timestamp DESC
        LIMIT 5
    """, (session_id,))

    if not rows:
        return {"status": "no data yet"}

    avg_focus   = round(sum(r["focus_score"] or 0 for r in rows) / len(rows), 1)
    hand_raises = sum(r["hand_raised"]     for r in rows)
    sleeping    = sum(r["sleeping"]        for r in rows)
    phones      = sum(r.get("phone_detected", 0) for r in rows)

    # Get actual distinct person count from the latest timestamp
    latest_ts = rows[0]["timestamp"]
    latest_rows = query("""
        SELECT COUNT(DISTINCT person_index) as cnt
        FROM events
        WHERE session_id = ? AND timestamp = ?
    """, (session_id, latest_ts))
    person_count = latest_rows[0]["cnt"] if latest_rows else len(rows)

    return {
        "timestamp":    rows[0]["timestamp"],
        "avg_focus":    avg_focus,
        "hand_raises":  hand_raises,
        "sleeping":     sleeping,
        "phones":       phones,
        "person_count": person_count,
    }


@app.get("/session/{session_id}/alerts")
def get_alerts(session_id: int):
    return query("""
        SELECT timestamp, person_index, focus_score,
               hand_raised, sleeping,
               COALESCE(phone_detected, 0) AS phone_detected
        FROM events
        WHERE session_id = ?
          AND (hand_raised = 1 OR sleeping = 1
               OR COALESCE(phone_detected, 0) = 1)
        ORDER BY timestamp DESC
        LIMIT 50
    """, (session_id,))


@app.get("/session/{session_id}/transcripts")
def get_transcripts(session_id: int):
    return query("""
        SELECT * FROM transcripts
        WHERE session_id = ?
        ORDER BY timestamp DESC
    """, (session_id,))


@app.get("/active_session")
def get_active_session():
    try:
        with open("active_session.txt", "r") as f:
            session_id = int(f.read().strip())
        return {"session_id": session_id, "active": True}
    except FileNotFoundError:
        return {"session_id": None, "active": False}


@app.put("/session/{session_id}/update")
def update_session(session_id: int, label: str, teacher: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "UPDATE sessions SET label = ? WHERE id = ?",
        (f"{label} | {teacher}", session_id)
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}


@app.get("/")
async def root():
    return FileResponse(os.path.join(DIST, "index.html"))


DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dashboard", "dist")

app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

@app.get("/dashboard")
@app.get("/dashboard/{rest:path}")
async def serve_dashboard(rest: str = ""):
    return FileResponse(os.path.join(DIST, "index.html"))