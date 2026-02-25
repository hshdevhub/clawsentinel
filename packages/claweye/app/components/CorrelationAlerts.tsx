'use client';

import { useEffect, useRef, useState } from 'react';

interface ClawEvent {
  id: string;
  timestamp: string;
  source: string;
  severity: 'info' | 'warn' | 'block' | 'critical';
  category: string;
  description: string;
  sessionId?: string;
}

// Correlation alerts are events with source='correlation' or category containing 'corr'
const isCorrelation = (e: ClawEvent) =>
  e.source === 'correlation' || e.category.toLowerCase().startsWith('corr');

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-red-700 bg-red-950/30',
  block:    'border-orange-800 bg-orange-950/20',
  warn:     'border-yellow-800 bg-yellow-950/20',
  info:     'border-claw-border bg-transparent',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-900 text-red-300',
  block:    'bg-orange-900 text-orange-300',
  warn:     'bg-yellow-900 text-yellow-300',
  info:     'bg-gray-800 text-gray-400',
};

export function CorrelationAlerts() {
  const [alerts, setAlerts] = useState<ClawEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    const source = new EventSource('/api/events/stream');

    source.onopen = () => setConnected(true);

    source.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as ClawEvent;
        if (!event.id || !isCorrelation(event)) return;
        if (seenIds.current.has(event.id)) return;
        seenIds.current.add(event.id);
        setAlerts(prev => [event, ...prev].slice(0, 50));
      } catch { /* skip */ }
    };

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  // On mount, also load recent correlation events from REST endpoint
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/events?source=correlation&limit=20');
        if (!res.ok) return;
        const data = await res.json() as { events: ClawEvent[] };
        const fresh = data.events.filter(e => !seenIds.current.has(e.id));
        fresh.forEach(e => seenIds.current.add(e.id));
        if (fresh.length > 0) {
          setAlerts(prev => [...fresh, ...prev].slice(0, 50));
        }
      } catch { /* silent */ }
    };
    void load();
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-claw-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-claw-subtext">CORRELATION ALERTS</span>
          {alerts.length > 0 && (
            <span className="text-[10px] bg-claw-critical/20 text-claw-critical border border-red-800 rounded px-1.5 font-mono">
              {alerts.length}
            </span>
          )}
        </div>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-claw-safe' : 'bg-gray-600'}`} />
      </div>

      {/* Alert list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 p-2">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-claw-muted gap-1.5 text-xs">
            <span className="text-xl">🔗</span>
            <p>No correlation alerts</p>
          </div>
        ) : (
          alerts.map(alert => (
            <AlertCard key={alert.id} alert={alert} />
          ))
        )}
      </div>
    </div>
  );
}

function AlertCard({ alert }: { alert: ClawEvent }) {
  const [expanded, setExpanded] = useState(false);
  const borderClass = SEVERITY_BORDER[alert.severity] ?? SEVERITY_BORDER['info']!;
  const badgeClass  = SEVERITY_BADGE[alert.severity]  ?? SEVERITY_BADGE['info']!;
  const time = new Date(alert.timestamp).toLocaleTimeString('en-US', { hour12: false });

  return (
    <div
      className={`border rounded p-2.5 cursor-pointer hover:brightness-110 transition-all ${borderClass}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-start gap-2">
        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${badgeClass}`}>
          {alert.severity.toUpperCase()}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-claw-text leading-snug">{alert.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-claw-muted font-mono">{time}</span>
            <span className="text-[10px] text-claw-muted">{alert.category}</span>
          </div>
        </div>
      </div>
      {expanded && alert.sessionId && (
        <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-claw-muted font-mono">
          session: {alert.sessionId.slice(0, 16)}…
        </div>
      )}
    </div>
  );
}
