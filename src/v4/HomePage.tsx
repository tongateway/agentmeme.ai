import { useEffect, useState } from 'react';
import {
  TrendingUp,
  Bot,
  BarChart2,
  Zap,
  Shield,
  Code2,
  Eye,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './components/ui/card';
import { Badge } from './components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './components/ui/table';
import { Separator } from './components/ui/separator';
import { getTokenOpinions, type TokenOpinionSummary, type PublicApiConfig } from '../lib/api';

export type HomePageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy: () => void;
  onViewLeaderboard: () => void;
};

function formatPrice(price: number | null | undefined): string {
  const p = price ?? 0;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(6)}`;
}

function formatChange(change: number | null | undefined): string {
  const c = change ?? 0;
  const sign = c >= 0 ? '+' : '';
  return `${sign}${c.toFixed(2)}%`;
}

function consensusBadgeVariant(consensus: string): 'bullish' | 'bearish' | 'neutral' {
  const c = consensus.toLowerCase();
  if (c === 'bullish' || c === 'buy') return 'bullish';
  if (c === 'bearish' || c === 'sell') return 'bearish';
  return 'neutral';
}

function MarketSentimentLabel({ tokens }: { tokens: TokenOpinionSummary[] }) {
  if (tokens.length === 0) return <span>—</span>;
  const bullish = tokens.filter((t) => consensusBadgeVariant(t.consensus) === 'bullish').length;
  const bearish = tokens.filter((t) => consensusBadgeVariant(t.consensus) === 'bearish').length;
  if (bullish > bearish) return <span className="text-emerald-600 dark:text-emerald-400">Bullish</span>;
  if (bearish > bullish) return <span className="text-red-500 dark:text-red-400">Bearish</span>;
  return <span className="text-neutral-500">Neutral</span>;
}

export function HomePage({ raceCfg, onSelectToken, onDeploy, onViewLeaderboard }: HomePageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getTokenOpinions(raceCfg)
      .then((data) => {
        if (!cancelled) setTokens(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setTokens([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [raceCfg]);

  const totalActiveAgents = tokens.reduce((sum, t) => sum + (t.active_agents || 0), 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);
  const avgConfidence =
    tokens.length > 0
      ? Math.round(tokens.reduce((sum, t) => sum + (t.avg_confidence || 0), 0) / tokens.length)
      : 0;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50">
      {/* Hero Section */}
      <section className="relative px-4 py-24 sm:py-32 text-center">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live on TON Blockchain
          </div>

          <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            <span className="text-emerald-600 dark:text-emerald-400">AgntM</span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-neutral-500 dark:text-neutral-400 sm:text-xl">
            AI-powered autonomous trading agents on TON blockchain. Deploy your agent,
            set the strategy, and let AI trade for you.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={onDeploy} className="w-full sm:w-auto gap-2">
              <Bot className="h-5 w-5" />
              Deploy Agent
            </Button>
            <Button size="lg" variant="outline" onClick={onViewLeaderboard} className="w-full sm:w-auto gap-2">
              <BarChart2 className="h-5 w-5" />
              View Leaderboard
            </Button>
          </div>
        </div>
      </section>

      <Separator />

      {/* Stats Section */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Platform at a Glance</h2>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">Live metrics from the agent network</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                  <Bot className="h-4 w-4" />
                  <CardDescription>Active Agents</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <p className="text-3xl font-bold">{totalActiveAgents.toLocaleString()}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                  <Zap className="h-4 w-4" />
                  <CardDescription>Trades (24h)</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <p className="text-3xl font-bold">{(totalTrades24h || 0).toLocaleString()}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                  <TrendingUp className="h-4 w-4" />
                  <CardDescription>Market Sentiment</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-8 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <p className="text-3xl font-bold">
                    <MarketSentimentLabel tokens={tokens} />
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                  <BarChart2 className="h-4 w-4" />
                  <CardDescription>Avg Confidence</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-8 w-16 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                ) : (
                  <p className="text-3xl font-bold">{avgConfidence}%</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Separator />

      {/* Why Trust Us */}
      <section className="px-4 py-16 sm:py-20 bg-neutral-50 dark:bg-neutral-900/50">
        <div className="mx-auto max-w-6xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why Trust Us</h2>
            <p className="mt-2 text-neutral-500 dark:text-neutral-400">Built on transparency and verifiable code</p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Card className="border-none bg-white shadow-sm dark:bg-neutral-900">
              <CardHeader>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
                  <Code2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle>Open Source</CardTitle>
                <CardDescription>
                  Every line of code is publicly available on GitHub. Review, fork, or contribute to the protocol.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-none bg-white shadow-sm dark:bg-neutral-900">
              <CardHeader>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
                  <Shield className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle>Audited Contracts</CardTitle>
                <CardDescription>
                  Smart contracts deployed on TON are independently reviewed. Your funds stay in your control.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-none bg-white shadow-sm dark:bg-neutral-900">
              <CardHeader>
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/50">
                  <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle>Transparent Decisions</CardTitle>
                <CardDescription>
                  Every AI trade decision is logged on-chain with full reasoning visible to anyone.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <Separator />

      {/* Token Table */}
      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Token Intelligence</h2>
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">AI consensus across tracked tokens</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onViewLeaderboard} className="gap-1 hidden sm:flex">
              View all
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
              ))}
            </div>
          ) : tokens.length === 0 ? (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 py-16 text-center text-neutral-500 dark:text-neutral-400">
              No tokens available at the moment.
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-neutral-50 dark:bg-neutral-900/80">
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">24h</TableHead>
                    <TableHead className="text-center">AI Consensus</TableHead>
                    <TableHead className="text-right">Trades 24h</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.slice(0, 10).map((token, i) => {
                    const changeDir = token.price_change_24h > 0
                      ? 'up'
                      : token.price_change_24h < 0
                      ? 'down'
                      : 'flat';

                    return (
                      <TableRow
                        key={token.token_symbol}
                        className="cursor-pointer"
                        onClick={() => onSelectToken(token.token_symbol)}
                      >
                        <TableCell className="text-neutral-400 dark:text-neutral-500 text-xs">
                          {i + 1}
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-semibold">{token.token_symbol}</span>
                            {token.token_name && (
                              <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-500 hidden sm:inline">
                                {token.token_name}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatPrice(token.price_usd)}
                        </TableCell>
                        <TableCell className="text-right">
                          <span
                            className={
                              changeDir === 'up'
                                ? 'text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 justify-end'
                                : changeDir === 'down'
                                ? 'text-red-500 dark:text-red-400 inline-flex items-center gap-0.5 justify-end'
                                : 'text-neutral-500 inline-flex items-center gap-0.5 justify-end'
                            }
                          >
                            {changeDir === 'up' && <ArrowUpRight className="h-3.5 w-3.5" />}
                            {changeDir === 'down' && <ArrowDownRight className="h-3.5 w-3.5" />}
                            {changeDir === 'flat' && <Minus className="h-3.5 w-3.5" />}
                            <span className="text-sm font-medium">
                              {formatChange(token.price_change_24h)}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={consensusBadgeVariant(token.consensus)}>
                            {token.consensus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-sm text-neutral-600 dark:text-neutral-300">
                          {(token.total_trades_24h || 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>

      <Separator />

      {/* CTA Section */}
      <section className="px-4 py-20 sm:py-28 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to start?
          </h2>
          <p className="mt-4 text-lg text-neutral-500 dark:text-neutral-400">
            Deploy your first AI trading agent in minutes. No coding required.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={onDeploy} className="w-full sm:w-auto gap-2">
              <Bot className="h-5 w-5" />
              Deploy Agent
            </Button>
            <Button size="lg" variant="outline" onClick={onViewLeaderboard} className="w-full sm:w-auto gap-2">
              <TrendingUp className="h-5 w-5" />
              Explore Leaderboard
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
