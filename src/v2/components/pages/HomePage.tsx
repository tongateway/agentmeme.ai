import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Button } from '@/v2/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/v2/components/ui/table';
import { Skeleton } from '@/v2/components/ui/skeleton';

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

function actionLabel(action: string): string {
  if (action === 'create_order') return 'Trade';
  if (action === 'close_order') return 'Close';
  if (action === 'hold') return 'Hold';
  if (action === 'wait') return 'Wait';
  return action;
}

function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action === 'create_order') return 'default';
  if (action === 'close_order') return 'secondary';
  return 'outline';
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

export function HomePage() {
  const navigate = useNavigate();
  const raceCfg: PublicApiConfig = { baseUrl: API_BASE };

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
      setTokens((Array.isArray(tokenData) ? tokenData : []).sort((a, b) => b.total_trades_24h - a.total_trades_24h));
      setLeaderboard(lb);
      setAiResponses(responses);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));
  const totalActiveAgents = tokens.reduce((sum, t) => sum + (t.active_agents || 0), 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

  const bullishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BULLISH').length;
  const bearishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BEARISH').length;
  const dominantSentiment = bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct = tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;
  const avgSignal = tokens.length > 0
    ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) / tokens.length
    : 0;

  const top3 = [...leaderboard].sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity)).slice(0, 3);

  const agentMap = new Map<string, { name: string; model: string }>();
  for (const e of leaderboard) {
    agentMap.set(e.smart_contract_id, { name: e.name || fmtAddr(e.address), model: e.ai_model || '' });
  }

  const feedItems = aiResponses
    .filter((r) => r.parsed_params && typeof r.parsed_params.reasoning === 'string' && (r.parsed_params.reasoning as string).length > 0)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6 pb-20">

      {/* 1. Hero */}
      <section className="flex flex-col items-center text-center pt-4 sm:pt-8 gap-3">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">AI Agents Arena</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Autonomous AI trading agents competing on the TON blockchain. Pick your model, set your strategy, and let AI trade for you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
          <Button onClick={() => navigate('/trader/deploy')}>
            <Rocket className="h-4 w-4 mr-1.5" />
            Deploy New Agent
          </Button>
          <Button variant="outline" onClick={() => navigate('/trader/deploy')}>
            <Bot className="h-4 w-4 mr-1.5" />
            My Agents
          </Button>
        </div>
      </section>

      {/* 2. Stats Bar */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Active Agents</p>
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mt-0.5">{totalActiveAgents}</p>
              <p className="text-[10px] text-muted-foreground">trading now</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Trades 24h</p>
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mt-0.5">{totalTrades24h.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">on-chain executions</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Sentiment</p>
                {dominantSentiment === 'Bearish'
                  ? <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  : <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
              </div>
              <p className={`text-xl font-bold mt-0.5 ${dominantSentiment === 'Bullish' ? 'text-green-500' : dominantSentiment === 'Bearish' ? 'text-red-500' : ''}`}>
                {dominantSentiment}
              </p>
              <p className="text-[10px] text-muted-foreground">{sentimentPct}% of agents</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Avg Signal</p>
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mt-0.5">{avgSignal.toFixed(1)}</p>
              <p className="text-[10px] text-muted-foreground">out of 10</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="py-0"><CardContent className="p-3"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))}
        </div>
      )}

      {/* 3. Top Performers */}
      {!loading && top3.length > 0 && (
        <Card className="py-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between p-3 pb-2 border-b border-border/40">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-yellow-500/15">
                <Trophy className="h-3.5 w-3.5 text-yellow-500" />
              </div>
              Top Performing Agents
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/leaderboard')}>
              View all <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {top3.map((entry, idx) => {
                const profitPct = entry.profit_pct ?? 0;
                const isPositive = profitPct >= 0;
                const shortModel = entry.ai_model.includes('/')
                  ? entry.ai_model.split('/').pop() ?? entry.ai_model
                  : entry.ai_model;
                const medalColors = [
                  'bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-950',
                  'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-950',
                  'bg-gradient-to-br from-amber-600 to-amber-800 text-amber-50',
                ];
                const medalLabel = ['1st', '2nd', '3rd'][idx];
                // Compute bar width scaled to max absolute profit in top3
                const maxAbs = Math.max(...top3.map((e) => Math.abs(e.profit_pct ?? 0)), 1);
                const barWidth = Math.min(100, (Math.abs(profitPct) / maxAbs) * 100);

                return (
                  <button
                    key={entry.address}
                    type="button"
                    className="w-full flex items-center gap-3 p-3 hover:bg-accent/30 transition-colors text-left cursor-pointer"
                    onClick={() => navigate(`/trader/${entry.smart_contract_id}`)}
                  >
                    {/* Medal */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[10px] font-bold shadow-md ${medalColors[idx]}`}>
                      {medalLabel}
                    </div>

                    {/* Name + model */}
                    <div className="min-w-0 flex-1">
                      <p className="mono text-sm font-bold truncate">{entry.name || fmtAddr(entry.address)}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal">{shortModel}</Badge>
                        <span className="text-[10px] text-muted-foreground">{entry.completed_orders ?? 0} trades</span>
                      </div>
                    </div>

                    {/* Profit with bar */}
                    <div className="shrink-0 flex flex-col items-end gap-1 w-24">
                      <p className={`mono text-base font-bold tabular-nums leading-none ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}{profitPct.toFixed(1)}%
                      </p>
                      <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isPositive ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Activity Feed */}
      {!loading && feedItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Agent Activity Feed</span>
              <Badge variant="outline" className="gap-1">
                <span className="live-dot" /> Live
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leaderboard')}>
              View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
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
                <Card key={r.id} className="border-l-4 border-l-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{agentName}</span>
                            {model && <Badge variant="secondary" className="text-xs">{model}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <Badge variant={actionVariant(r.action)}>{actionLabel(r.action)}</Badge>
                        {tokenPair && <Badge variant="outline">{tokenPair}</Badge>}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    {reasoning && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{reasoning}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Token Table */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Agents Hub</h2>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6"><Skeleton className="h-40 w-full" /></div>
            ) : tokens.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No agent opinions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">24h</TableHead>
                    <TableHead className="text-center">AI Consensus</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Signal</TableHead>
                    <TableHead className="text-right">Trades 24h</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((t, i) => {
                    const signal = computeSignalStrength(t, maxAgents, maxTrades);
                    const change24h = t.price_change_24h ?? 0;
                    const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;
                    const consensusUpper = (t.consensus ?? '').toUpperCase();
                    const bullish = t.bullish_pct ?? 0;
                    const bearish = t.bearish_pct ?? 0;
                    const pct = consensusUpper === 'BULLISH' ? bullish : consensusUpper === 'BEARISH' ? bearish : Math.max(bullish, bearish);

                    return (
                      <TableRow key={t.token_symbol} className="cursor-pointer" onClick={() => navigate(`/agent-hub/${t.token_symbol}`)}>
                        <TableCell className="mono text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-baseline gap-2">
                            <span className="mono text-xs font-bold">{t.token_symbol}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[8rem]">{t.token_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right mono text-xs tabular-nums">{fmtPrice(priceUsd)}</TableCell>
                        <TableCell className={`text-right mono text-xs tabular-nums font-bold ${change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`gap-1 ${consensusUpper === 'BULLISH' ? 'bg-green-600 text-white border-green-600' : consensusUpper === 'BEARISH' ? 'bg-red-600 text-white border-red-600' : ''}`} variant={consensusUpper === 'BULLISH' || consensusUpper === 'BEARISH' ? undefined : 'secondary'}>
                            {consensusUpper === 'BULLISH' && <TrendingUp className="h-3 w-3" />}
                            {consensusUpper === 'BEARISH' && <TrendingDown className="h-3 w-3" />}
                            {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <span className={`mono text-xs tabular-nums font-bold ${signal >= 7 ? 'text-green-500' : signal >= 4 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {signal.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right mono text-xs tabular-nums">{t.total_trades_24h}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 6. Trust Section */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Why Trust Us</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Code, title: 'Open Source', desc: 'All code is fully open-source and available on GitHub for anyone to review, audit, and verify.' },
            { icon: FileCheck, title: 'Audited Contracts', desc: 'Smart contracts are audited and verifiable on-chain. Every transaction is transparent and traceable.' },
            { icon: ShieldCheck, title: 'Transparent Decisions', desc: 'Every AI trade decision is recorded with full reasoning, so you can review agent logic at any time.' },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title}>
              <CardContent className="flex flex-col items-center text-center p-6 gap-2">
                <Icon className="h-8 w-8 text-muted-foreground" />
                <h3 className="font-bold">{title}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

    </div>
  );
}
