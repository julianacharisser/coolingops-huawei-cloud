from __future__ import annotations

import os
from pathlib import Path


APP_TITLE = "CoolingOps Backend"
APP_VERSION = "1.0.0"

HUAWEI_AK = os.getenv("HUAWEI_AK")
HUAWEI_SK = os.getenv("HUAWEI_SK")
SMN_TOPIC_URN = os.getenv("SMN_TOPIC_URN")

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data" / "raw" / "official"

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://coolingops-frontend.obs-website.ap-southeast-3.myhuaweicloud.com",
]

ROLLING_WINDOW_SIZE = 150
DEFAULT_SIMULATION_SPEED = 1.0
WS_CHANNELS = ("sensors", "alerts", "copilot")
