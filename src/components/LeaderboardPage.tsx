import { useCallback, useEffect, useState } from 'react';
import { getRaceLeaderboard, type LeaderboardEntry, type PublicApiConfig } from '@/lib/api';

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
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
        <div className="card-body">
          <h2 className="card-title">Leaderboard</h2>

          {error ? (
            <div className="text-sm text-error">{error}</div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-sm opacity-60">No entries yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Address</th>
                    <th>Model</th>
                    <th className="text-right">Start</th>
                    <th className="text-right">Current</th>
                    <th className="text-right">Profit</th>
                    <th className="text-right">%</th>
                    <th className="text-right">Orders</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const profitPct = e.profit_pct ?? 0;
                    const isPositive = profitPct >= 0;
                    return (
                      <tr key={e.smart_contract_id} className="hover">
                        <td className="font-medium tabular-nums">{e.rank}</td>
                        <td>
                          <a
                            className="mono text-xs underline-offset-4 hover:underline link link-hover"
                            href={explorerLink(e.address)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {fmtAddr(e.address)}
                          </a>
                        </td>
                        <td className="text-xs opacity-60 whitespace-nowrap">
                          {e.ai_model || '\u2014'}
                        </td>
                        <td className="mono text-xs text-right tabular-nums">
                          {e.start_balance_usd != null ? `$${e.start_balance_usd.toFixed(2)}` : '\u2014'}
                        </td>
                        <td className="mono text-xs text-right tabular-nums">
                          {e.current_balance_usd != null ? `$${e.current_balance_usd.toFixed(2)}` : '\u2014'}
                        </td>
                        <td className={`mono text-xs text-right tabular-nums ${isPositive ? 'text-profit-positive' : 'text-profit-negative'}`}>
                          {e.profit_usd != null ? `${isPositive ? '+' : ''}${e.profit_usd.toFixed(2)}` : '\u2014'}
                        </td>
                        <td className={`mono text-xs text-right tabular-nums font-medium ${isPositive ? 'text-profit-positive' : 'text-profit-negative'}`}>
                          {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                        </td>
                        <td className="mono text-xs text-right tabular-nums">
                          {e.total_orders ?? 0}
                        </td>
                        <td className="text-center">
                          <div className="inline-flex items-center gap-2">
                            <span className={`badge badge-sm ${e.is_active ? 'badge-success' : 'badge-ghost'}`}>
                              {e.is_active ? 'Active' : 'Off'}
                            </span>
                            <button
                              className="btn btn-ghost btn-xs"
                              type="button"
                              onClick={() => onOpenContract(e.smart_contract_id)}
                            >
                              Open
                            </button>
                          </div>
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
