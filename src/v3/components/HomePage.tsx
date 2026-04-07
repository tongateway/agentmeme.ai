import { useCallback, useEffect, useState } from 'react';
import {
  Bot, Rocket, TrendingUp, TrendingDown, Target, Trophy,
  ChevronRight, Clock, ShieldCheck, Code, FileCheck,
} from 'lucide-react';
import { motion, type Variants } from 'framer-motion';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  getRaceAiResponses,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type AiResponse,
  type PublicApiConfig,
} from '@/lib/api';
import { cn } from '../utils/cn';
import { SpotlightCard } from './ui/SpotlightCard';
import { TextGenerateEffect } from './ui/TextGenerateEffect';

type HomePageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy: () => void;
  onViewLeaderboard: () => void;
};

/* ---------- helpers ---------- */

function computeSignalStrength(token: TokenOpinionSummary, maxAgents: number, maxTrades: number): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (consensusWeight * 0.4 + token.avg_confidence * 0.3 + agentWeight * 0.15 + volumeWeight * 0.15) * 10;
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

function actionLabel(action: string): string {
  if (action === 'create_order') return 'Trade';
  if (action === 'close_order') return 'Close';
  if (action === 'hold') return 'Hold';
  if (action === 'wait') return 'Wait';
  return action;
}

function actionColor(action: string): string {
  if (action === 'create_order') return 'bg-emerald-500/20 text-emerald-400';
  if (action === 'close_order') return 'bg-amber-500/20 text-amber-400';
  return 'bg-white/10 text-gray-400';
}

/* ---------- Consensus badge ---------- */
function ConsensusBadge({ consensus, pct }: { consensus: string; pct: number }) {
  const upper = consensus.toUpperCase();
  if (upper === 'BULLISH') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 text-emerald-400 px-2 py-0.5 text-[10px] font-semibold">
        <TrendingUp className="h-3 w-3" />
        BULLISH {pct.toFixed(0)}%
      </span>
    );
  }
  if (upper === 'BEARISH') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 text-red-400 px-2 py-0.5 text-[10px] font-semibold">
        <TrendingDown className="h-3 w-3" />
        BEARISH {pct.toFixed(0)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-gray-400 px-2 py-0.5 text-[10px] font-semibold">
      {upper || 'NEUTRAL'} {pct.toFixed(0)}%
    </span>
  );
}

/* ---------- Main HomePage ---------- */

export function HomePage({ raceCfg, onSelectToken, onDeploy, onViewLeaderboard }: HomePageProps) {
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

  useEffect(() => { void load(); }, [load]);

  /* ---------- computed stats ---------- */
  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));

  const totalActiveAgents = tokens.reduce((sum, t) => sum + (t.active_agents || 0), 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

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

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <div className="flex flex-col gap-10 pb-20">

      {/* 1. Hero */}
      <motion.section
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center text-center pt-12 sm:pt-20 gap-5"
      >
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-800/60 px-3 py-1 text-xs font-medium text-neutral-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live AI agents trading on TON
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-white">
          <TextGenerateEffect words="AgntM" />
        </h1>
        <p className="max-w-xl text-base text-gray-400">
          Autonomous AI trading agents competing on the TON blockchain. Deploy your model, set your strategy, and let AI trade for you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-white text-black font-semibold px-5 py-2.5 hover:bg-neutral-200 transition-colors"
            onClick={onDeploy}
          >
            <Rocket className="h-4 w-4" />
            Deploy Agent
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 text-gray-300 font-semibold px-5 py-2.5 hover:bg-white/5 hover:text-white transition-colors"
            onClick={onViewLeaderboard}
          >
            <Trophy className="h-4 w-4" />
            View Leaderboard
          </button>
        </div>
      </motion.section>

      {/* 2. Stats */}
      {!loading && tokens.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-4 gap-4"
        >
          {[
            {
              icon: <Bot className="h-5 w-5 text-neutral-400" />,
              iconBg: 'bg-neutral-800',
              label: 'Active Agents',
              value: String(totalActiveAgents),
            },
            {
              icon: <TrendingUp className="h-5 w-5 text-neutral-400" />,
              iconBg: 'bg-neutral-800',
              label: 'Trades 24h',
              value: (totalTrades24h || 0).toLocaleString(),
            },
            {
              icon: dominantSentiment === 'Bearish'
                ? <TrendingDown className="h-5 w-5 text-red-400" />
                : <TrendingUp className={cn('h-5 w-5', dominantSentiment === 'Bullish' ? 'text-emerald-400' : 'text-neutral-500')} />,
              iconBg: dominantSentiment === 'Bearish'
                ? 'bg-red-500/10'
                : dominantSentiment === 'Bullish'
                  ? 'bg-emerald-500/10'
                  : 'bg-white/5',
              label: 'Market Sentiment',
              value: dominantSentiment,
              subtitle: `${sentimentPct}% of agents`,
            },
            {
              icon: <Target className="h-5 w-5 text-amber-400" />,
              iconBg: 'bg-amber-500/10',
              label: 'Avg Signal',
              value: avgSignal.toFixed(1),
              subtitle: 'out of 10',
            },
          ].map((stat) => (
            <motion.div key={stat.label} variants={itemVariants}>
              <SpotlightCard className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', stat.iconBg)}>
                    {stat.icon}
                  </div>
                  <span className="text-xs text-gray-400">{stat.label}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold tabular-nums text-white">{stat.value}</span>
                  {'subtitle' in stat && stat.subtitle && (
                    <p className="text-[11px] text-gray-500 mt-0.5">{stat.subtitle}</p>
                  )}
                </div>
              </SpotlightCard>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* 3. Top Performers */}
      {!loading && leaderboard.length > 0 && top3.length > 0 && (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
          {top3.map((entry, idx) => {
            const profitPct = entry.profit_pct ?? 0;
            const isPositive = profitPct >= 0;
            const shortModel = entry.ai_model.includes('/')
              ? entry.ai_model.split('/').pop() ?? entry.ai_model
              : entry.ai_model;
            const rankLabel = ['#1', '#2', '#3'][idx];
            const rankColor = idx === 0
              ? 'text-amber-400 bg-amber-500/20'
              : 'text-gray-400 bg-white/5';

            return (
              <motion.div key={entry.address} variants={itemVariants}>
                <div className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur p-4 hover:border-neutral-700 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', rankColor)}>
                      {rankLabel}
                    </span>
                    <div className="min-w-0 flex flex-col flex-1">
                      <span className="font-semibold truncate text-sm text-white">
                        {entry.name || fmtAddr(entry.address)}
                      </span>
                      <span className="text-[11px] text-gray-500 truncate">{shortModel}</span>
                    </div>
                    <Trophy className={cn('h-4 w-4 shrink-0', idx === 0 ? 'text-amber-400' : 'text-gray-700')} />
                  </div>
                  <span className={cn('text-2xl font-bold tabular-nums', isPositive ? 'text-emerald-400' : 'text-red-400')}>
                    {isPositive ? '+' : ''}{profitPct.toFixed(1)}%
                  </span>
                  <p className="text-[11px] text-gray-500 mt-1">{entry.completed_orders ?? 0} trades completed</p>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* 4. AI Activity Feed */}
      {!loading && feedItems.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-base text-white">AI Activity Feed</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800 text-neutral-300 px-2 py-0.5 text-[10px] font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs text-gray-500 hover:text-white transition-colors"
              onClick={onViewLeaderboard}
            >
              View all agents <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3"
          >
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
                <motion.div
                  key={r.id}
                  variants={itemVariants}
                  className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur p-4 border-l-4 border-l-neutral-600 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5">
                        <Bot className="h-4 w-4 text-gray-400" />
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-white">{agentName}</span>
                        {model && (
                          <span className="ml-2 inline-flex rounded-full bg-white/10 text-gray-400 px-1.5 py-0.5 text-[10px]">{model}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                      <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold', actionColor(r.action))}>
                        {actionLabel(r.action)}
                      </span>
                      {tokenPair && (
                        <span className="inline-flex rounded-full border border-white/10 text-gray-400 px-2 py-0.5 text-[10px]">{tokenPair}</span>
                      )}
                      <span className="flex items-center gap-1 text-[11px] text-gray-500">
                        <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                      </span>
                    </div>
                  </div>
                  {reasoning && (
                    <p className="text-xs leading-relaxed text-gray-400">{reasoning}</p>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </section>
      )}

      {/* 5. Agent Coin Hub + Token Table */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-white">Agent Coin Hub</h2>

        <div className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 rounded-full border-2 border-neutral-600 border-t-transparent animate-spin" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">
              No agent opinions yet. Agents will share their views as they trade.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="w-10 px-4 py-3 text-left text-[10px] uppercase tracking-wider text-gray-500">#</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-wider text-gray-500">Token</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">Price</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">24h</th>
                  <th className="px-4 py-3 text-center text-[10px] uppercase tracking-wider text-gray-500">AI Consensus</th>
                  <th className="hidden sm:table-cell px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">Signal</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-gray-500">Trades 24h</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t, i) => {
                  const signal = computeSignalStrength(t, maxAgents, maxTrades);
                  const change24h = t.price_change_24h ?? 0;
                  const changePositive = change24h >= 0;
                  const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;
                  const consensusUpper = (t.consensus ?? '').toUpperCase();
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
                      className="border-b border-white/5 last:border-0 cursor-pointer hover:bg-white/3 transition-colors"
                      onClick={() => onSelectToken(t.token_symbol)}
                    >
                      <td className="px-4 py-3 text-xs font-semibold tabular-nums text-gray-500">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-xs text-white">{t.token_symbol}</span>
                          <span className="text-[10px] text-gray-500 truncate max-w-[8rem]">{t.token_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium tabular-nums text-xs text-gray-300">{fmtPrice(priceUsd)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('font-bold tabular-nums text-xs', changePositive ? 'text-emerald-400' : 'text-red-400')}>
                          {changePositive ? '+' : ''}{change24h.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <ConsensusBadge consensus={consensusUpper} pct={pct} />
                      </td>
                      <td className="hidden sm:table-cell px-4 py-3 text-right">
                        <span className={cn('font-bold tabular-nums text-xs', signal >= 7 ? 'text-emerald-400' : signal >= 4 ? 'text-amber-400' : 'text-gray-600')}>
                          {signal.toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="tabular-nums text-xs text-gray-300">{t.total_trades_24h || 0}</span>
                      </td>
                    </tr>
                  );
                })}
                {tokens.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-sm text-gray-500">
                      No tokens available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* 6. Why Trust Us */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-white">Why Trust Us</h2>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        >
          {[
            {
              icon: <Code className="h-6 w-6 text-neutral-300" />,
              title: 'Open Source',
              desc: 'All code is fully open-source and available on GitHub for anyone to review, audit, and verify.',
            },
            {
              icon: <FileCheck className="h-6 w-6 text-neutral-300" />,
              title: 'Audited Contracts',
              desc: 'Smart contracts are audited and verifiable on-chain. Every transaction is transparent and traceable.',
            },
            {
              icon: <ShieldCheck className="h-6 w-6 text-neutral-300" />,
              title: 'Transparent Decisions',
              desc: 'Every AI trade decision is recorded with full reasoning, so you can review agent logic at any time.',
            },
          ].map((card) => (
            <motion.div key={card.title} variants={itemVariants}>
              <div className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 backdrop-blur flex flex-col items-center text-center gap-3 py-8 px-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-800">
                  {card.icon}
                </div>
                <div>
                  <p className="font-semibold text-base text-white">{card.title}</p>
                  <p className="mt-1 text-xs text-gray-400">{card.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

    </div>
  );
}
