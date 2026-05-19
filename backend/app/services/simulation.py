from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import DATA_DIR, DEFAULT_SIMULATION_SPEED
from app.services.pipeline import reset_pipeline_state, run_pipeline


_simulation_task: asyncio.Task | None = None
_simulation_status: dict[str, Any] = {
    "running": False,
    "scenario_id": None,
    "current_timestamp": None,
    "rows_processed": 0,
    "speed": DEFAULT_SIMULATION_SPEED,
}


def _fault_label_from_filename(file_path: Path) -> str:
    name = file_path.stem.lower()
    if name == "chillerplant":
        return "normal"
    if "bypass_leakage" in name:
        return "bypass_valve_leakage"
    if "bypass_stuck" in name:
        return "bypass_valve_stuck"
    if "coolingtower_fouling" in name:
        return "cooling_tower_fouling"
    if "coolingtower_bias" in name:
        return "cooling_tower_temp_sensor_bias"
    if "chiller_bias" in name:
        return "chiller_temp_sensor_bias"
    if "secondary_chilled_water_pressure_bias" in name:
        return "secondary_pressure_sensor_bias"
    if "coolingtower_pi" in name:
        return "controller_pi_fault"
    return "normal"


def _resolve_data_file(file_name: str) -> Path:
    candidate = Path(file_name)
    if candidate.is_file():
        return candidate.resolve()

    resolved = DATA_DIR / file_name
    if resolved.is_file():
        return resolved

    raise FileNotFoundError(f"Simulation data file not found: {file_name}")


def _normalize_speed(speed: float) -> float:
    normalized = float(speed)
    if normalized <= 0:
        raise ValueError("Simulation speed must be greater than 0.")
    return normalized


def _status_snapshot() -> dict[str, Any]:
    return dict(_simulation_status)


def get_simulation_status() -> dict[str, Any]:
    return _status_snapshot()


async def _run_segments(
    scenario_id: str,
    segments: list[dict[str, Any]],
    speed: float,
) -> None:
    global _simulation_task

    try:
        for segment in segments:
            data_frame = pd.read_csv(segment["path"], nrows=segment["rows"])
            for record in data_frame.to_dict(orient="records"):
                timestamp = pd.to_datetime(record.get("Datetime"), errors="coerce")
                timestamp_value = (
                    timestamp.isoformat()
                    if not pd.isna(timestamp)
                    else str(record.get("Datetime", ""))
                )

                record["timestamp"] = timestamp_value
                record["fault_label"] = segment["fault_label"]
                record["scenario_id"] = scenario_id

                _simulation_status["current_timestamp"] = timestamp_value
                _simulation_status["rows_processed"] += 1

                await run_pipeline(record)
                await asyncio.sleep(1.0 / speed)
    except asyncio.CancelledError:
        raise
    finally:
        _simulation_status["running"] = False
        _simulation_status["scenario_id"] = None
        if _simulation_task is asyncio.current_task():
            _simulation_task = None


async def stop_simulation() -> dict[str, Any]:
    global _simulation_task

    task = _simulation_task
    _simulation_task = None

    if task is not None and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    _simulation_status["running"] = False
    _simulation_status["scenario_id"] = None
    return _status_snapshot()


async def start_simulation(
    file_name: str,
    speed: float = DEFAULT_SIMULATION_SPEED,
    rows: int | None = None,
) -> dict[str, Any]:
    global _simulation_task

    await stop_simulation()
    reset_pipeline_state(clear_history=True)

    file_path = _resolve_data_file(file_name)
    speed = _normalize_speed(speed)

    _simulation_status.update(
        {
            "running": True,
            "scenario_id": file_path.stem,
            "current_timestamp": None,
            "rows_processed": 0,
            "speed": speed,
        }
    )

    segments = [
        {
            "path": file_path,
            "rows": rows,
            "fault_label": _fault_label_from_filename(file_path),
        }
    ]
    _simulation_task = asyncio.create_task(
        _run_segments(file_path.stem, segments, speed)
    )
    return _status_snapshot()


async def start_demo_simulation(
    speed: float = DEFAULT_SIMULATION_SPEED,
) -> dict[str, Any]:
    global _simulation_task

    await stop_simulation()
    reset_pipeline_state(clear_history=True)

    speed = _normalize_speed(speed)
    demo_files = [
        "ChillerPlant.csv",
        "ChillerPlant_bypass_leakage_025.csv",
        "ChillerPlant_bypass_leakage_075.csv",
    ]
    segments = []
    for file_name in demo_files:
        file_path = _resolve_data_file(file_name)
        segments.append(
            {
                "path": file_path,
                "rows": 300,
                "fault_label": _fault_label_from_filename(file_path),
            }
        )

    _simulation_status.update(
        {
            "running": True,
            "scenario_id": "demo",
            "current_timestamp": None,
            "rows_processed": 0,
            "speed": speed,
        }
    )

    _simulation_task = asyncio.create_task(_run_segments("demo", segments, speed))
    return _status_snapshot()
