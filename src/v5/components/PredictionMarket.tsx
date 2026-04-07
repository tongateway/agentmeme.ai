import { useCallback, useEffect, useState } from 'react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '@/lib/api';
import { Zap } from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';

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

  let accuracyVariant: 'success' | 'warning' | 'destructive' | 'secondary' = 'secondary';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) accuracyVariant = 'success';
    else if (accuracy.accuracy_pct >= 40) accuracyVariant = 'warning';
    else accuracyVariant = 'destructive';
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-neutral-500 dark:text-neutral-400">
        Prediction Market
      </span>

      {/* Conviction card */}
      <Card>
        <CardContent className="p-3 flex flex-col gap-2">
          {direction ? (
            <>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-semibold">{stats.token_symbol} Price Direction</span>
              </div>
              <div className="flex items-center justify-between">
                <span
                  className={
                    direction === 'UP'
                      ? 'text-xs text-emerald-600 dark:text-emerald-400'
                      : 'text-xs text-red-600 dark:text-red-400'
                  }
                >
                  Conviction {direction}
                </span>
                <span
                  className={
                    direction === 'UP'
                      ? 'font-mono text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400'
                      : 'font-mono text-sm font-bold tabular-nums text-red-600 dark:text-red-400'
                  }
                >
                  {conviction.toFixed(0)}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="flex h-2 rounded-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                <div
                  className={
                    direction === 'UP'
                      ? 'bg-emerald-500 rounded-full transition-all'
                      : 'bg-red-500 rounded-full transition-all'
                  }
                  style={{ width: `${conviction}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-neutral-400">No clear directional consensus</p>
          )}
        </CardContent>
      </Card>

      {/* Historical Accuracy */}
      {accuracy && accuracy.total_predictions > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider text-neutral-400">Accuracy</span>
              <Badge variant={accuracyVariant} className="font-mono tabular-nums">
                {accuracy.accuracy_pct.toFixed(0)}%
              </Badge>
            </div>
            <span className="text-[10px] text-neutral-400">
              {accuracy.correct_predictions} of {accuracy.total_predictions} calls correct
            </span>
            {accuracy.streak > 1 && (
              <span className="text-[10px] text-neutral-400">
                On a {accuracy.streak}-call streak
              </span>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
