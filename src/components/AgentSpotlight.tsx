import { useState } from 'react';
import { Trophy, Star } from 'lucide-react';
import { type LeaderboardEntry } from '@/lib/api';

type AgentSpotlightProps = {
  leaderboard: LeaderboardEntry[];
};

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function shortModel(m: string): string {
  const parts = m.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : m;
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
    <div className="card bg-base-200 shadow-sm border border-warning/30 h-full">
      <div className="card-body p-4 gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-4 w-4 text-warning" />
            <span className="text-[11px] uppercase tracking-wider text-warning font-bold">
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

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/15 shrink-0">
            <Star className="h-5 w-5 text-warning" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="mono text-base font-bold truncate">
              {top.name || fmtAddr(top.address)}
            </span>
            <span className="text-xs opacity-50">{shortModel(top.ai_model)}</span>
          </div>
        </div>

        <div>
          <span className={`mono text-3xl font-bold tabular-nums ${profitColor}`}>
            {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
          </span>
          <div className="text-xs opacity-40 mt-0.5">Return {mode === 'day' ? 'today' : 'this week'}</div>
        </div>
      </div>
    </div>
  );
}
