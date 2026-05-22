const rawBaseUrl = import.meta.env.VITE_API_URL;
const BASE_URL =
  rawBaseUrl !== undefined
    ? rawBaseUrl
    : 'http://localhost:8000';

export const startDemoSimulation = () =>
  fetch(`${BASE_URL}/api/simulation/demo`, { method: 'POST' }).then((r) => r.json());

export const stopSimulation = () =>
  fetch(`${BASE_URL}/api/simulation/stop`, { method: 'POST' }).then((r) => r.json());

export const getSimulationStatus = () =>
  fetch(`${BASE_URL}/api/simulation/status`).then((r) => r.json());

export const getAnomalies = () =>
  fetch(`${BASE_URL}/api/anomalies`).then((r) => r.json());

export const acknowledgeAnomaly = (id: number) =>
  fetch(`${BASE_URL}/api/anomalies/${id}/acknowledge`, { method: 'PATCH' }).then((r) => r.json());

export const getCopilotHistory = () =>
  fetch(`${BASE_URL}/api/copilot/history`).then((r) => r.json());

export const getCopilotLatest = () =>
  fetch(`${BASE_URL}/api/copilot/latest`).then((r) => r.json());

export const getRiskComponents = () =>
  fetch(`${BASE_URL}/api/risk/components`).then((r) => r.json());

export const getFeedbackSummary = () =>
  fetch(`${BASE_URL}/api/feedback/summary`).then((r) => r.json());
