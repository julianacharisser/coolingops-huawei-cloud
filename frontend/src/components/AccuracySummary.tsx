import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface AccuracySummaryProps {
  feedbackSummary?: any;
}

const demoSummary = {
  total: 12,
  confirmed: 9,
  partial: 2,
  incorrect: 1,
  avg_rating: 4.2,
  avg_resolve_minutes: 34,
  most_common_fault: 'Bypass Valve Leakage',
  by_fault_type: [
    { fault: 'Bypass Valve', correct: 4, total: 5 },
    { fault: 'CT Fouling', correct: 3, total: 4 },
    { fault: 'Sensor Bias', correct: 2, total: 3 },
  ],
};

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

function abbreviateFault(label: string) {
  const words = label.split(' ');
  if (words.length === 1) return label;
  return words
    .map((word) => word[0])
    .join('')
    .slice(0, 4)
    .toUpperCase();
}

export function AccuracySummary({ feedbackSummary }: AccuracySummaryProps) {
  const summary = { ...demoSummary, ...(feedbackSummary ?? {}) };
  const chartData = (summary.by_fault_type ?? demoSummary.by_fault_type).map((item: any) => ({
    fault: item.fault,
    short: abbreviateFault(item.fault),
    correctPct: percent(Number(item.correct ?? 0), Number(item.total ?? 0)),
  }));

  return (
    <section className="rounded-[30px] border border-border bg-panel/88 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02),0_24px_60px_rgba(0,0,0,0.24)] backdrop-blur-sm">
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.24em] text-cyan">Section 4</div>
        <h2 className="mt-2 text-xl font-semibold text-ink">Prediction Accuracy Summary</h2>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="rounded-[24px] border border-border bg-[#0d1524] p-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Total predictions</span>
              <span className="font-mono text-ink">{summary.total}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Confirmed correct</span>
              <span className="font-mono text-success">{`${summary.confirmed} (${percent(summary.confirmed, summary.total)}%)`}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Partially correct</span>
              <span className="font-mono text-warning">{`${summary.partial} (${percent(summary.partial, summary.total)}%)`}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Incorrect</span>
              <span className="font-mono text-critical">{`${summary.incorrect} (${percent(summary.incorrect, summary.total)}%)`}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-[#0d1524] p-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Avg accuracy rating</span>
              <span className="font-mono text-warning">{`⭐ ${summary.avg_rating}/5`}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Avg time to resolve</span>
              <span className="font-mono text-cyan">{`${summary.avg_resolve_minutes} min`}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Most common fault</span>
              <span className="font-mono text-ink">{summary.most_common_fault}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-border bg-[#0d1524] p-4">
          <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted">Accuracy By Fault Type</div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(31,41,55,0.5)" vertical={false} />
                <XAxis dataKey="short" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} width={32} />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 16 }}
                  labelStyle={{ color: '#f9fafb' }}
                  formatter={(value: number) => [`${value}% correct`, 'Accuracy']}
                />
                <Bar dataKey="correctPct" fill="#00ff88" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
