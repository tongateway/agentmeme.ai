import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { cn } from '../utils/cn';

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
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-400/20 text-amber-400 text-xs font-bold tabular-nums">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-400/20 text-gray-300 text-xs font-bold tabular-nums">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-500/20 text-orange-400 text-xs font-bold tabular-nums">
        3
      </span>
    );
  }
  return (
    <span className="font-mono text-xs font-semibold tabular-nums text-gray-600">
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
        <tr key={i} className="border-b border-white/5">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-4 rounded bg-white/5 animate-pulse"
                style={{ width: `${60 + ((i + j) % 3) * 15}%` }}
              />
            </td>
          ))}
        </tr>
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 py-2"
    >
      <div className="bg-gray-900/50 border border-white/10 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xl font-semibold text-white">
              {/* Trophy icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11 2v2.069A7.001 7.001 0 0 0 12 18.93V21h-2v2h8v-2h-2v-2.07A7 7 0 0 0 13 4.07V2h-2zm1 4a5 5 0 1 1 0 10A5 5 0 0 1 12 6zM5 4H2v6a4 4 0 0 0 4 4h1.167A8.048 8.048 0 0 1 7 13H6a2 2 0 0 1-2-2V4zm14 0v7a2 2 0 0 1-2 2h-1c-.007.338-.03.673-.07 1H17a4 4 0 0 0 4-4V4h-3z" />
              </svg>
              Leaderboard
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 flex-wrap">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    tab === t.key
                      ? 'bg-white text-black'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {error ? (
          <div className="px-6 py-8 text-sm text-red-400">{error}</div>
        ) : !isToken ? (
          /* ── Overall leaderboard ──────────────────────────────── */
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Model</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Balance</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">P&amp;L</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Trades</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows cols={7} />
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500 text-sm">
                      No entries yet.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => {
                    const profitPct = e.profit_pct ?? 0;
                    const isPositive = profitPct >= 0;
                    const totalOrd = e.total_orders ?? 0;
                    const compOrd = e.completed_orders ?? 0;
                    const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                    return (
                      <tr key={e.smart_contract_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <RankBadge rank={e.rank} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {e.is_active && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            )}
                            <a
                              className="font-mono text-xs text-gray-300 hover:text-white underline-offset-4 hover:underline transition-colors"
                              href={explorerLink(e.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {e.name || fmtAddr(e.address)}
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className="font-mono text-xs text-gray-600 truncate max-w-[9rem] block">
                            {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-mono text-xs tabular-nums font-medium text-gray-300">
                              {e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums text-gray-600">
                              {e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={cn(
                              'font-mono text-sm tabular-nums font-bold',
                              isPositive ? 'text-emerald-400' : 'text-red-400',
                            )}>
                              {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                            </span>
                            <span className={cn(
                              'font-mono text-[10px] tabular-nums',
                              isPositive ? 'text-emerald-400/60' : 'text-red-400/70',
                            )}>
                              {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-xs tabular-nums">
                              <span className="text-emerald-400">{compOrd}</span>
                              <span className="text-gray-700">/{totalOrd}</span>
                            </span>
                            {totalOrd > 0 && (
                              <div className="w-12 h-1 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${ordPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {onSelectAgent && (
                            <button
                              type="button"
                              className="h-7 text-xs px-2 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                              onClick={() => onSelectAgent(e.smart_contract_id)}
                            >
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Token-specific leaderboard ──────────────────────── */
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 w-12">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Agent</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Buy Vol</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Sell Vol</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Trades</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 hidden sm:table-cell">Decisions</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <LoadingRows cols={7} />
                ) : tokenEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500 text-sm">
                      No {tokenSymbol} trading data yet.
                    </td>
                  </tr>
                ) : (
                  tokenEntries.map((e) => {
                    const buyHuman = fromNanoToken(e.buy_volume, tokenSymbol);
                    const sellHuman = fromNanoToken(e.sell_volume, tokenSymbol);
                    const totalOrd = e.total_orders ?? 0;
                    const compOrd = e.completed_orders ?? 0;
                    const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                    return (
                      <tr key={e.smart_contract_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <RankBadge rank={e.rank} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {e.status === 'active' && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            )}
                            <span className="font-mono text-xs text-gray-300">
                              {e.name || fmtAddr(e.address)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-xs tabular-nums text-emerald-400">
                            {fmtAmount(buyHuman)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-xs tabular-nums text-red-400">
                            {fmtAmount(sellHuman)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-xs tabular-nums">
                              <span className="text-emerald-400">{compOrd}</span>
                              <span className="text-gray-700">/{totalOrd}</span>
                            </span>
                            {totalOrd > 0 && (
                              <div className="w-12 h-1 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-emerald-500"
                                  style={{ width: `${ordPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right hidden sm:table-cell">
                          <span className="font-mono text-[10px] text-gray-400 bg-white/5 border border-white/10 rounded px-1.5 py-0.5">
                            {e.used_decisions}
                            {e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {onSelectAgent && (
                            <button
                              type="button"
                              className="h-7 text-xs px-2 border border-white/10 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                              onClick={() => onSelectAgent(e.smart_contract_id)}
                            >
                              Open
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
