import { useCallback, useEffect, useState } from 'react';
import { Bot, TrendingUp, TrendingDown, Target, Search, ChevronRight, Trophy } from 'lucide-react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { TrendingTokens } from '@/components/TrendingTokens';
import { AgentSpotlight } from '@/components/AgentSpotlight';

type AgentHubPageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy?: () => void;
};

function computeSignalStrength(
  token: TokenOpinionSummary,
  maxAgents: number,
  maxTrades: number,
): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (
    consensusWeight * 0.4 +
    token.avg_confidence * 0.3 +
    agentWeight * 0.15 +
    volumeWeight * 0.15
  ) * 10;
}

function signalColor(signal: number): string {
  if (signal >= 7) return 'text-success';
  if (signal >= 4) return 'text-warning';
  return 'opacity-40';
}

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

export function AgentHubPage({ raceCfg, onSelectToken, onDeploy }: AgentHubPageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, lb] = await Promise.all([
        getTokenOpinions(raceCfg),
        getRaceLeaderboard(raceCfg).catch(() => [] as LeaderboardEntry[]),
      ]);
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => b.total_trades_24h - a.total_trades_24h,
      );
      setTokens(sorted);
      setLeaderboard(lb);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));

  // Stats bar calculations
  const totalActiveAgents = tokens.reduce((sum, t) => sum + t.active_agents, 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + t.total_trades_24h, 0);

  const bullishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BULLISH').length;
  const bearishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BEARISH').length;
  const dominantSentiment =
    bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct = tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;

  const avgSignal =
    tokens.length > 0
      ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) /
        tokens.length
      : 0;

  // Top 3 leaderboard
  const top3 = [...leaderboard]
    .sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity))
    .slice(0, 3);

  // Filtered tokens
  const q = search.trim().toLowerCase();
  const filteredTokens = q
    ? tokens.filter(
        (t) =>
          t.token_symbol.toLowerCase().includes(q) ||
          (t.token_name ?? '').toLowerCase().includes(q),
      )
    : tokens;

  const rankBadgeColor = (rank: number) => {
    if (rank === 0) return 'bg-warning text-warning-content';
    if (rank === 1) return 'bg-base-content/20 text-base-content';
    return 'bg-base-content/10 text-base-content/60';
  };

  return (
    <div className="mt-4 flex flex-col gap-4">

      {/* 1. Stats Bar */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Active Agents */}
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body p-3 gap-2 flex-row items-center">
              <div className="flex items-center justify-center rounded-full bg-primary/15 shrink-0" style={{ width: 40, height: 40 }}>
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="mono text-lg font-bold leading-tight tabular-nums">{totalActiveAgents}</span>
                <span className="text-[11px] opacity-50 leading-none">Active Agents</span>
              </div>
            </div>
          </div>

          {/* Trades 24h */}
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body p-3 gap-2 flex-row items-center">
              <div className="flex items-center justify-center rounded-full bg-success/15 shrink-0" style={{ width: 40, height: 40 }}>
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="mono text-lg font-bold leading-tight tabular-nums">{totalTrades24h}</span>
                <span className="text-[11px] opacity-50 leading-none">Trades (24h)</span>
              </div>
            </div>
          </div>

          {/* Market Sentiment */}
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body p-3 gap-2 flex-row items-center">
              <div
                className={`flex items-center justify-center rounded-full shrink-0 ${
                  dominantSentiment === 'Bullish' ? 'bg-success/15' : dominantSentiment === 'Bearish' ? 'bg-error/15' : 'bg-base-content/10'
                }`}
                style={{ width: 40, height: 40 }}
              >
                {dominantSentiment === 'Bearish' ? (
                  <TrendingDown className={`h-5 w-5 text-error`} />
                ) : (
                  <TrendingUp className={`h-5 w-5 ${dominantSentiment === 'Bullish' ? 'text-success' : 'opacity-40'}`} />
                )}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-lg font-bold leading-tight">{dominantSentiment}</span>
                <span className="text-[11px] opacity-50 leading-none">{sentimentPct}% of agents</span>
              </div>
            </div>
          </div>

          {/* Avg Signal Strength */}
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body p-3 gap-2 flex-row items-center">
              <div className="flex items-center justify-center rounded-full bg-warning/15 shrink-0" style={{ width: 40, height: 40 }}>
                <Target className="h-5 w-5 text-warning" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="mono text-lg font-bold leading-tight tabular-nums">{avgSignal.toFixed(1)}</span>
                <span className="text-[11px] opacity-50 leading-none">Avg Signal / 10</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Agent Spotlight Row */}
      {!loading && (leaderboard.length > 0 || tokens.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Agent of the Day */}
          <div>
            <AgentSpotlight leaderboard={leaderboard} />
          </div>

          {/* Top Performing Agents */}
          {top3.length > 0 && (
            <div className="card bg-base-200 shadow-sm border border-base-content/5">
              <div className="card-body p-3 gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-warning" />
                    <span className="text-[10px] uppercase tracking-wider font-bold text-warning">
                      Top Performing Agents
                    </span>
                  </div>
                  <span className="flex items-center gap-0.5 text-[11px] opacity-40 cursor-default">
                    View all <ChevronRight className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {top3.map((entry, idx) => {
                    const profitPct = entry.profit_pct ?? 0;
                    const profitColor = profitPct >= 0 ? 'text-success' : 'text-error';
                    const shortModel = entry.ai_model.includes('/')
                      ? entry.ai_model.split('/').pop() ?? entry.ai_model
                      : entry.ai_model;
                    return (
                      <div key={entry.address} className="flex items-center gap-2">
                        <span
                          className={`flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${rankBadgeColor(idx)}`}
                          style={{ width: 22, height: 22 }}
                        >
                          #{idx + 1}
                        </span>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="mono text-xs font-semibold truncate leading-none">
                            {entry.name || fmtAddr(entry.address)}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="badge badge-xs badge-ghost opacity-60 truncate max-w-[7rem]">
                              {shortModel}
                            </span>
                            <span className="mono text-[11px] opacity-40 tabular-nums">
                              {entry.completed_orders ?? 0} trades
                            </span>
                          </div>
                        </div>
                        <span className={`mono text-xs font-bold tabular-nums shrink-0 ${profitColor}`}>
                          {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Dashboard strip (TrendingTokens) — keep in layout */}
          <div className="hidden">
            <TrendingTokens tokens={tokens} onSelectToken={onSelectToken} />
          </div>
        </div>
      )}

      {/* 3. Search Bar + Deploy Button */}
      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3 flex-row items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 opacity-40" />
            <input
              type="text"
              className="input input-sm w-full pl-8 bg-base-100/50 border-base-content/10 focus:outline-none"
              placeholder="Search tokens…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {onDeploy && (
            <button
              type="button"
              className="btn btn-sm btn-success gap-1.5 shrink-0"
              onClick={onDeploy}
            >
              Deploy Agent
            </button>
          )}
        </div>
      </div>

      {/* 4. Token Table */}
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-3 sm:p-5 gap-3">
          <h2 className="card-title text-base">Agent Hub</h2>

          {error ? (
            <div className="text-sm text-error">{error}</div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-sm opacity-60">
              No agent opinions yet. Agents will share their views as they trade.
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-none">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
                    <th className="w-8 pl-0">#</th>
                    <th>Token</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">24h</th>
                    <th className="text-center">AI Consensus</th>
                    <th className="text-right hidden sm:table-cell">Signal</th>
                    <th className="text-right">Trades 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTokens.map((t, i) => {
                    const signal = computeSignalStrength(t, maxAgents, maxTrades);
                    const change24h = t.price_change_24h ?? 0;
                    const changePositive = change24h >= 0;
                    const changeColor = changePositive ? 'text-success' : 'text-error';
                    const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;

                    const consensusUpper = (t.consensus ?? '').toUpperCase();
                    let consensusBadge = 'badge-ghost opacity-60';
                    if (consensusUpper === 'BULLISH') consensusBadge = 'badge-success';
                    else if (consensusUpper === 'BEARISH') consensusBadge = 'badge-error';

                    const bullish = t.bullish_pct ?? 0;
                    const bearish = t.bearish_pct ?? 0;
                    const pct = consensusUpper === 'BULLISH'
                      ? bullish
                      : consensusUpper === 'BEARISH'
                        ? bearish
                        : Math.max(bullish, bearish);

                    return (
                      <tr
                        key={t.token_symbol}
                        className="hover border-b border-base-content/[0.03] cursor-pointer"
                        onClick={() => onSelectToken(t.token_symbol)}
                      >
                        <td className="pl-0 align-middle">
                          <span className="mono text-xs font-semibold tabular-nums opacity-50">{i + 1}</span>
                        </td>
                        <td className="py-2">
                          <div className="flex items-baseline gap-2">
                            <span className="mono text-xs font-bold leading-none">{t.token_symbol}</span>
                            <span className="text-[10px] opacity-35 leading-none truncate max-w-[8rem]">
                              {t.token_name}
                            </span>
                          </div>
                        </td>
                        <td className="text-right align-middle">
                          <span className="mono text-xs tabular-nums font-medium">
                            {fmtPrice(priceUsd)}
                          </span>
                        </td>
                        <td className="text-right align-middle">
                          <span className={`mono text-xs tabular-nums font-bold ${changeColor}`}>
                            {changePositive ? '+' : ''}{change24h.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-center align-middle">
                          <span className={`badge badge-sm gap-1 ${consensusBadge}`}>
                            {consensusUpper === 'BULLISH' ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : consensusUpper === 'BEARISH' ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : null}
                            {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-right align-middle hidden sm:table-cell">
                          <span className={`mono text-xs tabular-nums font-bold ${signalColor(signal)}`}>
                            {signal.toFixed(1)}
                          </span>
                        </td>
                        <td className="text-right align-middle">
                          <span className="mono text-xs tabular-nums">{t.total_trades_24h}</span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTokens.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-sm opacity-40">
                        No tokens match &ldquo;{search}&rdquo;
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
