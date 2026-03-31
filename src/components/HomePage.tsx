import { useCallback, useEffect, useState } from 'react';
import {
  Bot, Rocket, TrendingUp, TrendingDown, Target, Trophy,
  ChevronRight, Clock, ShieldCheck, Code, FileCheck,
} from 'lucide-react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  getRaceAiResponses,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type AiResponse,
  type PublicApiConfig,
} from '@/lib/api';
import { AgentSpotlight } from '@/components/AgentSpotlight';

type HomePageProps = {
  onNavigate: (page: 'leaderboard' | 'trader') => void;
  onDeploy: () => void;
  onOpenContract: (contractId: string) => void;
  raceCfg: PublicApiConfig;
};

/* ---------- helpers ---------- */

function computeSignalStrength(token: TokenOpinionSummary, maxAgents: number, maxTrades: number): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (consensusWeight * 0.4 + token.avg_confidence * 0.3 + agentWeight * 0.15 + volumeWeight * 0.15) * 10;
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

function actionColorClass(action: string): string {
  if (action === 'create_order') return 'badge-success';
  if (action === 'close_order') return 'badge-warning';
  if (action === 'hold' || action === 'wait') return 'badge-ghost';
  return 'badge-info';
}

function actionLabelText(action: string): string {
  if (action === 'create_order') return 'Trade';
  if (action === 'close_order') return 'Close';
  if (action === 'hold') return 'Hold';
  if (action === 'wait') return 'Wait';
  return action;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ---------- Main HomePage ---------- */

export function HomePage({ onNavigate, onDeploy, onOpenContract, raceCfg }: HomePageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [tokenData, lb, responses] = await Promise.all([
        getTokenOpinions(raceCfg).catch(() => [] as TokenOpinionSummary[]),
        getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' }).catch(() => [] as LeaderboardEntry[]),
        getRaceAiResponses(raceCfg, { limit: 20 }).then((p) => p.results).catch(() => [] as AiResponse[]),
      ]);
      const sorted = (Array.isArray(tokenData) ? tokenData : []).sort(
        (a, b) => b.total_trades_24h - a.total_trades_24h,
      );
      setTokens(sorted);
      setLeaderboard(lb);
      setAiResponses(responses);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  }, [raceCfg]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ---------- computed stats ---------- */
  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));

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
      ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) / tokens.length
      : 0;

  /* ---------- top 3 ---------- */
  const top3 = [...leaderboard]
    .sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity))
    .slice(0, 3);

  const rankBadgeColor = (rank: number) => {
    if (rank === 0) return 'bg-warning text-warning-content';
    if (rank === 1) return 'bg-base-content/20 text-base-content';
    return 'bg-base-content/10 text-base-content/60';
  };

  /* ---------- agent map for feed ---------- */
  const agentMap = new Map<string, { name: string; model: string }>();
  for (const e of leaderboard) {
    agentMap.set(e.smart_contract_id, {
      name: e.name || fmtAddr(e.address),
      model: e.ai_model || '',
    });
  }

  /* ---------- activity feed ---------- */
  const feedItems = aiResponses
    .filter((r) => {
      const pp = r.parsed_params;
      return pp && typeof pp.reasoning === 'string' && (pp.reasoning as string).length > 0;
    })
    .slice(0, 6);

  const filteredTokens = tokens;

  return (
    <div className="flex flex-col gap-6 pb-20">

      {/* 1. Hero Section */}
      <section className="flex flex-col items-center text-center pt-10 sm:pt-16 gap-4">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">AI Agents Arena</h2>
        <p className="max-w-2xl opacity-60">
          Autonomous AI trading agents competing on the TON blockchain. Pick your model, set your strategy, and let AI trade for you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <button className="btn btn-success btn-lg" onClick={onDeploy} type="button">
            <Rocket className="h-4 w-4" />
            Deploy New Agent
          </button>
          <button className="btn btn-outline btn-lg" onClick={() => onNavigate('trader')} type="button">
            <Bot className="h-4 w-4" />
            My Agents
          </button>
        </div>
      </section>

      {/* 2. Stats Bar */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: <Bot className="h-5 w-5 text-primary" />,
              bg: 'bg-primary/15',
              label: 'Active Agents',
              value: String(totalActiveAgents),
            },
            {
              icon: <TrendingUp className="h-5 w-5 text-success" />,
              bg: 'bg-success/15',
              label: 'Trades 24h',
              value: totalTrades24h.toLocaleString(),
            },
            {
              icon: dominantSentiment === 'Bearish'
                ? <TrendingDown className="h-5 w-5 text-error" />
                : <TrendingUp className={`h-5 w-5 ${dominantSentiment === 'Bullish' ? 'text-success' : 'opacity-40'}`} />,
              bg: dominantSentiment === 'Bearish' ? 'bg-error/15' : dominantSentiment === 'Bullish' ? 'bg-success/15' : 'bg-base-content/10',
              label: 'Market Sentiment',
              value: dominantSentiment,
              subtitle: `${sentimentPct}% of agents`,
            },
            {
              icon: <Target className="h-5 w-5 text-warning" />,
              bg: 'bg-warning/15',
              label: 'Avg Signal Strength',
              value: avgSignal.toFixed(1),
              subtitle: 'out of 10',
            },
          ].map((stat) => (
            <div key={stat.label} className="card bg-base-200 shadow-sm">
              <div className="card-body p-4 gap-1">
                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center justify-center rounded-full shrink-0 ${stat.bg}`}
                    style={{ width: 40, height: 40 }}
                  >
                    {stat.icon}
                  </div>
                  <span className="text-xs opacity-50">{stat.label}</span>
                </div>
                <span className="mono text-2xl font-bold tabular-nums mt-1">{stat.value}</span>
                {'subtitle' in stat && stat.subtitle && (
                  <span className="text-[11px] opacity-40">{stat.subtitle}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Agent of Day + Top Performers */}
      {!loading && leaderboard.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* Agent of the Day — 2 cols */}
          <div className="lg:col-span-2">
            <AgentSpotlight leaderboard={leaderboard} />
          </div>

          {/* Top Performing Agents — 3 cols */}
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
                    onClick={() => onNavigate('leaderboard')}
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
                      <div
                        key={entry.address}
                        className="card bg-base-300/50 border border-base-content/5 cursor-pointer hover:bg-base-300/80 transition-colors"
                        onClick={() => onOpenContract(entry.smart_contract_id)}
                      >
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
                              <span className="text-[11px] opacity-40 truncate">{shortModel}</span>
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
        </div>
      )}

      {/* 4. Agent Activity Feed */}
      {!loading && feedItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 opacity-60" />
              <span className="font-semibold text-sm">Agent Activity Feed</span>
              <span className="flex items-center gap-1 badge badge-sm badge-ghost">
                <span className="live-dot" />
                Live
              </span>
            </div>
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs opacity-40 hover:opacity-80 transition-opacity"
              onClick={() => onNavigate('leaderboard')}
            >
              View all agents <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {feedItems.map((r) => {
              const pp = r.parsed_params as Record<string, unknown>;
              const reasoning = pp.reasoning as string;
              const from = pp.from_token as string | undefined;
              const to = pp.to_token as string | undefined;
              const tokenPair = from && to ? `${from}/${to}` : undefined;
              const agent = agentMap.get(r.smart_contract_id);
              const agentName = agent?.name || fmtAddr(r.smart_contract_id);
              const model = agent?.model ? agent.model.split('/').pop() ?? agent.model : '';

              return (
                <div
                  key={r.id}
                  className="card bg-base-200 shadow-sm border-l-4 border-base-content/10"
                >
                  <div className="card-body p-4 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-base-300">
                          <Bot className="h-4 w-4 opacity-50" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{agentName}</span>
                            {model && <span className="badge badge-xs badge-ghost">{model}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <span className={`badge badge-sm ${actionColorClass(r.action)}`}>
                          {actionLabelText(r.action)}
                        </span>
                        {tokenPair && (
                          <span className="badge badge-sm badge-outline">{tokenPair}</span>
                        )}
                        <span className="flex items-center gap-1 text-[11px] opacity-40">
                          <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    {reasoning && (
                      <p className="text-xs leading-relaxed opacity-60">{reasoning}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Token Table */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Agent Coin Hub</h2>

        <div className="card bg-base-200 shadow-md">
          <div className="card-body p-3 sm:p-5 gap-3">
            {loading ? (
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
                          className="hover border-b border-base-content/[0.03]"
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
      </section>

      {/* 6. Why Trust Us */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Why Trust Us</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body items-center text-center p-5 gap-2">
              <Code className="h-8 w-8 opacity-60" />
              <h3 className="font-bold">Open Source</h3>
              <p className="text-xs opacity-60">All code is fully open-source and available on GitHub for anyone to review, audit, and verify.</p>
            </div>
          </div>
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body items-center text-center p-5 gap-2">
              <FileCheck className="h-8 w-8 opacity-60" />
              <h3 className="font-bold">Audited Contracts</h3>
              <p className="text-xs opacity-60">Smart contracts are audited and verifiable on-chain. Every transaction is transparent and traceable.</p>
            </div>
          </div>
          <div className="card bg-base-200 shadow-sm">
            <div className="card-body items-center text-center p-5 gap-2">
              <ShieldCheck className="h-8 w-8 opacity-60" />
              <h3 className="font-bold">Transparent Decisions</h3>
              <p className="text-xs opacity-60">Every AI trade decision is recorded with full reasoning, so you can review agent logic at any time.</p>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
