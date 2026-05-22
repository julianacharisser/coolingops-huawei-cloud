import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Filter } from 'lucide-react';
import { anomalyLogData } from '../data/mockData';
import type { LogEntry, Severity } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { acknowledgeAnomaly, getAnomalies } from '../services/api';
import { Panel } from './ui/Panel';

const severityPill: Record<Severity, string> = {
  critical: 'border-critical/30 bg-critical/10 text-critical',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  stable: 'border-success/30 bg-success/10 text-success',
};

const statusTone: Record<'open' | 'investigating' | 'mitigated', string> = {
  open: 'text-critical',
  investigating: 'text-warning',
  mitigated: 'text-success',
};

function failureProbTone(probability: number) {
  if (probability >= 70) return 'text-critical';
  if (probability >= 40) return 'text-warning';
  return 'text-success';
}

function rulTone(hours: number) {
  if (hours <= 50) return 'text-critical';
  if (hours <= 200) return 'text-warning';
  return 'text-success';
}

function getLogEntryKey(entry: LogEntry, index: number) {
  return typeof entry.id === 'number' ? `${entry.id}-${entry.timestamp}` : `${entry.id}-${index}`;
}

export function AnomalyLog() {
  const { lastMessage: alertMessage } = useWebSocket('alerts');
  const [logEntries, setLogEntries] = useState(anomalyLogData);
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'investigating' | 'mitigated'>('all');

  const mapAnomalyItem = useCallback(
    (item: any): LogEntry => ({
      id: item.id,
      timestamp: new Date(item.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      subsystem: item.component,
      anomaly: String(item.fault_type).replace(/_/g, ' '),
      failureProb: Math.round(item.confidence * 100),
      rulEstimate: Math.round((1 - item.degradation_score) * 300),
      agent: 'Diagnostic Agent',
      severity: item.severity === 'critical' || item.severity === 'high' ? 'critical' : 'warning',
      status: item.acknowledged ? 'mitigated' : 'open',
    }),
    [],
  );

  const loadAnomalies = useCallback(async () => {
    const response = await getAnomalies();
    if (Array.isArray(response.items) && response.items.length > 0) {
      setLogEntries(response.items.map(mapAnomalyItem));
    }
  }, [mapAnomalyItem]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await loadAnomalies();
      } catch {
        if (!active) return;
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [loadAnomalies]);

  useEffect(() => {
    if (!alertMessage || alertMessage.type !== 'anomaly_event') {
      return;
    }

    const nextEntry = mapAnomalyItem(alertMessage);
    setLogEntries((current) => {
      const exists = current.some(
        (entry) => entry.id === nextEntry.id && entry.timestamp === nextEntry.timestamp,
      );
      if (exists) {
        return current;
      }

      return [nextEntry, ...current].slice(0, 50);
    });
  }, [alertMessage, mapAnomalyItem]);

  const entries = useMemo(() => {
    return logEntries.filter((entry) => {
      const severityMatch = severityFilter === 'all' || entry.severity === severityFilter;
      const statusMatch = statusFilter === 'all' || entry.status === statusFilter;
      return severityMatch && statusMatch;
    });
  }, [logEntries, severityFilter, statusFilter]);

  const handleAcknowledge = useCallback(async (id: number) => {
    try {
      await acknowledgeAnomaly(id);
    } catch {
      // ignore failed acknowledgement and still allow local UI update
    }

    setLogEntries((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, status: 'mitigated' } : entry)),
    );
  }, []);

  return (
    <Panel
      title="Anomaly Log"
      subtitle="Operator-facing event ledger for active and recent AI detections"
      action={
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted">
          <Filter className="h-4 w-4 text-cyan" />
          Filtered view
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-night/60 px-3 py-2">
          <span className="text-xs uppercase tracking-[0.18em] text-muted">Severity</span>
          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as 'all' | Severity)}
            className="bg-transparent text-sm text-ink outline-none"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="stable">Stable</option>
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-night/60 px-3 py-2">
          <span className="text-xs uppercase tracking-[0.18em] text-muted">Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | 'open' | 'investigating' | 'mitigated')
            }
            className="bg-transparent text-sm text-ink outline-none"
          >
            <option value="all">All</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="mitigated">Mitigated</option>
          </select>
        </div>
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <div className="min-w-[1060px]">
          <div className="grid grid-cols-[88px_96px_1.1fr_1.2fr_110px_100px_130px_120px] gap-3 border-b border-border px-1 pb-3 text-xs uppercase tracking-[0.18em] text-muted">
            <span>Time</span>
            <span>ID</span>
            <span>Subsystem</span>
            <span>Anomaly</span>
            <span>Failure Prob</span>
            <span>RUL (hrs)</span>
            <span>Agent</span>
            <span>Status</span>
          </div>

          <div className="mt-3 space-y-2">
            {entries.length > 0 ? (
              entries.map((entry, index) => (
                <button
                  key={getLogEntryKey(entry, index)}
                  type="button"
                  onClick={() => undefined}
                  className="grid w-full grid-cols-[88px_96px_1.1fr_1.2fr_110px_100px_130px_120px] gap-3 rounded-xl border border-border bg-night/55 px-3 py-4 text-left transition hover:border-cyan/30 hover:bg-night/80"
                >
                  <span className="font-mono text-sm text-ink">{entry.timestamp.slice(11)}</span>
                  <span className="font-mono text-sm text-cyan">{entry.id}</span>
                  <span className="text-sm text-ink">{entry.subsystem}</span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    <AlertTriangle className={`h-4 w-4 ${statusTone[entry.status]}`} />
                    {entry.anomaly}
                  </span>
                  <span className={`font-mono text-sm ${failureProbTone(entry.failureProb)}`}>{entry.failureProb}%</span>
                  <span className={`font-mono text-sm ${rulTone(entry.rulEstimate)}`}>{entry.rulEstimate}</span>
                  <span className="text-sm text-muted">{entry.agent}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (entry.status !== 'mitigated') {
                        void handleAcknowledge(Number(entry.id));
                      }
                    }}
                    className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${severityPill[entry.severity]}`}
                  >
                    {entry.status === 'mitigated' ? 'mitigated' : 'acknowledge'}
                  </button>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-night/40 px-4 py-8 text-center text-sm text-muted">
                No anomalies match the current filters.
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
