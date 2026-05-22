# CoolingOps — Predictive Cooling Intelligence

**National AI Student Challenge 2026 — Huawei Track | TOP 5 FINALIST**
Team: DAC Girls | Finals: 22–23 May 2026

---

## What is CoolingOps

CoolingOps is a real-time multi-agent AI system for industrial cooling system fault detection and prevention. Singapore's industrial facilities rely on large-scale cooling systems monitored by static threshold-based alerts that miss gradual, cascading, multivariate failures.

CoolingOps detects fault signatures at early intensity (25%) before they escalate to critical failure (75%) — giving operators actionable lead time to intervene.

---

## Team

| Name | Role |
|---|---|
| Juliana | Project Lead, Full Stack Engineer, System Architecture |
| Dhirana | ML Engineer — anomaly detection, fault classification, multi-agent pipeline |
| Shaista | Cloud Engineer — Huawei Cloud deployment (ECS, SWR, OBS, GaussDB, SMN, ModelArts) |
| Lija | Data Engineer — feature engineering, dataset analysis |

---

## Dataset

**LBL Chiller Plant Dataset** — Lawrence Berkeley National Laboratory
- 77 sensors across a 3-chiller, 3-cooling-tower, 5-pump system
- 24 CSV files (23 faulted scenarios + 1 normal baseline)
- 1-minute resolution, full year per scenario
- Located in: `backend/data/raw/official/`

**Demo sequence (3 CSVs played in order):**
- `ChillerPlant.csv` → rows 1–300 (normal operation)
- `ChillerPlant_bypass_leakage_025.csv` → rows 301–600 (early fault, 25% intensity)
- `ChillerPlant_bypass_leakage_075.csv` → rows 601–900 (critical fault, 75% intensity)

---

## Tech Stack

**Frontend**
- React + TypeScript + Tailwind CSS
- Recharts for charts, Lucide for icons
- SVG plant schematic with animated pipe flow
- WebSocket client for real-time updates
- Vite build tool — runs on `localhost:5174`

**Backend**
- Python + FastAPI
- Async WebSockets (3 channels: sensors, alerts, copilot)
- In-memory storage for demo (no database by design)
- Runs on `localhost:8000`

**ML Pipeline**
- Stage 1: Isolation Forest — anomaly detection, trained on normal data, month-stratified bootstrap thresholds (P95 caution, P99 critical)
- Stage 2: HistGradientBoosting — fault classification across 8 fault types, 89% balanced accuracy, 89% macro F1
- Physics gates validate predictions using `fault_gate_baseline.json`
- Rolling 150-row window buffer

**Huawei Cloud**
- ECS — FastAPI backend (Docker container)
- OBS — React frontend (static hosting)
- SWR — Docker image registry
- ModelArts — DeepSeek inference endpoint for AI Copilot
- APIG — API Gateway in front of ECS (WebSocket passthrough enabled)
- SMN — Email/SMS alerts for critical faults

---

## Multi-Agent Pipeline

```
Sensor Window (150 rows)
        ↓
Monitoring Agent    — Isolation Forest anomaly scoring
        ↓ (if anomaly detected)
Prognosis Agent     — Rolling trend → predicted risk + lead time
        ↓ (if predicted risk > threshold)
Diagnosis Agent     — HistGradientBoosting fault classification
        ↓ (if confidence > threshold)
Physics Agent       — fault_gate_baseline.json constraint validation
        ↓ (if ≥3/5 physics rules pass)
Copilot Agent       — DeepSeek on ModelArts → operator recommendation
```

Each agent has a distinct role and only fires if the previous agent passes its gate. This architecture prevents alert flooding and ensures recommendations are physics-validated before reaching the operator.

**Agent thresholds:**
- Monitoring: `anomaly_score > 0.42`
- Prognosis: `predicted_risk > 0.75`
- Diagnosis: `confidence > 0.70`
- Physics: `≥3 of 5 rules pass`

---

## Dashboard

Single scrollable page, dark industrial theme.

### 1. Navigation Bar
- App name + connection status indicator
- Demo controls: **Start Predictive Replay** | **Trigger Early Warning** | **Reveal Actual Fault**
- Jump buttons override the automatic replay for presentation control

### 2. KPI Strip
Six live metric cards: Plant Health, Cooling Efficiency, Active Alerts, Flow Stability, Horizon, Lead Time

### 3. Main Dashboard (side by side)

**Plant Schematic (left 65%)**
- SVG schematic of physical chiller plant — 3 cooling towers, 3 chillers, 6 pumps, bypass valve
- Animated water flow on condenser loop (amber), chilled water loop (blue), bypass (cyan)
- Each component colour-coded by live risk score: green → amber → orange → red (pulsing)
- Sensor tag labels on every component
- Alert banner across top when fault is active: `⚠️ Predicted escalation: Chiller 2 likely critical in 27 min`
- Click any component for tooltip: name, risk %, severity, last updated

**Prediction Panel (right 35%)**
- Current risk vs predicted risk
- Confidence and lead time metrics
- Live countdown timer to predicted critical threshold
- Why / Action / Risk if deferred — populated from AI Copilot
- 3-stage reasoning trace: Stage A (Isolation Forest) → Stage B (XGBoost) → Stage C (Physics)
- Active sensor tags derived from top gate scores

### 4. AI Copilot Chat
- Conversational interface powered by DeepSeek on Huawei ModelArts
- Full plant context injected into every message (fault type, confidence, gate scores, component, reasoning trace)
- Suggested quick prompts: Why is this happening / What should I check first / How urgent is this / Show me the evidence
- Typing indicator while ModelArts responds
- Falls back to smart template if ModelArts unavailable

### 5. Anomaly Log with Operator Feedback
- Full event ledger: Time, ID, Fault Type, Risk, Assigned To, Status, Action
- Expandable feedback form per row:
  - Assign to operator (Operator A / B / C)
  - Was prediction correct? (Yes / No / Partially)
  - How was it handled? (Maintenance / Monitoring / No action)
  - Free text description
  - Star rating (1–5)
  - Time to resolve (minutes)
- Submits to `PATCH /api/anomalies/{id}/feedback`
- Status updates: OPEN → INVESTIGATING → RESOLVED / FALSE ALARM

### 6. Prediction Accuracy Summary
- Aggregate stats across all feedback submitted
- Confirmed / partial / incorrect breakdown
- Average rating and average resolve time
- Bar chart of accuracy by fault type (Recharts)

---

## WebSocket Channels

**`ws/sensors`**
```json
{
  "type": "sensor_snapshot",
  "timestamp": "string",
  "fault_label": "string",
  "sensor_data": { "[sensorName]": "number" }
}
```

**`ws/alerts`**
```json
{
  "type": "anomaly_event",
  "id": "number",
  "timestamp": "string",
  "component": "string",
  "fault_type": "string",
  "confidence": "float",
  "gate_scores": "object",
  "degradation_score": "float",
  "severity": "low|medium|high|critical",
  "acknowledged": "boolean",
  "assigned_to": "string|null",
  "status": "open|investigating|resolved|false_alarm"
}
```

**`ws/copilot`**
```json
{
  "type": "copilot_recommendation",
  "id": "number",
  "anomaly_id": "number",
  "timestamp": "string",
  "what": "string",
  "why": "string",
  "confidence": "float",
  "action": "string",
  "riskIfDeferred": "string",
  "degradation_score": "float",
  "reasoning": {
    "stage_a": { "label": "string", "detail": "string", "anomaly_score": "float", "sigma": "float" },
    "stage_b": { "label": "string", "detail": "string", "top_features": "array", "confidence": "float" },
    "stage_c": { "label": "string", "detail": "string", "ruled_out": "string", "confirmed": "string" }
  }
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/simulation/demo` | Start demo sequence (3-phase, 900 rows) |
| POST | `/api/simulation/start` | Start specific scenario |
| POST | `/api/simulation/stop` | Stop simulation |
| GET | `/api/simulation/status` | Running state + rows processed |
| GET | `/api/anomalies` | All past anomalies |
| PATCH | `/api/anomalies/{id}/acknowledge` | Mark anomaly as seen |
| PATCH | `/api/anomalies/{id}/feedback` | Submit operator feedback |
| GET | `/api/copilot/latest` | Most recent copilot recommendation |
| GET | `/api/copilot/history` | All recommendations |
| POST | `/api/copilot/chat` | Chat with AI Copilot (DeepSeek) |
| GET | `/api/risk/components` | Latest risk score per component |
| GET | `/api/feedback/summary` | Aggregated prediction accuracy stats |
| GET | `/api/operators` | List of operators for assignment |
| WS | `/api/ws/sensors` | Live sensor stream |
| WS | `/api/ws/alerts` | Live anomaly events |
| WS | `/api/ws/copilot` | Live copilot recommendations |

---

## Project Structure

```
coolingops-huawei-cloud/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── types.ts
│   │   ├── components/
│   │   │   ├── NavBar.tsx
│   │   │   ├── KPIStrip.tsx
│   │   │   ├── PlantSchematic.tsx
│   │   │   ├── PredictionPanel.tsx
│   │   │   ├── CopilotChat.tsx
│   │   │   ├── AnomalyLogWithFeedback.tsx
│   │   │   ├── AccuracySummary.tsx
│   │   │   └── ui/Panel.tsx
│   │   ├── hooks/useWebSocket.ts
│   │   └── services/api.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   └── websocket.py
│   │   ├── services/
│   │   │   ├── pipeline.py
│   │   │   └── simulation.py
│   │   ├── agents/
│   │   │   ├── monitoring_agent.py
│   │   │   ├── prognosis_agent.py
│   │   │   ├── diagnosis_agent.py
│   │   │   ├── physics_agent.py
│   │   │   └── copilot_agent.py
│   │   └── api/routes/routes.py
│   ├── ml/
│   │   ├── infer_root_cause_classifier.py
│   │   ├── data_pipeline.py
│   │   ├── plant_features.py
│   │   ├── fault_specific_gates.py
│   │   └── artifacts/
│   │       ├── root_cause_classifier/
│   │       │   ├── root_cause_model.joblib
│   │       │   ├── imputer.joblib
│   │       │   ├── label_encoder.joblib
│   │       │   └── config.json
│   │       └── fault_gate_calibration/
│   │           └── fault_gate_baseline.json
│   ├── data/raw/official/     ← 24 LBL CSV files
│   ├── requirements.txt
│   └── .env.example
├── .gitignore
└── README.md
```

---

## Environment Variables

Create `backend/.env` from `backend/.env.example`:

```
# Huawei ModelArts — DeepSeek copilot endpoint
MODELARTS_API_URL=https://your-modelarts-endpoint/v1/infers/your-endpoint-id
MODELARTS_API_KEY=your-modelarts-api-key
MODELARTS_MODEL_NAME=deepseek-v3

# Huawei SMN — critical fault email alerts
SMN_TOPIC_URN=urn:smn:ap-southeast-1:your-project:coolingops-critical-alerts
SMN_PROJECT_ID=your-project-id
HUAWEI_AK=your-access-key
HUAWEI_SK=your-secret-key
SMN_REGION=ap-southeast-1

# Dashboard public URL (used in SMN alert emails)
DASHBOARD_URL=http://coolingops-frontend.obs-website.ap-southeast-1.myhuaweicloud.com
```

If `MODELARTS_API_KEY` is not set, the copilot chat falls back to smart keyword-based templates — the demo still works.

If `SMN_TOPIC_URN` is not set, SMN notifications are skipped silently — the pipeline does not crash.

---

## Running Locally

**Backend:**
```bash
cd backend
source venv/bin/activate        # Mac/Linux
# or venv\Scripts\activate      # Windows
python -m uvicorn app.main:app --reload --port 8000
# Open http://localhost:8000/docs
```

**Frontend:**
```bash
cd frontend
npm run dev
# Open http://localhost:5174
```

**End-to-end test:**
1. Start backend
2. Start frontend
3. Open frontend in browser — status dot should show green SYSTEM ONLINE
4. Click **Start Predictive Replay** in nav bar
5. Watch sensor feed update, fault detected at ~row 301, escalation at ~row 601
6. Use jump buttons (Trigger Early Warning / Reveal Actual Fault) to skip phases during demo

---

## Cloud Architecture (Huawei)

```
IoT Sensors → APIG → ECS (Docker/FastAPI)
                              ↓
                   Multi-Agent Pipeline:
                   Agent 1: Isolation Forest (anomaly)
                   Agent 2: HGB + Physics Gates (fault type)
                   Agent 3: DeepSeek/ModelArts (copilot)
                              ↓
                   WebSocket broadcast
                        ↓              ↓
                       SMN            OBS
                  (email alerts)  (React dashboard)
```

**Deployment flow:**
1. `cd frontend && npm run build`
2. `bash deploy.sh` — builds and pushes backend Docker image to SWR, redeploys on ECS
3. Upload `frontend/dist/` to OBS bucket
4. Ensure `/app/.env` on ECS contains all environment variables
5. Verify APIG routes and WebSocket passthrough

**Production next steps (beyond competition scope):**
- CCE instead of ECS (Kubernetes orchestration)
- GeminiDB for time-series sensor storage
- GaussDB for anomaly history persistence
- IoTDA for real SCADA sensor ingestion
- ModelArts for versioned model serving

---

## Demo Flow (Finals Presentation)

```
Juliana clicks Start Predictive Replay
        ↓
Rows stream automatically through ML pipeline
        ↓
0:00 — Normal operation, all components green
       KPI strip healthy, copilot idle
        ↓
~1:00 — bypass_leakage_025 detected
        Alert banner fires: ⚠️ Predicted escalation
        Plant schematic: bypass valve node → amber
        Prediction panel: 49% current risk, 84% predicted
        Copilot: "AI Copilot is analysing..." → DeepSeek fires
        Reasoning trace animates: Stage A ✓ Stage B ✓ Stage C ✓
        Juliana: "We caught this fault at 25% intensity"
        ↓
~2:00 — bypass_leakage_075 escalates
        Alert banner: CRITICAL
        Plant schematic: multiple nodes → red + pulsing
        Countdown timer reaches critical threshold
        Copilot updates with urgent action + RUL
        Anomaly log: both events visible with timestamps
        Juliana: "Without intervention, failure in X minutes"
        ↓
Operator acknowledges fault on anomaly log
        Plant schematic node → "Under Investigation"
        Juliana: "Operator has been notified, action dispatched"
```

Jump buttons let presenter skip to any phase instantly if needed.

---

## Known Issues

| Issue | Status | Owner |
|---|---|---|
| False positives — Isolation Forest flags normal data | Pending | Dhirana |
| ModelArts DeepSeek for AI Copilot | In progress | Shaista |
| Updating Frontend | In progress | Juliana |
| SMN alert code not implemented | Pending |  |
| APIG WebSocket passthrough not configured | Pending |  |
