import { useCallback, useEffect, useState } from 'react';
import { getRaceLeaderboard, type LeaderboardEntry, type PublicApiConfig } from '@/lib/api';

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
}

/** Format USD — drop cents when ≥ $1000 */
function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

/** Shorten model name: "Qwen/Qwen3-32B" → "Qwen3-32B" */
function shortModel(m: string): string {
  const parts = m.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : m;
}

type LeaderboardPageProps = {
  raceCfg: PublicApiConfig;
  onOpenContract: (contractId: string) => void;
};

export function LeaderboardPage({ raceCfg, onOpenContract }: LeaderboardPageProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' });
      setEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mt-4">
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-3 sm:p-5 gap-3">
          <h2 className="card-title text-base">Leaderboard</h2>

          {error ? (
            <div className="text-sm text-error">{error}</div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-sm opacity-60">No entries yet.</div>
          ) : (
            <div className="overflow-x-auto scrollbar-none">
              <table className="table table-xs w-full">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
                    <th className="w-8 pl-0">#</th>
                    <th>Agent</th>
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
                    const decisions = e.total_decisions ?? 0;
                    const pctColor = isPositive ? 'text-profit-positive' : 'text-profit-negative';

                    return (
                      <tr key={e.smart_contract_id} className="hover border-b border-base-content/[0.03]">
                        {/* Rank */}
                        <td className="pl-0 align-middle">
                          <span className="mono text-xs font-semibold tabular-nums opacity-50">{e.rank}</span>
                        </td>

                        {/* Agent: address + model stacked */}
                        <td className="py-1.5">
                          <div className="flex flex-col gap-0.5">
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
                                {fmtAddr(e.address)}
                              </a>
                            </div>
                            <span className="text-[10px] opacity-35 leading-none pl-[12px] truncate max-w-[10rem]">
                              {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                            </span>
                          </div>
                        </td>

                        {/* Balance: start → current */}
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

                        {/* P&L: profit $ + % */}
                        <td className="text-right align-middle">
                          <div className="flex flex-col items-end gap-0">
                            <span className={`mono text-xs tabular-nums font-bold leading-tight ${pctColor}`}>
                              {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                            </span>
                            <span className={`mono text-[10px] tabular-nums leading-tight opacity-60 ${pctColor}`}>
                              {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                            </span>
                          </div>
                        </td>

                        {/* Orders: completed/total + decisions */}
                        <td className="text-right align-middle">
                          <div className="flex flex-col items-end gap-0">
                            <span className="mono text-xs tabular-nums leading-tight">
                              <span className="text-success/80">{compOrd}</span>
                              <span className="opacity-25">/{totalOrd}</span>
                            </span>
                            <span className="mono text-[10px] tabular-nums opacity-25 leading-tight">
                              {decisions} dec
                            </span>
                          </div>
                        </td>

                        {/* Action */}
                        <td className="text-center pr-0 align-middle">
                          <button
                            className="btn btn-ghost btn-xs mono text-[10px] opacity-50 hover:opacity-100"
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
          )}
        </div>
      </div>
    </div>
  );
}
