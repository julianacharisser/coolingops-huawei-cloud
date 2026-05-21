from __future__ import annotations

import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[2]


def _load_env_file() -> None:
    env_path = BACKEND_DIR / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = value.strip().strip('"').strip("'")


_load_env_file()


APP_TITLE = "CoolingOps Backend"
APP_VERSION = "1.0.0"

HUAWEI_AK = os.getenv("HUAWEI_AK")
HUAWEI_SK = os.getenv("HUAWEI_SK")
SMN_TOPIC_URN = os.getenv("SMN_TOPIC_URN")
MODELARTS_API_KEY = os.getenv("MODELARTS_API_KEY")
MODELARTS_API_URL = os.getenv("MODELARTS_API_URL")

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
