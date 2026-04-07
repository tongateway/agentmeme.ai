import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '../../lib/api';
import { cn } from '../utils/cn';

/* ---------- helpers ---------- */

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

/* ---------- RankBadge ---------- */

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/20 text-xs font-bold tabular-nums text-yellow-400">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-400/15 text-xs font-bold tabular-nums text-gray-300">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-600/15 text-xs font-bold tabular-nums text-amber-500">
        3
      </span>
    );
  }
  return <span className="font-mono text-xs font-semibold tabular-nums text-gray-600">{rank}</span>;
}

/* ---------- types ---------- */

type TabKey = 'overall' | 'agnt' | 'ton' | 'not' | 'build';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'agnt', label: 'AGNT' },
  { key: 'ton', label: 'TON' },
  { key: 'not', label: 'NOT' },
  { key: 'build', label: 'BUILD' },
];

type LeaderboardPageProps = {
  raceCfg: PublicApiConfig;
  onOpenContract: (contractId: string) => void;
};

/* ---------- main component ---------- */

export function LeaderboardPage({ raceCfg, onOpenContract }: LeaderboardPageProps) {
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

  useEffect(() => { void load(); }, [load]);

  const isToken = tab !== 'overall';
  const tokenSymbol = tab.toUpperCase();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10">
            {/* Trophy icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 2v2.069A7.001 7.001 0 0 0 12 18.93V21h-2v2h8v-2h-2v-2.07A7 7 0 0 0 13 4.07V2h-2zm1 4a5 5 0 1 1 0 10A5 5 0 0 1 12 6zM5 4H2v6a4 4 0 0 0 4 4h1.167A8.048 8.048 0 0 1 7 13H6a2 2 0 0 1-2-2V4zm14 0v7a2 2 0 0 1-2 2h-1c-.007.338-.03.673-.07 1H17a4 4 0 0 0 4-4V4h-3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Leaderboard</h1>
            <p className="text-xs text-gray-500">Ranked by P&L performance</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-all',
                tab === t.key
                  ? 'border-[#00C389]/40 bg-[#00C389]/10 text-[#00C389]'
                  : 'border-white/10 bg-white/[0.03] text-gray-500 hover:border-white/20 hover:text-white',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Table card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="overflow-hidden rounded-xl border border-white/5 bg-[#0d1117]"
      >
        {error ? (
          <div className="p-6 text-sm text-red-400">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />
          </div>
        ) : !isToken ? (
          /* Overall leaderboard */
          entries.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">No entries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-gray-600">
                    <th className="w-10 py-3 pl-4 text-left">#</th>
                    <th className="py-3 pl-2 text-left">Agent</th>
                    <th className="hidden py-3 text-left sm:table-cell">AI Model</th>
                    <th className="py-3 pr-4 text-right">Balance</th>
                    <th className="py-3 pr-4 text-right">P&L</th>
                    <th className="py-3 pr-4 text-right">Trades</th>
                    <th className="w-20 py-3 pr-4 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e, rowIdx) => {
                    const profitPct = e.profit_pct ?? 0;
                    const isPositive = profitPct >= 0;
                    const totalOrd = e.total_orders ?? 0;
                    const compOrd = e.completed_orders ?? 0;
                    const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                    const pctColor = isPositive ? 'text-emerald-400' : 'text-red-400';

                    return (
                      <motion.tr
                        key={e.smart_contract_id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: rowIdx * 0.02 }}
                        className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="py-2.5 pl-4 align-middle">
                          <RankBadge rank={e.rank} />
                        </td>
                        <td className="py-2.5 pl-2 align-middle">
                          <div className="flex items-center gap-1.5">
                            {e.is_active && (
                              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
                            )}
                            <a
                              className="font-mono text-xs text-gray-300 underline-offset-4 hover:text-white hover:underline"
                              href={explorerLink(e.address)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {e.name || fmtAddr(e.address)}
                            </a>
                          </div>
                        </td>
                        <td className="hidden py-2.5 align-middle sm:table-cell">
                          <span className="block max-w-[9rem] truncate font-mono text-xs text-gray-600">
                            {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right align-middle">
                          <div className="flex flex-col items-end gap-0">
                            <span className="font-mono text-xs font-medium tabular-nums text-gray-200 leading-tight">
                              {e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums text-gray-700 leading-tight">
                              {e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right align-middle">
                          <div className="flex flex-col items-end gap-0">
                            <span className={cn('font-mono text-sm font-bold tabular-nums leading-tight', pctColor)}>
                              {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                            </span>
                            <span className={cn('font-mono text-[10px] tabular-nums leading-tight opacity-60', pctColor)}>
                              {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right align-middle">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-xs tabular-nums leading-tight">
                              <span className="text-emerald-400/80">{compOrd}</span>
                              <span className="text-gray-700">/{totalOrd}</span>
                            </span>
                            {totalOrd > 0 && (
                              <div className="h-1 w-12 overflow-hidden rounded-full bg-white/5">
                                <div
                                  className="h-full rounded-full bg-emerald-500/50"
                                  style={{ width: `${ordPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => onOpenContract(e.smart_contract_id)}
                            className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-gray-400 transition-all hover:border-white/20 hover:text-white"
                          >
                            Open
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          /* Token-specific leaderboard */
          tokenEntries.length === 0 ? (
            <div className="p-6 text-sm text-gray-600">No {tokenSymbol} trading data yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-gray-600">
                    <th className="w-10 py-3 pl-4 text-left">#</th>
                    <th className="py-3 pl-2 text-left">Agent</th>
                    <th className="py-3 pr-4 text-right">Buy Vol</th>
                    <th className="py-3 pr-4 text-right">Sell Vol</th>
                    <th className="py-3 pr-4 text-right">Orders</th>
                    <th className="hidden py-3 pr-4 text-right sm:table-cell">Decisions</th>
                    <th className="w-20 py-3 pr-4 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {tokenEntries.map((e, rowIdx) => {
                    const buyHuman = fromNanoToken(e.buy_volume, tokenSymbol);
                    const sellHuman = fromNanoToken(e.sell_volume, tokenSymbol);
                    const totalOrd = e.total_orders ?? 0;
                    const compOrd = e.completed_orders ?? 0;
                    const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                    return (
                      <motion.tr
                        key={e.smart_contract_id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: rowIdx * 0.02 }}
                        className="border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="py-2.5 pl-4 align-middle">
                          <RankBadge rank={e.rank} />
                        </td>
                        <td className="py-2.5 pl-2 align-middle">
                          <div className="flex items-center gap-1.5">
                            {e.status === 'active' && (
                              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/70" />
                            )}
                            <span className="font-mono text-xs text-gray-300">
                              {e.name || fmtAddr(e.address)}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right align-middle">
                          <span className="font-mono text-xs tabular-nums text-emerald-400/80">
                            {fmtAmount(buyHuman)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right align-middle">
                          <span className="font-mono text-xs tabular-nums text-red-400/80">
                            {fmtAmount(sellHuman)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right align-middle">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-xs tabular-nums leading-tight">
                              <span className="text-emerald-400/80">{compOrd}</span>
                              <span className="text-gray-700">/{totalOrd}</span>
                            </span>
                            {totalOrd > 0 && (
                              <div className="h-1 w-12 overflow-hidden rounded-full bg-white/5">
                                <div
                                  className="h-full rounded-full bg-emerald-500/50"
                                  style={{ width: `${ordPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="hidden py-2.5 pr-4 text-right align-middle sm:table-cell">
                          <span className="font-mono text-xs tabular-nums text-gray-600">
                            {e.used_decisions}
                            {e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => onOpenContract(e.smart_contract_id)}
                            className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-gray-400 transition-all hover:border-white/20 hover:text-white"
                          >
                            Open
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </motion.div>
    </div>
  );
}
