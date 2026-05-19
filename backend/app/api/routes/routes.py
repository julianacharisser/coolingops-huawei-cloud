from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import DEFAULT_SIMULATION_SPEED
from app.services.pipeline import anomaly_history, build_risk_components, copilot_history
from app.services.simulation import (
    get_simulation_status,
    start_demo_simulation,
    start_simulation,
    stop_simulation,
)


router = APIRouter(prefix="/api", tags=["coolingops"])


@router.get("/anomalies")
async def list_anomalies() -> dict:
    return {
        "total": len(anomaly_history),
        "items": list(reversed(anomaly_history)),
    }


@router.patch("/anomalies/{anomaly_id}/acknowledge")
async def acknowledge_anomaly(anomaly_id: int) -> dict:
    for event in anomaly_history:
        if event["id"] == anomaly_id:
            event["acknowledged"] = True
            return event

    raise HTTPException(status_code=404, detail=f"Anomaly {anomaly_id} not found")


@router.get("/copilot/history")
async def copilot_history_endpoint() -> dict:
    return {
        "total": len(copilot_history),
        "items": list(reversed(copilot_history)),
    }


@router.get("/copilot/latest")
async def latest_copilot() -> dict:
    if not copilot_history:
        return {"message": "No recommendations yet"}
    return copilot_history[-1]


@router.get("/risk/components")
async def risk_components() -> dict:
    return build_risk_components()


@router.get("/simulation/status")
async def simulation_status() -> dict:
    return get_simulation_status()


@router.post("/simulation/start")
async def start_simulation_endpoint(
    file_name: str,
    speed: float = DEFAULT_SIMULATION_SPEED,
    rows: int | None = None,
) -> dict:
    try:
        return await start_simulation(file_name=file_name, speed=speed, rows=rows)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/simulation/demo")
async def start_demo_simulation_endpoint(
    speed: float = DEFAULT_SIMULATION_SPEED,
) -> dict:
    try:
        return await start_demo_simulation(speed=speed)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/simulation/stop")
async def stop_simulation_endpoint() -> dict:
    return await stop_simulation()
