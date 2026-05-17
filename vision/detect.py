import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import cv2
import time
import threading
from ultralytics import YOLO
from vision.focus    import get_focus_score
from vision.pose     import analyze_pose
from database.db     import init_db, start_session, end_session, save_event
from audio.listen    import run_audio_pipeline

# ── Setup ─────────────────────────────────────────────────────────
init_db()
import time as _time

# Wait for dashboard to create session first (up to 30 seconds)
def get_latest_session():
    session_id = start_session(label="CS301 - Lecture Hall B")
    # Write active session ID to a file so dashboard can read it
    with open("active_session.txt", "w") as f:
        f.write(str(session_id))
    return session_id  # ← THIS LINE WAS MISSING

session_id = get_latest_session()

# Start audio pipeline in background thread
stop_audio   = threading.Event()
audio_thread = threading.Thread(
    target=run_audio_pipeline,
    args=(session_id, stop_audio),
    daemon=True
)
audio_thread.start()

# ── YOLO — detect BOTH persons (0) and phones (67) ────────────────
model = YOLO("yolov8n.pt")
cap   = cv2.VideoCapture(0)

if not cap.isOpened():
    print("ERROR: Could not open webcam.")
    exit()

print("Running. Press Q to quit.")

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
    """
    Check if two bounding boxes overlap.
    box1, box2 = (x1, y1, x2, y2)
    Returns True if intersection area > threshold * smaller box area.
    """
    x1 = max(box1[0], box2[0])
    y1 = max(box1[1], box2[1])
    x2 = min(box1[2], box2[2])
    y2 = min(box1[3], box2[3])

    if x2 <= x1 or y2 <= y1:
        return False   # no overlap

    intersection = (x2 - x1) * (y2 - y1)
    box2_area    = (box2[2] - box2[0]) * (box2[3] - box2[1])

    return intersection > threshold * box2_area


while True:
    ret, frame = cap.read()
    if not ret:
        break

    # Detect persons AND phones in one single YOLO pass
    results = model(frame, classes=[0, 67], conf=0.45, verbose=False)
    boxes   = results[0].boxes
    now     = time.time()

    # Separate person boxes and phone boxes
    person_boxes = []
    phone_boxes  = []

    for box in boxes:
        cls = int(box.cls[0])
        coords = tuple(map(int, box.xyxy[0]))
        if cls == 0:
            person_boxes.append(coords)
        elif cls == 67:
            phone_boxes.append(coords)
            # Draw phone box in red
            px1, py1, px2, py2 = coords
            cv2.rectangle(frame, (px1, py1), (px2, py2), (0, 0, 255), 2)
            cv2.putText(frame, "PHONE", (px1, py1 - 6),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)

    # Process each person
    for i, (x1, y1, x2, y2) in enumerate(person_boxes):
        crop = frame[y1:y2, x1:x2]

        if crop.shape[0] < 80 or crop.shape[1] < 40:
            continue

        # ── Check if any phone overlaps this person ───────────────
        phone_detected = any(
            boxes_overlap((x1, y1, x2, y2), pb)
            for pb in phone_boxes
        )

        # ── Focus score ───────────────────────────────────────────
        score, yaw, pitch = get_focus_score(crop)

        # Apply phone penalty — reduce score by 30 points
        if phone_detected and score is not None:
            score = max(0, score - 30)

        if score is None:
            colour = (150, 150, 150)
            label  = "No face"
        elif score >= 70:
            colour = (0, 220, 100)
            label  = f"Focus: {score}%"
        elif score >= 40:
            colour = (0, 180, 255)
            label  = f"Focus: {score}%"
        else:
            colour = (0, 60, 220)
            label  = f"Focus: {score}%"

        # ── Phone override ────────────────────────────────────────
        if phone_detected:
            colour = (0, 0, 255)       # bright red
            label  = f"ON PHONE ({score}%)"
            last_log = last_phone_log.get(i, 0)
            if now - last_log >= PHONE_DEBOUNCE:
                log_event(f"Phone detected — person {i+1}")
                last_phone_log[i] = now

        # ── Pose analysis ─────────────────────────────────────────
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

        # ── Save to database every 5 seconds ──────────────────────
        if now - last_save_time >= SAVE_INTERVAL:
            save_event(
                session_id    = session_id,
                person_index  = i,
                focus_score   = score,
                yaw           = yaw,
                pitch         = pitch,
                hand_raised   = hand_raised,
                sleeping      = sleeping,
                phone_detected= phone_detected,
            )

        # ── Draw person box and label ─────────────────────────────
        cv2.rectangle(frame, (x1, y1), (x2, y2), colour, 2)
        cv2.putText(frame, label, (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, colour, 2)

        if yaw is not None:
            cv2.putText(frame, f"yaw={yaw} pitch={pitch}",
                        (x1, y2 + 18),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1)

    # Update save timer
    if now - last_save_time >= SAVE_INTERVAL:
        last_save_time = now

    # ── Event log overlay ─────────────────────────────────────────
    for j, event in enumerate(reversed(event_log)):
        cv2.putText(frame, event, (10, 30 + j * 22),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 50), 1)

    # ── Status bar ────────────────────────────────────────────────
    cv2.putText(
        frame,
        f"People: {len(person_boxes)}  Phones: {len(phone_boxes)}  Session: {session_id}",
        (10, frame.shape[0] - 10),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1
    )

    cv2.imshow("ByteHack - Classroom Monitor", frame)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ── Cleanup ───────────────────────────────────────────────────────
cap.release()
cv2.destroyAllWindows()
stop_audio.set()
audio_thread.join(timeout=5)
# Clear active session file
if os.path.exists("active_session.txt"):
    os.remove("active_session.txt")
end_session(session_id)