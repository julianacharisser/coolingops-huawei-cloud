import { useMemo, useState } from 'react';
import { AlertTriangle, Filter } from 'lucide-react';
import { anomalyLogData } from '../data/mockData';
import type { Severity } from '../types';
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

export function AnomalyLog() {
  const [severityFilter, setSeverityFilter] = useState<'all' | Severity>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'investigating' | 'mitigated'>('all');

  const entries = useMemo(() => {
    return anomalyLogData.filter((entry) => {
      const severityMatch = severityFilter === 'all' || entry.severity === severityFilter;
      const statusMatch = statusFilter === 'all' || entry.status === statusFilter;
      return severityMatch && statusMatch;
    });
  }, [severityFilter, statusFilter]);

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
              entries.map((entry) => (
                <button
                  key={entry.id}
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
                  <span
                    className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${severityPill[entry.severity]}`}
                  >
                    {entry.status}
                  </span>
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
