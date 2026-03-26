import { useCallback, useEffect, useState } from 'react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { TrendingTokens } from '@/components/TrendingTokens';
import { AgentSpotlight } from '@/components/AgentSpotlight';

type AgentHubPageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
};

function computeSignalStrength(
  token: TokenOpinionSummary,
  maxAgents: number,
  maxTrades: number,
): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (
    consensusWeight * 0.4 +
    token.avg_confidence * 0.3 +
    agentWeight * 0.15 +
    volumeWeight * 0.15
  ) * 10;
}

function signalColor(signal: number): string {
  if (signal >= 7) return 'text-success';
  if (signal >= 4) return 'text-warning';
  return 'opacity-40';
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

export function AgentHubPage({ raceCfg, onSelectToken }: AgentHubPageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, lb] = await Promise.all([
        getTokenOpinions(raceCfg),
        getRaceLeaderboard(raceCfg).catch(() => [] as LeaderboardEntry[]),
      ]);
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => b.total_trades_24h - a.total_trades_24h,
      );
      setTokens(sorted);
      setLeaderboard(lb);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);

  useEffect(() => {
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => clearInterval(iv);
  }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));

  return (
    <div className="mt-4">
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-3 sm:p-5 gap-3">
          <h2 className="card-title text-base">Agent Hub</h2>

          {/* Dashboard strip */}
          {!loading && tokens.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <AgentSpotlight leaderboard={leaderboard} />
              <div className="flex-1 min-w-0 flex items-center">
                <TrendingTokens tokens={tokens} onSelectToken={onSelectToken} />
              </div>
            </div>
          )}

          {error ? (
            <div className="text-sm text-error">{error}</div>
          ) : loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : tokens.length === 0 ? (
            <div className="text-sm opacity-60">
              No agent opinions yet. Agents will share their views as they trade.
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-none">
              <table className="table table-xs w-full">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
                    <th className="w-8 pl-0">#</th>
                    <th>Token</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">24h</th>
                    <th className="text-center">AI Consensus</th>
                    <th className="text-right hidden sm:table-cell">Agents</th>
                    <th className="text-right hidden sm:table-cell">Signal</th>
                    <th className="text-right">Trades 24h</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t, i) => {
                    const signal = computeSignalStrength(t, maxAgents, maxTrades);
                    const change24h = t.price_change_24h ?? 0;
                    const changePositive = change24h >= 0;
                    const changeColor = changePositive ? 'text-success' : 'text-error';
                    const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;

                    const consensusUpper = (t.consensus ?? '').toUpperCase();
                    let consensusBadge = 'badge-ghost opacity-60';
                    if (consensusUpper === 'BULLISH') consensusBadge = 'badge-success';
                    else if (consensusUpper === 'BEARISH') consensusBadge = 'badge-error';

                    const bullish = t.bullish_pct ?? 0;
                    const bearish = t.bearish_pct ?? 0;
                    const pct = consensusUpper === 'BULLISH'
                      ? bullish
                      : consensusUpper === 'BEARISH'
                        ? bearish
                        : Math.max(bullish, bearish);

                    return (
                      <tr
                        key={t.token_symbol}
                        className="hover border-b border-base-content/[0.03] cursor-pointer"
                        onClick={() => onSelectToken(t.token_symbol)}
                      >
                        <td className="pl-0 align-middle">
                          <span className="mono text-xs font-semibold tabular-nums opacity-50">{i + 1}</span>
                        </td>
                        <td className="py-1.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="mono text-xs font-medium leading-none">{t.token_symbol}</span>
                            <span className="text-[10px] opacity-35 leading-none truncate max-w-[10rem]">
                              {t.token_name}
                            </span>
                          </div>
                        </td>
                        <td className="text-right align-middle">
                          <span className="mono text-xs tabular-nums font-medium">
                            {fmtPrice(priceUsd)}
                          </span>
                        </td>
                        <td className="text-right align-middle">
                          <span className={`mono text-xs tabular-nums font-bold ${changeColor}`}>
                            {changePositive ? '+' : ''}{change24h.toFixed(1)}%
                          </span>
                        </td>
                        <td className="text-center align-middle">
                          <span className={`badge badge-sm ${consensusBadge}`}>
                            {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                          </span>
                        </td>
                        <td className="text-right align-middle hidden sm:table-cell">
                          <span className="mono text-xs tabular-nums opacity-60">{t.active_agents}</span>
                        </td>
                        <td className="text-right align-middle hidden sm:table-cell">
                          <span className={`mono text-xs tabular-nums font-bold ${signalColor(signal)}`}>
                            {signal.toFixed(1)}
                          </span>
                        </td>
                        <td className="text-right align-middle">
                          <span className="mono text-xs tabular-nums">{t.total_trades_24h}</span>
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
