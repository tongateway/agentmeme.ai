import { useCallback, useEffect, useState } from 'react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '@/lib/api';
import { Zap } from 'lucide-react';

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
  const direction = stats.bullish_pct > stats.bearish_pct ? 'UP' : stats.bearish_pct > stats.bullish_pct ? 'DOWN' : null;

  let accuracyColor = 'opacity-60';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) accuracyColor = 'text-success';
    else if (accuracy.accuracy_pct >= 40) accuracyColor = 'text-warning';
    else accuracyColor = 'text-error';
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wider font-semibold opacity-50">Prediction Market</span>

      <div className="card bg-base-200 shadow-sm">
        <div className="card-body p-3 gap-2">
          {direction ? (
            <>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-warning" />
                <span className="text-sm font-semibold">{stats.token_symbol} Price Direction</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${direction === 'UP' ? 'text-success' : 'text-error'}`}>
                  Probability {direction}
                </span>
                <span className={`mono text-sm font-bold tabular-nums ${direction === 'UP' ? 'text-success' : 'text-error'}`}>
                  {probability.toFixed(0)}%
                </span>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden bg-base-300">
                <div
                  className={direction === 'UP' ? 'bg-success' : 'bg-error'}
                  style={{ width: `${probability}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs opacity-50">No clear directional consensus</p>
          )}
        </div>
      </div>

      {/* Historical Accuracy */}
      {accuracy && accuracy.total_predictions > 0 && (
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-3 gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider opacity-40">Accuracy</span>
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
        </div>
      )}
    </div>
  );
}
