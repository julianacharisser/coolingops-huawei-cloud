import { ActivitySquare } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { anomalyTimelineData } from '../data/mockData';
import { Panel } from './ui/Panel';

export function AnomalyTimeline() {
  return (
    <Panel
      title="Anomaly Timeline"
      subtitle="24-hour anomaly density versus cooling load"
      action={
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-cyan">
          <ActivitySquare className="h-4 w-4" />
          Rolling 24h
        </div>
      }
      className="h-[380px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={anomalyTimelineData} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="anomalyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#00d4ff" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(31, 41, 55, 0.5)" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#6b7280', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
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
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="anomalyIndex"
            stroke="#00d4ff"
            strokeWidth={2.5}
            fill="url(#anomalyFill)"
            activeDot={{ r: 5, stroke: '#0a0f1a', strokeWidth: 2 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="thermalLoad"
            stroke="#ffaa00"
            strokeWidth={2}
            dot={{ r: 2, fill: '#ffaa00' }}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Panel>
  );
}
