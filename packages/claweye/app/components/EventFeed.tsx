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

const MAX_EVENTS = 200;

const SEVERITY_STYLES: Record<string, string> = {
  info:     'text-claw-subtext border-claw-border',
  warn:     'text-claw-warn   border-yellow-800',
  block:    'text-claw-block  border-orange-800',
  critical: 'text-claw-critical border-red-800 font-semibold animate-slide-in'
};

const SEVERITY_ICONS: Record<string, string> = {
  info:     'ℹ',
  warn:     '⚠',
  block:    '🚫',
  critical: '🚨'
};

const SOURCE_COLORS: Record<string, string> = {
  'clawguard':       'text-indigo-400',
  'clawhub-scanner': 'text-purple-400',
  'clawvault':       'text-blue-400',
  'clawbox':         'text-teal-400',
  'correlation':     'text-red-400',
  'system':          'text-gray-500'
};

export function EventFeed({ initialEvents = [] }: { initialEvents?: ClawEvent[] }) {
  const [events, setEvents] = useState<ClawEvent[]>(initialEvents);
  const [connected, setConnected] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const bottomRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  pausedRef.current = paused;

  useEffect(() => {
    const source = new EventSource('/api/events/stream');

    source.onopen = () => setConnected(true);

    source.onmessage = (e: MessageEvent) => {
      if (pausedRef.current) return;
      try {
        const event = JSON.parse(e.data as string) as ClawEvent;
        if (!event.id || !event.severity) return; // Skip ping/status messages
        setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS));
      } catch { /* malformed event — skip */ }
    };

    source.onerror = () => setConnected(false);

    return () => source.close();
  }, []);

  const filtered = filter === 'all'
    ? events
    : events.filter(e => e.severity === filter);

  const displayEvents = filtered.slice(0, 100);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-claw-border shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-claw-safe' : 'bg-gray-600'}`} />
          <span className="text-xs text-claw-subtext font-mono">
            {connected ? 'LIVE' : 'CONNECTING…'}
          </span>
          <span className="text-xs text-claw-muted ml-2">{events.length} events</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Severity filter */}
          <select
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="text-xs bg-claw-surface border border-claw-border text-claw-subtext rounded px-2 py-1 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="critical">Critical</option>
            <option value="block">Block</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
          </select>
          {/* Pause toggle */}
          <button
            onClick={() => setPaused(p => !p)}
            className={`text-xs px-2 py-1 rounded border font-mono transition-colors ${
              paused
                ? 'border-claw-warn text-claw-warn bg-yellow-950'
                : 'border-claw-border text-claw-subtext hover:border-claw-muted'
            }`}
          >
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-claw-muted gap-2">
            <span className="text-2xl">🛡️</span>
            <p>No events yet. ClawSentinel is watching.</p>
          </div>
        ) : (
          displayEvents.map(event => (
            <EventRow key={event.id} event={event} />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EventRow({ event }: { event: ClawEvent }) {
  const [expanded, setExpanded] = useState(false);
  const style    = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES['info']!;
  const icon     = SEVERITY_ICONS[event.severity]  ?? 'ℹ';
  const srcColor = SOURCE_COLORS[event.source]     ?? 'text-gray-400';
  const time     = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false });

  return (
    <div
      className={`flex flex-col border-b ${style} px-3 py-1.5 hover:bg-white/5 cursor-pointer`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 w-14 text-claw-muted">{time}</span>
        <span className="shrink-0 w-3">{icon}</span>
        <span className={`shrink-0 w-24 truncate ${srcColor}`}>[{event.source}]</span>
        <span className="truncate">{event.description}</span>
      </div>
      {expanded && (
        <div className="ml-20 mt-1 text-claw-muted text-[10px] space-y-0.5">
          <div>category: <span className="text-claw-subtext">{event.category}</span></div>
          {event.sessionId && (
            <div>session: <span className="text-claw-subtext font-mono">{event.sessionId.slice(0, 16)}…</span></div>
          )}
        </div>
      )}
    </div>
  );
}
