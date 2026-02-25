'use client';

import { useEffect, useState } from 'react';

interface StatsData {
  score: number;
  counts: { info: number; warn: number; block: number; critical: number };
  total: number;
  topCategories: Array<{ category: string; count: number }>;
  hourlyData: Array<{ hour: string; total: number; blocked: number }>;
  window: { hours: number; since: string };
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981'; // safe green
  if (score >= 60) return '#f59e0b'; // warn yellow
  if (score >= 40) return '#f97316'; // block orange
  return '#ef4444';                   // critical red
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'SECURE';
  if (score >= 60) return 'CAUTION';
  if (score >= 40) return 'AT RISK';
  return 'CRITICAL';
}

/** Renders a minimal SVG arc gauge */
function Gauge({ score }: { score: number }) {
  const radius = 52;
  const cx = 64;
  const cy = 64;
  // Arc from 200deg to 340deg (140deg sweep for full score)
  const startAngle = 200;
  const sweepAngle = 140;
  const scoreAngle = (score / 100) * sweepAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const arcPath = (startDeg: number, sweepDeg: number) => {
    const start = {
      x: cx + radius * Math.cos(toRad(startDeg)),
      y: cy + radius * Math.sin(toRad(startDeg)),
    };
    const end = {
      x: cx + radius * Math.cos(toRad(startDeg + sweepDeg)),
      y: cy + radius * Math.sin(toRad(startDeg + sweepDeg)),
    };
    const large = sweepDeg > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 1 ${end.x} ${end.y}`;
  };

  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  return (
    <div className="flex flex-col items-center">
      <svg width="128" height="96" viewBox="0 0 128 96" className="overflow-visible">
        {/* Track */}
        <path
          d={arcPath(startAngle, sweepAngle)}
          fill="none"
          stroke="#1f2937"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Score arc */}
        {score > 0 && (
          <path
            d={arcPath(startAngle, scoreAngle)}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color}80)` }}
          />
        )}
        {/* Score text */}
        <text
          x={cx}
          y={cy + 6}
          textAnchor="middle"
          fontSize="28"
          fontWeight="700"
          fontFamily="monospace"
          fill={color}
        >
          {score}
        </text>
        {/* Label */}
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fontSize="9"
          fontFamily="monospace"
          fill="#6b7280"
          letterSpacing="1"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

export function SecurityScore() {
  const [data, setData] = useState<StatsData | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch('/api/stats?hours=24');
      if (!res.ok) return;
      setData(await res.json() as StatsData);
    } catch { /* silent */ }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(interval);
  }, []);

  const score = data?.score ?? 100;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-claw-border shrink-0">
        <span className="text-xs font-mono text-claw-subtext">SECURITY SCORE</span>
        <span className="text-[10px] text-claw-muted">24h window</span>
      </div>

      {/* Gauge */}
      <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4">
        <Gauge score={score} />

        {data && (
          <div className="grid grid-cols-4 gap-1 w-full mt-1">
            <Pill label="CRIT" count={data.counts.critical} color="text-claw-critical" />
            <Pill label="BLOCK" count={data.counts.block} color="text-claw-block" />
            <Pill label="WARN" count={data.counts.warn} color="text-claw-warn" />
            <Pill label="INFO" count={data.counts.info} color="text-claw-subtext" />
          </div>
        )}
      </div>

      {/* Top categories */}
      {data && data.topCategories.length > 0 && (
        <div className="px-4 pb-3 shrink-0">
          <p className="text-[10px] text-claw-muted font-mono mb-1.5">TOP THREATS</p>
          <div className="space-y-1">
            {data.topCategories.slice(0, 3).map(cat => {
              const max = data.topCategories[0]?.count ?? 1;
              const pct = Math.round((cat.count / max) * 100);
              return (
                <div key={cat.category} className="flex items-center gap-2">
                  <span className="text-[10px] text-claw-subtext font-mono w-24 truncate">{cat.category}</span>
                  <div className="flex-1 bg-claw-border rounded-full h-1">
                    <div
                      className="bg-claw-block h-1 rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-claw-muted w-5 text-right">{cat.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex flex-col items-center bg-claw-surface border border-claw-border rounded px-1 py-1">
      <span className={`text-sm font-bold font-mono ${color}`}>{count}</span>
      <span className="text-[9px] text-claw-muted font-mono">{label}</span>
    </div>
  );
}
