import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer } from 'recharts';
import { baseSensorReadings, liveFaultLabel } from '../data/mockData';
import type { SensorReading, Severity } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { Panel } from './ui/Panel';

const severityColor: Record<Severity, string> = {
  stable: '#00ff88',
  warning: '#ffaa00',
  critical: '#ff3b3b',
};

type SensorKind = 'temperature' | 'power' | 'flow' | 'fan' | 'valve' | 'pressure';

interface SensorConfig {
  key: string;
  kind: SensorKind;
  displayScale?: number;
}

const sensorConfigMap: Record<string, SensorConfig> = {
  'CHW Supply Temp': { key: 'CWL_PRI_SW_TEMP', kind: 'temperature' },
  'CHW Return Temp': { key: 'CWL_PRI_RW_TEMP', kind: 'temperature' },
  'CW Supply Temp': { key: 'CDWL_SW_TEMP', kind: 'temperature' },
  'CW Return Temp': { key: 'CDWL_RW_TEMP', kind: 'temperature' },
  'Chiller 1 Power': { key: 'CHL_POW_1', kind: 'power' },
  'Chiller 2 Power': { key: 'CHL_POW_2', kind: 'power' },
  'Primary Pump 1 Flow': { key: 'CWL_PRI_CW_FLOW', kind: 'flow' },
  'Secondary Pump 1 Flow': { key: 'CWL_SEC_CW_FLOW', kind: 'flow' },
  'Cooling Tower 1 Fan Speed': { key: 'CT_FAN_SPD_1', kind: 'fan' },
  'Bypass Valve Position': { key: 'TWV_CTRL', kind: 'valve', displayScale: 100 },
  'Differential Pressure': { key: 'CWL_SEC_DP', kind: 'pressure' },
  'Outdoor Wet Bulb Temp': { key: 'OA_TEMP_WB', kind: 'temperature' },
};

function roundOne(value: number) {
  return Number(value.toFixed(1));
}

function resolveSeverity(kind: SensorKind, rawValue: number, rawDelta: number): Severity {
  const delta = Math.abs(rawDelta);

  if (kind === 'temperature') {
    if (delta > 2.0) return 'critical';
    if (delta > 1.0) return 'warning';
    return 'stable';
  }

  if (kind === 'power') {
    if (delta > 50) return 'critical';
    if (delta > 20) return 'warning';
    return 'stable';
  }

  if (kind === 'flow') {
    if (delta > 25) return 'critical';
    if (delta > 10) return 'warning';
    return 'stable';
  }

  if (kind === 'pressure') {
    if (delta > 15) return 'critical';
    if (delta > 5) return 'warning';
    return 'stable';
  }

  if (kind === 'valve') {
    if (rawValue > 0.6) return 'critical';
    if (rawValue > 0.3) return 'warning';
    return 'stable';
  }

  return 'stable';
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

export function LiveSensorFeed() {
  const { lastMessage: sensorMessage } = useWebSocket('sensors');
  const [readings, setReadings] = useState(baseSensorReadings);
  const [faultLabel, setFaultLabel] = useState(liveFaultLabel);

  useEffect(() => {
    if (!sensorMessage || sensorMessage.type !== 'sensor_snapshot') {
      return;
    }

    const nextFaultLabel =
      sensorMessage.fault_label === 'normal'
        ? 'NORMAL'
        : String(sensorMessage.fault_label).toUpperCase().replace(/_/g, ' ');
    setFaultLabel(nextFaultLabel);

    const payload = sensorMessage.sensor_data as Record<string, number>;
    setReadings((current) =>
      current.map((reading) => {
        const sensorConfig = sensorConfigMap[reading.name];
        if (!sensorConfig || !(sensorConfig.key in payload)) {
          return reading;
        }

        const rawValue = Number(payload[sensorConfig.key]);
        const displayScale = sensorConfig.displayScale ?? 1;
        const newValue = roundOne(rawValue * displayScale);
        const delta = roundOne(newValue - reading.value);
        const history = [...reading.history.slice(-19), newValue];

        return {
          ...reading,
          value: newValue,
          delta,
          history,
          severity: resolveSeverity(sensorConfig.kind, rawValue, rawValue - reading.value / displayScale),
        };
      }),
    );
  }, [sensorMessage]);

  const feedStatus = faultLabel.toLowerCase() === 'normal';
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
          {feedStatus ? 'NORMAL' : faultLabel}
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
