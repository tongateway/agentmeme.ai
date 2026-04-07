import { useCallback, useEffect, useState } from 'react';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
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

// ── Rank Badge ─────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-xs font-bold tabular-nums">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400 text-xs font-bold tabular-nums">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400 text-xs font-bold tabular-nums">
        3
      </span>
    );
  }
  return (
    <span className="font-mono text-xs font-semibold tabular-nums text-neutral-400 dark:text-neutral-600">
      {rank}
    </span>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

export type LeaderboardPageProps = {
  raceCfg: PublicApiConfig;
  onSelectAgent?: (contractId: string) => void;
};

type TabKey = 'overall' | 'agnt' | 'ton' | 'not' | 'build';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'agnt', label: 'AGNT' },
  { key: 'ton', label: 'TON' },
  { key: 'not', label: 'NOT' },
  { key: 'build', label: 'BUILD' },
];

// ── Loading Skeleton ───────────────────────────────────────────────────────

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}>
              <div className="h-4 rounded bg-neutral-100 dark:bg-neutral-800 animate-pulse" style={{ width: `${60 + ((i + j) % 3) * 15}%` }} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export function LeaderboardPage({ raceCfg, onSelectAgent }: LeaderboardPageProps) {
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
        const data = await getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' });
        setEntries(data);
      } else {
        const data = await getTokenLeaderboard(raceCfg, tab);
        setTokenEntries(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  const isToken = tab !== 'overall';
  const tokenSymbol = tab.toUpperCase();

  return (
    <div className="space-y-6 py-2">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              {/* Trophy icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 2v2.069A7.001 7.001 0 0 0 12 18.93V21h-2v2h8v-2h-2v-2.07A7 7 0 0 0 13 4.07V2h-2zm1 4a5 5 0 1 1 0 10A5 5 0 0 1 12 6zM5 4H2v6a4 4 0 0 0 4 4h1.167A8.048 8.048 0 0 1 7 13H6a2 2 0 0 1-2-2V4zm14 0v7a2 2 0 0 1-2 2h-1c-.007.338-.03.673-.07 1H17a4 4 0 0 0 4-4V4h-3z" />
              </svg>
              Leaderboard
            </CardTitle>

            {/* Tab bar */}
            <div className="flex gap-1 flex-wrap">
              {TABS.map((t) => (
                <Button
                  key={t.key}
                  variant={tab === t.key ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    tab === t.key && 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
                  )}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error ? (
            <div className="px-6 py-8 text-sm text-red-500">{error}</div>
          ) : !isToken ? (
            /* ── Overall leaderboard ──────────────────────────────── */
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="hidden sm:table-cell">Model</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">P&amp;L</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="w-20 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRows cols={7} />
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-neutral-400">
                      No entries yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((e) => {
                    const profitPct = e.profit_pct ?? 0;
                    const isPositive = profitPct >= 0;
                    const totalOrd = e.total_orders ?? 0;
                    const compOrd = e.completed_orders ?? 0;
                    const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                    return (
                      <TableRow key={e.smart_contract_id}>
                        <TableCell>
                          <RankBadge rank={e.rank} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {e.is_active && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            )}
                            <a
                              className="font-mono text-xs underline-offset-4 hover:underline text-neutral-700 dark:text-neutral-300"
                              href={explorerLink(e.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {e.name || fmtAddr(e.address)}
                            </a>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500 truncate max-w-[9rem] block">
                            {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono text-xs tabular-nums font-medium">
                              {e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums text-neutral-400">
                              {e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={cn(
                              'font-mono text-sm tabular-nums font-bold',
                              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400',
                            )}>
                              {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                            </span>
                            <span className={cn(
                              'font-mono text-[10px] tabular-nums',
                              isPositive ? 'text-emerald-500/70 dark:text-emerald-400/60' : 'text-red-400/70',
                            )}>
                              {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-xs tabular-nums">
                              <span className="text-emerald-600 dark:text-emerald-400">{compOrd}</span>
                              <span className="text-neutral-300 dark:text-neutral-600">/{totalOrd}</span>
                            </span>
                            {totalOrd > 0 && (
                              <div className="w-12 h-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-violet-500"
                                  style={{ width: `${ordPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {onSelectAgent && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => onSelectAgent(e.smart_contract_id)}
                            >
                              Open
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          ) : (
            /* ── Token-specific leaderboard ──────────────────────── */
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Buy Vol</TableHead>
                  <TableHead className="text-right">Sell Vol</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Decisions</TableHead>
                  <TableHead className="w-20 text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <LoadingRows cols={7} />
                ) : tokenEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-neutral-400">
                      No {tokenSymbol} trading data yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  tokenEntries.map((e) => {
                    const buyHuman = fromNanoToken(e.buy_volume, tokenSymbol);
                    const sellHuman = fromNanoToken(e.sell_volume, tokenSymbol);
                    const totalOrd = e.total_orders ?? 0;
                    const compOrd = e.completed_orders ?? 0;
                    const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                    return (
                      <TableRow key={e.smart_contract_id}>
                        <TableCell>
                          <RankBadge rank={e.rank} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {e.status === 'active' && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                            )}
                            <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">
                              {e.name || fmtAddr(e.address)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                            {fmtAmount(buyHuman)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-mono text-xs tabular-nums text-red-500 dark:text-red-400">
                            {fmtAmount(sellHuman)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-xs tabular-nums">
                              <span className="text-emerald-600 dark:text-emerald-400">{compOrd}</span>
                              <span className="text-neutral-300 dark:text-neutral-600">/{totalOrd}</span>
                            </span>
                            {totalOrd > 0 && (
                              <div className="w-12 h-1 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-violet-500"
                                  style={{ width: `${ordPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {e.used_decisions}
                            {e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {onSelectAgent && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => onSelectAgent(e.smart_contract_id)}
                            >
                              Open
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
