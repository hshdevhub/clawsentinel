'use client';

import { useEffect, useState } from 'react';

interface ModuleInfo {
  name: string;
  label: string;
  description: string;
  icon: string;
  status: 'running' | 'stopped' | 'unknown' | 'error';
  port?: number | null;
  healthUrl?: string;
}

interface StatusResponse {
  modules: ModuleInfo[];
  checkedAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  running: 'text-claw-safe',
  stopped: 'text-claw-muted',
  unknown:  'text-claw-muted',
  error:    'text-claw-critical',
};

const STATUS_DOT: Record<string, string> = {
  running: 'bg-claw-safe',
  stopped: 'bg-gray-600',
  unknown:  'bg-gray-700',
  error:    'bg-claw-critical',
};

const STATUS_LABEL: Record<string, string> = {
  running: 'RUNNING',
  stopped: 'STOPPED',
  unknown: 'UNKNOWN',
  error:   'ERROR',
};

export function LayerStatus() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [error, setError] = useState(false);

  const refresh = async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) throw new Error('non-ok');
      const json = await res.json() as StatusResponse;
      setData(json);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-claw-muted text-xs">
        Unable to load module status
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-claw-muted text-xs animate-pulse">
        Loading…
      </div>
    );
  }

  const runningCount = data.modules.filter(m => m.status === 'running').length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-claw-border shrink-0">
        <span className="text-xs font-mono text-claw-subtext">MODULES</span>
        <span className="text-xs text-claw-muted">
          {runningCount}/{data.modules.length} active
        </span>
      </div>

      {/* Module rows */}
      <div className="flex-1 overflow-y-auto divide-y divide-claw-border">
        {data.modules.map(mod => (
          <div
            key={mod.name}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
          >
            <span className="text-lg shrink-0 w-6 text-center">{mod.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-claw-text truncate">{mod.label}</span>
                {mod.port && (
                  <span className="text-[10px] text-claw-muted font-mono">:{mod.port}</span>
                )}
              </div>
              <p className="text-[10px] text-claw-muted truncate">{mod.description}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[mod.status] ?? 'bg-gray-600'}`} />
              <span className={`text-[10px] font-mono ${STATUS_STYLES[mod.status] ?? 'text-claw-muted'}`}>
                {STATUS_LABEL[mod.status] ?? mod.status.toUpperCase()}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer timestamp */}
      <div className="px-4 py-1.5 border-t border-claw-border shrink-0">
        <span className="text-[10px] text-claw-muted font-mono">
          checked {new Date(data.checkedAt).toLocaleTimeString('en-US', { hour12: false })}
        </span>
      </div>
    </div>
  );
}
