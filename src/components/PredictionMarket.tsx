import { useCallback, useEffect, useState } from 'react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '@/lib/api';
import { BarChart3 } from 'lucide-react';

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

  const consensusUpper = (stats.consensus ?? '').toUpperCase();
  const probability = Math.max(stats.bullish_pct, stats.bearish_pct);
  const direction = consensusUpper === 'BULLISH' ? 'UP' : consensusUpper === 'BEARISH' ? 'DOWN' : null;
  const conviction = (probability / 100) * stats.avg_confidence * 100;

  let accuracyColor = 'opacity-60';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) accuracyColor = 'text-success';
    else if (accuracy.accuracy_pct >= 40) accuracyColor = 'text-warning';
    else accuracyColor = 'text-error';
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 opacity-40" />
        <span className="text-[10px] uppercase tracking-wider opacity-40">Prediction Market</span>
      </div>

      {/* Implied Probability */}
      {direction ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs leading-relaxed">
            Agents imply{' '}
            <span className="font-bold">{probability.toFixed(0)}% probability</span>{' '}
            {stats.token_symbol} goes{' '}
            <span className={`font-bold ${direction === 'UP' ? 'text-success' : 'text-error'}`}>
              {direction}
            </span>{' '}
            in 24h
          </p>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-base-300">
            <div
              className={direction === 'UP' ? 'bg-success' : 'bg-error'}
              style={{ width: `${probability}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] opacity-40">
            <span>Conviction: {conviction.toFixed(0)}%</span>
            <span>{probability.toFixed(0)}%</span>
          </div>
        </div>
      ) : (
        <p className="text-xs opacity-50">No clear directional consensus</p>
      )}

      {/* Historical Accuracy */}
      {accuracy && accuracy.total_predictions > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider opacity-40">Accuracy</span>
            <span className={`mono text-sm font-bold tabular-nums ${accuracyColor}`}>
              {accuracy.accuracy_pct.toFixed(0)}%
            </span>
          </div>
          <span className="text-[10px] opacity-40">
            {accuracy.correct_predictions} of {accuracy.total_predictions} calls correct
          </span>
          {accuracy.streak > 1 && (
            <span className="text-[10px] opacity-40">
              On a {accuracy.streak}-call streak
            </span>
          )}
        </div>
      )}
    </div>
  );
}
