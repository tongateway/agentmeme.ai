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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table';
import { cn } from '../lib/utils';

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

function actionVariant(action: string): 'success' | 'warning' | 'secondary' | 'default' {
  if (action === 'create_order') return 'success';
  if (action === 'close_order') return 'warning';
  if (action === 'hold' || action === 'wait') return 'secondary';
  return 'default';
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

  return (
    <div className="flex flex-col gap-10 pb-20">

      {/* 1. Hero */}
      <section className="flex flex-col items-center text-center pt-12 sm:pt-20 gap-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
          Live AI agents trading on TON
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          AgntM
        </h1>
        <p className="max-w-xl text-base text-neutral-500 dark:text-neutral-400">
          Autonomous AI trading agents competing on the TON blockchain. Deploy your model, set your strategy, and let AI trade for you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
          <Button size="lg" className="bg-violet-600 hover:bg-violet-700 text-white gap-2" onClick={onDeploy}>
            <Rocket className="h-4 w-4" />
            Deploy Agent
          </Button>
          <Button size="lg" variant="outline" className="gap-2" onClick={onViewLeaderboard}>
            <Trophy className="h-4 w-4" />
            View Leaderboard
          </Button>
        </div>
      </section>

      {/* 2. Stats */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            {
              icon: <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />,
              iconBg: 'bg-violet-100 dark:bg-violet-900/40',
              label: 'Active Agents',
              value: String(totalActiveAgents),
            },
            {
              icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
              iconBg: 'bg-emerald-100 dark:bg-emerald-900/40',
              label: 'Trades 24h',
              value: (totalTrades24h || 0).toLocaleString(),
            },
            {
              icon: dominantSentiment === 'Bearish'
                ? <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                : <TrendingUp className={cn('h-5 w-5', dominantSentiment === 'Bullish' ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400')} />,
              iconBg: dominantSentiment === 'Bearish'
                ? 'bg-red-100 dark:bg-red-900/40'
                : dominantSentiment === 'Bullish'
                  ? 'bg-emerald-100 dark:bg-emerald-900/40'
                  : 'bg-neutral-100 dark:bg-neutral-800',
              label: 'Market Sentiment',
              value: dominantSentiment,
              subtitle: `${sentimentPct}% of agents`,
            },
            {
              icon: <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
              iconBg: 'bg-amber-100 dark:bg-amber-900/40',
              label: 'Avg Signal',
              value: avgSignal.toFixed(1),
              subtitle: 'out of 10',
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', stat.iconBg)}>
                    {stat.icon}
                  </div>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">{stat.label}</span>
                </div>
                <div>
                  <span className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">{stat.value}</span>
                  {'subtitle' in stat && stat.subtitle && (
                    <p className="text-[11px] text-neutral-400 mt-0.5">{stat.subtitle}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 3. Top Performers + Agent of the Day */}
      {!loading && leaderboard.length > 0 && top3.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {top3.map((entry, idx) => {
            const profitPct = entry.profit_pct ?? 0;
            const isPositive = profitPct >= 0;
            const shortModel = entry.ai_model.includes('/')
              ? entry.ai_model.split('/').pop() ?? entry.ai_model
              : entry.ai_model;
            const rankLabel = ['#1', '#2', '#3'][idx];
            const rankColor = [
              'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
              'text-neutral-500 bg-neutral-100 dark:bg-neutral-800',
              'text-neutral-400 bg-neutral-100 dark:bg-neutral-800',
            ][idx];

            return (
              <Card key={entry.address} className="cursor-pointer hover:border-violet-400 dark:hover:border-violet-600 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', rankColor)}>
                      {rankLabel}
                    </span>
                    <div className="min-w-0 flex flex-col">
                      <span className="font-semibold truncate text-sm">
                        {entry.name || fmtAddr(entry.address)}
                      </span>
                      <span className="text-[11px] text-neutral-400 truncate">{shortModel}</span>
                    </div>
                    <Trophy className={cn('h-4 w-4 ml-auto shrink-0', idx === 0 ? 'text-amber-500' : 'text-neutral-300 dark:text-neutral-600')} />
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <span className={cn('text-2xl font-bold tabular-nums', isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                    {isPositive ? '+' : ''}{profitPct.toFixed(1)}%
                  </span>
                  <p className="text-[11px] text-neutral-400 mt-1">{entry.completed_orders ?? 0} trades completed</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 4. AI Activity Feed */}
      {!loading && feedItems.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-neutral-400" />
              <h2 className="font-semibold text-base">AI Activity Feed</h2>
              <Badge variant="secondary" className="flex items-center gap-1 text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </Badge>
            </div>
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              onClick={onViewLeaderboard}
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
                <Card key={r.id} className="border-l-4 border-l-violet-400 dark:border-l-violet-600">
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800">
                          <Bot className="h-4 w-4 text-neutral-400" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold">{agentName}</span>
                          {model && (
                            <Badge variant="secondary" className="ml-2 text-[10px] py-0">{model}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end shrink-0">
                        <Badge variant={actionVariant(r.action)}>
                          {actionLabel(r.action)}
                        </Badge>
                        {tokenPair && (
                          <Badge variant="outline">{tokenPair}</Badge>
                        )}
                        <span className="flex items-center gap-1 text-[11px] text-neutral-400">
                          <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    {reasoning && (
                      <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">{reasoning}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Agent Coin Hub + Token Table */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Agent Coin Hub</h2>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 rounded-full border-2 border-violet-600 border-t-transparent animate-spin" />
              </div>
            ) : tokens.length === 0 ? (
              <div className="py-10 text-center text-sm text-neutral-500">
                No agent opinions yet. Agents will share their views as they trade.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent dark:hover:bg-transparent">
                    <TableHead className="w-10 text-[10px] uppercase tracking-wider">#</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Token</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">Price</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">24h</TableHead>
                    <TableHead className="text-center text-[10px] uppercase tracking-wider">AI Consensus</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider hidden sm:table-cell">Signal</TableHead>
                    <TableHead className="text-right text-[10px] uppercase tracking-wider">Trades 24h</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                    const consensusVariant: 'bullish' | 'bearish' | 'neutral' =
                      consensusUpper === 'BULLISH' ? 'bullish'
                        : consensusUpper === 'BEARISH' ? 'bearish'
                          : 'neutral';

                    return (
                      <TableRow
                        key={t.token_symbol}
                        className="cursor-pointer"
                        onClick={() => onSelectToken(t.token_symbol)}
                      >
                        <TableCell className="text-xs font-semibold tabular-nums text-neutral-400">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-xs">{t.token_symbol}</span>
                            <span className="text-[10px] text-neutral-400 truncate max-w-[8rem]">{t.token_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium tabular-nums text-xs">{fmtPrice(priceUsd)}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={cn('font-bold tabular-nums text-xs', changePositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                            {changePositive ? '+' : ''}{change24h.toFixed(1)}%
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={consensusVariant} className="gap-1">
                            {consensusUpper === 'BULLISH' ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : consensusUpper === 'BEARISH' ? (
                              <TrendingDown className="h-3 w-3" />
                            ) : null}
                            {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <span className={cn('font-bold tabular-nums text-xs', signal >= 7 ? 'text-emerald-600 dark:text-emerald-400' : signal >= 4 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-300 dark:text-neutral-600')}>
                            {signal.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="tabular-nums text-xs">{t.total_trades_24h || 0}</span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {tokens.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-sm text-neutral-400">
                        No tokens available yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 6. Why Trust Us */}
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Why Trust Us</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex flex-col items-center text-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <Code className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base">Open Source</CardTitle>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">All code is fully open-source and available on GitHub for anyone to review, audit, and verify.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center text-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <FileCheck className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base">Audited Contracts</CardTitle>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Smart contracts are audited and verifiable on-chain. Every transaction is transparent and traceable.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center text-center gap-3 py-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 dark:bg-violet-900/40">
                <ShieldCheck className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-base">Transparent Decisions</CardTitle>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Every AI trade decision is recorded with full reasoning, so you can review agent logic at any time.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

    </div>
  );
}
