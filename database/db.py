import sqlite3
import os
from datetime import datetime

# Database file will be created in ByteHack_AI folder
DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "classroom.db"
)


def get_connection():
    """Get a connection to the database."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # lets us access columns by name
    return conn


def init_db():
    """
    Create tables if they don't exist yet.
    Safe to call every time the app starts.
    """
    conn = get_connection()
    cursor = conn.cursor()

    # sessions table — one row per recording session
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            ended_at   TEXT,
            label      TEXT DEFAULT 'CS301'
        )
    """)

    # events table — one row saved every 5 seconds per person
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id   INTEGER NOT NULL,
            timestamp    TEXT NOT NULL,
            person_index INTEGER NOT NULL,
            focus_score  INTEGER,
            yaw          REAL,
            pitch        REAL,
            hand_raised  INTEGER DEFAULT 0,
            sleeping     INTEGER DEFAULT 0,
            FOREIGN KEY (session_id) REFERENCES sessions(id)
        )
    """)

    conn.commit()
    conn.close()
    print(f"Database ready at: {DB_PATH}")
    migrate_db()

def start_session(label="CS301"):
    """
    Call this when the camera starts.
    Returns the session_id to use for all events in this recording.
    """
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
    """Call this when the camera stops."""
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
               hand_raised, sleeping, phone_detected=False):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO events
            (session_id, timestamp, person_index, focus_score,
             yaw, pitch, hand_raised, sleeping, phone_detected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        session_id,
        datetime.now().isoformat(),
        person_index,
        focus_score,
        yaw,
        pitch,
        1 if hand_raised     else 0,
        1 if sleeping        else 0,
        1 if phone_detected  else 0,
    ))

    conn.commit()
    conn.close()


def get_session_summary(session_id):
    """
    Returns a summary dict for a session.
    Used later by FastAPI to send data to the dashboard.
    """
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
def migrate_db():
    """Add new columns if they don't exist — safe to run every time."""
    conn = get_connection()
    try:
        conn.execute("ALTER TABLE events ADD COLUMN phone_detected INTEGER DEFAULT 0")
        print("Migration: added phone_detected column")
    except Exception:
        pass  # column already exists, no problem
    conn.commit()
    conn.close()