import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, TrendingUp, TrendingDown, Target, Rocket, ArrowLeft, Users, Clock, Loader2 } from 'lucide-react';
import {
  getTokenOpinions,
  getTokenOpinionDetail,
  getRaceAiResponses,
  type TokenOpinionSummary,
  type AiResponse,
  type PublicApiConfig,
} from '@/lib/api';
import { Button } from '@/v2/components/ui/button';
import { Card, CardContent } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/v2/components/ui/table';
import { Skeleton } from '@/v2/components/ui/skeleton';
import { CandlestickChart } from '@/v2/components/CandlestickChart';

const TOKEN_LOGOS: Record<string, string> = {
  AGNT: '/agnt-token.png?v=2',
  TON: 'https://assets.dedust.io/images/ton.webp',
  NOT: 'https://assets.dedust.io/images/not.webp',
  BUILD: 'https://cdn.joincommunity.xyz/build/build_logo.png',
  USDT: 'https://assets.dedust.io/images/usdt.webp',
};

const TOKEN_COLORS: Record<string, string> = {
  AGNT: '#F5A623',
  NOT: '#4A90D9',
  BUILD: '#50C878',
  USDT: '#50C878',
  TON: '#888',
};

function TokenIcon({ symbol, size = 'h-4 w-4' }: { symbol: string; size?: string }) {
  const logo = TOKEN_LOGOS[symbol];
  if (logo) {
    return <img src={logo} alt={symbol} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  return <span className={`${size} rounded-full shrink-0`} style={{ background: TOKEN_COLORS[symbol] ?? '#888' }} />;
}

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

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

export function AgentHubPage() {
  const navigate = useNavigate();
  const { token: tokenParam } = useParams<{ token?: string }>();
  const raceCfg: PublicApiConfig = { baseUrl: API_BASE };

  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTokenOpinions(raceCfg);
      setTokens((Array.isArray(data) ? data : []).sort((a, b) => b.total_trades_24h - a.total_trades_24h));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!tokenParam) {
      void loadList();
    }
  }, [tokenParam, loadList]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));
  const totalActiveAgents = tokens.reduce((sum, t) => sum + t.active_agents, 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

  const bullishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BULLISH').length;
  const bearishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BEARISH').length;
  const dominantSentiment = bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct = tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;
  const avgSignal = tokens.length > 0
    ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) / tokens.length
    : 0;

  /* ---- Token detail view ---- */
  if (tokenParam) {
    const symbol = tokenParam.toUpperCase();
    return <TokenDetailView symbol={symbol} raceCfg={raceCfg} onBack={() => navigate('/agent-hub')} />;
  }

  /* ---- Hub overview ---- */
  // Featured token: prefer AGNT, fallback to first with most trades
  const featured = tokens.find((t) => t.token_symbol === 'AGNT') ?? tokens[0];

  return (
    <div className="flex flex-col gap-5">
      {/* Title + description */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agent Hub</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live market data and AI-driven sentiment for TON ecosystem tokens.
          </p>
        </div>
        <Button onClick={() => navigate('/trader/deploy')}>
          <Rocket className="h-4 w-4 mr-2" /> Deploy Agent
        </Button>
      </div>

      {/* Top stats row — compact */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Active Agents</p>
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mt-1 font-mono tabular-nums">{totalActiveAgents}</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Trades 24h</p>
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mt-1 font-mono tabular-nums">{totalTrades24h.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sentiment</p>
                {dominantSentiment === 'Bearish' ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> : <TrendingUp className="h-3.5 w-3.5 text-green-500" />}
              </div>
              <p className={`text-xl font-bold mt-1 ${dominantSentiment === 'Bullish' ? 'text-green-500' : dominantSentiment === 'Bearish' ? 'text-red-500' : ''}`}>
                {dominantSentiment}
              </p>
              <p className="text-[10px] text-muted-foreground">{sentimentPct}% of agents</p>
            </CardContent>
          </Card>
          <Card className="py-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Avg Signal</p>
                <Target className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="text-xl font-bold mt-1 font-mono tabular-nums">{avgSignal.toFixed(1)}<span className="text-xs text-muted-foreground font-normal">/10</span></p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Featured token chart */}
      {!loading && featured && (
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <TokenIcon symbol={featured.token_symbol} size="h-10 w-10" />
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{featured.token_symbol}</h2>
                    <span className="text-xs text-muted-foreground">{featured.token_name}</span>
                    <Badge variant="outline" className="text-[9px] px-1.5 h-4">Featured</Badge>
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-xl font-bold font-mono tabular-nums">{fmtPrice(featured.price_usd ?? 0)}</span>
                    <span className={`text-xs font-bold font-mono tabular-nums ${(featured.price_change_24h ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {(featured.price_change_24h ?? 0) >= 0 ? '+' : ''}{(featured.price_change_24h ?? 0).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate(`/agent-hub/${featured.token_symbol}`)}>
                View details
              </Button>
            </div>
            <CandlestickChart
              raceCfg={raceCfg}
              fromSymbol="TON"
              toSymbol={featured.token_symbol === 'TON' ? 'USDT' : featured.token_symbol}
              height={220}
            />
          </CardContent>
        </Card>
      )}

      {/* Token list title */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <h2 className="text-xl font-bold">All Tokens</h2>
        <span className="text-xs text-muted-foreground">Click any row to drill down</span>
      </div>

      {/* Token table */}
      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-red-500">{error}</p>
          ) : loading ? (
            <div className="p-6"><Skeleton className="h-40 w-full" /></div>
          ) : tokens.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No agent opinions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-b-border/60">
                  <TableHead className="w-10 text-[10px] uppercase tracking-wider">#</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-wider">Token</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">Price</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">24h %</TableHead>
                  <TableHead className="text-center text-[10px] uppercase tracking-wider">AI Consensus</TableHead>
                  <TableHead className="text-right hidden md:table-cell text-[10px] uppercase tracking-wider">Signal</TableHead>
                  <TableHead className="text-right hidden sm:table-cell text-[10px] uppercase tracking-wider">Agents</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-wider">Trades 24h</TableHead>
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
                  const isPositive = change24h >= 0;

                  return (
                    <TableRow
                      key={t.token_symbol}
                      className="cursor-pointer hover:bg-accent/40 border-b-border/30"
                      onClick={() => navigate(`/agent-hub/${t.token_symbol}`)}
                    >
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <TokenIcon symbol={t.token_symbol} size="h-7 w-7" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm font-bold leading-tight">{t.token_symbol}</span>
                            <span className="text-[10px] text-muted-foreground leading-tight truncate max-w-[10rem]">{t.token_name}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums font-medium">{fmtPrice(priceUsd)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm tabular-nums font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                        <span className="inline-flex items-center gap-0.5 justify-end">
                          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {isPositive ? '+' : ''}{change24h.toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`gap-1 ${consensusUpper === 'BULLISH' ? 'bg-green-600 text-white border-green-600' : consensusUpper === 'BEARISH' ? 'bg-red-600 text-white border-red-600' : ''}`} variant={consensusUpper === 'BULLISH' || consensusUpper === 'BEARISH' ? undefined : 'secondary'}>
                          {consensusUpper === 'BULLISH' && <TrendingUp className="h-3 w-3" />}
                          {consensusUpper === 'BEARISH' && <TrendingDown className="h-3 w-3" />}
                          {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden md:table-cell">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${signal >= 7 ? 'bg-green-500' : signal >= 4 ? 'bg-yellow-500' : 'bg-muted-foreground/50'}`}
                              style={{ width: `${Math.min(100, signal * 10)}%` }}
                            />
                          </div>
                          <span className={`font-mono text-xs tabular-nums font-bold ${signal >= 7 ? 'text-green-500' : signal >= 4 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {signal.toFixed(1)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell font-mono text-xs tabular-nums text-muted-foreground">{t.active_agents}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">{t.total_trades_24h.toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function fmtPriceDetail(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

const TOKEN_DECIMALS: Record<string, number> = { USDT: 6, USDC: 6 };

function fmtNano(nano: string, token?: string): string {
  const decimals = TOKEN_DECIMALS[(token ?? '').toUpperCase()] ?? 9;
  const n = Number(nano) / 10 ** decimals;
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtAddrShort(addr: string): string {
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

function TokenDetailView({ symbol, raceCfg, onBack }: { symbol: string; raceCfg: PublicApiConfig; onBack: () => void }) {
  const [stats, setStats] = useState<TokenOpinionSummary | null>(null);
  const [responses, setResponses] = useState<AiResponse[]>([]);
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
      const [statsData, feedData] = await Promise.all([
        off === 0 ? getTokenOpinionDetail(raceCfg, symbol, { limit: 0 }) : null,
        getRaceAiResponses(raceCfg, {
          limit: PAGE_SIZE,
          offset: off,
          actions: ['create_order'],
          tokenSymbol: symbol,
        }),
      ]);
      if (statsData) setStats(statsData.stats);
      const relevant = feedData.results.filter((r) => {
        const pp = r.parsed_params ?? {};
        return (pp.to_token as string)?.toUpperCase() === symbol || (pp.from_token as string)?.toUpperCase() === symbol;
      });
      setTotal(feedData.total);
      setResponses((prev) => (append ? [...prev, ...relevant] : relevant));
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
      <div className="flex justify-center py-8">
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" size="sm" onClick={onBack} className="self-start">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  const changePositive = (stats?.price_change_24h ?? 0) >= 0;
  const bullPct = stats?.bullish_pct ?? 0;
  const bearPct = stats?.bearish_pct ?? 0;
  const consensusUpper = (stats?.consensus ?? '').toUpperCase();

  const chartFrom = 'TON';
  const chartTo = symbol === 'TON' ? 'USDT' : symbol;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Left sidebar */}
      <div className="lg:w-64 lg:sticky lg:top-24 lg:self-start shrink-0 flex flex-col gap-3">
        {/* Back to Hub — moved to top */}
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start h-7 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back to Hub
        </Button>

        {/* Token header */}
        <div className="flex items-center gap-2.5">
          <TokenIcon symbol={symbol} size="h-10 w-10" />
          <div className="flex flex-col min-w-0">
            <span className="text-lg font-bold leading-tight truncate">{stats?.token_symbol}</span>
            <span className="text-xs text-muted-foreground truncate">{stats?.token_name}</span>
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums font-mono">{fmtPriceDetail(stats?.price_usd ?? 0)}</span>
          <span className={`flex items-center gap-0.5 text-xs font-bold tabular-nums font-mono ${changePositive ? 'text-green-500' : 'text-red-500'}`}>
            {changePositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {changePositive ? '+' : ''}{(stats?.price_change_24h ?? 0).toFixed(1)}%
          </span>
        </div>

        {/* Sentiment */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Sentiment</span>
            <Badge className={`h-4 px-1.5 text-[9px] ${consensusUpper === 'BULLISH' ? 'bg-green-600 text-white border-green-600' : consensusUpper === 'BEARISH' ? 'bg-red-600 text-white border-red-600' : ''}`} variant={consensusUpper === 'BULLISH' || consensusUpper === 'BEARISH' ? undefined : 'secondary'}>
              {consensusUpper || 'NEUTRAL'}
            </Badge>
          </div>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
            {bullPct > 0 && <div className="bg-green-500" style={{ width: `${bullPct}%` }} />}
            {bearPct > 0 && <div className="bg-red-500" style={{ width: `${bearPct}%` }} />}
          </div>
          <div className="flex justify-between text-[9px] text-muted-foreground">
            <span>{bullPct.toFixed(0)}% Bullish</span>
            <span>{bearPct.toFixed(0)}% Bearish</span>
          </div>
        </div>

        {/* Active Agents stats — compact 3 cards */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Active Agents</span>
          <div className="grid grid-cols-3 gap-1.5">
            <Card className="py-0">
              <CardContent className="flex flex-col items-center justify-center p-2 gap-0.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-sm font-bold tabular-nums leading-none">{stats?.active_agents ?? 0}</span>
                <span className="text-[9px] text-muted-foreground leading-none">Agents</span>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="flex flex-col items-center justify-center p-2 gap-0.5">
                <TrendingUp className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-sm font-bold tabular-nums leading-none">{(stats?.total_trades_24h ?? 0).toLocaleString()}</span>
                <span className="text-[9px] text-muted-foreground leading-none">Trades</span>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardContent className="flex flex-col items-center justify-center p-2 gap-0.5">
                <Target className="h-3 w-3 text-muted-foreground" />
                <span className="font-mono text-sm font-bold tabular-nums leading-none">{((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%</span>
                <span className="text-[9px] text-muted-foreground leading-none">Confidence</span>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Right main column */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Candlestick chart */}
        {stats && (
          <Card>
            <CardContent className="p-4">
              <CandlestickChart raceCfg={raceCfg} fromSymbol={chartFrom} toSymbol={chartTo} />
            </CardContent>
          </Card>
        )}

        {/* Feed header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Agent Trading Feed</h2>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[11px] text-muted-foreground">Live updates</span>
          </div>
        </div>

        {responses.length === 0 ? (
          <Card className="py-0">
            <CardContent className="p-3">
              <span className="text-xs text-muted-foreground">No trade activity on this token yet.</span>
            </CardContent>
          </Card>
        ) : (
          <Card className="py-0 overflow-hidden">
            <div className="divide-y divide-border/30">
              {responses.map((r) => {
                const pp = r.parsed_params ?? {};
                const fromToken = pp.from_token as string | undefined;
                const toToken = pp.to_token as string | undefined;
                const amount = pp.amount as string | undefined;
                const shortReason = pp.short_reason as string | undefined;
                const humanOpinion = pp.human_opinion as string | undefined;
                const reasoning = pp.reasoning as string | undefined;
                const isBuy = toToken?.toUpperCase() === symbol;
                const title = shortReason || humanOpinion || reasoning || '';
                const body = (shortReason && (humanOpinion || reasoning)) ? (humanOpinion || reasoning) : '';
                const amountText = amount && amount !== '0' && fromToken ? `${fmtNano(amount, fromToken)} ${fromToken}` : '';

                return (
                  <div
                    key={r.id}
                    className={`relative px-3 py-2 hover:bg-accent/20 transition-colors border-l-2 ${isBuy ? 'border-l-green-500/70' : 'border-l-red-500/70'}`}
                  >
                    {/* Row 1: avatar + name + badges */}
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${isBuy ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                        <Bot className="h-3 w-3" />
                      </div>
                      <span className="text-xs font-bold truncate">
                        {r.contract_name || fmtAddrShort(r.smart_contract_id)}
                      </span>
                      <Badge className={`h-4 px-1.5 text-[9px] shrink-0 ${isBuy ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'}`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </Badge>
                      {(fromToken || toToken) && (
                        <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono shrink-0">
                          {fromToken}→{toToken}
                        </Badge>
                      )}
                      {amountText && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {amountText}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(r.created_at)}
                      </span>
                    </div>

                    {/* Row 2: title (short reason) + optional body (full reasoning) */}
                    {title && (
                      <p className="pl-7 text-xs leading-snug text-foreground">{title}</p>
                    )}
                    {body && body !== title && (
                      <p className="pl-7 text-[11px] leading-snug text-muted-foreground line-clamp-2 mt-0.5">{body}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {responses.length < total && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="self-center"
          >
            {loadingMore ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            Load more
          </Button>
        )}
      </div>
    </div>
  );
}
