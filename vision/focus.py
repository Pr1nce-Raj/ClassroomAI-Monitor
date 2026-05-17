import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision
from mediapipe.tasks.python.vision import FaceLandmarkerOptions, FaceLandmarker
from mediapipe.tasks.python.components.containers import landmark as lm_module
import os

# Path to the downloaded model file
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "face_landmarker.task"
)

# 6 landmark indices for head pose (nose, chin, eye corners, mouth corners)
LANDMARK_IDS = [1, 152, 263, 33, 287, 57]

# Real-world 3D face model
FACE_3D = np.array([
    [0.0,    0.0,    0.0  ],
    [0.0,   -63.6, -12.5  ],
    [-43.3,  32.7, -26.0  ],
    [43.3,   32.7, -26.0  ],
    [-28.9, -28.9, -24.1  ],
    [28.9,  -28.9, -24.1  ],
], dtype=np.float64)

# ── Initialize FaceLandmarker ─────────────────────────────────────
base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)

options = FaceLandmarkerOptions(
    base_options=base_options,
    num_faces=1,
    min_face_detection_confidence=0.5,
    min_face_presence_confidence=0.5,
    min_tracking_confidence=0.5,
    output_face_blendshapes=False,
    output_facial_transformation_matrixes=False,
)

detector = FaceLandmarker.create_from_options(options)
print("FaceLandmarker loaded successfully.")


def get_focus_score(crop):
    """
    Takes a BGR crop of one person from YOLO.
    Returns (score 0-100, yaw, pitch) or (None, None, None).
    """
    h, w = crop.shape[:2]
    if h < 60 or w < 40:
        return None, None, None

    # Convert to MediaPipe Image format
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

    # Run detection
    result = detector.detect(mp_image)

    if not result.face_landmarks:
        return None, None, None

    landmarks = result.face_landmarks[0]  # first face

    # Extract 2D pixel positions of our 6 reference landmarks
    face_2d = []
    for idx in LANDMARK_IDS:
        lm = landmarks[idx]
        face_2d.append([lm.x * w, lm.y * h])

    face_2d = np.array(face_2d, dtype=np.float64)

    # Camera matrix
    focal = w
    cam_matrix = np.array([
        [focal, 0,     w / 2],
        [0,     focal, h / 2],
        [0,     0,     1    ]
    ], dtype=np.float64)

    dist_coeffs = np.zeros((4, 1), dtype=np.float64)

    # solvePnP — match 3D model to 2D landmarks → rotation = head pose
    success, rot_vec, _ = cv2.solvePnP(
        FACE_3D, face_2d, cam_matrix, dist_coeffs,
        flags=cv2.SOLVEPNP_ITERATIVE
    )

    if not success:
        return None, None, None

    rmat, _ = cv2.Rodrigues(rot_vec)
    angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)

    pitch = angles[0]   # up/down
    yaw   = angles[1]   # left/right

    # Score drops as head turns away from camera
    yaw_score   = max(0.0, 1.0 - abs(yaw)   / 30.0)
    pitch_score = max(0.0, 1.0 - abs(pitch) / 20.0)
    score = int((0.5 * yaw_score + 0.5 * pitch_score) * 100)

    return score, round(yaw, 1), round(pitch, 1)