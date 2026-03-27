import { useCallback, useEffect, useState } from 'react';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
}

/** Format USD — drop cents when >= $1000 */
function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

/** Shorten model name: "Qwen/Qwen3-32B" -> "Qwen3-32B" */
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
  if (rank === 1) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-warning/20 text-warning text-xs font-bold tabular-nums">
        1
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-base-content/10 text-base-content/70 text-xs font-bold tabular-nums">
        2
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-warning/10 text-warning/60 text-xs font-bold tabular-nums">
        3
      </span>
    );
  }
  return (
    <span className="mono text-xs font-semibold tabular-nums opacity-40">{rank}</span>
  );
}

type LeaderboardPageProps = {
  raceCfg: PublicApiConfig;
  onOpenContract: (contractId: string) => void;
};

type TabKey = 'overall' | 'agnt' | 'ton' | 'not' | 'build';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'agnt', label: 'AGNT' },
  { key: 'ton', label: 'TON' },
  { key: 'not', label: 'NOT' },
  { key: 'build', label: 'BUILD' },
];

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

  useEffect(() => {
    void load();
  }, [load]);

  const isToken = tab !== 'overall';
  const tokenSymbol = tab.toUpperCase();

  return (
    <div className="mt-4">
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-4 sm:p-6 gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="card-title text-lg font-bold flex items-center gap-2">
              {/* Trophy icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-5 h-5 text-warning"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M11 2v2.069A7.001 7.001 0 0 0 12 18.93V21h-2v2h8v-2h-2v-2.07A7 7 0 0 0 13 4.07V2h-2zm1 4a5 5 0 1 1 0 10A5 5 0 0 1 12 6zM5 4H2v6a4 4 0 0 0 4 4h1.167A8.048 8.048 0 0 1 7 13H6a2 2 0 0 1-2-2V4zm14 0v7a2 2 0 0 1-2 2h-1c-.007.338-.03.673-.07 1H17a4 4 0 0 0 4-4V4h-3z" />
              </svg>
              Leaderboard
            </h2>
            <div role="tablist" className="tabs tabs-bordered tabs-sm">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  className={`tab font-medium ${tab === t.key ? 'tab-active' : 'opacity-60 hover:opacity-100'}`}
                  onClick={() => setTab(t.key)}
                  type="button"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="text-sm text-error">{error}</div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : !isToken ? (
            /* Overall leaderboard */
            entries.length === 0 ? (
              <div className="text-sm opacity-60">No entries yet.</div>
            ) : (
              <div className="overflow-x-auto scrollbar-none">
                <table className="table table-sm w-full">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
                      <th className="w-8 pl-0">#</th>
                      <th>Agent</th>
                      <th className="hidden sm:table-cell">AI Model</th>
                      <th className="text-right">Balance</th>
                      <th className="text-right">P&L</th>
                      <th className="text-right">Orders</th>
                      <th className="w-16 text-center pr-0"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const profitPct = e.profit_pct ?? 0;
                      const isPositive = profitPct >= 0;
                      const totalOrd = e.total_orders ?? 0;
                      const compOrd = e.completed_orders ?? 0;
                      const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                      const pctColor = isPositive ? 'text-profit-positive' : 'text-profit-negative';

                      return (
                        <tr key={e.smart_contract_id} className="hover border-b border-base-content/[0.03]">
                          <td className="pl-0 align-middle">
                            <RankBadge rank={e.rank} />
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-1.5">
                              {e.is_active && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success/70 shrink-0" />
                              )}
                              <a
                                className="mono text-xs underline-offset-4 hover:underline link link-hover leading-none"
                                href={explorerLink(e.address)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {e.name || fmtAddr(e.address)}
                              </a>
                            </div>
                          </td>
                          <td className="align-middle hidden sm:table-cell">
                            <span className="mono text-xs opacity-40 truncate max-w-[9rem] block">
                              {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                            </span>
                          </td>
                          <td className="text-right align-middle">
                            <div className="flex flex-col items-end gap-0">
                              <span className="mono text-xs tabular-nums font-medium leading-tight">
                                {e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}
                              </span>
                              <span className="mono text-[10px] tabular-nums opacity-30 leading-tight">
                                {e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}
                              </span>
                            </div>
                          </td>
                          <td className="text-right align-middle">
                            <div className="flex flex-col items-end gap-0">
                              <span className={`mono text-sm tabular-nums font-bold leading-tight ${pctColor}`}>
                                {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                              </span>
                              <span className={`mono text-[10px] tabular-nums leading-tight opacity-60 ${pctColor}`}>
                                {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                              </span>
                            </div>
                          </td>
                          <td className="text-right align-middle">
                            <div className="flex flex-col items-end gap-1">
                              <span className="mono text-xs tabular-nums leading-tight">
                                <span className="text-success/80">{compOrd}</span>
                                <span className="opacity-25">/{totalOrd}</span>
                              </span>
                              {totalOrd > 0 && (
                                <div className="w-12 h-1 rounded-full bg-base-content/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-success/50"
                                    style={{ width: `${ordPct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-center pr-0 align-middle">
                            <button
                              className="btn btn-outline btn-xs mono text-[10px]"
                              type="button"
                              onClick={() => onOpenContract(e.smart_contract_id)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            /* Token-specific leaderboard */
            tokenEntries.length === 0 ? (
              <div className="text-sm opacity-60">No {tokenSymbol} trading data yet.</div>
            ) : (
              <div className="overflow-x-auto scrollbar-none">
                <table className="table table-sm w-full">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
                      <th className="w-8 pl-0">#</th>
                      <th>Agent</th>
                      <th className="text-right">Buy Vol</th>
                      <th className="text-right">Sell Vol</th>
                      <th className="text-right">Orders</th>
                      <th className="text-right hidden sm:table-cell">Decisions</th>
                      <th className="w-16 text-center pr-0"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tokenEntries.map((e) => {
                      const buyHuman = fromNanoToken(e.buy_volume, tokenSymbol);
                      const sellHuman = fromNanoToken(e.sell_volume, tokenSymbol);
                      const totalOrd = e.total_orders ?? 0;
                      const compOrd = e.completed_orders ?? 0;
                      const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                      return (
                        <tr key={e.smart_contract_id} className="hover border-b border-base-content/[0.03]">
                          <td className="pl-0 align-middle">
                            <RankBadge rank={e.rank} />
                          </td>
                          <td className="py-2">
                            <div className="flex items-center gap-1.5">
                              {e.status === 'active' && (
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-success/70 shrink-0" />
                              )}
                              <span className="mono text-xs leading-none">
                                {e.name || fmtAddr(e.address)}
                              </span>
                            </div>
                          </td>
                          <td className="text-right align-middle">
                            <span className="mono text-xs tabular-nums text-success/80">
                              {fmtAmount(buyHuman)}
                            </span>
                          </td>
                          <td className="text-right align-middle">
                            <span className="mono text-xs tabular-nums text-error/80">
                              {fmtAmount(sellHuman)}
                            </span>
                          </td>
                          <td className="text-right align-middle">
                            <div className="flex flex-col items-end gap-1">
                              <span className="mono text-xs tabular-nums leading-tight">
                                <span className="text-success/80">{compOrd}</span>
                                <span className="opacity-25">/{totalOrd}</span>
                              </span>
                              {totalOrd > 0 && (
                                <div className="w-12 h-1 rounded-full bg-base-content/10 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-success/50"
                                    style={{ width: `${ordPct}%` }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="text-right align-middle hidden sm:table-cell">
                            <span className="mono text-xs tabular-nums opacity-50">
                              {e.used_decisions}
                              {e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                            </span>
                          </td>
                          <td className="text-center pr-0 align-middle">
                            <button
                              className="btn btn-outline btn-xs mono text-[10px]"
                              type="button"
                              onClick={() => onOpenContract(e.smart_contract_id)}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
