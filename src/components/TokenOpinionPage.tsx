import { useCallback, useEffect, useState } from 'react';
import { Bot, ArrowLeft } from 'lucide-react';
import {
  getTokenOpinionDetail,
  type AgentOpinion,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';

type TokenOpinionPageProps = {
  raceCfg: PublicApiConfig;
  symbol: string;
  onBack: () => void;
};

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PAGE_SIZE = 20;

export function TokenOpinionPage({ raceCfg, symbol, onBack }: TokenOpinionPageProps) {
  const [stats, setStats] = useState<TokenOpinionSummary | null>(null);
  const [opinions, setOpinions] = useState<AgentOpinion[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (off: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getTokenOpinionDetail(raceCfg, symbol, { limit: PAGE_SIZE, offset: off });
      setStats(data.stats);
      setTotal(data.total);
      setOpinions((prev) => (append ? [...prev, ...data.opinions] : data.opinions));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [raceCfg, symbol]);

  useEffect(() => {
    setOffset(0);
    void load(0, false);
  }, [load]);

  const handleLoadMore = () => {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void load(next, true);
  };

  if (loading) {
    return (
      <div className="mt-4 flex justify-center py-8">
        <span className="loading loading-spinner loading-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4">
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-3 sm:p-5 gap-3">
            <div className="text-sm text-error">{error}</div>
            <button className="btn btn-sm btn-ghost gap-1 self-start" type="button" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const consensusUpper = (stats?.consensus ?? '').toUpperCase();
  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const changeColor = changePositive ? 'text-success' : 'text-error';

  let consensusColor = 'opacity-60';
  if (consensusUpper === 'BULLISH') consensusColor = 'text-success';
  else if (consensusUpper === 'BEARISH') consensusColor = 'text-error';

  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;

  return (
    <div className="mt-4 flex flex-col lg:flex-row gap-4">
      {/* Left sidebar */}
      <div className="lg:w-80 lg:sticky lg:top-4 lg:self-start shrink-0">
        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-4 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-lg font-bold">{stats?.token_symbol}</span>
              <span className="text-xs opacity-50">{stats?.token_name}</span>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums mono">{fmtPrice(stats?.price_usd ?? 0)}</span>
              <span className={`text-sm font-bold tabular-nums mono ${changeColor}`}>
                {changePositive ? '+' : ''}{(stats?.price_change_24h ?? 0).toFixed(1)}%
              </span>
            </div>

            <div className={`text-2xl font-extrabold ${consensusColor}`}>
              {consensusUpper || 'NEUTRAL'}
            </div>

            {/* Bullish/Bearish bar */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] uppercase tracking-wider opacity-50">
                <span>Bullish {bullPct.toFixed(0)}%</span>
                <span>Bearish {bearPct.toFixed(0)}%</span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-base-300">
                {bullPct > 0 && (
                  <div className="bg-success" style={{ width: `${bullPct}%` }} />
                )}
                {bearPct > 0 && (
                  <div className="bg-error" style={{ width: `${bearPct}%` }} />
                )}
              </div>
            </div>

            {/* 24h stats */}
            <div className="flex items-center gap-1.5 mt-1">
              <span className="h-1.5 w-1.5 rounded-full bg-info animate-pulse shrink-0" />
              <span className="text-[10px] uppercase tracking-wider opacity-40">Last 24 hours</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] uppercase tracking-wider opacity-40">Active Agents</span>
                <span className="mono text-sm font-bold tabular-nums">{stats?.active_agents ?? 0}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] uppercase tracking-wider opacity-40">Trades</span>
                <span className="mono text-sm font-bold tabular-nums">{(stats?.total_trades_24h ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[10px] uppercase tracking-wider opacity-40">Avg Confidence</span>
                <span className="mono text-sm font-bold tabular-nums">{((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%</span>
              </div>
            </div>

            <button className="btn btn-sm btn-ghost gap-1 mt-2 self-start" type="button" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back to Hub
            </button>
          </div>
        </div>
      </div>

      {/* Right column — opinion feed */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">
        {opinions.length === 0 ? (
          <div className="card bg-base-200 shadow-md">
            <div className="card-body p-4">
              <span className="text-sm opacity-60">No opinions on this token yet.</span>
            </div>
          </div>
        ) : (
          opinions.map((op) => {
            const sentUpper = (op.sentiment ?? '').toUpperCase();
            const isHold = op.action === 'hold';
            const borderColor = isHold ? 'border-warning' : sentUpper === 'BULLISH' ? 'border-success' : sentUpper === 'BEARISH' ? 'border-error' : 'border-base-content/20';
            const actionColor = isHold ? 'badge-warning' : sentUpper === 'BULLISH' ? 'badge-success' : sentUpper === 'BEARISH' ? 'badge-error' : 'badge-ghost';

            return (
              <div key={op.id} className={`card bg-base-200 shadow-sm border-l-4 ${borderColor}`}>
                <div className="card-body p-3 sm:p-4 gap-2">
                  {/* Header row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Bot className="h-3.5 w-3.5 opacity-40 shrink-0" />
                    <span className="mono font-medium">
                      {op.agent_name || fmtAddr(op.agent_address)}
                    </span>
                    <span className={`badge badge-xs ${actionColor} uppercase`}>
                      {op.action === 'create_order' ? (sentUpper === 'BULLISH' ? 'BUY' : 'SELL') : op.action === 'close_order' ? 'CLOSE' : op.action === 'hold' ? 'HOLD' : op.action}
                    </span>
                    <span className="opacity-40 tabular-nums">conf: {op.confidence.toFixed(2)}</span>
                    <span className="opacity-30 tabular-nums ml-auto">{timeAgo(op.created_at)}</span>
                  </div>

                  {/* Reasoning */}
                  {op.reasoning && (
                    <p className="text-xs leading-relaxed opacity-80">{op.reasoning}</p>
                  )}

                  {/* Action details */}
                  {(op.from_token || op.to_token) && (
                    <div className="text-[10px] opacity-35 mono">
                      {op.from_token} &rarr; {op.to_token}
                      {op.amount_nano && op.amount_nano !== '0' && ` (${op.amount_nano})`}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {opinions.length < total && (
          <button
            className="btn btn-sm btn-ghost self-center"
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <span className="loading loading-spinner loading-xs" /> : 'Load more'}
          </button>
        )}
      </div>
    </div>
  );
}
