from __future__ import annotations

from pathlib import Path


APP_TITLE = "CoolingOps Backend"
APP_VERSION = "1.0.0"

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data" / "raw" / "official"

CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]

ROLLING_WINDOW_SIZE = 150
DEFAULT_SIMULATION_SPEED = 1.0
WS_CHANNELS = ("sensors", "alerts", "copilot")
