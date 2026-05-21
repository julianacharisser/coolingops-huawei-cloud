import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import {
  acknowledgeAnomaly,
  getAnomalies,
  getCopilotHistory,
  getFeedbackSummary,
  getSimulationStatus,
} from './services/api';
import { AccuracySummary } from './components/AccuracySummary';
import { KPIStrip } from './components/KPIStrip';
import { NavBar } from './components/NavBar';
import { CopilotChat } from './components/CopilotChat';
import { AnomalyLogWithFeedback } from './components/AnomalyLogWithFeedback';
import { PlantSchematic } from './components/PlantSchematic';
import { PredictionPanel } from './components/PredictionPanel';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AlertStreamMessage {
  type: 'anomaly_event';
  id: number;
  timestamp: string;
  component: string;
  fault_type: string;
  confidence: number;
  gate_scores: Record<string, number>;
  degradation_score: number;
  severity: Severity;
  acknowledged: boolean;
}

interface CopilotReasoningStageA {
  label: string;
  detail: string;
  anomaly_score: number;
  sigma: number;
}

interface CopilotReasoningStageB {
  label: string;
  detail: string;
  top_features: Array<{ name: string; value: string }>;
  confidence: number;
}

interface CopilotReasoningStageC {
  label: string;
  detail: string;
  ruled_out: string;
  confirmed: string;
}

interface CopilotMessage {
  type: 'copilot_recommendation';
  id: number;
  timestamp: string;
  what: string;
  why: string;
  confidence: number;
  action: string;
  riskIfDeferred: string;
  degradation_score: number;
  reasoning: {
    stage_a: CopilotReasoningStageA;
    stage_b: CopilotReasoningStageB;
    stage_c: CopilotReasoningStageC;
  };
}

function SectionCard({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[30px] border border-border bg-panel/88 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm ${className}`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-cyan">{eyebrow}</div>
          <h2 className="mt-2 text-xl font-semibold text-ink">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function App() {
  const [isSimulating, setIsSimulating] = useState(false);
  const [anomalies, setAnomalies] = useState<AlertStreamMessage[]>([]);
  const [copilotEntries, setCopilotEntries] = useState<CopilotMessage[]>([]);
  const [feedbackSummary, setFeedbackSummary] = useState<any>(null);
  const [warningTriggered, setWarningTriggered] = useState(false);
  const [faultRevealed, setFaultRevealed] = useState(false);

  const { isConnected } = useWebSocket('sensors');
  const { lastMessage: alertMessage } = useWebSocket('alerts');
  const { lastMessage: copilotMessage } = useWebSocket('copilot');

  const syncSimulationStatus = useCallback(async () => {
    try {
      const status = await getSimulationStatus();
      setIsSimulating(Boolean(status.running));
    } catch {
      setIsSimulating(false);
    }
  }, []);

  const loadBootData = useCallback(async () => {
    try {
      const [anomalyResponse, copilotResponse, feedbackResponse] = await Promise.all([
        getAnomalies(),
        getCopilotHistory(),
        getFeedbackSummary().catch(() => null),
      ]);

      if (Array.isArray(anomalyResponse.items)) {
        setAnomalies(anomalyResponse.items.slice(0, 16));
      }

      if (Array.isArray(copilotResponse.items)) {
        setCopilotEntries(copilotResponse.items.slice(0, 10));
      }

      if (feedbackResponse) {
        setFeedbackSummary(feedbackResponse);
      }
    } catch {
      // keep the dashboard resilient while the backend warms up
    }
  }, []);

  const refreshFeedbackSummary = useCallback(async () => {
    try {
      const summary = await getFeedbackSummary();
      setFeedbackSummary(summary);
    } catch {
      // keep demo summary visible if the backend summary endpoint is unavailable
    }
  }, []);

  useEffect(() => {
    void syncSimulationStatus();
    void loadBootData();
  }, [loadBootData, syncSimulationStatus]);

  useEffect(() => {
    const message = alertMessage as AlertStreamMessage | null;
    if (!message || message.type !== 'anomaly_event') {
      return;
    }

    setAnomalies((current) => [message, ...current.filter((item) => item.id !== message.id)].slice(0, 16));
  }, [alertMessage]);

  useEffect(() => {
    const message = copilotMessage as CopilotMessage | null;
    if (!message || message.type !== 'copilot_recommendation') {
      return;
    }

    setCopilotEntries((current) => [message, ...current.filter((item) => item.id !== message.id)].slice(0, 10));
  }, [copilotMessage]);

  const handleAcknowledge = useCallback(async (id: number) => {
    try {
      await acknowledgeAnomaly(id);
    } catch {
      // keep the UI responsive even if the backend call fails
    }

    setAnomalies((current) =>
      current.map((item) => (item.id === id ? { ...item, acknowledged: true } : item)),
    );
  }, []);

  const latestAlert = anomalies[0] ?? null;
  const latestCopilot = copilotEntries[0] ?? null;

  return (
    <main className="min-h-screen bg-grid bg-[size:64px_64px] text-ink">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <NavBar
          isConnected={isConnected}
          isSimulating={isSimulating}
          onStartReplay={() => setIsSimulating(true)}
          onStopReplay={() => setIsSimulating(false)}
          onTriggerWarning={() => setWarningTriggered(true)}
          onRevealFault={() => setFaultRevealed(true)}
        />

        {(warningTriggered || faultRevealed) ? (
          <section className="flex flex-wrap gap-3">
            {warningTriggered ? (
              <div className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-warning">
                Early warning mode armed
              </div>
            ) : null}
            {faultRevealed ? (
              <div className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-cyan">
                Actual fault reveal active
              </div>
            ) : null}
          </section>
        ) : null}

        <KPIStrip anomalies={anomalies} latestAlert={latestAlert} />

        <section className="grid gap-6">
          <SectionCard eyebrow="Section 1" title="Main Dashboard">
            <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
              <PlantSchematic latestAlert={latestAlert} allAlerts={anomalies} />
              <PredictionPanel latestAlert={latestAlert} latestCopilot={latestCopilot} />
            </div>
          </SectionCard>
          <CopilotChat latestAlert={latestAlert} latestCopilot={latestCopilot} />
        </section>

        <SectionCard
          eyebrow="Section 3"
          title="Anomaly Log And Feedback"
          action={
            <div className="rounded-full border border-border bg-[#0d1524] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-muted">
              {anomalies.length} tracked events
            </div>
          }
        >
          <AnomalyLogWithFeedback
            anomalies={anomalies}
            onAcknowledge={handleAcknowledge}
            onFeedbackSubmitted={() => void refreshFeedbackSummary()}
          />
        </SectionCard>
        <AccuracySummary feedbackSummary={feedbackSummary} />
      </div>
    </main>
  );
}
