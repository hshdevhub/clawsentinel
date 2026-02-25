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

interface Stat {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}

/** Sparkline for hourly events */
function Sparkline({ data }: { data: Array<{ hour: string; total: number; blocked: number }> }) {
  if (data.length < 2) {
    return <div className="h-8 flex items-center text-[10px] text-claw-muted">No data</div>;
  }

  const width = 120;
  const height = 32;
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  const pts = data.map((d, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - (d.total / maxTotal) * (height - 4) - 2,
    blocked: d.blocked,
    total: d.total,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#6366f1"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Blocked overlay dots */}
      {pts.filter(p => p.blocked > 0).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2" fill="#ef4444" />
      ))}
    </svg>
  );
}

export function StatsBar() {
  const [data, setData] = useState<StatsData | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/stats?hours=24');
        if (!res.ok) return;
        setData(await res.json() as StatsData);
      } catch { /* silent */ }
    };
    void load();
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="flex items-center gap-6 px-4 h-full text-[10px] text-claw-muted font-mono animate-pulse">
        Loading stats…
      </div>
    );
  }

  const blockedTotal = data.counts.block + data.counts.critical;
  const blockRate = data.total > 0 ? Math.round((blockedTotal / data.total) * 100) : 0;

  const stats: Stat[] = [
    {
      label: 'EVENTS',
      value: data.total.toLocaleString(),
      sub: '24h',
      color: 'text-claw-subtext',
    },
    {
      label: 'BLOCKED',
      value: blockedTotal.toLocaleString(),
      sub: `${blockRate}% rate`,
      color: blockedTotal > 0 ? 'text-claw-block' : 'text-claw-subtext',
    },
    {
      label: 'CRITICAL',
      value: data.counts.critical.toLocaleString(),
      sub: 'events',
      color: data.counts.critical > 0 ? 'text-claw-critical' : 'text-claw-subtext',
    },
    {
      label: 'SCORE',
      value: data.score,
      sub: '/100',
      color: data.score >= 80 ? 'text-claw-safe' : data.score >= 60 ? 'text-claw-warn' : 'text-claw-critical',
    },
  ];

  return (
    <div className="flex items-center gap-0 h-full divide-x divide-claw-border">
      {stats.map(stat => (
        <div key={stat.label} className="flex items-center gap-3 px-4">
          <div className="flex flex-col">
            <span className="text-[9px] text-claw-muted font-mono tracking-wider">{stat.label}</span>
            <span className={`text-sm font-bold font-mono leading-none ${stat.color}`}>{stat.value}</span>
            {stat.sub && <span className="text-[9px] text-claw-muted">{stat.sub}</span>}
          </div>
        </div>
      ))}

      {/* Sparkline */}
      <div className="flex items-center gap-2 px-4">
        <span className="text-[9px] text-claw-muted font-mono">ACTIVITY</span>
        <Sparkline data={data.hourlyData} />
      </div>
    </div>
  );
}
