import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.vision import PoseLandmarkerOptions, PoseLandmarker
import os

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "pose_landmarker.task"
)

# Pose landmark indices we care about
LEFT_SHOULDER  = 11
RIGHT_SHOULDER = 12
LEFT_WRIST     = 15
RIGHT_WRIST    = 16
LEFT_EAR       = 7
RIGHT_EAR      = 8
NOSE           = 0

# ── Initialize PoseLandmarker ─────────────────────────────────────
base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)

options = PoseLandmarkerOptions(
    base_options=base_options,
    num_poses=1,
    min_pose_detection_confidence=0.5,
    min_pose_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)

detector = PoseLandmarker.create_from_options(options)
print("PoseLandmarker loaded successfully.")


def analyze_pose(crop):
    """
    Takes a BGR crop of one person from YOLO.
    Returns a dict with:
        hand_raised (bool)   — either hand above shoulder
        sleeping    (bool)   — head dropped very low
        side        (str)    — 'left', 'right', 'both', or None
    Returns None if no pose detected.
    """
    h, w = crop.shape[:2]
    if h < 80 or w < 40:
        return None

    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

    result = detector.detect(mp_image)

    if not result.pose_landmarks:
        return None

    lm = result.pose_landmarks[0]  # first person

    # Helper — get (x, y) in pixel coords from normalized landmark
    def px(idx):
        return lm[idx].x * w, lm[idx].y * h

    # Get key positions
    ls_x, ls_y = px(LEFT_SHOULDER)
    rs_x, rs_y = px(RIGHT_SHOULDER)
    lw_x, lw_y = px(LEFT_WRIST)
    rw_x, rw_y = px(RIGHT_WRIST)
    nose_x, nose_y = px(NOSE)

    # ── Hand raise detection ──────────────────────────────────────
    # Wrist Y < Shoulder Y means wrist is ABOVE shoulder in the image
    # We add a small threshold (20px) to avoid false positives
    RAISE_THRESHOLD = 20

    left_raised  = (ls_y - lw_y) > RAISE_THRESHOLD
    right_raised = (rs_y - rw_y) > RAISE_THRESHOLD

    hand_raised = left_raised or right_raised

    if left_raised and right_raised:
        side = "both"
    elif left_raised:
        side = "left"
    elif right_raised:
        side = "right"
    else:
        side = None

    # ── Sleep detection ───────────────────────────────────────────
    # Average shoulder Y position
    shoulder_avg_y = (ls_y + rs_y) / 2

    # If nose is BELOW the shoulder midpoint — head has dropped forward
    # In image coords: nose Y > shoulder Y = head drooping down
    sleeping = (nose_y - shoulder_avg_y) > 30

    return {
        "hand_raised": hand_raised,
        "side":        side,
        "sleeping":    sleeping,
    }