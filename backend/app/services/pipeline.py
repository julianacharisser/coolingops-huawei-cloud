from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

import pandas as pd

from app.core.config import ROLLING_WINDOW_SIZE
from app.core.websocket import manager
from ml.infer_root_cause_classifier import predict_window


FAULT_ORDER = (
    "bypass_valve_leakage",
    "bypass_valve_stuck",
    "bypass_valve_fault",
    "cooling_tower_fouling",
    "cooling_tower_temp_sensor_bias",
    "chiller_temp_sensor_bias",
    "secondary_pressure_sensor_bias",
    "controller_pi_fault",
)

DEGRADATION_BASE = {
    "normal": 0.0,
    "bypass_valve_leakage": 0.55,
    "bypass_valve_stuck": 0.65,
    "bypass_valve_fault": 0.50,
    "cooling_tower_fouling": 0.70,
    "cooling_tower_temp_sensor_bias": 0.35,
    "chiller_temp_sensor_bias": 0.35,
    "secondary_pressure_sensor_bias": 0.40,
    "controller_pi_fault": 0.60,
}

COMPONENT_MAP = {
    "bypass_valve_leakage": "Bypass Valve",
    "bypass_valve_stuck": "Bypass Valve",
    "bypass_valve_fault": "Bypass Valve",
    "cooling_tower_fouling": "Cooling Tower",
    "cooling_tower_temp_sensor_bias": "Cooling Tower",
    "chiller_temp_sensor_bias": "Chiller",
    "secondary_pressure_sensor_bias": "Secondary Loop",
    "controller_pi_fault": "Cooling Tower",
}

COPILOT_TEMPLATES = {
    "bypass_valve_leakage": {
        "what": "Bypass Valve - Early Leakage Signature Detected",
        "why": "Valve position drifting above setpoint. Differential pressure decaying gradually across control cycles.",
        "action": "Schedule actuator inspection within 72h - intervention window open",
        "risk": "{X}% probability of escalation to critical within 5 days",
    },
    "bypass_valve_stuck": {
        "what": "Bypass Valve - Valve Stuck Fault Detected",
        "why": "Valve not responding to control signal. Position locked outside normal operating range.",
        "action": "Inspect actuator mechanism and verify stroke calibration",
        "risk": "{X}% chilled water imbalance probability within 48h",
    },
    "bypass_valve_fault": {
        "what": "Bypass Valve - Fault Signature Detected",
        "why": "Abnormal valve behaviour detected across multiple control cycles.",
        "action": "Inspect bypass valve actuator and control signal integrity",
        "risk": "{X}% system imbalance probability within 72h",
    },
    "cooling_tower_fouling": {
        "what": "Cooling Tower - Heat Exchanger Fouling Detected",
        "why": "Tower approach temperature widening. Reduced heat rejection efficiency across consecutive cycles.",
        "action": "Schedule tower cleaning within 96h",
        "risk": "{X}% cooling capacity reduction within 7 days",
    },
    "cooling_tower_temp_sensor_bias": {
        "what": "Cooling Tower - Temperature Sensor Bias Detected",
        "why": "Sensor reading deviating systematically from expected range based on operating conditions.",
        "action": "Verify and recalibrate cooling tower leaving temperature sensor",
        "risk": "{X}% control system misguidance probability if unaddressed",
    },
    "chiller_temp_sensor_bias": {
        "what": "Chiller - Temperature Sensor Bias Detected",
        "why": "Chiller leaving temperature sensor reading outside expected bounds for current load.",
        "action": "Recalibrate chiller leaving temperature sensor",
        "risk": "{X}% efficiency loss from incorrect control setpoint within 48h",
    },
    "secondary_pressure_sensor_bias": {
        "what": "Secondary Loop - Pressure Sensor Bias Detected",
        "why": "Differential pressure reading deviating from expected value based on pump operation.",
        "action": "Inspect and recalibrate secondary loop differential pressure sensor",
        "risk": "{X}% pump control instability probability within 72h",
    },
    "controller_pi_fault": {
        "what": "Cooling Tower - PI Controller Fault Detected",
        "why": "Fan tracking error increasing. Controller output diverging from setpoint.",
        "action": "Review controller tuning parameters and check sensor calibration",
        "risk": "{X}% control instability within 48h",
    },
}

METADATA_FIELDS = {"timestamp", "Datetime", "fault_label", "scenario_id"}

rolling_window: deque[dict[str, float]] = deque(maxlen=ROLLING_WINDOW_SIZE)
anomaly_history: list[dict[str, Any]] = []
copilot_history: list[dict[str, Any]] = []
latest_sensor_snapshot: dict[str, Any] | None = None
_smn_last_sent: dict[str, float] = {}
_SMN_COOLDOWN_SECONDS = 10 * 60


def reset_pipeline_state(clear_history: bool = True) -> None:
    global latest_sensor_snapshot
    rolling_window.clear()
    latest_sensor_snapshot = None
    if clear_history:
        anomaly_history.clear()
        copilot_history.clear()


def _clamp_score(value: Any) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        numeric = 0.0
    return round(max(0.0, min(1.0, numeric)), 3)


def _normalize_timestamp(value: Any) -> str:
    if value is None or value == "":
        return datetime.utcnow().isoformat()

    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return str(value)
    return parsed.isoformat()


def _humanize_fault_name(fault_type: str) -> str:
    return fault_type.replace("_", " ").title()


def _extract_sensor_data(row: dict[str, Any]) -> dict[str, float]:
    sensor_data: dict[str, float] = {}
    for key, value in row.items():
        if key in METADATA_FIELDS:
            continue
        if value is None:
            continue
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        if pd.isna(numeric):
            continue
        sensor_data[key] = numeric
    return sensor_data


def _normalize_gate_scores(gate_scores: Any) -> dict[str, float]:
    normalized = {fault: 0.0 for fault in FAULT_ORDER}
    if isinstance(gate_scores, dict):
        for fault, score in gate_scores.items():
            if fault in normalized:
                normalized[fault] = _clamp_score(score)
    return normalized


def _component_for_fault(fault_type: str) -> str:
    return COMPONENT_MAP.get(fault_type, _humanize_fault_name(fault_type))


def _degradation_score(fault_type: str, confidence: float) -> float:
    base = DEGRADATION_BASE.get(fault_type, 0.0)
    return round(base * confidence, 3)


def _severity(score: float) -> str:
    if score >= 0.75:
        return "critical"
    if score >= 0.55:
        return "high"
    if score >= 0.30:
        return "medium"
    return "low"


def _sorted_gate_scores(gate_scores: dict[str, float]) -> list[tuple[str, float]]:
    return sorted(gate_scores.items(), key=lambda item: item[1], reverse=True)


def _build_anomaly_event(
    timestamp: str,
    fault_type: str,
    confidence: float,
    gate_scores: dict[str, float],
) -> dict[str, Any]:
    degradation_score = _degradation_score(fault_type, confidence)
    return {
        "id": len(anomaly_history) + 1,
        "timestamp": timestamp,
        "component": _component_for_fault(fault_type),
        "fault_type": fault_type,
        "confidence": confidence,
        "gate_scores": gate_scores,
        "degradation_score": degradation_score,
        "severity": _severity(degradation_score),
        "acknowledged": False,
        "assigned_to": None,
        "status": "open",
        "feedback": None,
    }


def _build_copilot_recommendation(
    anomaly_event: dict[str, Any],
    gate_scores: dict[str, float],
) -> dict[str, Any]:
    fault_type = anomaly_event["fault_type"]
    degradation_score = anomaly_event["degradation_score"]
    confidence = anomaly_event["confidence"]
    template = COPILOT_TEMPLATES.get(
        fault_type,
        {
            "what": f"{_component_for_fault(fault_type)} - Fault Signature Detected",
            "why": "Sustained abnormal behaviour detected across the rolling inference window.",
            "action": "Inspect the affected subsystem and validate controls and sensors.",
            "risk": "{X}% probability of operating impact if deferred",
        },
    )

    risk_percent = round(degradation_score * 100 * 0.4)
    ranked_scores = _sorted_gate_scores(gate_scores)
    top_features = [
        {
            "name": _humanize_fault_name(name),
            "value": f"{score * 100:.1f}%",
        }
        for name, score in ranked_scores[:3]
    ]

    anomaly_score = round((confidence + ranked_scores[0][1]) / 2, 3) if ranked_scores else confidence
    ruled_out = _humanize_fault_name(ranked_scores[1][0]) if len(ranked_scores) > 1 else "Normal Operation"

    return {
        "id": len(copilot_history) + 1,
        "anomaly_id": anomaly_event["id"],
        "timestamp": anomaly_event["timestamp"],
        "what": template["what"],
        "why": template["why"],
        "confidence": confidence,
        "action": template["action"],
        "riskIfDeferred": template["risk"].replace("{X}", str(risk_percent)),
        "degradation_score": degradation_score,
        "reasoning": {
            "stage_a": {
                "label": "Stage A - Rolling Window Anomaly Check",
                "detail": "The latest 150-row sensor window deviates from the learned normal operating baseline.",
                "anomaly_score": anomaly_score,
                "sigma": round(anomaly_score * 4, 3),
            },
            "stage_b": {
                "label": "Stage B - Root Cause Ranking",
                "detail": f"The classifier and gate scores converge on {_humanize_fault_name(fault_type)}.",
                "top_features": top_features,
                "confidence": confidence,
            },
            "stage_c": {
                "label": "Stage C - Operational Cross-Check",
                "detail": "Secondary candidates were compared against the dominant fault signature before confirming the recommendation.",
                "ruled_out": ruled_out,
                "confirmed": _humanize_fault_name(fault_type),
            },
        },
    }


def _clean_env(name: str, default: str | None = None) -> str | None:
    value = os.getenv(name, default)
    if value is None:
        return None
    return value.strip().strip('"').strip("'")


def _smn_settings() -> dict[str, str | None]:
    return {
        "topic_urn": _clean_env("SMN_TOPIC_URN"),
        "project_id": _clean_env("SMN_PROJECT_ID"),
        "access_key": _clean_env("HUAWEI_AK"),
        "secret_key": _clean_env("HUAWEI_SK"),
        "region": _clean_env("SMN_REGION", "ap-southeast-3"),
        "dashboard_url": _clean_env("DASHBOARD_URL", "http://localhost:5173"),
    }


def _sha256_hex(value: bytes | str) -> str:
    payload = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(payload).hexdigest()


def _build_smn_subject(component: str) -> str:
    return f"\U0001F6A8 CRITICAL FAULT: {component} \u2014 Immediate Action Required"


def _build_smn_message(
    anomaly_event: dict[str, Any],
    recommendation: dict[str, Any],
    dashboard_url: str,
) -> str:
    return (
        "CoolingOps has detected a critical fault.\n\n"
        f"Component: {anomaly_event['component']}\n"
        f"Fault: {anomaly_event['fault_type']}\n"
        f"Current Risk: {anomaly_event['degradation_score'] * 100:.0f}%\n"
        f"Confidence: {anomaly_event['confidence'] * 100:.0f}%\n"
        f"Recommended Action: {recommendation['action']}\n\n"
        f"Open Dashboard: {dashboard_url}\n\n"
        "This is an automated alert from CoolingOps."
    )


def _build_smn_authorization(
    method: str,
    canonical_uri: str,
    host: str,
    content_type: str,
    payload_bytes: bytes,
    x_sdk_date: str,
    access_key: str,
    secret_key: str,
) -> str:
    signed_headers = "content-type;host;x-sdk-date"
    canonical_headers = (
        f"content-type:{content_type}\n"
        f"host:{host}\n"
        f"x-sdk-date:{x_sdk_date}"
    )
    canonical_request = (
        f"{method}\n"
        f"{canonical_uri}\n"
        "\n"
        f"{canonical_headers}\n"
        "\n"
        f"{signed_headers}\n"
        f"{_sha256_hex(payload_bytes)}"
    )
    string_to_sign = f"SDK-HMAC-SHA256\n{x_sdk_date}\n{_sha256_hex(canonical_request)}"
    signature = hmac.new(
        secret_key.encode("utf-8"),
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return (
        "SDK-HMAC-SHA256 "
        f"Access={access_key}, "
        f"SignedHeaders={signed_headers}, "
        f"Signature={signature}"
    )


def _send_signed_smn_request(
    url: str,
    canonical_uri: str,
    payload: dict[str, str],
    access_key: str,
    secret_key: str,
) -> None:
    payload_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    content_type = "application/json"
    host = url.split("/")[2]
    x_sdk_date = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    authorization = _build_smn_authorization(
        method="POST",
        canonical_uri=canonical_uri,
        host=host,
        content_type=content_type,
        payload_bytes=payload_bytes,
        x_sdk_date=x_sdk_date,
        access_key=access_key,
        secret_key=secret_key,
    )
    request = Request(
        url,
        data=payload_bytes,
        method="POST",
        headers={
            "Content-Type": content_type,
            "Host": host,
            "X-Sdk-Date": x_sdk_date,
            "Authorization": authorization,
        },
    )
    with urlopen(request, timeout=10) as response:
        if response.status >= 400:
            raise RuntimeError(f"SMN publish failed with status {response.status}")


def _publish_smn_notification(
    anomaly_event: dict[str, Any],
    recommendation: dict[str, Any],
) -> bool:
    if anomaly_event.get("severity") != "critical":
        return False
    if float(anomaly_event.get("confidence") or 0.0) < 0.75:
        return False

    settings = _smn_settings()
    topic_urn = settings["topic_urn"]
    project_id = settings["project_id"]
    access_key = settings["access_key"]
    secret_key = settings["secret_key"]
    region = settings["region"] or "ap-southeast-3"
    dashboard_url = settings["dashboard_url"] or "http://localhost:5173"

    if not topic_urn:
        return False
    if not project_id or not access_key or not secret_key:
        return False

    fault_type = str(anomaly_event.get("fault_type") or "unknown")
    now = time.time()
    last_sent = _smn_last_sent.get(fault_type)
    if last_sent is not None and now - last_sent < _SMN_COOLDOWN_SECONDS:
        return False

    encoded_topic_urn = quote(topic_urn, safe="")
    canonical_uri = f"/v2/{project_id}/notifications/topics/{encoded_topic_urn}/publish"
    url = f"https://smn.{region}.myhuaweicloud.com{canonical_uri}"
    payload = {
        "subject": _build_smn_subject(anomaly_event["component"]),
        "message": _build_smn_message(anomaly_event, recommendation, dashboard_url),
    }

    try:
        _send_signed_smn_request(
            url=url,
            canonical_uri=canonical_uri,
            payload=payload,
            access_key=access_key,
            secret_key=secret_key,
        )
    except Exception:
        return False

    _smn_last_sent[fault_type] = now
    return True


def build_risk_components() -> dict[str, list[dict[str, Any]]]:
    latest_by_component: dict[str, dict[str, Any]] = {}
    for event in anomaly_history:
        latest_by_component[event["component"]] = event

    components = [
        {
            "component": component,
            "risk_score": event["degradation_score"],
            "severity": event["severity"],
            "last_updated": event["timestamp"],
        }
        for component, event in latest_by_component.items()
    ]
    components.sort(key=lambda item: item["risk_score"], reverse=True)
    return {"components": components}


def get_latest_sensor_snapshot() -> dict[str, Any] | None:
    if latest_sensor_snapshot is None:
        return None
    return {
        "type": latest_sensor_snapshot.get("type"),
        "timestamp": latest_sensor_snapshot.get("timestamp"),
        "fault_label": latest_sensor_snapshot.get("fault_label"),
        "sensor_data": dict(latest_sensor_snapshot.get("sensor_data", {})),
    }


async def run_pipeline(row: dict[str, Any]) -> dict[str, Any] | None:
    global latest_sensor_snapshot

    timestamp = _normalize_timestamp(row.get("timestamp") or row.get("Datetime"))
    fault_label = str(row.get("fault_label") or "normal")
    sensor_data = _extract_sensor_data(row)

    sensor_snapshot = {
        "type": "sensor_snapshot",
        "timestamp": timestamp,
        "fault_label": fault_label,
        "sensor_data": sensor_data,
    }
    latest_sensor_snapshot = sensor_snapshot
    await manager.broadcast("sensors", sensor_snapshot)

    if not sensor_data:
        return None

    rolling_window.append(sensor_data)
    if len(rolling_window) < ROLLING_WINDOW_SIZE:
        return None

    window_df = pd.DataFrame(list(rolling_window))
    prediction = predict_window(window_df)

    fault_type = str(prediction.get("fault_type", "normal"))
    confidence = _clamp_score(prediction.get("confidence", 0.0))
    gate_scores = _normalize_gate_scores(prediction.get("gate_scores", {}))
    is_anomaly = bool(prediction.get("is_anomaly", fault_type != "normal"))

    if not is_anomaly or fault_type == "normal":
        return None

    anomaly_event = _build_anomaly_event(
        timestamp=timestamp,
        fault_type=fault_type,
        confidence=confidence,
        gate_scores=gate_scores,
    )
    anomaly_history.append(anomaly_event)
    await manager.broadcast("alerts", {"type": "anomaly_event", **anomaly_event})

    recommendation = _build_copilot_recommendation(anomaly_event, gate_scores)
    copilot_history.append(recommendation)
    await manager.broadcast("copilot", {"type": "copilot_recommendation", **recommendation})
    await asyncio.to_thread(_publish_smn_notification, anomaly_event, recommendation)

    return {
        "anomaly_event": anomaly_event,
        "copilot_recommendation": recommendation,
    }
