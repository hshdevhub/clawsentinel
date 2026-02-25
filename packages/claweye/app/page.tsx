import { EventFeed }          from './components/EventFeed.js';
import { LayerStatus }         from './components/LayerStatus.js';
import { SecurityScore }        from './components/SecurityScore.js';
import { CorrelationAlerts }    from './components/CorrelationAlerts.js';
import { StatsBar }             from './components/StatsBar.js';

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-screen bg-claw-bg overflow-hidden">

      {/* ── Top bar ─────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-4 h-10 border-b border-claw-border bg-claw-surface shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-claw-accent font-bold font-mono text-sm tracking-wider">⚡ CLAWEYE</span>
          <span className="text-[10px] text-claw-muted font-mono">v0.4.0</span>
        </div>
        <div className="flex-1 border-l border-claw-border pl-4 h-full flex items-center overflow-hidden">
          <StatsBar />
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────── */}
      <main className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left sidebar — module status + score */}
        <aside className="flex flex-col w-64 shrink-0 border-r border-claw-border bg-claw-surface overflow-hidden">
          {/* Security score gauge — top half */}
          <div className="h-72 border-b border-claw-border shrink-0 overflow-hidden">
            <SecurityScore />
          </div>
          {/* Module status — remaining space */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <LayerStatus />
          </div>
        </aside>

        {/* Centre — event feed */}
        <section className="flex-1 min-w-0 border-r border-claw-border overflow-hidden">
          <EventFeed />
        </section>

        {/* Right sidebar — correlation alerts */}
        <aside className="w-72 shrink-0 overflow-hidden">
          <CorrelationAlerts />
        </aside>

      </main>

    </div>
  );
}
