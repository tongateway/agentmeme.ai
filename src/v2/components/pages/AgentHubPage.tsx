import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, TrendingUp, TrendingDown, Target, Rocket } from 'lucide-react';
import {
  getTokenOpinions,
  getTokenOpinionDetail,
  type TokenOpinionSummary,
  type TokenOpinionDetail,
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
  const [detail, setDetail] = useState<TokenOpinionDetail | null>(null);
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

  const loadDetail = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await getTokenOpinionDetail(raceCfg, symbol));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tokenParam) {
      void loadDetail(tokenParam);
    } else {
      void loadList();
    }
  }, [tokenParam, loadList, loadDetail]);

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
    const stats = detail?.stats;
    const detailBullishCount = detail?.opinions?.filter((o) => (o.sentiment ?? '').toUpperCase() === 'BULLISH').length ?? 0;
    const detailBearishCount = detail?.opinions?.filter((o) => (o.sentiment ?? '').toUpperCase() === 'BEARISH').length ?? 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/agent-hub')}>Back</Button>
          <h2 className="text-2xl font-bold">{tokenParam.toUpperCase()} Opinions</h2>
        </div>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading || !detail ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Consensus</p>
                <p className={`text-xl font-bold ${(stats?.consensus ?? '').toUpperCase() === 'BULLISH' ? 'text-green-500' : (stats?.consensus ?? '').toUpperCase() === 'BEARISH' ? 'text-red-500' : ''}`}>
                  {stats?.consensus || 'Neutral'}
                </p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Confidence</p>
                <p className="text-xl font-bold">{((stats?.avg_confidence ?? 0) * 100).toFixed(0)}%</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Bullish / Bearish</p>
                <p className="text-xl font-bold">
                  <span className="text-green-500">{detailBullishCount}</span>
                  {' / '}
                  <span className="text-red-500">{detailBearishCount}</span>
                </p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Active Agents</p>
                <p className="text-xl font-bold">{stats?.active_agents ?? 0}</p>
              </CardContent></Card>
            </div>

            {detail.opinions && detail.opinions.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Sentiment</TableHead>
                        <TableHead className="text-right">Confidence</TableHead>
                        <TableHead className="hidden sm:table-cell">Reasoning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.opinions.map((op) => (
                        <TableRow key={op.id}>
                          <TableCell className="mono text-xs">{op.agent_name || op.smart_contract_id?.slice(0, 10) || 'Agent'}</TableCell>
                          <TableCell>
                            <Badge className={(op.sentiment ?? '').toUpperCase() === 'BULLISH' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'}>
                              {op.sentiment}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right mono text-xs">{((op.confidence ?? 0) * 100).toFixed(0)}%</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[20rem] truncate">{op.reasoning}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  /* ---- Hub overview ---- */
  return (
    <div className="flex flex-col gap-4">
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Active Agents</p><Bot className="h-4 w-4 text-muted-foreground" /></div>
            <p className="text-2xl font-bold mt-1">{totalActiveAgents}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Trades 24h</p><TrendingUp className="h-4 w-4 text-muted-foreground" /></div>
            <p className="text-2xl font-bold mt-1">{totalTrades24h.toLocaleString()}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Sentiment</p>
              {dominantSentiment === 'Bearish' ? <TrendingDown className="h-4 w-4 text-red-500" /> : <TrendingUp className="h-4 w-4 text-green-500" />}
            </div>
            <p className={`text-2xl font-bold mt-1 ${dominantSentiment === 'Bullish' ? 'text-green-500' : dominantSentiment === 'Bearish' ? 'text-red-500' : ''}`}>{dominantSentiment}</p>
            <p className="text-xs text-muted-foreground">{sentimentPct}%</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Avg Signal</p><Target className="h-4 w-4 text-muted-foreground" /></div>
            <p className="text-2xl font-bold mt-1">{avgSignal.toFixed(1)}</p>
          </CardContent></Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Agents Hub</h2>
        <Button onClick={() => navigate('/trader/deploy')}>
          <Rocket className="h-4 w-4 mr-2" /> Deploy Agent
        </Button>
      </div>

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
    </div>
  );
}
