import { useMemo, useState } from 'react';

type Severity = 'low' | 'medium' | 'high' | 'critical';

interface AlertLike {
  component?: string;
  degradation_score?: number;
  severity?: Severity;
  timestamp?: string;
  lead_time_minutes?: number | string | null;
}

interface PlantSchematicProps {
  latestAlert: any;
  allAlerts: any[];
  className?: string;
}

interface PlantComponent {
  id: string;
  name: string;
  sensorTag: string;
  kind: 'tower' | 'pump' | 'chiller' | 'valve';
  role?: 'cdw' | 'primary' | 'secondary';
  x: number;
  y: number;
}

interface TooltipState {
  component: PlantComponent;
  riskScore: number;
  severity: Severity;
  updatedAt: string;
}

const components: PlantComponent[] = [
  { id: 'cooling-tower-1', name: 'Cooling Tower 1', sensorTag: 'CT_SW_TEMP_1', kind: 'tower', x: 90, y: 120 },
  { id: 'cdw-pump-1', name: 'CDW Pump 1', sensorTag: 'CDWL_PM_POW_1', kind: 'pump', role: 'cdw', x: 270, y: 120 },
  { id: 'chiller-1', name: 'Chiller 1', sensorTag: 'CHL_SW_TEMP_1', kind: 'chiller', x: 430, y: 120 },
  { id: 'primary-pump-1', name: 'Primary Pump 1', sensorTag: 'CWL_PRI_PM_POW_1', kind: 'pump', role: 'primary', x: 660, y: 120 },
  { id: 'secondary-pump-1', name: 'Secondary Pump 1', sensorTag: 'CWL_SEC_SW_TEMP', kind: 'pump', role: 'secondary', x: 865, y: 120 },

  { id: 'cooling-tower-2', name: 'Cooling Tower 2', sensorTag: 'CT_SW_TEMP_2', kind: 'tower', x: 90, y: 290 },
  { id: 'cdw-pump-2', name: 'CDW Pump 2', sensorTag: 'CDWL_PM_POW_2', kind: 'pump', role: 'cdw', x: 270, y: 290 },
  { id: 'chiller-2', name: 'Chiller 2', sensorTag: 'CHL_SW_TEMP_2', kind: 'chiller', x: 430, y: 290 },
  { id: 'primary-pump-2', name: 'Primary Pump 2', sensorTag: 'CWL_PRI_PM_POW_2', kind: 'pump', role: 'primary', x: 660, y: 290 },
  { id: 'bypass-valve', name: 'Bypass Valve', sensorTag: 'TWV_CTRL', kind: 'valve', x: 865, y: 290 },

  { id: 'cooling-tower-3', name: 'Cooling Tower 3', sensorTag: 'CT_SW_TEMP_3', kind: 'tower', x: 90, y: 460 },
  { id: 'cdw-pump-3', name: 'CDW Pump 3', sensorTag: 'CDWL_PM_POW_3', kind: 'pump', role: 'cdw', x: 270, y: 460 },
  { id: 'chiller-3', name: 'Chiller 3', sensorTag: 'CHL_SW_TEMP_3', kind: 'chiller', x: 430, y: 460 },
  { id: 'primary-pump-3', name: 'Primary Pump 3', sensorTag: 'CWL_PRI_PM_POW_3', kind: 'pump', role: 'primary', x: 660, y: 460 },
  { id: 'secondary-pump-2', name: 'Secondary Pump 2', sensorTag: 'CWL_SEC_RW_TEMP', kind: 'pump', role: 'secondary', x: 865, y: 460 },
];

const toneBySeverity: Record<Severity, { stroke: string; fill: string; badge: string; glow: string }> = {
  low: {
    stroke: '#00ff88',
    fill: 'rgba(0,255,136,0.08)',
    badge: 'border-success/30 bg-success/10 text-success',
    glow: 'drop-shadow(0 0 10px rgba(0,255,136,0.18))',
  },
  medium: {
    stroke: '#ffaa00',
    fill: 'rgba(255,170,0,0.08)',
    badge: 'border-warning/30 bg-warning/10 text-warning',
    glow: 'drop-shadow(0 0 12px rgba(255,170,0,0.22))',
  },
  high: {
    stroke: '#ff6b00',
    fill: 'rgba(255,107,0,0.08)',
    badge: 'border-[#ff6b00]/30 bg-[#ff6b00]/10 text-[#ff6b00]',
    glow: 'drop-shadow(0 0 14px rgba(255,107,0,0.22))',
  },
  critical: {
    stroke: '#ff3b3b',
    fill: 'rgba(255,59,59,0.08)',
    badge: 'border-critical/30 bg-critical/10 text-critical',
    glow: 'drop-shadow(0 0 16px rgba(255,59,59,0.28))',
  },
};

function formatTime(value?: string) {
  if (!value) return 'No update yet';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function clampPercent(value?: number) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric * 100)));
}

function alertMatchesComponent(alert: AlertLike, component: PlantComponent) {
  const source = String(alert.component ?? '').toLowerCase();
  const target = component.name.toLowerCase();

  if (!source) return false;
  if (source === target) return true;
  if (source === 'cooling tower' && component.kind === 'tower') return true;
  if (source === 'chiller' && component.kind === 'chiller') return true;
  if (source === 'bypass valve' && component.kind === 'valve') return true;
  if (source === 'secondary loop' && component.role === 'secondary') return true;
  if (source.includes('pump') && component.kind === 'pump' && source.includes(component.name.toLowerCase())) return true;
  return false;
}

function getComponentState(component: PlantComponent, allAlerts: AlertLike[]) {
  const match = allAlerts.find((alert) => alertMatchesComponent(alert, component));

  return {
    riskScore: clampPercent(match?.degradation_score),
    severity: (match?.severity ?? 'low') as Severity,
    updatedAt: formatTime(match?.timestamp),
  };
}

function CoolingTowerIcon({ x, y, stroke, fill, critical }: { x: number; y: number; stroke: string; fill: string; critical: boolean }) {
  return (
    <g className={critical ? 'critical-schematic-icon' : undefined}>
      <polygon
        points={`${x - 36},${y - 26} ${x + 36},${y - 26} ${x + 48},${y + 34} ${x - 48},${y + 34}`}
        fill={fill}
        stroke={stroke}
        strokeWidth="3"
      />
      <circle cx={x} cy={y - 2} r="16" fill="#0a0f1a" stroke={stroke} strokeWidth="2.5" />
      <path d={`M ${x} ${y - 14} L ${x + 5} ${y - 2} L ${x - 5} ${y - 2} Z`} fill={stroke} />
      <path d={`M ${x + 14} ${y} L ${x + 2} ${y + 5} L ${x + 2} ${y - 5} Z`} fill={stroke} />
      <path d={`M ${x} ${y + 14} L ${x - 5} ${y + 2} L ${x + 5} ${y + 2} Z`} fill={stroke} />
      <path d={`M ${x - 14} ${y} L ${x - 2} ${y - 5} L ${x - 2} ${y + 5} Z`} fill={stroke} />
      <line x1={x - 24} y1={y + 10} x2={x + 24} y2={y + 10} stroke={stroke} strokeOpacity="0.75" />
      <line x1={x - 26} y1={y + 18} x2={x + 26} y2={y + 18} stroke={stroke} strokeOpacity="0.55" />
      <line x1={x - 28} y1={y + 26} x2={x + 28} y2={y + 26} stroke={stroke} strokeOpacity="0.35" />
    </g>
  );
}

function ChillerIcon({ x, y, stroke, fill, critical }: { x: number; y: number; stroke: string; fill: string; critical: boolean }) {
  return (
    <g className={critical ? 'critical-schematic-icon' : undefined}>
      <rect x={x - 58} y={y - 34} width="116" height="72" rx="16" fill={fill} stroke={stroke} strokeWidth="3" />
      <line x1={x - 50} y1={y} x2={x + 50} y2={y} stroke={stroke} strokeWidth="2" strokeOpacity="0.8" />
      <text x={x} y={y - 10} fill="#9ca3af" fontFamily="monospace" fontSize="10" textAnchor="middle">
        COND
      </text>
      <text x={x} y={y + 18} fill="#9ca3af" fontFamily="monospace" fontSize="10" textAnchor="middle">
        EVAP
      </text>
      <circle cx={x - 58} cy={y - 14} r="5" fill="#0a0f1a" stroke={stroke} strokeWidth="2" />
      <circle cx={x + 58} cy={y - 14} r="5" fill="#0a0f1a" stroke={stroke} strokeWidth="2" />
      <circle cx={x - 58} cy={y + 16} r="5" fill="#0a0f1a" stroke={stroke} strokeWidth="2" />
      <circle cx={x + 58} cy={y + 16} r="5" fill="#0a0f1a" stroke={stroke} strokeWidth="2" />
    </g>
  );
}

function PumpIcon({ x, y, stroke, fill, critical }: { x: number; y: number; stroke: string; fill: string; critical: boolean }) {
  return (
    <g className={critical ? 'critical-schematic-icon' : undefined}>
      <circle cx={x} cy={y} r="31" fill={fill} stroke={stroke} strokeWidth="3" />
      <circle cx={x} cy={y} r="12" fill="#0a0f1a" stroke={stroke} strokeWidth="2" />
      <path
        d={`M ${x - 8} ${y + 10} Q ${x - 2} ${y - 13} ${x + 14} ${y - 4} Q ${x + 5} ${y + 11} ${x - 8} ${y + 10} Z`}
        fill={stroke}
        opacity="0.9"
      />
      <path d={`M ${x + 31} ${y} h 16`} stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      <path d={`M ${x - 47} ${y} h 16`} stroke={stroke} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function ValveIcon({ x, y, stroke, fill, critical }: { x: number; y: number; stroke: string; fill: string; critical: boolean }) {
  return (
    <g className={critical ? 'critical-schematic-icon' : undefined}>
      <polygon
        points={`${x},${y - 34} ${x + 34},${y} ${x},${y + 34} ${x - 34},${y}`}
        fill={fill}
        stroke={stroke}
        strokeWidth="3"
      />
      <line x1={x} y1={y - 56} x2={x} y2={y - 16} stroke={stroke} strokeWidth="3" />
      <circle cx={x} cy={y - 62} r="8" fill="#0a0f1a" stroke={stroke} strokeWidth="2.5" />
      <line x1={x - 12} y1={y} x2={x + 12} y2={y} stroke={stroke} strokeWidth="2.5" />
      <line x1={x} y1={y - 12} x2={x} y2={y + 12} stroke={stroke} strokeWidth="2.5" />
    </g>
  );
}

function ComponentIcon({ component, severity }: { component: PlantComponent; severity: Severity }) {
  const tone = toneBySeverity[severity];
  const critical = severity === 'critical';

  if (component.kind === 'tower') {
    return <CoolingTowerIcon x={component.x} y={component.y} stroke={tone.stroke} fill={tone.fill} critical={critical} />;
  }

  if (component.kind === 'chiller') {
    return <ChillerIcon x={component.x} y={component.y} stroke={tone.stroke} fill={tone.fill} critical={critical} />;
  }

  if (component.kind === 'valve') {
    return <ValveIcon x={component.x} y={component.y} stroke={tone.stroke} fill={tone.fill} critical={critical} />;
  }

  return <PumpIcon x={component.x} y={component.y} stroke={tone.stroke} fill={tone.fill} critical={critical} />;
}

export function PlantSchematic({ latestAlert, allAlerts, className = '' }: PlantSchematicProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const componentStates = useMemo(
    () =>
      Object.fromEntries(
        components.map((component) => [component.id, getComponentState(component, allAlerts)]),
      ) as Record<string, { riskScore: number; severity: Severity; updatedAt: string }>,
    [allAlerts],
  );

  const leadTime = latestAlert?.lead_time_minutes ?? '--';

  return (
    <div className={`relative overflow-hidden rounded-[28px] border border-border bg-[#0d1524] p-4 ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,212,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,59,59,0.12),transparent_24%)]" />
      <div className="relative">
        {latestAlert ? (
          <div className="mb-4 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            {'\u26A0'} Predicted escalation: {latestAlert.component ?? 'Unknown component'} likely critical in {leadTime} min
          </div>
        ) : null}

        <div className="mb-4 flex items-center justify-between">
          <div className="mb-5">
            <h2 className="mt-2 text-xl font-semibold text-ink">Digital Twin</h2>
            <div className="mt-2 text-sm text-muted">Live 3D replica fed by real-time sensor data to monitor performance, simulate scenarios, and predict faults.</div>
          </div>
        </div>

        <div className="relative overflow-x-auto">
          <svg viewBox="0 0 1040 610" className="h-[520px] min-w-[980px] w-full">
            <defs>
              <filter id="cyanGlow">
                <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#00d4ff" floodOpacity="0.5" />
              </filter>
            </defs>

            <path d="M 126 120 C 170 120, 200 120, 239 120" stroke="#ffaa00" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow" />
            <path d="M 301 120 C 350 120, 370 120, 372 106" stroke="#ffaa00" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow" />
            <path d="M 488 106 C 570 106, 610 106, 627 120" stroke="#1d4ed8" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow-reverse" />
            <path d="M 693 120 C 760 120, 805 120, 834 120" stroke="#1d4ed8" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow-reverse" />

            <path d="M 126 290 C 170 290, 200 290, 239 290" stroke="#ffaa00" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow" />
            <path d="M 301 290 C 350 290, 370 290, 372 276" stroke="#ffaa00" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow" />
            <path d="M 488 276 C 570 276, 610 276, 627 290" stroke="#1d4ed8" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow-reverse" />
            <path d="M 693 290 C 760 290, 806 290, 832 290" stroke="#00d4ff" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow-bypass" filter="url(#cyanGlow)" />

            <path d="M 126 460 C 170 460, 200 460, 239 460" stroke="#ffaa00" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow" />
            <path d="M 301 460 C 350 460, 370 460, 372 446" stroke="#ffaa00" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow" />
            <path d="M 488 446 C 570 446, 610 446, 627 460" stroke="#1d4ed8" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow-reverse" />
            <path d="M 693 460 C 760 460, 805 460, 834 460" stroke="#1d4ed8" strokeWidth="4" fill="none" strokeLinecap="round" className="schematic-flow-reverse" />

            <path d="M 865 152 C 865 220, 865 240, 865 256" stroke="#00d4ff" strokeWidth="3" fill="none" strokeDasharray="10 10" className="schematic-flow-bypass" filter="url(#cyanGlow)" />
            <path d="M 865 324 C 865 390, 865 414, 865 428" stroke="#00d4ff" strokeWidth="3" fill="none" strokeDasharray="10 10" className="schematic-flow-bypass" filter="url(#cyanGlow)" />

            {components.map((component) => {
              const state = componentStates[component.id];
              const tone = toneBySeverity[state.severity];

              return (
                <g
                  key={component.id}
                  onClick={() =>
                    setTooltip({
                      component,
                      riskScore: state.riskScore,
                      severity: state.severity,
                      updatedAt: state.updatedAt,
                    })
                  }
                  className="cursor-pointer"
                  style={{ filter: tone.glow }}
                >
                  <text x={component.x} y={component.y - 70} textAnchor="middle" fill="#f9fafb" fontSize="15" fontWeight="600">
                    {component.name}
                  </text>
                  <text x={component.x} y={component.y + 72} textAnchor="middle" fill="#6b7280" fontFamily="monospace" fontSize="11">
                    {component.sensorTag}
                  </text>
                  <ComponentIcon component={component} severity={state.severity} />
                </g>
              );
            })}
          </svg>

          {tooltip ? (
            <div className="absolute right-4 top-4 w-64 rounded-2xl border border-border bg-night/95 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.38)]">
              <div className="text-sm font-semibold text-ink">{tooltip.component.name}</div>
              <div className="mt-3 font-mono text-3xl text-cyan">{tooltip.riskScore}%</div>
              <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${toneBySeverity[tooltip.severity].badge}`}>
                {tooltip.severity}
              </div>
              <div className="mt-3 text-xs text-muted">Last updated {tooltip.updatedAt}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
