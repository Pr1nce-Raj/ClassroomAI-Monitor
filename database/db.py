import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "classroom.db"
)


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            ended_at   TEXT,
            label      TEXT DEFAULT 'CS301'
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   INTEGER NOT NULL,
            timestamp    TEXT NOT NULL,
            person_index INTEGER NOT NULL,
            track_id     INTEGER DEFAULT -1,
            focus_score  INTEGER,
            yaw          REAL,
            pitch        REAL,
            hand_raised  INTEGER DEFAULT 0,
            sleeping     INTEGER DEFAULT 0,
            phone_detected INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    """)

    conn.commit()
    conn.close()
    print(f"Database ready at: {DB_PATH}")
    migrate_db()


def migrate_db():
    conn = get_connection()
    migrations = [
        "ALTER TABLE events ADD COLUMN phone_detected INTEGER DEFAULT 0",
        "ALTER TABLE events ADD COLUMN track_id INTEGER DEFAULT -1",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
        except Exception:
            pass
    conn.commit()
    conn.close()


def start_session(label="CS301"):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sessions (started_at, label) VALUES (?, ?)",
        (datetime.now().isoformat(), label)
    )
    session_id = cursor.lastrowid
    conn.commit()
    conn.close()
    print(f"Session started — ID: {session_id}")
    return session_id


def end_session(session_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE sessions SET ended_at = ? WHERE id = ?",
        (datetime.now().isoformat(), session_id)
    )
    conn.commit()
    conn.close()
    print(f"Session {session_id} ended.")


def save_event(session_id, person_index, focus_score, yaw, pitch,
               hand_raised, sleeping, phone_detected=False, track_id=-1):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO events
            (session_id, timestamp, person_index, track_id, focus_score,
             yaw, pitch, hand_raised, sleeping, phone_detected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        datetime.now().isoformat(),
        person_index,
        track_id,
        focus_score,
        yaw,
        pitch,
        1 if hand_raised    else 0,
        1 if sleeping       else 0,
        1 if phone_detected else 0,
    ))
    conn.commit()
    conn.close()


def get_session_summary(session_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            COUNT(*)                          AS total_events,
            ROUND(AVG(focus_score), 1)        AS avg_focus,
            SUM(hand_raised)                  AS total_hand_raises,
            SUM(sleeping)                     AS total_sleeping
        FROM events
        WHERE session_id = ?
    """, (session_id,))
    row = cursor.fetchone()
    conn.close()
    return {
        "session_id":        session_id,
        "total_events":      row["total_events"],
        "avg_focus":         row["avg_focus"],
        "total_hand_raises": row["total_hand_raises"],
        "total_sleeping":    row["total_sleeping"],
    }