import { useCallback, useEffect, useState } from 'react';
import { AlertOctagon, Play, Snowflake, Square, Waves, Wind } from 'lucide-react';
import { AnomalyLog } from './components/AnomalyLog';
import { AnomalyTimeline } from './components/AnomalyTimeline';
import { ComponentRiskHeatmap } from './components/ComponentRiskHeatmap';
import { CopilotPanel } from './components/CopilotPanel';
import { LiveSensorFeed } from './components/LiveSensorFeed';
import { useWebSocket } from './hooks/useWebSocket';
import { getSimulationStatus, startDemoSimulation, stopSimulation } from './services/api';

const kpiCards = [
  { label: 'Cooling Efficiency', value: '91.8%', delta: '+1.2%', icon: Snowflake, tone: 'text-success' },
  { label: 'Active Alerts', value: '07', delta: '+2', icon: AlertOctagon, tone: 'text-critical' },
  { label: 'Flow Stability', value: '96.4%', delta: '-0.8%', icon: Waves, tone: 'text-warning' },
  { label: 'Tower Throughput', value: '14.2k', delta: '+4.1%', icon: Wind, tone: 'text-cyan' },
];

export default function App() {
  const [isSimulating, setIsSimulating] = useState(false);
  const { isConnected } = useWebSocket('alerts');

  const syncSimulationStatus = useCallback(async () => {
    try {
      const status = await getSimulationStatus();
      setIsSimulating(Boolean(status.running));
    } catch {
      setIsSimulating(false);
    }
  }, []);

  useEffect(() => {
    void syncSimulationStatus();
  }, [syncSimulationStatus]);

  const handleSimulationToggle = useCallback(async () => {
    if (isSimulating) {
      await stopSimulation();
      setIsSimulating(false);
      return;
    }

    await startDemoSimulation();
    setIsSimulating(true);
  }, [isSimulating]);

  return (
    <main className="min-h-screen bg-grid bg-[size:72px_72px]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 overflow-hidden rounded-[28px] border border-cyan/20 bg-panel/80 p-6 shadow-glow backdrop-blur-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan/20 bg-cyan/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-cyan">
              CoolingOps
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-night/60 px-3 py-1 text-xs uppercase tracking-[0.18em] text-ink">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isConnected
                      ? 'bg-success shadow-[0_0_12px_rgba(0,255,136,0.85)]'
                      : 'bg-critical shadow-[0_0_12px_rgba(255,59,59,0.85)]'
                  }`}
                />
                System Online
              </div>
              <button
                type="button"
                onClick={() => void handleSimulationToggle()}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  isSimulating
                    ? 'border-critical/30 bg-critical/10 text-critical hover:bg-critical/15'
                    : 'border-success/30 bg-success/10 text-success hover:bg-success/15'
                }`}
              >
                {isSimulating ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isSimulating ? 'Stop Simulation' : 'Start Simulation'}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Real-time industrial cooling supervision for multi-agent anomaly detection.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                Dark-room operational view for thermal stability, subsystem risk, copilot actions, and live telemetry across the plant.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {kpiCards.map(({ label, value, delta, icon: Icon, tone }) => (
                <div key={label} className="rounded-2xl border border-border bg-night/70 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted">{label}</span>
                    <Icon className={`h-4 w-4 ${tone}`} />
                  </div>
                  <div className="mt-3 font-mono text-3xl font-semibold text-ink">{value}</div>
                  <div className={`mt-2 text-sm ${tone}`}>{delta} vs. previous cycle</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="grid gap-6">
            <ComponentRiskHeatmap />
            <AnomalyTimeline />
            <AnomalyLog />
          </div>

          <div className="grid gap-6">
            <CopilotPanel />
            <LiveSensorFeed />
          </div>
        </div>
      </div>
    </main>
  );
}
