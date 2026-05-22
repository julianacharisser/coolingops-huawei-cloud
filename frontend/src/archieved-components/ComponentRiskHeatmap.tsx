import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { heatmapData } from '../data/mockData';
import type { HeatmapCard, RiskLevel } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { getRiskComponents } from '../services/api';
import { Panel } from './ui/Panel';

const levelStyles: Record<RiskLevel, { badge: string; bar: string; glow: string }> = {
  low: {
    badge: 'border-success/30 bg-success/10 text-success',
    bar: '#00ff88',
    glow: 'rgba(0, 255, 136, 0.12)',
  },
  medium: {
    badge: 'border-warning/30 bg-warning/10 text-warning',
    bar: '#ffaa00',
    glow: 'rgba(255, 170, 0, 0.12)',
  },
  high: {
    badge: 'border-high/30 bg-high/10 text-high',
    bar: '#ff6b00',
    glow: 'rgba(255, 107, 0, 0.14)',
  },
  critical: {
    badge: 'border-critical/30 bg-critical/10 text-critical',
    bar: '#ff3b3b',
    glow: 'rgba(255, 59, 59, 0.18)',
  },
};

type HeatmapView = 'ensemble' | 'digitalTwin';

type TwinComponentType = 'tower' | 'chiller' | 'pump' | 'valve';

interface TwinComponent {
  key: string;
  dataKey?: HeatmapCard['component'];
  label: string;
  shortLabel: string;
  type: TwinComponentType;
  x: number;
  y: number;
  width: number;
  height: number;
  interactive: boolean;
}

interface TooltipState {
  item: HeatmapCard;
  label: string;
  x: number;
  y: number;
}

const svgSize = { width: 980, height: 540 };

const twinComponents: TwinComponent[] = [
  {
    key: 'cooling-tower-1',
    dataKey: 'cooling_tower_1',
    label: 'Cooling Tower 1',
    shortLabel: 'CT1',
    type: 'tower',
    x: 90,
    y: 36,
    width: 60,
    height: 70,
    interactive: true,
  },
  {
    key: 'cooling-tower-2',
    dataKey: 'cooling_tower_2',
    label: 'Cooling Tower 2',
    shortLabel: 'CT2',
    type: 'tower',
    x: 90,
    y: 176,
    width: 60,
    height: 70,
    interactive: true,
  },
  {
    key: 'cooling-tower-3',
    dataKey: 'cooling_tower_3',
    label: 'Cooling Tower 3',
    shortLabel: 'CT3',
    type: 'tower',
    x: 90,
    y: 316,
    width: 60,
    height: 70,
    interactive: true,
  },
  {
    key: 'condenser-pump-1',
    label: 'CDW Pump 1',
    shortLabel: 'CDW',
    type: 'pump',
    x: 102,
    y: 124,
    width: 36,
    height: 36,
    interactive: false,
  },
  {
    key: 'condenser-pump-2',
    label: 'CDW Pump 2',
    shortLabel: 'CDW',
    type: 'pump',
    x: 102,
    y: 264,
    width: 36,
    height: 36,
    interactive: false,
  },
  {
    key: 'condenser-pump-3',
    label: 'CDW Pump 3',
    shortLabel: 'CDW',
    type: 'pump',
    x: 102,
    y: 404,
    width: 36,
    height: 36,
    interactive: false,
  },
  {
    key: 'chiller-1',
    dataKey: 'chiller_1',
    label: 'Chiller 1',
    shortLabel: 'CH1',
    type: 'chiller',
    x: 390,
    y: 28,
    width: 70,
    height: 80,
    interactive: true,
  },
  {
    key: 'chiller-2',
    dataKey: 'chiller_2',
    label: 'Chiller 2',
    shortLabel: 'CH2',
    type: 'chiller',
    x: 390,
    y: 168,
    width: 70,
    height: 80,
    interactive: true,
  },
  {
    key: 'chiller-3',
    dataKey: 'chiller_3',
    label: 'Chiller 3',
    shortLabel: 'CH3',
    type: 'chiller',
    x: 390,
    y: 308,
    width: 70,
    height: 80,
    interactive: true,
  },
  {
    key: 'primary-pump-1',
    dataKey: 'pump_primary_1',
    label: 'Primary Pump 1',
    shortLabel: 'P1',
    type: 'pump',
    x: 510,
    y: 50,
    width: 36,
    height: 36,
    interactive: true,
  },
  {
    key: 'primary-pump-2',
    dataKey: 'pump_primary_2',
    label: 'Primary Pump 2',
    shortLabel: 'P2',
    type: 'pump',
    x: 510,
    y: 190,
    width: 36,
    height: 36,
    interactive: true,
  },
  {
    key: 'primary-pump-3-structural',
    label: 'Primary Pump 3',
    shortLabel: 'P3',
    type: 'pump',
    x: 510,
    y: 330,
    width: 36,
    height: 36,
    interactive: false,
  },
  {
    key: 'secondary-pump-1',
    dataKey: 'pump_secondary_1',
    label: 'Secondary Pump 1',
    shortLabel: 'S1',
    type: 'pump',
    x: 740,
    y: 140,
    width: 36,
    height: 36,
    interactive: true,
  },
  {
    key: 'secondary-pump-2',
    dataKey: 'pump_secondary_2',
    label: 'Secondary Pump 2',
    shortLabel: 'S2',
    type: 'pump',
    x: 740,
    y: 260,
    width: 36,
    height: 36,
    interactive: true,
  },
  {
    key: 'bypass-valve',
    dataKey: 'bypass_valve',
    label: 'Bypass Valve',
    shortLabel: 'BV',
    type: 'valve',
    x: 826,
    y: 52,
    width: 30,
    height: 30,
    interactive: true,
  },
];

const condenserPipeColor = '#facc15';
const evaporatorPipeColor = '#22d3ee';
const secondaryPipeColor = '#1d4ed8';
const structuralStroke = '#374151';
const structuralFill = '#111827';

function formatComponentName(component: string) {
  const normalized = component.toLowerCase();
  const suffix = normalized.split('_').slice(-1)[0];

  if (normalized.startsWith('cooling_tower_')) {
    return `Cooling Tower ${suffix}`;
  }

  if (normalized.startsWith('chiller_')) {
    return `Chiller ${suffix}`;
  }

  if (normalized.startsWith('pump_primary_')) {
    return `Primary Pump ${suffix}`;
  }

  if (normalized.startsWith('pump_secondary_')) {
    return `Secondary Pump ${suffix}`;
  }

  if (normalized === 'bypass_valve') {
    return 'Bypass Valve';
  }

  return component
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeComponentKey(component: string) {
  return component.toLowerCase().replace(/\s+/g, '_');
}

const componentGroupMap: Record<string, string[]> = {
  chiller: ['chiller_1', 'chiller_2', 'chiller_3'],
  cooling_tower: ['cooling_tower_1', 'cooling_tower_2', 'cooling_tower_3'],
  bypass_valve: ['bypass_valve'],
  secondary_loop: ['pump_secondary_1', 'pump_secondary_2'],
};

function findComponentIndexes(cards: HeatmapCard[], component: string) {
  const target = normalizeComponentKey(component);
  const groupedTargets = componentGroupMap[target];

  if (groupedTargets) {
    return cards
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => groupedTargets.includes(normalizeComponentKey(item.component)))
      .map(({ index }) => index);
  }

  const exactIndexes = cards
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizeComponentKey(item.component) === target)
    .map(({ index }) => index);

  if (exactIndexes.length > 0) {
    return exactIndexes;
  }

  return cards
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => normalizeComponentKey(item.component).startsWith(`${target}_`))
    .map(({ index }) => index);
}

function getComponentStyle(item?: HeatmapCard) {
  if (!item) {
    return {
      stroke: structuralStroke,
      fill: structuralFill,
      glow: 'none',
      badge: '',
      isCritical: false,
    };
  }

  const tone = levelStyles[item.severity];

  return {
    stroke: tone.bar,
    fill: structuralFill,
    glow: `drop-shadow(0 0 10px ${tone.glow})`,
    badge: tone.badge,
    isCritical: item.severity === 'critical',
  };
}

function TowerIcon({
  item,
  component,
  onSelect,
}: {
  item?: HeatmapCard;
  component: TwinComponent;
  onSelect: (event: MouseEvent<SVGGElement>, component: TwinComponent, item: HeatmapCard) => void;
}) {
  const style = getComponentStyle(item);
  const fanCx = component.x + component.width / 2;
  const fanCy = component.y + 20;
  const score = item?.score ?? '--';

  return (
    <g
      className={component.interactive ? 'cursor-pointer' : undefined}
      onClick={item ? (event) => onSelect(event, component, item) : undefined}
      style={{ filter: style.glow }}
    >
      <polygon
        points={`${component.x + 12},${component.y} ${component.x + component.width - 12},${component.y} ${component.x + component.width},${component.y + component.height} ${component.x},${component.y + component.height}`}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={4}
        className={style.isCritical ? 'critical-schematic-icon' : undefined}
      />
      <circle cx={fanCx} cy={fanCy} r={11} fill="#0a0f1a" stroke={style.stroke} strokeWidth={2} />
      <path d={`M ${fanCx} ${fanCy - 8} L ${fanCx + 3} ${fanCy - 1} L ${fanCx - 3} ${fanCy - 1} Z`} fill={style.stroke} />
      <path d={`M ${fanCx + 8} ${fanCy} L ${fanCx + 1} ${fanCy + 3} L ${fanCx + 1} ${fanCy - 3} Z`} fill={style.stroke} />
      <path d={`M ${fanCx} ${fanCy + 8} L ${fanCx - 3} ${fanCy + 1} L ${fanCx + 3} ${fanCy + 1} Z`} fill={style.stroke} />
      <path d={`M ${fanCx - 8} ${fanCy} L ${fanCx - 1} ${fanCy - 3} L ${fanCx - 1} ${fanCy + 3} Z`} fill={style.stroke} />
      <text x={fanCx} y={component.y + 49} fill="#f9fafb" fontSize="14" fontWeight="700" textAnchor="middle">
        {score}
      </text>
      <text x={fanCx} y={component.y + component.height + 18} fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
        {component.shortLabel} {score}
      </text>
    </g>
  );
}

function ChillerIcon({
  item,
  component,
  onSelect,
}: {
  item?: HeatmapCard;
  component: TwinComponent;
  onSelect: (event: MouseEvent<SVGGElement>, component: TwinComponent, item: HeatmapCard) => void;
}) {
  const style = getComponentStyle(item);
  const score = item?.score ?? '--';

  return (
    <g
      className={component.interactive ? 'cursor-pointer' : undefined}
      onClick={item ? (event) => onSelect(event, component, item) : undefined}
      style={{ filter: style.glow }}
    >
      <rect
        x={component.x}
        y={component.y}
        width={component.width}
        height={component.height}
        rx={18}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={4}
        className={style.isCritical ? 'critical-schematic-icon' : undefined}
      />
      <line x1={component.x + 6} y1={component.y + 40} x2={component.x + component.width - 6} y2={component.y + 40} stroke={style.stroke} strokeWidth={2} />
      <text x={component.x + component.width / 2} y={component.y + 24} fill="#9ca3af" fontFamily="monospace" fontSize="10" textAnchor="middle">
        COND
      </text>
      <text x={component.x + component.width / 2} y={component.y + 63} fill="#9ca3af" fontFamily="monospace" fontSize="10" textAnchor="middle">
        EVAP
      </text>
      <text x={component.x + component.width / 2} y={component.y + 47} fill="#f9fafb" fontSize="14" fontWeight="700" textAnchor="middle">
        {score}
      </text>
      <text x={component.x + component.width / 2} y={component.y + component.height + 18} fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
        {component.label} {score}
      </text>
    </g>
  );
}

function PumpIcon({
  item,
  component,
  onSelect,
}: {
  item?: HeatmapCard;
  component: TwinComponent;
  onSelect: (event: MouseEvent<SVGGElement>, component: TwinComponent, item: HeatmapCard) => void;
}) {
  const style = getComponentStyle(item);
  const cx = component.x + component.width / 2;
  const cy = component.y + component.height / 2;
  const score = item?.score ?? '--';

  return (
    <g
      className={component.interactive ? 'cursor-pointer' : undefined}
      onClick={item ? (event) => onSelect(event, component, item) : undefined}
      style={{ filter: style.glow }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={component.width / 2}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={4}
        className={style.isCritical ? 'critical-schematic-icon' : undefined}
      />
      <path d={`M ${cx - 6} ${cy + 7} Q ${cx - 1} ${cy - 8} ${cx + 9} ${cy - 1} Q ${cx + 4} ${cy + 8} ${cx - 6} ${cy + 7} Z`} fill={style.stroke} opacity={0.9} />
      <text x={cx} y={cy + 4} fill="#f9fafb" fontSize="14" fontWeight="700" textAnchor="middle">
        {score}
      </text>
      <text x={cx} y={component.y + component.height + 18} fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
        {component.shortLabel} {score}
      </text>
    </g>
  );
}

function ValveIcon({
  item,
  component,
  onSelect,
}: {
  item?: HeatmapCard;
  component: TwinComponent;
  onSelect: (event: MouseEvent<SVGGElement>, component: TwinComponent, item: HeatmapCard) => void;
}) {
  const style = getComponentStyle(item);
  const centerX = component.x + component.width / 2;
  const centerY = component.y + component.height / 2;
  const score = item?.score ?? '--';

  return (
    <g
      className={component.interactive ? 'cursor-pointer' : undefined}
      onClick={item ? (event) => onSelect(event, component, item) : undefined}
      style={{ filter: style.glow }}
    >
      <polygon
        points={`${centerX},${component.y} ${component.x + component.width},${centerY} ${centerX},${component.y + component.height} ${component.x},${centerY}`}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={4}
        className={style.isCritical ? 'critical-schematic-icon' : undefined}
      />
      <text x={centerX} y={centerY + 5} fill="#f9fafb" fontSize="12" fontWeight="700" textAnchor="middle">
        {score}
      </text>
      <text x={centerX} y={component.y + component.height + 18} fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
        BV {score}
      </text>
    </g>
  );
}

function DigitalTwinView({ items }: { items: HeatmapCard[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const componentMap = useMemo(
    () => new Map(items.map((item) => [item.component, item])),
    [items],
  );

  const handleSelect = (event: MouseEvent<SVGGElement>, component: TwinComponent, item: HeatmapCard) => {
    event.stopPropagation();

    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const rect = wrapper.getBoundingClientRect();

    setTooltip({
      item,
      label: component.label,
      x: event.clientX - rect.left + wrapper.scrollLeft + 14,
      y: event.clientY - rect.top + wrapper.scrollTop - 10,
    });
  };

  return (
    <div
      ref={wrapperRef}
      className="scrollbar-thin relative max-h-[560px] overflow-auto rounded-2xl border border-border bg-[#0a0f1a]"
      onClick={() => setTooltip(null)}
    >
      <div className="relative min-w-[940px]">
        <svg viewBox={`0 0 ${svgSize.width} ${svgSize.height}`} className="h-auto w-full">
          <defs>
            <marker id="ahuArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1d4ed8" />
            </marker>
            <marker id="ahuArrowCyan" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#22d3ee" />
            </marker>
          </defs>

          <rect width={svgSize.width} height={svgSize.height} fill="#0a0f1a" />

          <line x1="182" y1="70" x2="182" y2="444" stroke={condenserPipeColor} strokeWidth="3" className="schematic-flow" />
          <line x1="610" y1="70" x2="610" y2="392" stroke={evaporatorPipeColor} strokeWidth="3" className="schematic-flow" />
          <line x1="812" y1="98" x2="812" y2="434" stroke={secondaryPipeColor} strokeWidth="3" className="schematic-flow-reverse" />

          <path d="M 856 67 H 930" stroke={secondaryPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" markerEnd="url(#ahuArrow)" />
          <path d="M 930 434 H 856" stroke={secondaryPipeColor} strokeWidth="3" fill="none" className="schematic-flow" markerEnd="url(#ahuArrow)" />
          <path d="M 841 82 H 900 V 26 H 182" stroke={condenserPipeColor} strokeWidth="3" fill="none" strokeDasharray="10 8" className="schematic-flow-bypass" />

          <text x="928" y="22" fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="end">
            To AHU Coils
          </text>
          <text x="928" y="454" fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="end">
            From AHU Coils
          </text>

          <path d="M 150 71 H 182" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />
          <path d="M 150 211 H 182" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />
          <path d="M 150 351 H 182" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />

          <path d="M 120 106 V 124" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />
          <path d="M 120 246 V 264" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />
          <path d="M 120 386 V 404" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />

          <path d="M 138 142 H 340 V 68 H 390" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />
          <path d="M 138 282 H 340 V 208 H 390" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />
          <path d="M 138 422 H 340 V 348 H 390" stroke={condenserPipeColor} strokeWidth="3" fill="none" className="schematic-flow" />

          <path d="M 460 88 H 510" stroke={evaporatorPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 460 228 H 510" stroke={evaporatorPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 460 368 H 510" stroke={evaporatorPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />

          <path d="M 546 68 H 610" stroke={evaporatorPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 546 208 H 610" stroke={evaporatorPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 546 348 H 610" stroke={evaporatorPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />

          <path d="M 610 158 H 740" stroke={secondaryPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 610 278 H 740" stroke={secondaryPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 776 158 H 812" stroke={secondaryPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />
          <path d="M 776 278 H 812" stroke={secondaryPipeColor} strokeWidth="3" fill="none" className="schematic-flow-reverse" />

          <path d="M 812 68 H 826" stroke={secondaryPipeColor} strokeWidth="3" fill="none" opacity="0.42" />

          <text x="118" y="18" fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
            COOLING TOWERS
          </text>
          <text x="425" y="18" fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
            CHILLERS
          </text>
          <text x="785" y="18" fill="#6b7280" fontFamily="monospace" fontSize="11" textAnchor="middle">
            SECONDARY LOOP
          </text>

          {twinComponents.map((component) => {
            const item = component.dataKey ? componentMap.get(component.dataKey) : undefined;

            if (component.type === 'tower') {
              return <TowerIcon key={component.key} component={component} item={item} onSelect={handleSelect} />;
            }

            if (component.type === 'chiller') {
              return <ChillerIcon key={component.key} component={component} item={item} onSelect={handleSelect} />;
            }

            if (component.type === 'valve') {
              return <ValveIcon key={component.key} component={component} item={item} onSelect={handleSelect} />;
            }

            return <PumpIcon key={component.key} component={component} item={item} onSelect={handleSelect} />;
          })}
        </svg>

        {tooltip ? (
          <div
            className="pointer-events-none absolute z-10 w-52 rounded-2xl border border-border bg-night/95 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.4)]"
            style={{ left: Math.min(tooltip.x, svgSize.width - 220), top: tooltip.y }}
          >
            <div className="text-sm font-medium text-ink">{tooltip.label}</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-ink">{tooltip.item.score}</div>
            <div
              className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${
                levelStyles[tooltip.item.severity].badge
              }`}
            >
              {tooltip.item.severity}
            </div>
            <div className="mt-3 text-xs text-muted">Last updated {tooltip.item.updatedAt}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ComponentRiskHeatmap() {
  const { lastMessage: alertMessage } = useWebSocket('alerts');
  const [cards, setCards] = useState(heatmapData);
  const [view, setView] = useState<HeatmapView>('ensemble');

  const applyRiskUpdate = useCallback(
    (component: string, score: number, severity: RiskLevel, updatedAt: string) => {
      setCards((current) => {
        const next = [...current];
        const indexes = findComponentIndexes(next, component);
        if (indexes.length === 0) {
          return current;
        }

        indexes.forEach((index) => {
          next[index] = {
            ...next[index],
            score,
            severity,
            updatedAt,
          };
        });
        return next;
      });
    },
    [],
  );

  const loadRiskComponents = useCallback(async () => {
    const response = await getRiskComponents();
    if (!Array.isArray(response.components) || response.components.length === 0) {
      return;
    }

    setCards((current) => {
      const next = [...current];
      response.components.forEach((item: any) => {
        findComponentIndexes(next, item.component).forEach((index) => {
          next[index] = {
            ...next[index],
            score: Math.round(item.risk_score * 100),
            severity: item.severity,
            updatedAt: new Date(item.last_updated).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            }),
          };
        });
      });
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        await loadRiskComponents();
      } catch {
        if (!active) return;
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [loadRiskComponents]);

  useEffect(() => {
    if (!alertMessage || alertMessage.type !== 'anomaly_event') {
      return;
    }

    applyRiskUpdate(
      alertMessage.component,
      Math.round(alertMessage.degradation_score * 100),
      alertMessage.severity,
      new Date(alertMessage.timestamp).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    );
  }, [alertMessage, applyRiskUpdate]);

  return (
    <Panel
      title="Component Risk Heatmap"
      subtitle="Fused ensemble risk score for each monitored cooling asset"
      action={
        <div className="inline-flex rounded-full border border-border bg-night/60 p-1">
          <button
            type="button"
            onClick={() => setView('ensemble')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] transition ${
              view === 'ensemble'
                ? 'border border-cyan/60 bg-cyan/10 text-cyan'
                : 'border border-transparent text-muted hover:text-ink'
            }`}
          >
            Ensemble View
          </button>
          <button
            type="button"
            onClick={() => setView('digitalTwin')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] transition ${
              view === 'digitalTwin'
                ? 'border border-cyan/60 bg-cyan/10 text-cyan'
                : 'border border-transparent text-muted hover:text-ink'
            }`}
          >
            Digital Twin
          </button>
        </div>
      }
    >
      {view === 'ensemble' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((item) => {
            const tone = levelStyles[item.severity];

            return (
              <div
                key={item.component}
                className={`relative overflow-hidden rounded-2xl border border-border bg-night/70 p-4 ${
                  item.severity === 'critical' ? 'critical-card-pulse' : ''
                }`}
                style={{ boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.02), 0 0 22px ${tone.glow}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">{formatComponentName(item.component)}</div>
                    <div className="mt-3 font-mono text-4xl font-semibold text-ink">{item.score}</div>
                  </div>
                  <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${tone.badge}`}>
                    {item.severity}
                  </div>
                </div>

                <div className="mt-6 text-xs text-muted">Last updated {item.updatedAt}</div>

                <div className="absolute inset-x-0 bottom-0 h-[3px] bg-border/60">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${item.score}%`,
                      backgroundColor: tone.bar,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DigitalTwinView items={cards} />
      )}
    </Panel>
  );
}
