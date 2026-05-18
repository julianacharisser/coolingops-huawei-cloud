import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { baseSensorReadings, liveFaultLabel } from '../data/mockData';
import type { SensorReading, Severity } from '../types';
import { Panel } from './ui/Panel';

const severityColor: Record<Severity, string> = {
  stable: '#00ff88',
  warning: '#ffaa00',
  critical: '#ff3b3b',
};

function getSensorSeverity(name: string, value: number, delta: number): Severity {
  if (name === 'Bypass Valve Position' && value >= 70) return 'critical';
  if (name === 'Chiller 2 Power' && value >= 545) return 'critical';
  if (name === 'CHW Return Temp' && value >= 12.7) return 'warning';
  if (name === 'CW Return Temp' && value >= 33.5) return 'warning';
  if (name === 'Secondary Pump 1 Flow' && value <= 205) return 'warning';
  if (name === 'Differential Pressure' && value <= 50) return 'warning';
  if (Math.abs(delta) > 8) return 'warning';
  return 'stable';
}

function mutateSensors(readings: SensorReading[]) {
  return readings.map((reading) => {
    const magnitude = reading.unit === 'kW' || reading.unit === 'rpm' || reading.unit === 'L/s' ? 10 : 0.4;
    const randomSwing = Number(((Math.random() - 0.5) * magnitude).toFixed(reading.unit === 'C' ? 1 : 0));
    const precision = reading.unit === 'C' ? 1 : 0;
    const nextValue = Number((reading.value + randomSwing).toFixed(precision));
    const nextDelta = Number((nextValue - reading.value).toFixed(precision));
    const nextHistory = [...reading.history.slice(1), nextValue];
    const severity = getSensorSeverity(reading.name, nextValue, nextDelta);

    return {
      ...reading,
      value: nextValue,
      delta: nextDelta,
      severity,
      history: nextHistory,
    };
  });
}

function Sparkline({ reading }: { reading: SensorReading }) {
  return (
    <div className="h-8 w-[60px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={reading.history.map((value, index) => ({ index, value }))}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={severityColor[reading.severity]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LiveSensorFeed({ isSimulating }: { isSimulating: boolean }) {
  const [readings, setReadings] = useState(baseSensorReadings);

  useEffect(() => {
    if (!isSimulating) return undefined;

    const intervalId = window.setInterval(() => {
      setReadings((current) => mutateSensors(current));
    }, 2400);

    return () => window.clearInterval(intervalId);
  }, [isSimulating]);

  const feedStatus = liveFaultLabel.toLowerCase() === 'normal';
  const topBadgeClass = feedStatus
    ? 'border-success/30 bg-success/10 text-success'
    : 'border-critical/30 bg-critical/10 text-critical';

  return (
    <Panel
      title="Live Sensor Feed"
      subtitle="Streaming telemetry snapshots from the cooling plant edge bus"
      action={
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.16em] ${topBadgeClass}`}>
          <Gauge className="h-4 w-4" />
          {feedStatus ? 'NORMAL' : liveFaultLabel}
        </div>
      }
    >
      <div className="scrollbar-thin max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {readings.map((reading) => (
          <div
            key={reading.id}
            className="grid grid-cols-[minmax(0,1fr)_60px_auto] items-center gap-4 rounded-xl border border-border bg-night/60 px-4 py-3"
          >
            <div className="min-w-0 text-sm text-muted">{reading.name}</div>
            <Sparkline reading={reading} />
            <div className="justify-self-end font-mono text-sm" style={{ color: severityColor[reading.severity] }}>
              {reading.value}
              <span className="ml-1 text-muted">{reading.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
