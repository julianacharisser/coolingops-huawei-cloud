import { useCallback, useEffect, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { acknowledgeAnomaly, getAnomalies, getSimulationStatus } from './services/api';
import { NavBar } from './components/NavBar';
import { KPIStrip } from './components/KPIStrip';
import { PlantSchematic } from './components/PlantSchematic';
import { PredictionPanel } from './components/PredictionPanel';
import { CopilotChat } from './components/CopilotChat';
import { AnomalyLogWithFeedback } from './components/AnomalyLogWithFeedback';
import { AccuracySummary } from './components/AccuracySummary';

export default function App() {
  const { lastMessage: alertMessage, isConnected } = useWebSocket('alerts');
  const { lastMessage: copilotMessage } = useWebSocket('copilot');

  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [latestAlert, setLatestAlert] = useState<any>(null);
  const [latestCopilot, setLatestCopilot] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  useEffect(() => {
    void getAnomalies()
      .then((data) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        setAnomalies(items);
        setLatestAlert(items[0] ?? null);
      })
      .catch(() => {
        setAnomalies([]);
        setLatestAlert(null);
      });

    void getSimulationStatus()
      .then((status) => setIsSimulating(Boolean(status?.running)))
      .catch(() => setIsSimulating(false));
  }, []);

  useEffect(() => {
    if (!alertMessage) {
      return;
    }

    setLatestAlert(alertMessage);
    setAnomalies((prev) => [alertMessage, ...prev.filter((item) => item.id !== alertMessage.id)].slice(0, 50));
  }, [alertMessage]);

  useEffect(() => {
    if (!copilotMessage) {
      return;
    }

    setLatestCopilot(copilotMessage);
  }, [copilotMessage]);

  const handleStart = useCallback(() => {
    setIsSimulating(true);
  }, []);

  const handleStop = useCallback(() => {
    setIsSimulating(false);
  }, []);

  const handleAcknowledge = useCallback(async (id: number) => {
    try {
      await acknowledgeAnomaly(id);
    } catch {
      // keep local UI responsive even if the backend is unavailable
    }

    setAnomalies((prev) =>
      prev.map((item) => (item.id === id ? { ...item, acknowledged: true } : item)),
    );
    setLatestAlert((current: any) =>
      current?.id === id ? { ...current, acknowledged: true } : current,
    );
  }, []);

  return (
    <main className="min-h-screen scroll-smooth bg-grid bg-[size:64px_64px] text-ink">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <NavBar
          isConnected={isConnected}
          isSimulating={isSimulating}
          onStartReplay={handleStart}
          onStopReplay={handleStop}
        />

        <div className="border-t border-border/60 pt-6">
          <KPIStrip anomalies={anomalies} latestAlert={latestAlert} />
        </div>

        <div className="border-t border-border/60 pt-6">
          <div className="flex flex-col gap-4 xl:flex-row">
            <PlantSchematic
              latestAlert={latestAlert}
              allAlerts={anomalies}
              className="xl:w-2/3"
            />
            <PredictionPanel
              latestAlert={latestAlert}
              latestCopilot={latestCopilot}
              className="xl:w-1/3"
            />
          </div>
        </div>

        <div className="border-t border-border/60 pt-6">
          <CopilotChat
            latestAlert={latestAlert}
            latestCopilot={latestCopilot}
          />
        </div>

        <div className="border-t border-border/60 pt-6">
          <AnomalyLogWithFeedback
            anomalies={anomalies}
            onAcknowledge={handleAcknowledge}
          />
        </div>

        <div className="border-t border-border/60 pt-6">
          <AccuracySummary />
        </div>
      </div>
    </main>
  );
}
