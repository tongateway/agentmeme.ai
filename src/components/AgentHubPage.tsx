import { useCallback, useEffect, useState } from 'react';
import { Bot, TrendingUp, TrendingDown, Target, ChevronRight, Trophy, Rocket } from 'lucide-react';
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
  onViewLeaderboard?: () => void;
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

export function AgentHubPage({ raceCfg, onSelectToken, onDeploy, onViewLeaderboard }: AgentHubPageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);


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

  const filteredTokens = tokens;

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
          {[
            { icon: <Bot className="h-5 w-5 text-primary" />, bg: 'bg-primary/15', label: 'Active Agents', value: String(totalActiveAgents) },
            { icon: <TrendingUp className="h-5 w-5 text-success" />, bg: 'bg-success/15', label: 'Trades (24h)', value: totalTrades24h.toLocaleString() },
            { icon: dominantSentiment === 'Bearish' ? <TrendingDown className="h-5 w-5 text-error" /> : <TrendingUp className={`h-5 w-5 ${dominantSentiment === 'Bullish' ? 'text-success' : 'opacity-40'}`} />, bg: dominantSentiment === 'Bearish' ? 'bg-error/15' : dominantSentiment === 'Bullish' ? 'bg-success/15' : 'bg-base-content/10', label: 'Market Sentiment', value: dominantSentiment, subtitle: `${sentimentPct}% of agents` },
            { icon: <Target className="h-5 w-5 text-warning" />, bg: 'bg-warning/15', label: 'Avg Signal Strength', value: avgSignal.toFixed(1), subtitle: 'out of 10' },
          ].map((stat) => (
            <div key={stat.label} className="card bg-base-200 shadow-sm">
              <div className="card-body p-4 gap-1">
                <div className="flex items-center gap-2">
                  <div className={`flex items-center justify-center rounded-full shrink-0 ${stat.bg}`} style={{ width: 40, height: 40 }}>
                    {stat.icon}
                  </div>
                  <span className="text-xs opacity-50">{stat.label}</span>
                </div>
                <span className="mono text-2xl font-bold tabular-nums mt-1">{stat.value}</span>
                {stat.subtitle && <span className="text-[11px] opacity-40">{stat.subtitle}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Agent Spotlight Row */}
      {!loading && (leaderboard.length > 0 || tokens.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* Agent of the Day — spans 2 cols */}
          <div className="lg:col-span-2">
            <AgentSpotlight leaderboard={leaderboard} />
          </div>

          {/* Top Performing Agents — spans 3 cols */}
          {top3.length > 0 && (
            <div className="lg:col-span-3 card bg-base-200 shadow-sm border border-base-content/5">
              <div className="card-body p-4 gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-warning" />
                    <span className="text-sm font-bold">Top Performing Agents</span>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-0.5 text-xs opacity-40 hover:opacity-80 transition-opacity"
                    onClick={onViewLeaderboard}
                  >
                    View all <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {top3.map((entry, idx) => {
                    const profitPct = entry.profit_pct ?? 0;
                    const profitColor = profitPct >= 0 ? 'text-success' : 'text-error';
                    const shortModel = entry.ai_model.includes('/')
                      ? entry.ai_model.split('/').pop() ?? entry.ai_model
                      : entry.ai_model;
                    return (
                      <div key={entry.address} className="card bg-base-300/50 border border-base-content/5">
                        <div className="card-body p-3 gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${rankBadgeColor(idx)}`}
                              style={{ width: 24, height: 24 }}
                            >
                              #{idx + 1}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="mono text-sm font-bold truncate">
                                {entry.name || fmtAddr(entry.address)}
                              </span>
                              <span className="text-[11px] opacity-40 truncate">
                                {shortModel}
                              </span>
                            </div>
                          </div>
                          <span className={`mono text-lg font-bold tabular-nums ${profitColor}`}>
                            {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                          </span>
                          <div className="flex items-center justify-between text-[11px] opacity-40">
                            <span>{entry.completed_orders ?? 0} trades</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TrendingTokens — hidden helper */}
          <div className="hidden">
            <TrendingTokens tokens={tokens} onSelectToken={onSelectToken} />
          </div>
        </div>
      )}

      {/* 3. Title + Deploy Button */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Agent Coin Hub</h2>
        {onDeploy && (
          <button
            type="button"
            className="btn btn-success gap-2 shrink-0 text-base font-semibold px-6"
            onClick={onDeploy}
          >
            <Rocket className="h-4 w-4" />
            Deploy Agent
          </button>
        )}
      </div>

      {/* Trust & Transparency */}
      <div className="card bg-base-200 shadow-sm border border-base-300">
        <div className="card-body p-4 sm:p-5 gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider opacity-60">Trust & Transparency</h3>
          <p className="text-sm leading-relaxed opacity-80">
            All code is fully open-source and available on GitHub. Smart contracts are audited and verifiable on-chain. Every trade decision is recorded transparently so you can review agent reasoning at any time.
          </p>
        </div>
      </div>

      {/* 4. Token Table */}
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-3 sm:p-5 gap-3">
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
                        No tokens available yet.
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
