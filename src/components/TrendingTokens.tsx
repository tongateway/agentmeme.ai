import { type TokenOpinionSummary } from '@/lib/api';
import { TrendingUp } from 'lucide-react';

type TrendingTokensProps = {
  tokens: TokenOpinionSummary[];
  onSelectToken: (symbol: string) => void;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function TrendingTokens({ tokens, onSelectToken }: TrendingTokensProps) {
  const trades = tokens.map((t) => t.total_trades_24h);
  const med = median(trades);
  const threshold = Math.max(med * 2, 10);

  const trending = tokens
    .filter((t) => t.total_trades_24h > threshold)
    .map((t) => ({ ...t, ratio: med > 0 ? t.total_trades_24h / med : 0 }))
    .sort((a, b) => b.ratio - a.ratio);

  if (trending.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
      <TrendingUp className="h-3.5 w-3.5 opacity-40 shrink-0" />
      <span className="text-[10px] uppercase tracking-wider opacity-40 shrink-0">Trending</span>
      {trending.map((t) => {
        const color = t.ratio > 3 ? 'badge-success' : 'badge-warning';
        return (
          <button
            key={t.token_symbol}
            type="button"
            className={`badge badge-sm ${color} cursor-pointer shrink-0`}
            onClick={() => onSelectToken(t.token_symbol)}
          >
            {t.token_symbol} {t.ratio.toFixed(1)}x
          </button>
        );
      })}
    </div>
  );
}
