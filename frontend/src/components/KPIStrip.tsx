interface AnomalyEvent {
  degradation_score: number;
  acknowledged: boolean;
}

interface KPIStripProps {
  anomalies: AnomalyEvent[];
  latestAlert: any;
}

function getPlantHealthTone(value: number) {
  if (value > 70) return 'text-success';
  if (value > 40) return 'text-warning';
  return 'text-critical';
}

function getAlertTone(count: number) {
  return count > 0 ? 'text-critical' : 'text-success';
}

function getLeadTimeValue(latestAlert: any) {
  const value = latestAlert?.lead_time_minutes;
  if (value === undefined || value === null || value === '') {
    return '--';
  }

  return `${value} min`;
}

export function KPIStrip({ anomalies, latestAlert }: KPIStripProps) {
  const avgDegradation =
    anomalies.length > 0
      ? anomalies.reduce((sum, item) => sum + Number(item.degradation_score || 0), 0) / anomalies.length
      : 0;
  const plantHealth = Math.max(0, Math.min(100, Math.round((1 - avgDegradation) * 100)));
  const activeAlerts = anomalies.filter((item) => !item.acknowledged).length;
  const leadTime = getLeadTimeValue(latestAlert);

  const items = [
    {
      label: 'Plant Health',
      value: `${plantHealth}%`,
      tone: getPlantHealthTone(plantHealth),
    },
    {
      label: 'Cooling Efficiency',
      value: '79%',
      tone: 'text-warning',
    },
    {
      label: 'Active Alerts',
      value: String(activeAlerts),
      tone: getAlertTone(activeAlerts),
    },
    {
      label: 'Flow Stability',
      value: '84%',
      tone: 'text-success',
    },
    {
      label: 'Horizon',
      value: '30 min',
      tone: 'text-cyan',
    },
    {
      label: 'Lead Time',
      value: leadTime,
      tone: 'text-warning',
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-border bg-panel/90 px-4 py-3 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
        >
          <div className="text-xs uppercase tracking-[0.16em] text-muted">{item.label}</div>
          <div className={`mt-3 font-mono text-2xl font-bold ${item.tone}`}>{item.value}</div>
        </div>
      ))}
    </section>
  );
}
