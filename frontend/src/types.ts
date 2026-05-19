export type Severity = 'critical' | 'warning' | 'stable';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface HeatmapCard {
  component: string;
  score: number;
  severity: RiskLevel;
  updatedAt: string;
}

export interface CopilotEntry {
  id: string | number;
  timestamp: string;
  what: string;
  why: string;
  confidence: number;
  action: string;
  riskIfDeferred: string;
  reasoning: {
    stage_a:
      | {
          component: string;
          anomaly_score: number;
          sigma: number;
        }
      | {
          label: string;
          detail: string;
          anomaly_score: number;
          sigma: number;
        };
    stage_b:
      | {
          fault_type: string;
          top_features: Array<{
            name: string;
            value: string;
          }>;
          confidence: number;
        }
      | {
          label: string;
          detail: string;
          top_features: Array<{
            name: string;
            value: string;
          }>;
          confidence: number;
        };
    stage_c:
      | {
          validated: string;
          ruled_out: Array<{
            fault: string;
            reason: string;
          }>;
          confirmed: string;
        }
      | {
          label: string;
          detail: string;
          ruled_out: string;
          confirmed: string;
        };
  };
}

export interface TimelinePoint {
  time: string;
  anomalyIndex: number;
  thermalLoad: number;
}

export interface SensorReading {
  id: string;
  name: string;
  unit: string;
  value: number;
  delta: number;
  severity: Severity;
  history: number[];
}

export interface LogEntry {
  id: string | number;
  timestamp: string;
  subsystem: string;
  anomaly: string;
  failureProb: number;
  rulEstimate: number;
  agent: string;
  severity: Severity;
  status: 'open' | 'investigating' | 'mitigated';
}
