import { useCallback, useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '../../lib/api';
import { cn } from '../utils/cn';

type PredictionMarketProps = {
  raceCfg: PublicApiConfig;
  stats: TokenOpinionSummary;
};

export function PredictionMarket({ raceCfg, stats }: PredictionMarketProps) {
  const [accuracy, setAccuracy] = useState<TokenPredictionAccuracy | null>(null);

  const loadAccuracy = useCallback(async () => {
    try {
      const data = await getTokenPredictionAccuracy(raceCfg, stats.token_symbol);
      setAccuracy(data);
    } catch {
      // Endpoint not available yet — hide accuracy section
    }
  }, [raceCfg, stats.token_symbol]);

  useEffect(() => {
    void loadAccuracy();
  }, [loadAccuracy]);

  const probability = Math.max(stats.bullish_pct, stats.bearish_pct);
  const direction =
    stats.bullish_pct > stats.bearish_pct
      ? 'UP'
      : stats.bearish_pct > stats.bullish_pct
      ? 'DOWN'
      : null;
  const conviction = (probability / 100) * stats.avg_confidence * 100;

  let accuracyColor = 'text-gray-500';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) accuracyColor = 'text-[#00C389]';
    else if (accuracy.accuracy_pct >= 40) accuracyColor = 'text-yellow-400';
    else accuracyColor = 'text-red-400';
  }

  const directionColor = direction === 'UP' ? 'text-[#00C389]' : 'text-red-400';
  const barColor = direction === 'UP' ? 'bg-[#00C389]' : 'bg-red-500';

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
        Prediction Market
      </span>

      <div className="rounded-xl border border-white/5 bg-gray-800/60 p-3 flex flex-col gap-2">
        {direction ? (
          <>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="text-sm font-semibold text-white">{stats.token_symbol} Price Direction</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn('text-xs', directionColor)}>Conviction {direction}</span>
              <span className={cn('font-mono text-sm font-bold tabular-nums', directionColor)}>
                {conviction.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden bg-gray-700">
              <div className={cn('h-full rounded-full', barColor)} style={{ width: `${conviction}%` }} />
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-500">No clear directional consensus</p>
        )}
      </div>

      {accuracy && accuracy.total_predictions > 0 && (
        <div className="rounded-xl border border-white/5 bg-gray-800/60 p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-gray-600">Accuracy</span>
            <span className={cn('font-mono text-sm font-bold tabular-nums', accuracyColor)}>
              {accuracy.accuracy_pct.toFixed(0)}%
            </span>
          </div>
          <span className="text-[10px] text-gray-600">
            {accuracy.correct_predictions} of {accuracy.total_predictions} calls correct
          </span>
          {accuracy.streak > 1 && (
            <span className="text-[10px] text-gray-600">On a {accuracy.streak}-call streak</span>
          )}
        </div>
      )}
    </div>
  );
}
