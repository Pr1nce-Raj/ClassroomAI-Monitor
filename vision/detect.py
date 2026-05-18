import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import json
import time
import threading
from ultralytics import YOLO
from vision.focus    import get_focus_score
from vision.pose     import analyze_pose
from database.db     import init_db, start_session, end_session, save_event
from audio.listen    import run_audio_pipeline

ROOT              = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_CONFIG_PATH = os.path.join(ROOT, "video_config.json")
STOP_FLAG_PATH    = os.path.join(ROOT, "stop_pipeline.flag")

def load_video_config():
    try:
        with open(VIDEO_CONFIG_PATH, "r") as f:
            cfg = json.load(f)
        return cfg.get("video_mode", False), cfg.get("video_path", None)
    except FileNotFoundError:
        return False, None

VIDEO_MODE, VIDEO_PATH = load_video_config()

# Fallback to camera if video file no longer exists
if VIDEO_MODE and (not VIDEO_PATH or not os.path.exists(VIDEO_PATH)):
    print(f"[CONFIG] Video file not found — falling back to webcam.")
    VIDEO_MODE = False
    VIDEO_PATH = None

if VIDEO_MODE:
    print(f"[CONFIG] Video mode ON — source: {VIDEO_PATH}")
else:
    print("[CONFIG] Live camera mode.")

# Clean up any leftover stop flag from a previous run
if os.path.exists(STOP_FLAG_PATH):
    os.remove(STOP_FLAG_PATH)

init_db()

def get_latest_session():
    session_id = start_session(label="CS301 - Lecture Hall B")
    with open(os.path.join(ROOT, "active_session.txt"), "w") as f:
        f.write(str(session_id))
    return session_id

session_id = get_latest_session()

stop_audio = threading.Event()
if not VIDEO_MODE:
    audio_thread = threading.Thread(
        target=run_audio_pipeline,
        args=(session_id, stop_audio),
        daemon=True
    )
    audio_thread.start()
    print("Audio pipeline started.")
else:
    print("Video mode — audio pipeline disabled.")
    audio_thread = None

model = YOLO("yolov8n.pt")

if VIDEO_MODE:
    if not VIDEO_PATH or not os.path.exists(VIDEO_PATH):
        print(f"ERROR: Video file not found at: {VIDEO_PATH}")
        exit()
    cap = cv2.VideoCapture(VIDEO_PATH)
    print(f"Playing: {VIDEO_PATH}")
else:
    cap = cv2.VideoCapture(0)
    print("Live camera mode.")

if not cap.isOpened():
    print("ERROR: Could not open video source.")
    exit()

# ── Fix 1: Resizable window with default size ──────────────────────
WINDOW_NAME = "ClassroomAI Monitor — ByteHack 2026"
cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
cv2.resizeWindow(WINDOW_NAME, 1024, 600)

SOURCE_LABEL = "VIDEO" if VIDEO_MODE else "LIVE"
print("Running. Press Q to quit. Press R to restart video (video mode only).")

event_log           = []
last_save_time      = time.time()
last_hand_raise_log = {}
last_phone_log      = {}
SAVE_INTERVAL       = 5
HAND_RAISE_DEBOUNCE = 3
PHONE_DEBOUNCE      = 5


def log_event(msg):
    event_log.append(msg)
    if len(event_log) > 5:
        event_log.pop(0)
    print(msg)


def boxes_overlap(box1, box2, threshold=0.3):
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])
    if x2 <= x1 or y2 <= y1:
        return False
    intersection = (x2 - x1) * (y2 - y1)
    box2_area    = (box2[2] - box2[0]) * (box2[3] - box2[1])
    return intersection > threshold * box2_area


while True:
    # ── Fix 2: Detect window X button close ───────────────────────
    # getWindowProperty returns -1 if the window no longer exists
    try:
        visible = cv2.getWindowProperty(WINDOW_NAME, cv2.WND_PROP_VISIBLE)
        if visible < 1:
            print("Window closed — shutting down cleanly.")
            break
    except cv2.error:
        print("Window closed — shutting down cleanly.")
        break

    # ── Fix 3: Check for stop flag written by FastAPI ─────────────
    if os.path.exists(STOP_FLAG_PATH):
        print("Stop signal received from dashboard — shutting down.")
        os.remove(STOP_FLAG_PATH)
        break

    ret, frame = cap.read()

    if not ret:
        if VIDEO_MODE:
            print("Video ended — looping back to start.")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
        else:
            print("Camera feed lost.")
            break

    results = model.track(
        frame,
        classes=[0, 67],
        conf=0.45,
        verbose=False,
        persist=True,
        tracker="bytetrack.yaml"
    )
    boxes = results[0].boxes
    now   = time.time()

    person_boxes = []
    phone_boxes  = []

    for box in boxes:
        cls    = int(box.cls[0])
        coords = tuple(map(int, box.xyxy[0]))
        tid    = int(box.id[0]) if box.id is not None else -1

        if cls == 0:
            person_boxes.append((*coords, tid))
        elif cls == 67:
            phone_boxes.append(coords)
            px1, py1, px2, py2 = coords
            cv2.rectangle(frame, (px1, py1), (px2, py2), (0, 0, 255), 2)
            cv2.putText(frame, "PHONE", (px1, py1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    for i, (x1, y1, x2, y2, track_id) in enumerate(person_boxes):
        crop = frame[y1:y2, x1:x2]
        if crop.shape[0] < 80 or crop.shape[1] < 40:
            continue

        phone_detected = any(
            boxes_overlap((x1, y1, x2, y2), pb) for pb in phone_boxes
        )

        score, yaw, pitch = get_focus_score(crop)

        if phone_detected and score is not None:
            score = max(0, score - 30)

        if score is None:
            colour, label = (150, 150, 150), "No face"
        elif score >= 70:
            colour, label = (0, 220, 100), f"S{track_id} Focus: {score}%"
        elif score >= 40:
            colour, label = (0, 180, 255), f"S{track_id} Focus: {score}%"
        else:
            colour, label = (0, 60, 220), f"S{track_id} Focus: {score}%"

        if phone_detected:
            colour = (0, 0, 255)
            label  = f"S{track_id} ON PHONE ({score}%)"
            last_log = last_phone_log.get(track_id, 0)
            if now - last_log >= PHONE_DEBOUNCE:
                log_event(f"Phone detected — Student {track_id}")
                last_phone_log[track_id] = now

        pose        = analyze_pose(crop)
        hand_raised = False
        sleeping    = False

        if pose is not None:
            hand_raised = pose["hand_raised"]
            sleeping    = pose["sleeping"]

            if hand_raised and not phone_detected:
                colour = (255, 200, 0)
                label  = f"S{track_id} HAND RAISED ({pose['side']})"
                last_log = last_hand_raise_log.get(track_id, 0)
                if now - last_log >= HAND_RAISE_DEBOUNCE:
                    log_event(f"Hand raise — Student {track_id} ({pose['side']})")
                    last_hand_raise_log[track_id] = now

            if sleeping:
                colour = (0, 0, 200)
                label  = f"S{track_id} SLEEPING"
                log_event(f"Sleeping — Student {track_id}")

        if now - last_save_time >= SAVE_INTERVAL:
            save_event(
                session_id     = session_id,
                person_index   = i,
                focus_score    = score,
                yaw            = yaw,
                pitch          = pitch,
                hand_raised    = hand_raised,
                sleeping       = sleeping,
                phone_detected = phone_detected,
                track_id       = track_id,
            )

        cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
        cv2.putText(frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)

        if yaw is not None:
            cv2.putText(frame, f"yaw={yaw} pitch={pitch}",
                        (x1, y2 + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)

    if now - last_save_time >= SAVE_INTERVAL:
        last_save_time = now

    for j, event in enumerate(reversed(event_log)):
        cv2.putText(frame, event, (10, 30 + j * 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 50), 1)

    src_color = (0, 165, 255) if VIDEO_MODE else (0, 220, 100)
    cv2.putText(frame, f"● {SOURCE_LABEL}  |  Q = quit  R = restart video",
                (10, frame.shape[0] - 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, src_color, 1)

    cv2.putText(
        frame,
        f"Students: {len(person_boxes)}  Phones: {len(phone_boxes)}  Session: {session_id}",
        (10, frame.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
    )

    cv2.imshow(WINDOW_NAME, frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
        print("Q pressed — shutting down.")
        break
    elif key == ord('r') and VIDEO_MODE:
        print("Restarting video...")
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

# ── Cleanup ────────────────────────────────────────────────────────
cap.release()
cv2.destroyAllWindows()
stop_audio.set()
if audio_thread is not None:
    audio_thread.join(timeout=5)
active_path = os.path.join(ROOT, "active_session.txt")
if os.path.exists(active_path):
    os.remove(active_path)
end_session(session_id)

# Delete uploaded video and reset config after session ends
if VIDEO_MODE and VIDEO_PATH and os.path.exists(VIDEO_PATH):
    try:
        os.remove(VIDEO_PATH)
        print(f"Deleted uploaded video: {VIDEO_PATH}")
    except Exception as e:
        print(f"Could not delete video: {e}")

# Reset video_config.json back to camera mode
config = {"video_mode": False, "video_path": None, "filename": None}
with open(VIDEO_CONFIG_PATH, "w") as f:
    json.dump(config, f)
print("Video config reset to camera mode.")

print("Pipeline stopped cleanly.")