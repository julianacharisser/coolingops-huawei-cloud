from __future__ import annotations

import numpy as np
import pandas as pd


def existing(df: pd.DataFrame, candidates: list[str]) -> str:
    for c in candidates:
        if c in df.columns:
            return c
    raise KeyError(f"None of these columns found: {candidates}")


def cols_existing(df: pd.DataFrame, patterns: list[str]) -> list[str]:
    return [c for c in patterns if c in df.columns]


def active_avg(df: pd.DataFrame, value_cols: list[str], status_cols: list[str] | None = None) -> pd.Series:
    if not value_cols:
        return pd.Series(np.zeros(len(df)), index=df.index)

    values = df[value_cols].astype(float)

    if status_cols is None or not status_cols:
        return values.mean(axis=1)

    statuses = df[status_cols].astype(float)
    statuses = statuses.replace(0, np.nan)

    weighted = values.values * statuses.values
    denom = np.nansum(statuses.values, axis=1)
    denom = np.where(denom == 0, np.nan, denom)

    out = np.nansum(weighted, axis=1) / denom
    fallback = values.mean(axis=1).values
    out = np.where(np.isnan(out), fallback, out)

    return pd.Series(out, index=df.index)


def active_sum(df: pd.DataFrame, value_cols: list[str]) -> pd.Series:
    if not value_cols:
        return pd.Series(np.zeros(len(df)), index=df.index)
    return df[value_cols].astype(float).sum(axis=1)


def safe_ratio(a: pd.Series, b: pd.Series, eps: float = 1e-6) -> pd.Series:
    return a.astype(float) / (b.astype(float).abs() + eps)


def make_plant_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()

    dp_col = existing(out, ["CWL_SEC_DPSPT", "CWL_SEC_DPSPTS"])

    ct_sw = cols_existing(out, ["CT_SW_TEMP_1", "CT_SW_TEMP_2", "CT_SW_TEMP_3"])
    ct_rw = cols_existing(out, ["CT_RW_TEMP_1", "CT_RW_TEMP_2", "CT_RW_TEMP_3"])
    ct_sta = cols_existing(out, ["CT_STA_1", "CT_STA_2", "CT_STA_3"])
    ct_fan = cols_existing(out, ["CT_FAN_SPD_1", "CT_FAN_SPD_2", "CT_FAN_SPD_3"])
    ct_fan_ctrl = cols_existing(out, ["CT_FAN_SPD_CTRL_1", "CT_FAN_SPD_CTRL_2", "CT_FAN_SPD_CTRL_3"])
    ct_pow = cols_existing(out, ["CT_POW_1", "CT_POW_2", "CT_POW_3"])
    ct_flow = cols_existing(out, ["CT_FLOW_1", "CT_FLOW_2", "CT_FLOW_3"])

    chl_sw = cols_existing(out, ["CHL_SW_TEMP_1", "CHL_SW_TEMP_2", "CHL_SW_TEMP_3"])
    chl_rw = cols_existing(out, ["CHL_RW_TEMP_1", "CHL_RW_TEMP_2", "CHL_RW_TEMP_3"])
    chl_swcd = cols_existing(out, ["CHL_SWCD_TEMP_1", "CHL_SWCD_TEMP_2", "CHL_SWCD_TEMP_3"])
    chl_rwcd = cols_existing(out, ["CHL_RWCD_TEMP_1", "CHL_RWCD_TEMP_2", "CHL_RWCD_TEMP_3"])
    chl_sta = cols_existing(out, ["CHL_STA_1", "CHL_STA_2", "CHL_STA_3"])
    chl_pow = cols_existing(out, ["CHL_POW_1", "CHL_POW_2", "CHL_POW_3"])
    chl_flow = cols_existing(out, ["CHL_CW_FLOW_1", "CHL_CW_FLOW_2", "CHL_CW_FLOW_3"])
    chl_cd_flow = cols_existing(out, ["CHL_CD_FLOW_1", "CHL_CD_FLOW_2", "CHL_CD_FLOW_3"])
    chl_comp_ctrl = cols_existing(out, ["CHL_COMP_SPD_CTRL_1", "CHL_COMP_SPD_CTRL_2", "CHL_COMP_SPD_CTRL_3"])

    cwp_pow = cols_existing(out, ["CDWL_PM_POW_1", "CDWL_PM_POW_2", "CDWL_PM_POW_3"])
    pri_pm_pow = cols_existing(out, ["CWL_PRI_PM_POW_1", "CWL_PRI_PM_POW_2", "CWL_PRI_PM_POW_3"])
    sec_pm_pow = cols_existing(out, ["CWL_SEC_PM_POW_1", "CWL_SEC_PM_POW_2"])
    sec_pm_spd = cols_existing(out, ["CWL_SEC_PM_SPD_1", "CWL_SEC_PM_SPD_2"])
    sec_pm_sta = cols_existing(out, ["CWL_SEC_PM_STA_1", "CWL_SEC_PM_STA_2"])

    out["PF_CT_SW_ACTIVE_AVG"] = active_avg(out, ct_sw, ct_sta)
    out["PF_CT_RW_ACTIVE_AVG"] = active_avg(out, ct_rw, ct_sta)
    out["PF_CT_FAN_ACTIVE_AVG"] = active_avg(out, ct_fan, ct_sta)
    out["PF_CT_FAN_CTRL_ACTIVE_AVG"] = active_avg(out, ct_fan_ctrl, ct_sta)
    out["PF_CT_POWER_TOTAL"] = active_sum(out, ct_pow)
    out["PF_CT_FLOW_TOTAL"] = active_sum(out, ct_flow)

    out["PF_CHL_SW_ACTIVE_AVG"] = active_avg(out, chl_sw, chl_sta)
    out["PF_CHL_RW_ACTIVE_AVG"] = active_avg(out, chl_rw, chl_sta)
    out["PF_CHL_SWCD_ACTIVE_AVG"] = active_avg(out, chl_swcd, chl_sta)
    out["PF_CHL_RWCD_ACTIVE_AVG"] = active_avg(out, chl_rwcd, chl_sta)
    out["PF_CHL_COMP_CTRL_ACTIVE_AVG"] = active_avg(out, chl_comp_ctrl, chl_sta)
    out["PF_CHL_POWER_TOTAL"] = active_sum(out, chl_pow)
    out["PF_CHL_CW_FLOW_TOTAL"] = active_sum(out, chl_flow)
    out["PF_CHL_CD_FLOW_TOTAL"] = active_sum(out, chl_cd_flow)

    out["PF_CWP_POWER_TOTAL"] = active_sum(out, cwp_pow)
    out["PF_PRI_PUMP_POWER_TOTAL"] = active_sum(out, pri_pm_pow)
    out["PF_SEC_PUMP_POWER_TOTAL"] = active_sum(out, sec_pm_pow)
    out["PF_SEC_PUMP_SPEED_ACTIVE_AVG"] = active_avg(out, sec_pm_spd, sec_pm_sta)

    out["PF_CT_TARGET_FROM_WB"] = out["OA_TEMP_WB"].astype(float) + 8.0
    out["PF_CT_WB_TRACKING_ERROR"] = out["PF_CT_SW_ACTIVE_AVG"] - out["PF_CT_TARGET_FROM_WB"]
    out["PF_CT_SETPOINT_TRACKING_ERROR"] = out["PF_CT_SW_ACTIVE_AVG"] - out["CT_SW_TEMPSPT"].astype(float)

    out["PF_TWV_CTRL"] = out["TWV_CTRL"].astype(float)
    out["PF_TWV_TO_CDWL_RESPONSE"] = out["PF_TWV_CTRL"] * (out["CDWL_RW_TEMP"] - out["CDWL_SW_TEMP"])

    out["PF_PRESSURE_TRACKING_ERROR"] = out["CWL_SEC_DP"].astype(float) - out[dp_col].astype(float)

    out["PF_CT_DELTA_T"] = out["PF_CT_RW_ACTIVE_AVG"] - out["PF_CT_SW_ACTIVE_AVG"]
    out["PF_CHL_EVAP_DELTA_T"] = out["PF_CHL_RW_ACTIVE_AVG"] - out["PF_CHL_SW_ACTIVE_AVG"]
    out["PF_CHL_COND_DELTA_T"] = out["PF_CHL_RWCD_ACTIVE_AVG"] - out["PF_CHL_SWCD_ACTIVE_AVG"]

    out["PF_SECONDARY_DELTA_T"] = out["CWL_SEC_RW_TEMP"] - out["CWL_SEC_SW_TEMP"]
    out["PF_PRIMARY_DELTA_T"] = out["CWL_PRI_RW_TEMP"] - out["CWL_PRI_SW_TEMP"]

    out["PF_PRIMARY_SECONDARY_SUPPLY_GAP"] = out["CWL_PRI_SW_TEMP"] - out["CWL_SEC_SW_TEMP"]
    out["PF_CHILLER_TO_PRIMARY_SUPPLY_GAP"] = out["PF_CHL_SW_ACTIVE_AVG"] - out["CWL_PRI_SW_TEMP"]

    out["PF_CONDENSER_TO_TOWER_SUPPLY_GAP"] = out["CDWL_SW_TEMP"] - out["PF_CT_SW_ACTIVE_AVG"]
    out["PF_CONDENSER_TO_TOWER_RETURN_GAP"] = out["CDWL_RW_TEMP"] - out["PF_CT_RW_ACTIVE_AVG"]

    out["PF_CHILLER_COND_TO_CDWL_SUPPLY_GAP"] = out["PF_CHL_SWCD_ACTIVE_AVG"] - out["CDWL_SW_TEMP"]
    out["PF_CHILLER_COND_TO_CDWL_RETURN_GAP"] = out["PF_CHL_RWCD_ACTIVE_AVG"] - out["CDWL_RW_TEMP"]

    out["PF_CHILLER_POWER_PER_EVAP_DT"] = safe_ratio(out["PF_CHL_POWER_TOTAL"], out["PF_CHL_EVAP_DELTA_T"])
    out["PF_CHILLER_POWER_PER_SEC_DT"] = safe_ratio(out["PF_CHL_POWER_TOTAL"], out["PF_SECONDARY_DELTA_T"])
    out["PF_TOWER_POWER_PER_CT_DT"] = safe_ratio(out["PF_CT_POWER_TOTAL"], out["PF_CT_DELTA_T"])

    out["PF_THERMAL_REJECTION_STRESS"] = (
        out["PF_CT_WB_TRACKING_ERROR"].abs()
        + out["PF_CONDENSER_TO_TOWER_SUPPLY_GAP"].abs()
        + out["PF_CHL_COND_DELTA_T"].abs()
    )

    out["PF_CHILLED_WATER_DELIVERY_STRESS"] = (
        out["PF_PRIMARY_SECONDARY_SUPPLY_GAP"].abs()
        + out["PF_SECONDARY_DELTA_T"].abs()
        + out["PF_PRESSURE_TRACKING_ERROR"].abs()
    )

    out["PF_CONTROL_INSTABILITY"] = (
        (out["PF_CT_FAN_CTRL_ACTIVE_AVG"] - out["PF_CT_FAN_ACTIVE_AVG"]).abs()
        + out["PF_CT_SETPOINT_TRACKING_ERROR"].abs()
    )

    return out


PLANT_FEATURE_COLS = [
    "PF_CT_SW_ACTIVE_AVG",
    "PF_CT_RW_ACTIVE_AVG",
    "PF_CT_FAN_ACTIVE_AVG",
    "PF_CT_FAN_CTRL_ACTIVE_AVG",
    "PF_CT_POWER_TOTAL",
    "PF_CT_FLOW_TOTAL",
    "PF_CHL_SW_ACTIVE_AVG",
    "PF_CHL_RW_ACTIVE_AVG",
    "PF_CHL_SWCD_ACTIVE_AVG",
    "PF_CHL_RWCD_ACTIVE_AVG",
    "PF_CHL_COMP_CTRL_ACTIVE_AVG",
    "PF_CHL_POWER_TOTAL",
    "PF_CHL_CW_FLOW_TOTAL",
    "PF_CHL_CD_FLOW_TOTAL",
    "PF_CWP_POWER_TOTAL",
    "PF_PRI_PUMP_POWER_TOTAL",
    "PF_SEC_PUMP_POWER_TOTAL",
    "PF_SEC_PUMP_SPEED_ACTIVE_AVG",
    "PF_CT_WB_TRACKING_ERROR",
    "PF_CT_SETPOINT_TRACKING_ERROR",
    "PF_TWV_CTRL",
    "PF_TWV_TO_CDWL_RESPONSE",
    "PF_PRESSURE_TRACKING_ERROR",
    "PF_CT_DELTA_T",
    "PF_CHL_EVAP_DELTA_T",
    "PF_CHL_COND_DELTA_T",
    "PF_SECONDARY_DELTA_T",
    "PF_PRIMARY_DELTA_T",
    "PF_PRIMARY_SECONDARY_SUPPLY_GAP",
    "PF_CHILLER_TO_PRIMARY_SUPPLY_GAP",
    "PF_CONDENSER_TO_TOWER_SUPPLY_GAP",
    "PF_CONDENSER_TO_TOWER_RETURN_GAP",
    "PF_CHILLER_COND_TO_CDWL_SUPPLY_GAP",
    "PF_CHILLER_COND_TO_CDWL_RETURN_GAP",
    "PF_CHILLER_POWER_PER_EVAP_DT",
    "PF_CHILLER_POWER_PER_SEC_DT",
    "PF_TOWER_POWER_PER_CT_DT",
    "PF_THERMAL_REJECTION_STRESS",
    "PF_CHILLED_WATER_DELIVERY_STRESS",
    "PF_CONTROL_INSTABILITY",
]
