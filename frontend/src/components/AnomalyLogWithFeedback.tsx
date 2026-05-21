import { useMemo, useState } from 'react';

interface AnomalyLogWithFeedbackProps {
  anomalies: any[];
  onAcknowledge: (id: number) => void;
  onFeedbackSubmitted?: () => void;
}

type PredictionCorrect = 'yes' | 'no' | 'partial' | null;
type ResolutionType = 'maintenance' | 'monitoring' | 'no_action' | null;
type RowStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE ALARM';

interface FeedbackDraft {
  assigned_to: string | null;
  prediction_correct: PredictionCorrect;
  resolution: ResolutionType;
  description: string;
  accuracy_rating: number;
  time_to_resolve_minutes: string;
}

interface FeedbackResult {
  assigned_to: string | null;
  status: RowStatus;
}

const rawBaseUrl = import.meta.env.VITE_API_URL;
const BASE_URL = rawBaseUrl !== undefined ? rawBaseUrl : 'http://localhost:8000';

const defaultDraft: FeedbackDraft = {
  assigned_to: null,
  prediction_correct: null,
  resolution: null,
  description: '',
  accuracy_rating: 0,
  time_to_resolve_minutes: '',
};

const operatorOptions = ['Unassigned', 'Operator A', 'Operator B', 'Operator C'];

function formatTime(value?: string) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFaultType(value?: string) {
  return String(value ?? '--')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function clampPercent(value?: number) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

function riskTone(value: number) {
  if (value > 70) return 'text-critical';
  if (value > 40) return 'text-warning';
  return 'text-success';
}

function severityDotClass(severity?: string) {
  if (severity === 'critical') return 'bg-critical';
  if (severity === 'high' || severity === 'medium') return 'bg-warning';
  return 'bg-success';
}

function statusBadge(status: RowStatus) {
  if (status === 'RESOLVED') return 'border-success/30 bg-success/10 text-success';
  if (status === 'FALSE ALARM') return 'border-border bg-night/60 text-muted';
  if (status === 'INVESTIGATING') return 'border-warning/30 bg-warning/10 text-warning animate-pulse';
  return 'border-critical/30 bg-critical/10 text-critical';
}

function deriveStatus(anomaly: any, result?: FeedbackResult): RowStatus {
  if (result?.status) return result.status;
  if (result?.assigned_to || anomaly?.acknowledged) return 'INVESTIGATING';
  return 'OPEN';
}

export function AnomalyLogWithFeedback({
  anomalies,
  onAcknowledge,
  onFeedbackSubmitted,
}: AnomalyLogWithFeedbackProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, FeedbackDraft>>({});
  const [results, setResults] = useState<Record<number, FeedbackResult>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sortedAnomalies = useMemo(() => [...anomalies], [anomalies]);

  const updateDraft = (id: number, patch: Partial<FeedbackDraft>) => {
    setDrafts((current) => ({
      ...current,
      [id]: {
        ...defaultDraft,
        ...current[id],
        ...patch,
      },
    }));
  };

  const handleExpandToggle = (id: number) => {
    setExpandedId((current) => {
      const next = current === id ? null : id;
      if (next === id) {
        onAcknowledge(id);
      }
      return next;
    });
  };

  const handleCancel = (id: number) => {
    setDrafts((current) => ({
      ...current,
      [id]: current[id] ?? defaultDraft,
    }));
    setExpandedId(null);
  };

  const handleSubmit = async (id: number) => {
    const draft = drafts[id] ?? defaultDraft;
    setSubmittingId(id);

    try {
      const response = await fetch(`${BASE_URL}/api/anomalies/${id}/feedback`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assigned_to: draft.assigned_to,
          prediction_correct: draft.prediction_correct,
          resolution: draft.resolution,
          description: draft.description,
          accuracy_rating: draft.accuracy_rating || null,
          time_to_resolve_minutes: draft.time_to_resolve_minutes
            ? Number(draft.time_to_resolve_minutes)
            : null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const nextStatus: RowStatus =
        draft.prediction_correct === 'no' ? 'FALSE ALARM' : 'RESOLVED';

      setResults((current) => ({
        ...current,
        [id]: {
          assigned_to: draft.assigned_to,
          status: nextStatus,
        },
      }));
      onFeedbackSubmitted?.();
      setToast('Feedback submitted');
      setExpandedId(null);
      window.setTimeout(() => setToast(null), 2400);
    } catch {
      setToast('Feedback submission failed');
      window.setTimeout(() => setToast(null), 2400);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="relative">
      {toast ? (
        <div
          className={`absolute right-0 top-0 z-10 rounded-full border px-4 py-2 text-sm ${
            toast === 'Feedback submitted'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-critical/30 bg-critical/10 text-critical'
          }`}
        >
          {toast}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[26px] border border-border bg-[#0d1524]">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-panel/70 text-left text-xs uppercase tracking-[0.18em] text-muted">
                <th className="px-4 py-4">Time</th>
                <th className="px-4 py-4">ID</th>
                <th className="px-4 py-4">Fault Type</th>
                <th className="px-4 py-4">Risk</th>
                <th className="px-4 py-4">Assigned To</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedAnomalies.length > 0 ? (
                sortedAnomalies.map((anomaly) => {
                  const risk = clampPercent(anomaly.degradation_score);
                  const draft = drafts[anomaly.id] ?? defaultDraft;
                  const result = results[anomaly.id];
                  const assignedTo = result?.assigned_to ?? draft.assigned_to ?? null;
                  const status = deriveStatus(anomaly, result);

                  return (
                    <>
                      <tr key={`row-${anomaly.id}`} className="border-b border-border/80 align-top">
                        <td className="px-4 py-4 font-mono text-sm text-ink">{formatTime(anomaly.timestamp)}</td>
                        <td className="px-4 py-4 font-mono text-sm text-cyan">{`AL-${anomaly.id}`}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3 text-sm text-ink">
                            <span className={`h-2.5 w-2.5 rounded-full ${severityDotClass(anomaly.severity)}`} />
                            <span>{formatFaultType(anomaly.fault_type)}</span>
                          </div>
                        </td>
                        <td className={`px-4 py-4 font-mono text-sm ${riskTone(risk)}`}>{risk}%</td>
                        <td className="px-4 py-4 text-sm text-muted">{assignedTo ?? 'Unassigned'}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${statusBadge(status)}`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => handleExpandToggle(anomaly.id)}
                            className="text-sm text-cyan transition hover:text-ink"
                          >
                            {expandedId === anomaly.id ? 'Collapse ▲' : 'Expand ▼'}
                          </button>
                        </td>
                      </tr>

                      {expandedId === anomaly.id ? (
                        <tr key={`expand-${anomaly.id}`} className="border-b border-border/80">
                          <td colSpan={7} className="px-4 py-5">
                            <div className="rounded-[24px] border border-border bg-panel/70 p-5">
                              <div className="grid gap-5 lg:grid-cols-2">
                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Assign Operator</div>
                                  <select
                                    value={draft.assigned_to ?? 'Unassigned'}
                                    onChange={(event) =>
                                      updateDraft(anomaly.id, {
                                        assigned_to:
                                          event.target.value === 'Unassigned'
                                            ? null
                                            : event.target.value,
                                      })
                                    }
                                    className="mt-3 h-11 w-full rounded-2xl border border-border bg-night/70 px-4 text-sm text-ink outline-none"
                                  >
                                    {operatorOptions.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Was The Prediction Correct?</div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {[
                                      ['yes', 'Yes, confirmed'],
                                      ['no', 'No fault found'],
                                      ['partial', 'Partially correct'],
                                    ].map(([value, label]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() =>
                                          updateDraft(anomaly.id, {
                                            prediction_correct: value as PredictionCorrect,
                                          })
                                        }
                                        className={`rounded-full border px-3 py-2 text-sm transition ${
                                          draft.prediction_correct === value
                                            ? 'border-cyan/30 bg-cyan/10 text-cyan'
                                            : 'border-border bg-night/50 text-muted hover:text-ink'
                                        }`}
                                      >
                                        {value === 'yes' ? '✅ ' : value === 'no' ? '❌ ' : '⚠️ '}
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="lg:col-span-2">
                                  <div className="text-xs uppercase tracking-[0.18em] text-muted">How Was It Handled?</div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {[
                                      ['maintenance', '🔧 Maintenance performed'],
                                      ['monitoring', '👁 Monitoring only'],
                                      ['no_action', '🚫 No action needed'],
                                    ].map(([value, label]) => (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() =>
                                          updateDraft(anomaly.id, {
                                            resolution: value as ResolutionType,
                                          })
                                        }
                                        className={`rounded-full border px-3 py-2 text-sm transition ${
                                          draft.resolution === value
                                            ? 'border-cyan/30 bg-cyan/10 text-cyan'
                                            : 'border-border bg-night/50 text-muted hover:text-ink'
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="lg:col-span-2">
                                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Describe The Issue</div>
                                  <textarea
                                    rows={3}
                                    value={draft.description}
                                    onChange={(event) =>
                                      updateDraft(anomaly.id, { description: event.target.value })
                                    }
                                    className="mt-3 w-full rounded-2xl border border-border bg-night/70 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-cyan/40"
                                  />
                                </div>

                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Prediction Accuracy</div>
                                  <div className="mt-3 flex gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                      <button
                                        key={star}
                                        type="button"
                                        onClick={() =>
                                          updateDraft(anomaly.id, { accuracy_rating: star })
                                        }
                                        className={`text-2xl ${
                                          star <= draft.accuracy_rating
                                            ? 'text-warning'
                                            : 'text-muted'
                                        }`}
                                      >
                                        ★
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <div className="text-xs uppercase tracking-[0.18em] text-muted">Time To Resolve</div>
                                  <div className="mt-3 flex items-center gap-3">
                                    <input
                                      type="number"
                                      min="0"
                                      value={draft.time_to_resolve_minutes}
                                      onChange={(event) =>
                                        updateDraft(anomaly.id, {
                                          time_to_resolve_minutes: event.target.value,
                                        })
                                      }
                                      className="h-11 w-32 rounded-2xl border border-border bg-night/70 px-4 text-sm text-ink outline-none"
                                    />
                                    <span className="text-sm text-muted">minutes</span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-5 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => void handleSubmit(anomaly.id)}
                                  disabled={submittingId === anomaly.id}
                                  className="rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm text-success transition hover:bg-success/15 disabled:opacity-60"
                                >
                                  {submittingId === anomaly.id ? 'Submitting...' : 'Submit Feedback'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCancel(anomaly.id)}
                                  className="rounded-full border border-border bg-night/60 px-4 py-2 text-sm text-muted transition hover:text-ink"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                    No anomaly events yet. Start the simulation to populate the event log.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
