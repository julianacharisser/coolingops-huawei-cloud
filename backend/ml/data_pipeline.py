from __future__ import annotations

from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

from .plant_features import make_plant_features, PLANT_FEATURE_COLS

try:
    import torch
except ModuleNotFoundError:
    torch = None

OFFICIAL_LABELS = {
    "normal",
    "bypass_valve_leakage",
    "bypass_valve_stuck",
    "secondary_pressure_sensor_bias",
    "cooling_tower_temp_sensor_bias",
    "chiller_temp_sensor_bias",
    "cooling_tower_fouling",
    "controller_pi_fault",
}


def parse_label_from_filename(file_path: str | Path) -> dict:
    name = Path(file_path).stem.lower()

    if name == "chillerplant":
        return {
            "fault_family": "normal",
            "severity": "none",
            "severity_value": 0.0,
        }

    if "bypass_leakage" in name:
        level = float(name.split("_")[-1])
        severity = "low" if level == 25 else "medium" if level == 50 else "high"
        return {
            "fault_family": "bypass_valve_leakage",
            "severity": severity,
            "severity_value": level,
        }

    if "bypass_stuck" in name:
        level = float(name.split("_")[-1])
        severity = "medium" if level == 50 else "high"
        return {
            "fault_family": "bypass_valve_stuck",
            "severity": severity,
            "severity_value": level,
        }

    if "secondary_chilled_water_pressure_bias" in name:
        value = float(name.split("_")[-1])
        severity = "low" if abs(value) == 10 else "high"
        return {
            "fault_family": "secondary_pressure_sensor_bias",
            "severity": severity,
            "severity_value": value,
        }

    if "coolingtower_bias" in name:
        value = float(name.split("_")[-1])
        severity = "low" if abs(value) == 1 else "high"
        return {
            "fault_family": "cooling_tower_temp_sensor_bias",
            "severity": severity,
            "severity_value": value,
        }

    if "chiller_bias" in name:
        value = float(name.split("_")[-1])
        severity = "low" if abs(value) == 1 else "high"
        return {
            "fault_family": "chiller_temp_sensor_bias",
            "severity": severity,
            "severity_value": value,
        }

    if "coolingtower_fouling" in name:
        level = float(name.split("_")[-1])
        severity = "low" if level == 65 else "medium" if level == 80 else "high"
        return {
            "fault_family": "cooling_tower_fouling",
            "severity": severity,
            "severity_value": level,
        }

    if "coolingtower_pi" in name:
        return {
            "fault_family": "controller_pi_fault",
            "severity": "medium",
            "severity_value": 1.0,
        }

    return {
        "fault_family": "unknown",
        "severity": "unknown",
        "severity_value": -1.0,
    }


BASE_COLS = [
    "CDWL_RW_TEMP",
    "CDWL_SW_TEMP",
    "CWL_PRI_RW_TEMP",
    "CWL_PRI_SW_TEMP",
    "CWL_PRI_SW_TEMPSPT",
    "CWL_SEC_DP",
    "CWL_SEC_DPSPT",
    "CWL_SEC_RW_TEMP",
    "CWL_SEC_SW_TEMP",
    "OA_TEMP",
    "OA_TEMP_WB",
    "TWV_CTRL",
    "CT_SW_TEMPSPT",
    "CT_SW_TEMP_1",
    "CT_RW_TEMP_1",
    "CT_FAN_SPD_1",
    "CT_FAN_SPD_CTRL_1",
    "CHL_SW_TEMP_1",
    "CHL_RW_TEMP_1",
    "CHL_SWCD_TEMP_1",
    "CHL_RWCD_TEMP_1",
    "CHL_POW_1",
]


def add_derived_columns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    out["DELTA_T_SEC"] = out["CWL_SEC_RW_TEMP"] - out["CWL_SEC_SW_TEMP"]
    out["DELTA_T_PRI"] = out["CWL_PRI_RW_TEMP"] - out["CWL_PRI_SW_TEMP"]
    out["DELTA_T_COND"] = out["CDWL_RW_TEMP"] - out["CDWL_SW_TEMP"]
    out["COND_SETPOINT_ERROR"] = out["CDWL_SW_TEMP"] - out["CT_SW_TEMPSPT"]
    out["CHW_SETPOINT_ERROR"] = out["CWL_PRI_SW_TEMP"] - out["CWL_PRI_SW_TEMPSPT"]
    out["PRESSURE_ERROR"] = out["CWL_SEC_DP"] - out["CWL_SEC_DPSPT"]
    out["TOWER_APPROACH_1"] = out["CT_SW_TEMP_1"] - out["OA_TEMP_WB"]
    out["CT_FAN_TRACKING_ERROR_1"] = out["CT_FAN_SPD_CTRL_1"] - out["CT_FAN_SPD_1"]
    out["CHILLER_COND_DELTA_T_1"] = out["CHL_RWCD_TEMP_1"] - out["CHL_SWCD_TEMP_1"]
    out["CHILLER_CHW_DELTA_T_1"] = out["CHL_RW_TEMP_1"] - out["CHL_SW_TEMP_1"]
    out["COOLING_TOWER_DELTA_T_1"] = out["CT_RW_TEMP_1"] - out["CT_SW_TEMP_1"]
    out["CHILLER_POWER_PER_DELTA_T"] = out["CHL_POW_1"] / (
        (out["CHL_RW_TEMP_1"] - out["CHL_SW_TEMP_1"]).abs() + 1e-6
    )
    out["CT_SETPOINT_ERROR_1"] = out["CT_SW_TEMP_1"] - out["CT_SW_TEMPSPT"]

    return out


FEATURE_COLS = BASE_COLS + [
    "DELTA_T_SEC",
    "DELTA_T_PRI",
    "DELTA_T_COND",
    "COND_SETPOINT_ERROR",
    "CHW_SETPOINT_ERROR",
    "PRESSURE_ERROR",
    "TOWER_APPROACH_1",
    "CT_FAN_TRACKING_ERROR_1",
    "CHILLER_COND_DELTA_T_1",
    "CHILLER_CHW_DELTA_T_1",
    "COOLING_TOWER_DELTA_T_1",
    "CHILLER_POWER_PER_DELTA_T",
    "CT_SETPOINT_ERROR_1",
] + PLANT_FEATURE_COLS


def load_csv(fp: Path, max_rows: Optional[int] = None) -> pd.DataFrame:
    if max_rows is None:
        df = pd.read_csv(fp)
    else:
        df = pd.read_csv(fp, nrows=max_rows)

    df["Datetime"] = pd.to_datetime(df["Datetime"])
    df = df.sort_values("Datetime").reset_index(drop=True)
    df = add_derived_columns(df)
    df = make_plant_features(df)
    return df


def chronological_split_with_gap(
    df: pd.DataFrame,
    train_ratio: float,
    gap_rows: int,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    n = len(df)
    split_idx = int(n * train_ratio)

    train_end = max(split_idx - gap_rows, 0)
    val_start = min(split_idx + gap_rows, n)

    df_train = df.iloc[:train_end].reset_index(drop=True)
    df_val = df.iloc[val_start:].reset_index(drop=True)
    return df_train, df_val


def build_sequences(
    df: pd.DataFrame,
    input_len: int,
    horizon: int,
    stride: int,
    feature_cols: list[str],
    target_cols: list[str],
) -> tuple[np.ndarray, np.ndarray]:
    X, Y, _ = build_sequences_with_starts(
        df=df,
        input_len=input_len,
        horizon=horizon,
        stride=stride,
        feature_cols=feature_cols,
        target_cols=target_cols,
    )
    return X, Y


def build_sequences_with_starts(
    df: pd.DataFrame,
    input_len: int,
    horizon: int,
    stride: int,
    feature_cols: list[str],
    target_cols: list[str],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    x_list = []
    y_list = []
    starts = []

    values_x = df[feature_cols].astype(float).values
    values_y = df[target_cols].astype(float).values

    max_start = len(df) - input_len - horizon
    if max_start < 0:
        return (
            np.empty((0, input_len, len(feature_cols)), dtype=np.float32),
            np.empty((0, horizon, len(target_cols)), dtype=np.float32),
            np.empty((0,), dtype=np.int64),
        )

    for start in range(0, max_start + 1, stride):
        x = values_x[start:start + input_len]
        y = values_y[start + input_len:start + input_len + horizon]
        x_list.append(x)
        y_list.append(y)
        starts.append(start)

    return (
        np.array(x_list, dtype=np.float32),
        np.array(y_list, dtype=np.float32),
        np.array(starts, dtype=np.int64),
    )


def build_event_windows_with_starts(
    df: pd.DataFrame,
    window_len: int,
    stride: int,
    feature_cols: list[str],
) -> tuple[np.ndarray, np.ndarray]:
    x_list = []
    starts = []

    values_x = df[feature_cols].astype(float).values
    max_start = len(df) - window_len
    if max_start < 0:
        return (
            np.empty((0, window_len, len(feature_cols)), dtype=np.float32),
            np.empty((0,), dtype=np.int64),
        )

    for start in range(0, max_start + 1, stride):
        x = values_x[start:start + window_len]
        x_list.append(x)
        starts.append(start)

    return np.array(x_list, dtype=np.float32), np.array(starts, dtype=np.int64)


def fit_scaler_from_normal(
    raw_dir: Path,
    feature_cols: list[str],
    max_rows_per_file: Optional[int],
    train_ratio: float = 0.8,
    gap_rows: int = 0,
) -> StandardScaler:
    normal_file = raw_dir / "official" / "ChillerPlant.csv"
    df = load_csv(normal_file, max_rows=max_rows_per_file)
    df_train, _ = chronological_split_with_gap(df, train_ratio=train_ratio, gap_rows=gap_rows)

    scaler = StandardScaler()
    scaler.fit(df_train[feature_cols].astype(float).values)
    return scaler


def apply_scaler_3d(x: np.ndarray, scaler: StandardScaler) -> np.ndarray:
    n, t, d = x.shape
    flat = x.reshape(-1, d)
    flat_scaled = scaler.transform(flat)
    return flat_scaled.reshape(n, t, d).astype(np.float32)


def tensor_dataset(x: np.ndarray, y: np.ndarray):
    if torch is None:
        raise RuntimeError("torch is required to build tensor datasets.")

    return torch.utils.data.TensorDataset(
        torch.tensor(x, dtype=torch.float32),
        torch.tensor(y, dtype=torch.float32),
    )
