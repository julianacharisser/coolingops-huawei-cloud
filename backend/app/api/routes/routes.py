from __future__ import annotations

from collections import Counter, defaultdict
import os
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import DEFAULT_SIMULATION_SPEED
from app.services.pipeline import (
    anomaly_history,
    build_risk_components,
    copilot_history,
    get_latest_sensor_snapshot,
)
from app.services.simulation import (
    get_simulation_status,
    start_demo_simulation,
    start_simulation,
    stop_simulation,
)


router = APIRouter(prefix="/api", tags=["coolingops"])


class AnomalyFeedbackRequest(BaseModel):
    assigned_to: str | None = None
    prediction_correct: str | None = None
    resolution: str | None = None
    description: str | None = None
    accuracy_rating: int | None = None
    time_to_resolve_minutes: int | None = None


class CopilotChatContext(BaseModel):
    fault_type: str | None = None
    confidence: float | None = None
    degradation_score: float | None = None
    gate_scores: dict | None = None
    component: str | None = None
    reasoning: dict | None = None


class CopilotChatRequest(BaseModel):
    question: str
    context: CopilotChatContext


DEMO_FEEDBACK_SUMMARY = {
    "total": 12,
    "confirmed": 9,
    "partial": 2,
    "incorrect": 1,
    "avg_rating": 4.2,
    "avg_resolve_minutes": 34,
    "most_common_fault": "bypass_valve_leakage",
    "by_fault_type": [
        {"fault": "bypass_valve_leakage", "correct": 4, "total": 5},
        {"fault": "cooling_tower_fouling", "correct": 3, "total": 4},
        {"fault": "chiller_temp_sensor_bias", "correct": 2, "total": 3},
    ],
}

PLANT_LAYOUT = (
    "CoolingOps monitors a chiller plant with 3 cooling towers, 3 condenser water pumps, "
    "3 chillers, 3 primary pumps, 2 secondary pumps, and a bypass valve."
)

COMPONENT_SENSOR_PREFIXES = {
    "plant": ("CT_", "CDWL_", "CHL_", "CWL_", "TWV_"),
    "chiller": ("CHL_",),
    "cooling tower": ("CT_",),
    "tower": ("CT_",),
    "pump": ("CDWL_PM_", "CWL_PRI_PM_", "CWL_SEC_", "CDWL_"),
    "primary pump": ("CWL_PRI_PM_",),
    "secondary pump": ("CWL_SEC_",),
    "secondary loop": ("CWL_SEC_",),
    "bypass": ("TWV_", "CWL_SEC_DP", "CWL_SEC_DPSPT", "CDWL_CW_FLOW"),
    "valve": ("TWV_", "CWL_SEC_DP", "CWL_SEC_DPSPT", "CDWL_CW_FLOW"),
    "condenser": ("CDWL_",),
}


def _find_anomaly(anomaly_id: int) -> dict:
    for event in anomaly_history:
        if event["id"] == anomaly_id:
            return event
    raise HTTPException(status_code=404, detail=f"Anomaly {anomaly_id} not found")


def _demo_copilot_answer(question: str, context: CopilotChatContext) -> str:
    merged = _resolve_chat_context(context, question)
    lowered = question.lower()
    component = merged["component"] or "the subsystem"
    fault_type = merged["fault_type"] or "the active anomaly"
    confidence = merged["confidence"]
    degradation = merged["degradation_score"]
    sensor_summary = merged["sensor_summary"]
    latest_alert = merged["latest_alert"]

    if "what kind of questions" in lowered or "what can you answer" in lowered:
        return (
            "I can explain plant status, summarize active faults, estimate urgency, suggest checks, "
            "interpret gate scores, and comment on chillers, towers, pumps, valves, and recent sensor trends."
        )

    if "plant" in lowered or "system" in lowered:
        if latest_alert:
            return (
                f"{PLANT_LAYOUT} The latest issue is {latest_alert['fault_type']} on {latest_alert['component']} "
                f"at {float(latest_alert['degradation_score']) * 100:.0f}% risk and "
                f"{float(latest_alert['confidence']) * 100:.0f}% confidence. "
                f"{sensor_summary}"
            )
        if sensor_summary:
            return f"{PLANT_LAYOUT} Latest live readings include {sensor_summary.lower()}."
        return f"{PLANT_LAYOUT} Start the simulation to load live plant readings and anomaly context."

    if any(word in lowered for word in ("chiller", "tower", "pump", "valve", "bypass")) and sensor_summary:
        return f"For {component}, the latest available readings are {sensor_summary.lower()}."

    if "why" in lowered:
        gate_scores = merged["gate_scores"] or {}
        if gate_scores:
            top_name, top_score = sorted(
                gate_scores.items(), key=lambda item: item[1], reverse=True
            )[0]
            return (
                f"The current signal points to {fault_type} around {component}. "
                f"The strongest indicator is {top_name} at {float(top_score):.2f}, "
                f"which is consistent with the latest degradation pattern."
            )
        return f"The current signal points to {fault_type} around {component} based on the latest model context."

    if "urgent" in lowered:
        if degradation is not None and confidence is not None:
            return (
                f"This looks time-sensitive. {component} is showing roughly "
                f"{float(degradation) * 100:.0f}% degradation with model confidence near "
                f"{float(confidence) * 100:.0f}%, so it should be checked soon."
            )
        return f"This should be treated as time-sensitive until {component} is inspected."

    if "check" in lowered:
        return (
            f"Start with {component}: verify the control signal, inspect the physical actuator or sensor path, "
            f"and compare the current readings against the reasoning trace before taking corrective action."
        )

    return "Please start the simulation to get live plant context."


def _clean_env(name: str) -> str | None:
    value = os.getenv(name)
    if value is None:
        return None
    cleaned = value.strip().strip('"').strip("'")
    return cleaned or None


def _modelarts_endpoint() -> tuple[str | None, str | None]:
    api_url = _clean_env("MODELARTS_API_URL")
    api_key = _clean_env("MODELARTS_API_KEY")
    if not api_url or not api_key:
        return None, None

    normalized_url = api_url.rstrip("/")
    if normalized_url.endswith("/openai/v1") or normalized_url.endswith("/v1"):
        normalized_url = f"{normalized_url}/chat/completions"

    return normalized_url, api_key


def _format_sensor_value(value: object) -> str:
    if isinstance(value, (int, float)):
        return f"{float(value):.2f}"
    return str(value)


def _select_sensor_excerpt(question: str, component: str | None, sensor_data: dict) -> list[str]:
    lowered = question.lower()
    prefixes: tuple[str, ...] = ()

    for keyword, keyword_prefixes in COMPONENT_SENSOR_PREFIXES.items():
        if keyword in lowered:
            prefixes = keyword_prefixes
            break

    if not prefixes and component:
        prefixes = COMPONENT_SENSOR_PREFIXES.get(component.lower(), ())

    if prefixes:
        matched = [
            f"{tag}={_format_sensor_value(value)}"
            for tag, value in sensor_data.items()
            if any(tag.startswith(prefix) for prefix in prefixes)
        ]
        if matched:
            return matched[:8]

    return [
        f"{tag}={_format_sensor_value(value)}"
        for tag, value in list(sensor_data.items())[:8]
    ]


def _resolve_chat_context(context: CopilotChatContext, question: str) -> dict:
    latest_alert = anomaly_history[-1] if anomaly_history else None
    latest_recommendation = copilot_history[-1] if copilot_history else None
    latest_snapshot = get_latest_sensor_snapshot()
    sensor_data = latest_snapshot.get("sensor_data", {}) if latest_snapshot else {}
    component = context.component or (latest_alert or {}).get("component")
    sensor_excerpt = _select_sensor_excerpt(question, component, sensor_data)
    sensor_summary = ", ".join(sensor_excerpt) if sensor_excerpt else "No live sensor values available"

    return {
        "fault_type": context.fault_type or (latest_alert or {}).get("fault_type"),
        "confidence": context.confidence if context.confidence is not None else (latest_alert or {}).get("confidence"),
        "degradation_score": (
            context.degradation_score
            if context.degradation_score is not None
            else (latest_alert or {}).get("degradation_score")
        ),
        "gate_scores": context.gate_scores or (latest_alert or {}).get("gate_scores"),
        "component": component,
        "reasoning": context.reasoning or (latest_recommendation or {}).get("reasoning"),
        "latest_alert": latest_alert,
        "latest_recommendation": latest_recommendation,
        "latest_snapshot": latest_snapshot,
        "sensor_summary": sensor_summary,
    }


def _build_system_prompt(context: CopilotChatContext, question: str) -> str:
    resolved = _resolve_chat_context(context, question)
    confidence_pct = (
        f"{float(resolved['confidence']) * 100:.1f}%"
        if resolved["confidence"] is not None
        else "unknown"
    )
    degradation_pct = (
        f"{float(resolved['degradation_score']) * 100:.1f}%"
        if resolved["degradation_score"] is not None
        else "unknown"
    )
    latest_alert = resolved["latest_alert"]
    latest_snapshot = resolved["latest_snapshot"]
    latest_recommendation = resolved["latest_recommendation"]
    return (
        "You are an expert industrial cooling system AI copilot "
        "for CoolingOps. You have access to real-time plant data.\n\n"
        f"Plant layout:\n- {PLANT_LAYOUT}\n\n"
        "Current plant state:\n"
        f"- Fault detected: {resolved['fault_type']}\n"
        f"- Confidence: {confidence_pct}\n"
        f"- Component at risk: {resolved['component']}\n"
        f"- Degradation score: {degradation_pct}\n"
        f"- Physics gate scores: {resolved['gate_scores']}\n"
        f"- Latest sensor timestamp: {(latest_snapshot or {}).get('timestamp')}\n"
        f"- Latest sensor excerpt: {resolved['sensor_summary']}\n"
        f"- Latest fault label from simulation: {(latest_snapshot or {}).get('fault_label')}\n"
        f"- Latest anomaly record: {latest_alert}\n"
        f"- Latest recommendation: {latest_recommendation}\n\n"
        "You help industrial operators make decisions quickly.\n"
        "Be specific, concise, and actionable.\n"
        "Use technical but understandable language.\n"
        "Answer plant-wide questions using the known plant layout and latest available readings.\n"
        "For component questions, mention the most relevant sensor tags if available.\n"
        "Always reference the specific sensor values when relevant.\n"
        "Do not claim data is unavailable if the prompt already includes plant layout, anomaly context, or sensor excerpts.\n"
        "Keep answers under 100 words."
    )


def _extract_modelarts_answer(payload: dict) -> str | None:
    if isinstance(payload.get("answer"), str):
        return payload["answer"]

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message", {})
        if isinstance(message, dict) and isinstance(message.get("content"), str):
            return message["content"]

    output = payload.get("output")
    if isinstance(output, dict) and isinstance(output.get("text"), str):
        return output["text"]

    if isinstance(payload.get("generated_text"), str):
        return payload["generated_text"]

    return None


def _call_modelarts_chat(question: str, context: CopilotChatContext) -> str:
    modelarts_url, modelarts_api_key = _modelarts_endpoint()
    if not modelarts_api_key or not modelarts_url:
        return _demo_copilot_answer(question, context)

    system_prompt = _build_system_prompt(context, question)
    payload = {
        "model": "deepseek-v3",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question},
        ],
        "max_tokens": 200,
        "temperature": 0.3,
    }
    request = Request(
        modelarts_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {modelarts_api_key}",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=20) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)
    except (HTTPError, URLError, json.JSONDecodeError, TimeoutError, OSError):
        return _demo_copilot_answer(question, context)
    except Exception:
        return _demo_copilot_answer(question, context)

    answer = _extract_modelarts_answer(data)
    if not answer:
        return _demo_copilot_answer(question, context)
    return answer


@router.get("/anomalies")
async def list_anomalies() -> dict:
    return {
        "total": len(anomaly_history),
        "items": list(reversed(anomaly_history)),
    }


@router.patch("/anomalies/{anomaly_id}/acknowledge")
async def acknowledge_anomaly(anomaly_id: int) -> dict:
    event = _find_anomaly(anomaly_id)
    event["acknowledged"] = True
    return event


@router.patch("/anomalies/{anomaly_id}/feedback")
async def update_anomaly_feedback(
    anomaly_id: int,
    payload: AnomalyFeedbackRequest,
) -> dict:
    event = _find_anomaly(anomaly_id)
    feedback = payload.model_dump()
    event["assigned_to"] = payload.assigned_to
    event["feedback"] = feedback
    event["acknowledged"] = True

    if payload.prediction_correct == "no":
        event["status"] = "false_alarm"
    elif payload.prediction_correct in {"yes", "partial"}:
        event["status"] = "resolved"
    else:
        event["status"] = "investigating"

    return event


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


@router.post("/copilot/chat")
async def copilot_chat(payload: CopilotChatRequest) -> dict:
    answer = _call_modelarts_chat(payload.question, payload.context)
    return {"answer": answer}


@router.get("/risk/components")
async def risk_components() -> dict:
    return build_risk_components()


@router.get("/feedback/summary")
async def feedback_summary() -> dict:
    feedback_events = [event for event in anomaly_history if event.get("feedback")]
    if not feedback_events:
        return DEMO_FEEDBACK_SUMMARY

    total = len(feedback_events)
    confirmed = sum(
        1
        for event in feedback_events
        if event["feedback"].get("prediction_correct") == "yes"
    )
    partial = sum(
        1
        for event in feedback_events
        if event["feedback"].get("prediction_correct") == "partial"
    )
    incorrect = sum(
        1
        for event in feedback_events
        if event["feedback"].get("prediction_correct") == "no"
    )

    ratings = [
        event["feedback"]["accuracy_rating"]
        for event in feedback_events
        if event["feedback"].get("accuracy_rating") is not None
    ]
    resolve_times = [
        event["feedback"]["time_to_resolve_minutes"]
        for event in feedback_events
        if event["feedback"].get("time_to_resolve_minutes") is not None
    ]
    fault_counter = Counter(event["fault_type"] for event in feedback_events)
    by_fault_type_counter: dict[str, dict[str, int]] = defaultdict(
        lambda: {"fault": "", "correct": 0, "total": 0}
    )

    for event in feedback_events:
        fault_type = event["fault_type"]
        item = by_fault_type_counter[fault_type]
        item["fault"] = fault_type
        item["total"] += 1
        if event["feedback"].get("prediction_correct") == "yes":
            item["correct"] += 1

    return {
        "total": total,
        "confirmed": confirmed,
        "partial": partial,
        "incorrect": incorrect,
        "avg_rating": round(sum(ratings) / len(ratings), 1) if ratings else 0.0,
        "avg_resolve_minutes": round(sum(resolve_times) / len(resolve_times), 1)
        if resolve_times
        else 0.0,
        "most_common_fault": fault_counter.most_common(1)[0][0] if fault_counter else "",
        "by_fault_type": sorted(
            by_fault_type_counter.values(),
            key=lambda item: item["total"],
            reverse=True,
        ),
    }


@router.get("/operators")
async def list_operators() -> dict:
    return {
        "operators": [
            {"id": "op_a", "name": "Operator A"},
            {"id": "op_b", "name": "Operator B"},
            {"id": "op_c", "name": "Operator C"},
        ]
    }


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
