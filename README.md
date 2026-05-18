# CoolingOps

**Real-time multi-agent AI system for industrial cooling system fault detection and prevention.**

Built for the Huawei Track of the National AI Student Challenge 2026 — Top 5 Finalist.

---

## What It Does

CoolingOps detects and predicts faults in industrial chiller plant systems before they cascade into costly downtime. It processes real-time sensor telemetry through a two-stage ML pipeline, identifies fault signatures at early intensity levels, and delivers explainable operator recommendations through a live dashboard.

The system catches faults like bypass valve leakage at 25% intensity — before they escalate to 75% and trigger a critical failure.

---

## Demo

> Start the simulation, select the bypass leakage scenario, and watch the system detect an early fault signature, classify it, validate it against physics constraints, and generate an operator recommendation — all in real time.

---

## Architecture

```
LBL Chiller Plant CSV (24 fault scenarios, 77 sensors)
              ↓
    FastAPI Backend (Python)
    ┌─────────────────────────────────────────┐
    │  Rolling 150-row sensor buffer          │
    │         ↓                               │
    │  Stage 1: Isolation Forest              │
    │  (anomaly detection)                    │
    │         ↓                               │
    │  Stage 2: HistGradientBoosting          │
    │  (fault classification — 8 fault types) │
    │         ↓                               │
    │  Physics Gate Validation                │
    │  (thermodynamic constraint scoring)     │
    │         ↓                               │
    │  Copilot Agent                          │
    │  (explainable operator recommendation)  │
    └─────────────────────────────────────────┘
              ↓ WebSocket
    React Dashboard (TypeScript)
    ┌─────────────────────────────────────────┐
    │  Component Risk Heatmap                 │
    │  Digital Twin (SVG chiller plant)       │
    │  AI Copilot Panel + Reasoning Trace     │
    │  Anomaly Log                            │
    │  Live Sensor Feed                       │
    │  Anomaly Timeline                       │
    └─────────────────────────────────────────┘
```

Deployed on Huawei Cloud — ECS (backend) + OBS static hosting (frontend).

---

## ML Pipeline

### Stage 1 — Anomaly Detection
- **Model:** Isolation Forest trained exclusively on normal operation data
- **Approach:** Month-stratified bootstrap thresholds (P95 caution, P99 critical) to account for seasonal variation
- **Output:** Anomaly score + CAUTION/CRITICAL status

### Stage 2 — Fault Classification
- **Model:** HistGradientBoostingClassifier
- **Classes:** 8 fault types across bypass valve, cooling tower, chiller, and pressure subsystems
- **Performance:** 89% balanced accuracy, 89% macro F1-score
- **Physics gates:** Expert-engineered thermodynamic rules validate ML predictions

### 8 Fault Types Detected
| Fault | Component |
|---|---|
| Bypass valve leakage | 3-way bypass valve |
| Bypass valve stuck | 3-way bypass valve |
| Cooling tower fouling | Cooling Tower 1 |
| Cooling tower sensor bias | Cooling Tower 1 leaving temp |
| Chiller sensor bias | Chiller 1 leaving temp |
| Secondary pressure sensor bias | Secondary loop differential pressure |
| Controller PI fault | Condenser loop controller |
| Bypass valve fault (generic) | 3-way bypass valve |

---

## Dataset

**LBL Chiller Plant Dataset — Lawrence Berkeley National Laboratory**

- 77 sensors across a 3-chiller, 3-cooling-tower, 5-pump system
- 24 scenarios (23 faulted + 1 fault-free baseline)
- 1-minute resolution, full year per scenario
- Chicago TMY weather data

Fault labels are derived from filenames — each CSV represents one operating scenario at a fixed fault intensity.

---

## Tech Stack

**Backend**
- Python, FastAPI, async WebSockets
- Scikit-learn (Isolation Forest, HistGradientBoosting)
- Pandas, NumPy, Joblib
- Uvicorn

**Frontend**
- React, TypeScript, Tailwind CSS
- Recharts (anomaly timeline, sparklines)
- SVG digital twin with animated pipe flow
- WebSocket client for real-time updates

**Cloud (Huawei)**
- ECS — backend hosting
- OBS — frontend static hosting
- CCE — production container orchestration
- ModelArts — production model serving
- GeminiDB — time-series sensor data
- GaussDB — structured anomaly history
- IoTDA — IoT sensor ingestion
- APIG — API gateway

---

## Project Structure

```
coolingops/
├── app/
│   ├── main.py                     # FastAPI entry point
│   ├── core/
│   │   ├── config.py               # Settings and env vars
│   │   └── websocket.py            # WebSocket connection manager
│   ├── services/
│   │   ├── pipeline.py             # Core ML inference pipeline
│   │   └── simulation.py          # CSV replay controller
│   └── api/routes/
│       └── routes.py               # All API + WebSocket endpoints
├── ml/
│   ├── infer_root_cause_classifier.py  # Main inference + predict_window()
│   ├── data_pipeline.py                # Data loading and feature engineering
│   ├── plant_features.py               # Physical signal feature computation
│   ├── fault_specific_gates.py         # Physics-based fault gate scoring
│   └── artifacts/
│       └── root_cause_classifier/
│           ├── root_cause_model.joblib
│           ├── imputer.joblib
│           ├── label_encoder.joblib
│           └── config.json
├── data/
│   └── raw/official/               # LBL CSV files (not committed)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ComponentRiskHeatmap.tsx
│   │   │   ├── AnomalyTimeline.tsx
│   │   │   ├── CopilotPanel.tsx
│   │   │   ├── LiveSensorFeed.tsx
│   │   │   └── AnomalyLog.tsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── data/
│   │       └── mockData.ts
│   └── package.json
├── requirements.txt
├── .env.example
└── README.md
```

---

## Quick Start

### Backend

```bash
# Clone the repo
git clone https://github.com/yourusername/coolingops.git
cd coolingops

# Install dependencies
pip install -r requirements.txt

# Copy env file
cp .env.example .env

# Add LBL CSV files to data/raw/official/

# Start the server
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` to see all API endpoints.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to see the dashboard.

### Start the Demo

```bash
# Trigger the demo scenario (normal → early fault → critical)
curl -X POST http://localhost:8000/api/simulation/start
```

Or click **Start Simulation** on the dashboard.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/simulation/start` | Start CSV replay |
| POST | `/api/simulation/stop` | Stop replay |
| GET | `/api/simulation/status` | Current simulation state |
| GET | `/api/sensors/latest` | Latest sensor snapshot |
| WS | `/api/ws/sensors` | Live sensor stream |
| WS | `/api/ws/alerts` | Live anomaly alerts |
| WS | `/api/ws/copilot` | Live copilot recommendations |
| GET | `/api/anomalies` | All past anomalies |
| PATCH | `/api/anomalies/{id}/acknowledge` | Mark anomaly as seen |
| GET | `/api/copilot/latest` | Latest copilot recommendation |
| GET | `/api/copilot/history` | All past recommendations |
| GET | `/api/risk/components` | Current risk score per component |

---

## Dashboard Features

| Feature | Description |
|---|---|
| Component Risk Heatmap | Fused risk score per physical component, colour coded by severity |
| Digital Twin | Interactive SVG schematic of the chiller plant with animated water flow and live risk overlay |
| AI Copilot Panel | Structured operator recommendation with 3-stage reasoning trace |
| Anomaly Log | Full event ledger with failure probability, degradation score, and acknowledgement |
| Live Sensor Feed | Real-time telemetry with sparkline trends and fault label badge |
| Anomaly Timeline | Rolling risk history chart |
| Simulation Controller | Scenario selector with start/stop controls |

---

## Copilot Reasoning Trace

Every recommendation shows the full reasoning chain:

```
STAGE A — ANOMALY DETECTION
Isolation Forest flagged deviation from baseline
Anomaly score: 0.87 | 3.5σ from normal ✓

STAGE B — FAULT IDENTIFICATION
HistGradientBoosting matched: bypass_valve_leakage
Top signals: bypass_valve_fault (0.63), pressure_bias (0.12)
Confidence: 87% ✓

STAGE C — PHYSICS VALIDATION
Valve position above setpoint across 5 control cycles
Ruled out: bypass_valve_stuck (gate score below threshold)
Confirmed: bypass_valve_leakage ✓

ACTION
Schedule actuator inspection within 72h
Risk if deferred: 31% trip probability within 5 days
```

---

## Team

**DAC Girls — National AI Student Challenge 2026**

| Name | Role |
|---|---|
| Juliana Charisse Ramos | Project Lead, Full Stack Engineer |
| Dhirana Sundaram | ML Engineer |
| Shaista Muskan | ML Engineer |
| Ang Lija | Data Engineer |

---

## Competition

**National AI Student Challenge 2026 — Huawei Track**
- Stage 1: Top 10 (out of all participating teams)
- Stage 2: Top 5 Finalist (Semi-Final, April 30 2026)
- Grand Final: May 23 2026, AI Student Developer Conference
