import { useEffect, useState } from 'react';
import { ActivitySquare } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { anomalyTimelineData } from '../data/mockData';
import { useWebSocket } from '../hooks/useWebSocket';
import { Panel } from './ui/Panel';

export function AnomalyTimeline() {
  const { lastMessage: alertMessage } = useWebSocket('alerts');
  const [timelineData, setTimelineData] = useState(anomalyTimelineData);
  const [anomalyCount, setAnomalyCount] = useState(0);

  useEffect(() => {
    if (!alertMessage || alertMessage.type !== 'anomaly_event') {
      return;
    }

    setAnomalyCount((prev) => {
      const nextCount = prev + 1;
      setTimelineData((current) => [
        ...current.slice(-23),
        {
          time: new Date(alertMessage.timestamp).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          anomalyIndex: nextCount,
          thermalLoad: 0,
        },
      ]);
      return nextCount;
    });
  }, [alertMessage]);

  return (
    <Panel
      title="LIVE ANOMALY HISTORY"
      subtitle="Rolling backend anomaly events from the plant alert stream"
      action={
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-cyan">
          <ActivitySquare className="h-4 w-4" />
          {anomalyCount > 0 ? `${anomalyCount} Alerts` : 'Rolling 24h'}
        </div>
      }
      className="h-[380px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={timelineData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid stroke="rgba(31, 41, 55, 0.5)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
            label={{ value: 'Anomaly Count', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(0, 212, 255, 0.35)', strokeWidth: 1 }}
            contentStyle={{
              backgroundColor: '#111827',
              borderColor: '#1f2937',
              borderRadius: '14px',
              color: '#f9fafb',
            }}
          />
          <Line
            type="monotone"
            dataKey="anomalyIndex"
            stroke="#00d4ff"
            strokeWidth={2.5}
            dot={{ r: 2, fill: '#00d4ff' }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
}
