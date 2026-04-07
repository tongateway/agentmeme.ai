import { useCallback, useEffect, useState } from 'react';
import { Bot, TrendingUp, TrendingDown, Target, ChevronRight, Trophy, Rocket } from 'lucide-react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
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

type AgentHubPageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy?: () => void;
  onViewLeaderboard?: () => void;
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

/* ---------- AgentHubPage ---------- */

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

  useEffect(() => { void load(); }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));

  const totalActiveAgents = tokens.reduce((sum, t) => sum + t.active_agents, 0);
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

  const top3 = [...leaderboard]
    .sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity))
    .slice(0, 3);

  return (
    <div className="mt-4 flex flex-col gap-6">

      {/* 1. Stats Row */}
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
              label: 'Trades (24h)',
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
              label: 'Avg Signal Strength',
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

      {/* 2. Agent Spotlight — top 3 */}
      {!loading && top3.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <h2 className="font-semibold text-base">Agent Spotlight</h2>
            </div>
            {onViewLeaderboard && (
              <button
                type="button"
                className="flex items-center gap-0.5 text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
                onClick={onViewLeaderboard}
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <Card key={entry.address} className="hover:border-violet-400 dark:hover:border-violet-600 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold', rankColor)}>
                        {rankLabel}
                      </span>
                      <div className="min-w-0 flex flex-col flex-1">
                        <CardTitle className="text-sm truncate">
                          {entry.name || fmtAddr(entry.address)}
                        </CardTitle>
                        <span className="text-[11px] text-neutral-400 truncate">{shortModel}</span>
                      </div>
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
        </div>
      )}

      {/* 3. Title + Deploy Button */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">Agent Coin Hub</h2>
        {onDeploy && (
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white gap-2 shrink-0"
            onClick={onDeploy}
          >
            <Rocket className="h-4 w-4" />
            Deploy Agent
          </Button>
        )}
      </div>

      {/* 4. Token Table */}
      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="py-6 px-4 text-sm text-red-500 dark:text-red-400">{error}</div>
          ) : loading ? (
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

    </div>
  );
}
