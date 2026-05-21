import { useCallback, useState } from 'react';
import { AlertTriangle, Play, Search, Square, Zap } from 'lucide-react';
import { startDemoSimulation, stopSimulation } from '../services/api';

interface NavBarProps {
  onStartReplay: () => void;
  onStopReplay: () => void;
  onTriggerWarning: () => void;
  onRevealFault: () => void;
  isSimulating: boolean;
  isConnected: boolean;
}

export function NavBar({
  onStartReplay,
  onStopReplay,
  onTriggerWarning,
  onRevealFault,
  isSimulating,
  isConnected,
}: NavBarProps) {
  const [triggerWarning, setTriggerWarning] = useState(false);
  const [revealFault, setRevealFault] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const handleReplayToggle = useCallback(async () => {
    if (isBusy) {
      return;
    }

    setIsBusy(true);
    try {
      if (isSimulating) {
        await stopSimulation();
        onStopReplay();
        return;
      }

      await startDemoSimulation();
      onStartReplay();
    } finally {
      setIsBusy(false);
    }
  }, [isBusy, isSimulating, onStartReplay, onStopReplay]);

  const handleTriggerWarning = useCallback(() => {
    setTriggerWarning(true);
    onTriggerWarning();
  }, [onTriggerWarning]);

  const handleRevealFault = useCallback(() => {
    setRevealFault(true);
    onRevealFault();
  }, [onRevealFault]);

  return (
    <nav className="sticky top-4 z-20 w-full h-14 rounded-[28px] border border-border bg-night/85 px-5 shadow-[0_18px_42px_rgba(0,0,0,0.3)] backdrop-blur">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="font-mono text-lg font-bold text-cyan">CoolingOps</div>
            <div className="text-[11px] text-muted">Predictive Cooling Intelligence</div>
          </div>
        </div>

        <div className="hidden items-center gap-2 rounded-full border border-border bg-panel/90 px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted md:inline-flex">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isConnected ? 'bg-success status-dot-pulse' : 'bg-critical'
            }`}
          />
          {isConnected ? 'System Online' : 'System Offline'}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleReplayToggle()}
            disabled={isBusy}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition ${
              isSimulating
                ? 'border-critical/30 bg-critical/10 text-critical hover:bg-critical/15'
                : 'border-success/30 bg-success/10 text-success hover:bg-success/15'
            } ${isBusy ? 'cursor-wait opacity-70' : ''}`}
          >
            {isSimulating ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isSimulating ? 'Stop Replay' : 'Start Predictive Replay'}
          </button>

          <button
            type="button"
            onClick={handleTriggerWarning}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition ${
              triggerWarning
                ? 'border-warning/40 bg-warning/15 text-warning'
                : 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/15'
            }`}
          >
            <Zap className="h-4 w-4" />
            Trigger Early Warning
          </button>

          <button
            type="button"
            onClick={handleRevealFault}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm transition ${
              revealFault
                ? 'border-cyan/40 bg-cyan/15 text-cyan'
                : 'border-cyan/30 bg-cyan/10 text-cyan hover:bg-cyan/15'
            }`}
          >
            <Search className="h-4 w-4" />
            Reveal Actual Fault
          </button>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {triggerWarning ? 'Early warning triggered' : ''}
        {revealFault ? 'Actual fault revealed' : ''}
        {!isConnected ? <AlertTriangle className="h-0 w-0" /> : null}
      </div>
    </nav>
  );
}
