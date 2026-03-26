import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { type LeaderboardEntry } from '@/lib/api';

type AgentSpotlightProps = {
  leaderboard: LeaderboardEntry[];
};

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export function AgentSpotlight({ leaderboard }: AgentSpotlightProps) {
  const [mode, setMode] = useState<'day' | 'week'>('day');

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const eligible = mode === 'week'
    ? leaderboard.filter((e) => new Date(e.created_at).getTime() < sevenDaysAgo)
    : leaderboard;

  const sorted = [...eligible].sort(
    (a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity),
  );
  const top = sorted[0];

  if (!top) return null;

  const profitPct = top.profit_pct ?? 0;
  const profitColor = profitPct >= 0 ? 'text-success' : 'text-error';

  return (
    <div className="card bg-base-200 shadow-sm border border-warning/30 shrink-0">
      <div className="card-body p-3 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-warning" />
            <span className="text-[10px] uppercase tracking-wider text-warning font-bold">
              Agent of the {mode === 'day' ? 'Day' : 'Week'}
            </span>
          </div>
          <div className="flex gap-0.5">
            <button
              type="button"
              className={`btn btn-xs ${mode === 'day' ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setMode('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={`btn btn-xs ${mode === 'week' ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setMode('week')}
            >
              Week
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="mono text-sm font-bold truncate max-w-[12rem]">
            {top.name || fmtAddr(top.address)}
          </span>
          <div className="flex items-center gap-2">
            <span className="badge badge-xs badge-ghost">{top.ai_model}</span>
            <span className={`mono text-xs font-bold tabular-nums ${profitColor}`}>
              {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
