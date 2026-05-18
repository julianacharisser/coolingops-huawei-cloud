import { useMemo, useState } from 'react';
import { Bot, Bolt, ChevronRight, AlertTriangle } from 'lucide-react';
import { copilotEntries } from '../data/mockData';
import type { CopilotEntry } from '../types';
import { Panel } from './ui/Panel';

interface ReasoningStage {
  id: string;
  label: string;
  lines: string[];
}

function buildReasoningStages(entry: CopilotEntry): ReasoningStage[] {
  const ruledOutSummary = entry.reasoning.stage_c.ruled_out
    .map(({ fault, reason }) => `${fault}: ${reason}`)
    .join(' | ');

  return [
    {
      id: 'stage-a',
      label: 'STAGE A \u2014 ANOMALY DETECTION',
      lines: [
        `Flagged ${entry.reasoning.stage_a.component}.`,
        `Anomaly score ${entry.reasoning.stage_a.anomaly_score.toFixed(2)} with ${entry.reasoning.stage_a.sigma.toFixed(1)} sigma deviation from baseline.`,
      ],
    },
    {
      id: 'stage-b',
      label: 'STAGE B \u2014 FAULT IDENTIFICATION',
      lines: [
        `XGBoost match: ${entry.reasoning.stage_b.fault_type}.`,
        `Top features: ${entry.reasoning.stage_b.top_features[0]?.name}=${entry.reasoning.stage_b.top_features[0]?.value}; ${entry.reasoning.stage_b.top_features[1]?.name}=${entry.reasoning.stage_b.top_features[1]?.value}.`,
        `Model confidence ${entry.reasoning.stage_b.confidence}%.`,
      ],
    },
    {
      id: 'stage-c',
      label: 'STAGE C \u2014 PHYSICS CONSTRAINTS APPLIED',
      lines: [
        `Validated: ${entry.reasoning.stage_c.validated}`,
        `Ruled out: ${ruledOutSummary}`,
        `Confirmed root cause: ${entry.reasoning.stage_c.confirmed}`,
      ],
    },
  ];
}

export function CopilotPanel() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = copilotEntries[selectedIndex];
  const history = copilotEntries
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => index !== selectedIndex);
  const reasoningStages = useMemo(() => buildReasoningStages(selected), [selected]);

  return (
    <Panel
      title="Copilot Panel"
      subtitle="AI operator assistant coordinating multi-agent recommendations"
      className="h-full"
    >
      <div className="rounded-2xl border border-border bg-night/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-cyan">
            <Bot className="h-4 w-4" />
            AI Copilot
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted">{selected.timestamp}</span>
            <span className="rounded-full border border-success/20 bg-success/10 px-3 py-1 text-xs text-success">
              Copilot Online
            </span>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">What</div>
          <h3 className="mt-2 text-2xl font-semibold text-ink">{selected.what}</h3>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Reasoning Trace</div>
          <div key={selected.id} className="mt-3 space-y-3">
            {reasoningStages.map((stage, index) => {
              const stageDelay = index * 600;
              const checkDelay = stageDelay + 420;

              return (
                <div
                  key={stage.id}
                  className="reasoning-stage rounded-2xl border border-border bg-panel/55 px-4 py-3"
                  style={{ animationDelay: `${stageDelay}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-cyan">{stage.label}</div>
                    <span
                      className="reasoning-stage-check text-sm text-success"
                      style={{ animationDelay: `${checkDelay}ms` }}
                    >
                      {'\u2713'}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5 font-mono text-xs leading-5 text-muted">
                    {stage.lines.map((line) => (
                      <div key={line}>{line}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Why</div>
          <p className="mt-2 text-sm leading-6 text-muted">{selected.why}</p>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-xs uppercase tracking-[0.18em] text-muted">Confidence</span>
            <span className="font-mono text-sm text-cyan">{selected.confidence}%</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-border">
            <div
              className="progress-scan relative h-full rounded-full bg-cyan"
              style={{ width: `${selected.confidence}%` }}
            />
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Action</div>
          <div className="mt-2 flex items-start gap-3 rounded-2xl border border-cyan/30 bg-cyan/8 p-4 text-cyan">
            <Bolt className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-sm">{selected.action}</span>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-muted">Risk If Deferred</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-critical">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{selected.riskIfDeferred}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted">Past Recommendations</div>
        <div className="scrollbar-thin max-h-[240px] space-y-3 overflow-y-auto pr-1">
          {history.map(({ entry, index }) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className="w-full rounded-xl border border-border bg-night/55 p-4 text-left transition hover:border-cyan/30 hover:bg-night/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-ink">{entry.what}</div>
                  <div className="mt-2 font-mono text-xs text-cyan">{entry.confidence}% confidence</div>
                  <div className="mt-2 font-mono text-xs text-success/75">{`3-stage reasoning complete \u2713`}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted">{entry.timestamp}</span>
                  <ChevronRight className="h-4 w-4 text-cyan" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
