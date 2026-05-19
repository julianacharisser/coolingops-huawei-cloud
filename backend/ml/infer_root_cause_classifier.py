from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import joblib
import pandas as pd

from .fault_specific_gates import compute_fault_gate_features
from .fault_specific_gates import rank_fault_scores, score_fault_gates


MODEL_DIR = Path(__file__).resolve().parent / "artifacts" / "root_cause_classifier"


@lru_cache(maxsize=1)
def _load_artifacts():
    with open(MODEL_DIR / "config.json", "r", encoding="utf-8") as config_file:
        config = json.load(config_file)

    model = joblib.load(MODEL_DIR / "root_cause_model.joblib")
    imputer = joblib.load(MODEL_DIR / "imputer.joblib")
    label_encoder = joblib.load(MODEL_DIR / "label_encoder.joblib")
    return config, model, imputer, label_encoder


def _final_decision(model_label: str, gate_scores: dict[str, float]) -> str:
    ranked = rank_fault_scores(gate_scores)
    gate_top, gate_score = ranked[0]

    if model_label in {"bypass_valve_leakage", "bypass_valve_stuck"}:
        if gate_top in {"bypass_valve_leakage", "bypass_valve_stuck"}:
            return model_label if model_label == gate_top else "bypass_valve_fault"
        return "bypass_valve_fault"

    for sensor_fault in (
        "secondary_pressure_sensor_bias",
        "chiller_temp_sensor_bias",
        "cooling_tower_temp_sensor_bias",
    ):
        if gate_scores.get(sensor_fault, 0.0) >= 0.80:
            return sensor_fault

    if model_label == gate_top:
        return model_label

    if gate_score < 0.45:
        return model_label

    return gate_top


def predict_window(df_window: pd.DataFrame) -> dict:
    if len(df_window) < 150:
        raise ValueError("predict_window requires at least 150 rows.")

    config, model, imputer, label_encoder = _load_artifacts()

    working_window = df_window.tail(150).copy()
    features = compute_fault_gate_features(working_window)
    gate_scores = {
        key: float(value)
        for key, value in score_fault_gates(features).items()
    }

    feature_frame = pd.DataFrame([features]).reindex(
        columns=config["feature_cols"],
        fill_value=0.0,
    )
    transformed = imputer.transform(feature_frame)

    predicted_encoded = model.predict(transformed)
    model_label = str(label_encoder.inverse_transform(predicted_encoded)[0])

    if hasattr(model, "predict_proba"):
        model_confidence = float(model.predict_proba(transformed)[0].max())
    else:
        model_confidence = 1.0

    fault_type = str(_final_decision(model_label, gate_scores))
    confidence = model_confidence
    if fault_type != model_label:
        confidence = max(model_confidence, gate_scores.get(fault_type, 0.0))

    return {
        "fault_type": fault_type,
        "confidence": round(float(confidence), 3),
        "gate_scores": {name: round(score, 3) for name, score in gate_scores.items()},
        "is_anomaly": fault_type != "normal",
    }
