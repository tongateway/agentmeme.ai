import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/v2/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/v2/components/ui/tabs';
import { Button } from '@/v2/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/v2/components/ui/table';
import { Skeleton } from '@/v2/components/ui/skeleton';
import { Trophy } from 'lucide-react';

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function shortModel(m: string): string {
  const parts = m.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : m;
}

function fmtAmount(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const colors = [
      'bg-yellow-500/20 text-yellow-500',
      'bg-muted text-muted-foreground',
      'bg-yellow-500/10 text-yellow-600',
    ];
    return (
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold tabular-nums ${colors[rank - 1]}`}>
        {rank}
      </span>
    );
  }
  return <span className="mono text-xs font-semibold tabular-nums text-muted-foreground">{rank}</span>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

type TabKey = 'overall' | 'agnt' | 'ton' | 'not' | 'build';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'agnt', label: 'AGNT' },
  { key: 'ton', label: 'TON' },
  { key: 'not', label: 'NOT' },
  { key: 'build', label: 'BUILD' },
];

export function LeaderboardPage() {
  const navigate = useNavigate();
  const raceCfg: PublicApiConfig = { baseUrl: API_BASE };
  const [tab, setTab] = useState<TabKey>('overall');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [tokenEntries, setTokenEntries] = useState<TokenLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'overall') {
        setEntries(await getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' }));
      } else {
        setTokenEntries(await getTokenLeaderboard(raceCfg, tab));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const isToken = tab !== 'overall';

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading ? (
          <Skeleton className="h-60 w-full" />
        ) : !isToken ? (
          entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="hidden sm:table-cell">AI Model</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const profitPct = e.profit_pct ?? 0;
                  const isPositive = profitPct >= 0;
                  const totalOrd = e.total_orders ?? 0;
                  const compOrd = e.completed_orders ?? 0;
                  const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                  return (
                    <TableRow key={e.smart_contract_id}>
                      <TableCell><RankBadge rank={e.rank} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {e.is_active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/70 shrink-0" />}
                          <a className="mono text-xs hover:underline" href={`https://tonviewer.com/${e.address}`} target="_blank" rel="noreferrer">
                            {e.name || fmtAddr(e.address)}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="mono text-xs text-muted-foreground truncate max-w-[9rem] block">
                          {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="mono text-xs tabular-nums font-medium">{e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}</span>
                          <span className="mono text-[10px] tabular-nums text-muted-foreground">{e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`mono text-sm tabular-nums font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                            {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                          </span>
                          <span className={`mono text-[10px] tabular-nums ${isPositive ? 'text-green-500/60' : 'text-red-500/60'}`}>
                            {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="mono text-xs tabular-nums">
                            <span className="text-green-500/80">{compOrd}</span>
                            <span className="text-muted-foreground/40">/{totalOrd}</span>
                          </span>
                          {totalOrd > 0 && (
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-green-500/50" style={{ width: `${ordPct}%` }} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate(`/trader/${e.smart_contract_id}`)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : (
          tokenEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {tab.toUpperCase()} trading data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Buy Vol</TableHead>
                  <TableHead className="text-right">Sell Vol</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Decisions</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokenEntries.map((e) => {
                  const buyHuman = fromNanoToken(e.buy_volume, tab.toUpperCase());
                  const sellHuman = fromNanoToken(e.sell_volume, tab.toUpperCase());
                  const totalOrd = e.total_orders ?? 0;
                  const compOrd = e.completed_orders ?? 0;
                  const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                  return (
                    <TableRow key={e.smart_contract_id}>
                      <TableCell><RankBadge rank={e.rank} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {e.status === 'active' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/70 shrink-0" />}
                          <span className="mono text-xs">{e.name || fmtAddr(e.address)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right mono text-xs tabular-nums text-green-500/80">{fmtAmount(buyHuman)}</TableCell>
                      <TableCell className="text-right mono text-xs tabular-nums text-red-500/80">{fmtAmount(sellHuman)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="mono text-xs tabular-nums">
                            <span className="text-green-500/80">{compOrd}</span>
                            <span className="text-muted-foreground/40">/{totalOrd}</span>
                          </span>
                          {totalOrd > 0 && (
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-green-500/50" style={{ width: `${ordPct}%` }} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell mono text-xs tabular-nums text-muted-foreground">
                        {e.used_decisions}{e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate(`/trader/${e.smart_contract_id}`)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        )}
      </CardContent>
    </Card>
  );
}
