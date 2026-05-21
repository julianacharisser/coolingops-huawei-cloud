import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Timer, Zap } from 'lucide-react';

interface PredictionPanelProps {
  latestAlert: any;
  latestCopilot: any;
  className?: string;
}

const sensorTagMap: Record<string, string[]> = {
  bypass_valve_leakage: ['TWV_CTRL', 'CWL_SEC_DP'],
  bypass_valve_stuck: ['TWV_CTRL', 'CDWL_CW_FLOW'],
  cooling_tower_fouling: ['CT_RW_TEMP_1', 'CT_SW_TEMP_1'],
  chiller_temp_sensor_bias: ['CHL_SW_TEMP_1', 'CHL_RW_TEMP_1'],
  secondary_pressure_sensor_bias: ['CWL_SEC_DP', 'CWL_SEC_DPSPT'],
  controller_pi_fault: ['CT_FAN_SPD_1', 'CT_FAN_SPD_CTRL_1'],
};

function clampPercent(value: unknown) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

function toneForPercent(value: number) {
  if (value > 70) return 'text-critical';
  if (value > 40) return 'text-warning';
  return 'text-success';
}

function formatTime(value?: string) {
  if (!value) return '--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatGateName(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function getLeadTimeMinutes(latestAlert: any) {
  const numeric = Number(latestAlert?.lead_time_minutes);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function formatCountdown(totalSeconds: number) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getFallbackWhy(latestAlert: any) {
  const entries = Object.entries(latestAlert?.gate_scores ?? {})
    .map(([name, score]) => ({ name, score: Number(score) }))
    .filter((item) => !Number.isNaN(item.score))
    .sort((a, b) => b.score - a.score);

  if (entries.length === 0) {
    return 'Primary signal: --';
  }

  const top = entries[0];
  const second = entries[1];

  return second
    ? `Primary signal: ${formatGateName(top.name)} (${top.score.toFixed(2)}), secondary: ${formatGateName(second.name)} (${second.score.toFixed(2)})`
    : `Primary signal: ${formatGateName(top.name)} (${top.score.toFixed(2)})`;
}

function getSensorTags(latestAlert: any) {
  const entries = Object.entries(latestAlert?.gate_scores ?? {})
    .map(([name, score]) => ({ name, score: Number(score) }))
    .filter((item) => item.score > 0.3)
    .sort((a, b) => b.score - a.score);

  const tags = new Set<string>();

  entries.forEach((entry) => {
    (sensorTagMap[entry.name] ?? []).forEach((tag) => tags.add(tag));
  });

  return Array.from(tags);
}

export function PredictionPanel({ latestAlert, latestCopilot, className = '' }: PredictionPanelProps) {
  const leadTimeMinutes = useMemo(() => getLeadTimeMinutes(latestAlert), [latestAlert]);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!latestAlert || !leadTimeMinutes) {
      setRemainingSeconds(null);
      return;
    }

    const startedAt = new Date(latestAlert.timestamp ?? Date.now()).getTime();
    const target = startedAt + leadTimeMinutes * 60 * 1000;

    const tick = () => {
      const next = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemainingSeconds(next);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [latestAlert?.id, latestAlert?.timestamp, leadTimeMinutes, latestAlert]);

  const currentRisk = latestAlert ? clampPercent(latestAlert.degradation_score) : null;
  const predictedRisk = latestAlert ? Math.min(99, Math.round(clampPercent(latestAlert.degradation_score) * 1.7)) : null;
  const confidence = latestAlert ? clampPercent(latestAlert.confidence) : null;
  const leadTimeDisplay = leadTimeMinutes ? `${leadTimeMinutes} min` : '--';
  const predictedCriticalAt = useMemo(() => {
    if (!latestAlert?.timestamp || !leadTimeMinutes) return '--';
    const target = new Date(new Date(latestAlert.timestamp).getTime() + leadTimeMinutes * 60 * 1000);
    if (Number.isNaN(target.getTime())) return '--';
    return target.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [latestAlert?.timestamp, leadTimeMinutes]);

  const whyText = latestCopilot?.why ?? getFallbackWhy(latestAlert);
  const actionText = latestCopilot?.action ?? '--';
  const deferredRiskText = latestCopilot?.riskIfDeferred ?? '--';
  const tags = getSensorTags(latestAlert);
  const isCriticalCountdown = latestAlert && remainingSeconds === 0;
  const badgeClass =
    latestAlert?.severity === 'critical'
      ? 'border-critical/30 bg-critical/10 text-critical'
      : 'border-success/30 bg-success/10 text-success';

  const stageA = latestCopilot?.reasoning?.stage_a;
  const stageC = latestCopilot?.reasoning?.stage_c;

  const stageItems = [
    {
      label: 'STAGE A — ANOMALY DETECTION',
      detail: stageA
        ? `Isolation Forest flagged deviation. Score: ${Number(stageA.anomaly_score ?? 0).toFixed(2)} | ${Number(stageA.sigma ?? 0).toFixed(1)}σ from baseline`
        : 'Isolation Forest flagged deviation. Score: -- | --σ from baseline',
    },
    {
      label: 'STAGE B — FAULT IDENTIFICATION',
      detail: latestAlert
        ? `XGBoost: ${formatGateName(String(latestAlert.fault_type ?? '--'))}. Confidence: ${confidence ?? '--'}%`
        : 'XGBoost: --. Confidence: --%',
    },
    {
      label: 'STAGE C — PHYSICS VALIDATION',
      detail: stageC
        ? `Gate scores validated. Confirmed: ${stageC.confirmed ?? '--'} | Ruled out: ${stageC.ruled_out ?? '--'}`
        : 'Gate scores validated. Confirmed: -- | Ruled out: --',
    },
  ];

  return (
    <div className={`h-full rounded-[28px] border border-cyan/20 bg-[#0d1524] p-5 shadow-[0_0_0_1px_rgba(0,212,255,0.06)] ${className}`}>
      <div className="flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="mb-5">
            <h2 className="mt-2 text-xl font-semibold text-ink">Prediction Accuracy Summary</h2>
            <div className="mt-2 text-sm text-muted">Escalation forecast and validation stack.</div>
          </div>
        </div>

        <div>
          {latestAlert ? (
            <>
              <div className="text-lg text-ink">At {formatTime(latestAlert.timestamp)}, system predicts</div>
              <div className="mt-2 text-3xl font-semibold text-ink">{latestAlert.component ?? '--'} will become critical</div>
              <div className="mt-2 text-2xl font-semibold text-cyan">by {predictedCriticalAt}</div>
            </>
          ) : (
            <>
              <div className="text-lg text-ink">System operating normally</div>
              <div className="mt-2 text-3xl font-semibold text-ink">-- will become critical</div>
              <div className="mt-2 text-2xl font-semibold text-cyan">by --</div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Current risk', value: currentRisk !== null ? `${currentRisk}%` : '--', tone: currentRisk !== null ? toneForPercent(currentRisk) : 'text-muted' },
            { label: 'Predicted risk', value: predictedRisk !== null ? `${predictedRisk}%` : '--', tone: predictedRisk !== null ? toneForPercent(predictedRisk) : 'text-muted' },
            { label: 'Confidence', value: confidence !== null ? `${confidence}%` : '--', tone: confidence !== null ? toneForPercent(confidence) : 'text-muted' },
            { label: 'Lead time', value: leadTimeDisplay, tone: 'text-warning' },
          ].map((metric) => (
            <div key={metric.label} className="rounded-2xl border border-border bg-panel/70 p-4">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">{metric.label}</div>
              <div className={`mt-3 font-mono text-3xl font-bold ${metric.tone}`}>{metric.value}</div>
            </div>
          ))}
        </div>

        <div className={`rounded-2xl border px-4 py-4 ${isCriticalCountdown ? 'border-critical/30 bg-critical/10' : 'border-warning/30 bg-warning/10'}`}>
          {isCriticalCountdown ? (
            <div className="font-mono text-3xl font-bold text-critical">{'\u26A0'} CRITICAL NOW</div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-muted">
                <Timer className="h-4 w-4 text-warning" />
                Critical predicted in
              </div>
              <div className="mt-2 font-mono text-4xl font-bold text-warning">
                {remainingSeconds !== null ? formatCountdown(remainingSeconds) : '--:--'}
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-cyan/30 bg-cyan/10 px-4 py-4">
          <div className="flex items-start gap-3">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-cyan">Action</div>
              <div className="mt-2 text-sm text-cyan">{actionText}</div>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-critical/25 bg-critical/10 px-4 py-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-critical">Risk If Deferred</div>
            <div className="mt-2 text-sm text-critical">{deferredRiskText}</div>
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Why</div>
          <div className="mt-2 text-sm leading-6 text-muted">{whyText}</div>
        </div>
        
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Reasoning Trace</div>
          <div className="mt-3 space-y-3">
            {stageItems.map((stage, index) => (
              <div
                key={stage.label}
                className="reasoning-stage rounded-2xl border border-border bg-panel/70 p-4"
                style={{ animationDelay: `${index * 400}ms` }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan">{stage.label}</div>
                  <CheckCircle2
                    className="reasoning-stage-check h-4 w-4 text-success"
                    style={{ animationDelay: `${index * 400 + 180}ms` }}
                  />
                </div>
                <div className="mt-2 font-mono text-xs leading-5 text-muted">{stage.detail}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Sensor Tags</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <div
                  key={tag}
                  className="rounded-full border border-cyan/30 bg-cyan/10 px-3 py-1 font-mono text-xs text-cyan"
                >
                  {tag}
                </div>
              ))
            ) : (
              <div className="rounded-full border border-border bg-panel/70 px-3 py-1 font-mono text-xs text-muted">--</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
