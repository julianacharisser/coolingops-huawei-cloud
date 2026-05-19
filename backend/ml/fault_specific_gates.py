from __future__ import annotations

from pathlib import Path
import json
import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent
BASELINE_PATH = ROOT_DIR / "artifacts" / "fault_gate_calibration" / "fault_gate_baseline.json"


def _series(x) -> pd.Series:
    return pd.Series(x).astype(float).replace([np.inf, -np.inf], np.nan).fillna(0.0)


def _stats(x, prefix: str) -> dict[str, float]:
    s = _series(x)
    v = s.values
    d = np.diff(v) if len(v) > 1 else np.array([0.0])

    if len(v) < 2:
        slope = 0.0
    else:
        t = np.arange(len(v), dtype=float)
        denom = np.sum((t - t.mean()) ** 2)
        slope = 0.0 if denom == 0 else float(np.sum((t - t.mean()) * (v - v.mean())) / denom)

    signs = np.sign(d)
    osc = float(np.mean(signs[1:] != signs[:-1])) if len(signs) > 1 else 0.0

    return {
        f"{prefix}_mean": float(np.mean(v)),
        f"{prefix}_abs_mean": float(np.mean(np.abs(v))),
        f"{prefix}_std": float(np.std(v, ddof=0)),
        f"{prefix}_min": float(np.min(v)),
        f"{prefix}_max": float(np.max(v)),
        f"{prefix}_range": float(np.max(v) - np.min(v)),
        f"{prefix}_slope": slope,
        f"{prefix}_diff_std": float(np.std(d, ddof=0)),
        f"{prefix}_osc": osc,
    }


def _safe_ratio(a, b, eps: float = 1e-6):
    return _series(a) / (_series(b).abs() + eps)


def compute_fault_gate_features(df: pd.DataFrame) -> dict[str, float]:
    f: dict[str, float] = {}

    pressure_tracking_error = df["CWL_SEC_DP"] - df["CWL_SEC_DPSPT"]

    chiller_supply_return_gap = df["CHL_RW_TEMP_1"] - df["CHL_SW_TEMP_1"]
    tower_supply_return_gap = df["CT_RW_TEMP_1"] - df["CT_SW_TEMP_1"]

    chiller_to_primary_gap = df["CHL_SW_TEMP_1"] - df["CWL_PRI_SW_TEMP"]
    tower_wb_gap = df["CT_SW_TEMP_1"] - df["OA_TEMP_WB"]
    tower_setpoint_gap = df["CT_SW_TEMP_1"] - df["CT_SW_TEMPSPT"]

    cond_to_tower_supply_gap = df["CDWL_SW_TEMP"] - df["CT_SW_TEMP_1"]
    cond_to_tower_return_gap = df["CDWL_RW_TEMP"] - df["CT_RW_TEMP_1"]

    twv = df["TWV_CTRL"]

    fan_speed = df["CT_FAN_SPD_1"]
    fan_ctrl = df["CT_FAN_SPD_CTRL_1"]
    fan_tracking = fan_ctrl - fan_speed

    chiller_power_per_evap_dt = _safe_ratio(df["CHL_POW_1"], chiller_supply_return_gap)
    tower_power_per_ct_dt = _safe_ratio(
        df["CT_POW_1"] if "CT_POW_1" in df.columns else pd.Series(0.0, index=df.index),
        tower_supply_return_gap,
    )

    thermal_rejection_stress = (
        tower_wb_gap.abs()
        + cond_to_tower_supply_gap.abs()
        + tower_supply_return_gap.abs()
    )

    chilled_water_delivery_stress = (
        pressure_tracking_error.abs()
        + (df["CWL_SEC_RW_TEMP"] - df["CWL_SEC_SW_TEMP"]).abs()
        + (df["CWL_PRI_SW_TEMP"] - df["CWL_SEC_SW_TEMP"]).abs()
    )

    control_instability = fan_tracking.abs() + tower_setpoint_gap.abs()

    signals = {
        "pressure_tracking_error": pressure_tracking_error,
        "chiller_supply_return_gap": chiller_supply_return_gap,
        "tower_supply_return_gap": tower_supply_return_gap,
        "chiller_to_primary_gap": chiller_to_primary_gap,
        "tower_wb_gap": tower_wb_gap,
        "tower_setpoint_gap": tower_setpoint_gap,
        "cond_to_tower_supply_gap": cond_to_tower_supply_gap,
        "cond_to_tower_return_gap": cond_to_tower_return_gap,
        "twv": twv,
        "fan_speed": fan_speed,
        "fan_ctrl": fan_ctrl,
        "fan_tracking": fan_tracking,
        "chiller_power_per_evap_dt": chiller_power_per_evap_dt,
        "tower_power_per_ct_dt": tower_power_per_ct_dt,
        "thermal_rejection_stress": thermal_rejection_stress,
        "chilled_water_delivery_stress": chilled_water_delivery_stress,
        "control_instability": control_instability,
    }

    for name, sig in signals.items():
        f.update(_stats(sig, name))

    f["pressure_sensor_signature"] = f["pressure_tracking_error_abs_mean"] * (
        1.0 / (1.0 + f["pressure_tracking_error_std"])
    )

    f["chiller_temp_sensor_signature"] = f["chiller_to_primary_gap_abs_mean"] * (
        1.0 / (1.0 + f["chiller_to_primary_gap_std"])
    )

    f["tower_temp_sensor_signature"] = f["tower_wb_gap_abs_mean"] * (
        1.0 / (1.0 + f["tower_wb_gap_std"])
    )

    f["bypass_signature"] = (
        f["cond_to_tower_supply_gap_abs_mean"]
        + f["cond_to_tower_return_gap_abs_mean"]
        + f["twv_range"]
    )

    f["fouling_signature"] = (
        f["tower_wb_gap_abs_mean"]
        + f["thermal_rejection_stress_abs_mean"]
        + f["tower_power_per_ct_dt_abs_mean"]
    )

    f["pi_signature"] = (
        f["tower_setpoint_gap_diff_std"]
        + f["fan_speed_diff_std"]
        + f["fan_tracking_diff_std"]
        + f["control_instability_diff_std"]
    )

    return f


def load_fault_gate_baseline() -> dict:
    with open(BASELINE_PATH, "r", encoding="utf-8") as fp:
        return json.load(fp)


def score_fault_gates(feat: dict[str, float]) -> dict[str, float]:
    base = load_fault_gate_baseline()["feature_stats"]

    def dev(name: str) -> float:
        if name not in base:
            return 0.0
        med = base[name]["median"]
        p05 = base[name]["p05"]
        p95 = base[name]["p95"]
        scale = max(abs(p95 - p05), 1e-6)
        return float(np.clip(abs(feat.get(name, 0.0) - med) / scale, 0, 1))

    def high(name: str) -> float:
        if name not in base:
            return 0.0
        p95 = base[name]["p95"]
        p99 = base[name]["p99"]
        if p99 <= p95:
            return dev(name)
        return float(np.clip((feat.get(name, 0.0) - p95) / (p99 - p95), 0, 1))

    pressure_bias = np.mean([
        dev("pressure_tracking_error"),
        dev("pressure_tracking_std"),
    ])

    chiller_raw = np.mean([
        dev("ch1_peer_gap_abs_mean"),
        dev("ch1_to_primary_supply_gap"),
        dev("chiller_supply_return_gap"),
    ])

    tower_raw = np.mean([
        dev("ct1_peer_gap_abs_mean"),
        dev("tower_supply_return_gap"),
        dev("approach_error"),
    ])

    chiller_bias = max(0.0, chiller_raw - 0.35 * tower_raw)
    tower_bias = max(0.0, tower_raw - 0.35 * chiller_raw)

    hydraulic_mismatch = np.mean([
        dev("cond_to_tower_supply_gap"),
        dev("cond_to_tower_return_gap"),
        dev("twv_mean"),
        dev("twv_min"),
    ])

    valve_fixed = 1.0 - high("twv_std")

    bypass_stuck = hydraulic_mismatch * valve_fixed
    bypass_leakage = np.mean([
        hydraulic_mismatch,
        dev("twv_mean"),
        dev("twv_min"),
        high("twv_hunting"),
    ])

    bypass_fault = max(bypass_stuck, bypass_leakage)

    fouling = np.mean([
        dev("approach_error"),
        dev("heat_rejection_efficiency"),
        dev("tower_supply_return_gap"),
    ])

    pi_fault = np.mean([
        dev("control_oscillation"),
        dev("ct_tracking_oscillation"),
        dev("fan_hunting"),
        dev("fan_ctrl_hunting"),
        dev("fan_tracking_hunting"),
    ])

    scores = {
        "cooling_tower_temp_sensor_bias": float(np.clip(tower_bias, 0, 1)),
        "chiller_temp_sensor_bias": float(np.clip(chiller_bias, 0, 1)),
        "secondary_pressure_sensor_bias": float(np.clip(pressure_bias, 0, 1)),
        "bypass_valve_fault": float(np.clip(bypass_fault, 0, 1)),
        "bypass_valve_leakage": float(np.clip(bypass_leakage, 0, 1)),
        "bypass_valve_stuck": float(np.clip(bypass_stuck, 0, 1)),
        "cooling_tower_fouling": float(np.clip(fouling, 0, 1)),
        "controller_pi_fault": float(np.clip(pi_fault, 0, 1)),
    }

    sensor_max = max(
        scores["cooling_tower_temp_sensor_bias"],
        scores["chiller_temp_sensor_bias"],
        scores["secondary_pressure_sensor_bias"],
    )

    if sensor_max >= 0.80:
        for key in [
            "bypass_valve_fault",
            "bypass_valve_leakage",
            "bypass_valve_stuck",
            "cooling_tower_fouling",
            "controller_pi_fault",
        ]:
            scores[key] *= 0.35

    return scores


def rank_fault_scores(scores: dict[str, float]) -> list[tuple[str, float]]:
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)
