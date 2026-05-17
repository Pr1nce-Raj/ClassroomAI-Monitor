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

# ── Read video config written by the dashboard ─────────────────────
ROOT             = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_CONFIG_PATH = os.path.join(ROOT, "video_config.json")

def load_video_config():
    try:
        with open(VIDEO_CONFIG_PATH, "r") as f:
            cfg = json.load(f)
        return cfg.get("video_mode", False), cfg.get("video_path", None)
    except FileNotFoundError:
        return False, None

VIDEO_MODE, VIDEO_PATH = load_video_config()

if VIDEO_MODE:
    print(f"[CONFIG] Video mode ON — source: {VIDEO_PATH}")
else:
    print("[CONFIG] Live camera mode.")

# ── Setup ──────────────────────────────────────────────────────────
init_db()

def get_latest_session():
    session_id = start_session(label="CS301 - Lecture Hall B")
    with open(os.path.join(ROOT, "active_session.txt"), "w") as f:
        f.write(str(session_id))
    return session_id

session_id = get_latest_session()

# Start audio pipeline in background thread (live mode only)
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

# ── YOLO ───────────────────────────────────────────────────────────
model = YOLO("yolov8n.pt")

# ── Open video source ──────────────────────────────────────────────
if VIDEO_MODE:
    if not VIDEO_PATH or not os.path.exists(VIDEO_PATH):
        print(f"ERROR: Video file not found at: {VIDEO_PATH}")
        print("Upload a video from the dashboard first, or switch back to camera mode.")
        exit()
    cap = cv2.VideoCapture(VIDEO_PATH)
    print(f"Playing: {VIDEO_PATH}")
else:
    cap = cv2.VideoCapture(0)
    print("Live camera mode.")

if not cap.isOpened():
    print("ERROR: Could not open video source.")
    exit()

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
    ret, frame = cap.read()

    if not ret:
        if VIDEO_MODE:
            print("Video ended — looping back to start.")
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            continue
        else:
            print("Camera feed lost.")
            break

    results = model(frame, classes=[0, 67], conf=0.45, verbose=False)
    boxes   = results[0].boxes
    now     = time.time()

    person_boxes = []
    phone_boxes  = []

    for box in boxes:
        cls    = int(box.cls[0])
        coords = tuple(map(int, box.xyxy[0]))
        if cls == 0:
            person_boxes.append(coords)
        elif cls == 67:
            phone_boxes.append(coords)
            px1, py1, px2, py2 = coords
            cv2.rectangle(frame, (px1, py1), (px2, py2), (0, 0, 255), 2)
            cv2.putText(frame, "PHONE", (px1, py1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    for i, (x1, y1, x2, y2) in enumerate(person_boxes):
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
            colour, label = (0, 220, 100), f"Focus: {score}%"
        elif score >= 40:
            colour, label = (0, 180, 255), f"Focus: {score}%"
        else:
            colour, label = (0, 60, 220), f"Focus: {score}%"

        if phone_detected:
            colour = (0, 0, 255)
            label  = f"ON PHONE ({score}%)"
            last_log = last_phone_log.get(i, 0)
            if now - last_log >= PHONE_DEBOUNCE:
                log_event(f"Phone detected — person {i+1}")
                last_phone_log[i] = now

        pose        = analyze_pose(crop)
        hand_raised = False
        sleeping    = False

        if pose is not None:
            hand_raised = pose["hand_raised"]
            sleeping    = pose["sleeping"]

            if hand_raised and not phone_detected:
                colour = (255, 200, 0)
                label  = f"HAND RAISED ({pose['side']})"
                last_log = last_hand_raise_log.get(i, 0)
                if now - last_log >= HAND_RAISE_DEBOUNCE:
                    log_event(f"Hand raise — person {i+1} ({pose['side']})")
                    last_hand_raise_log[i] = now

            if sleeping:
                colour = (0, 0, 200)
                label  = "SLEEPING"
                log_event(f"Sleeping — person {i+1}")

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
    cv2.putText(frame, f"● {SOURCE_LABEL}",
                (frame.shape[1] - 100, 30),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, src_color, 2)

    cv2.putText(
        frame,
        f"People: {len(person_boxes)}  Phones: {len(phone_boxes)}  Session: {session_id}",
        (10, frame.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
    )

    cv2.imshow("ByteHack - Classroom Monitor", frame)

    key = cv2.waitKey(1) & 0xFF
    if key == ord('q'):
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