import { useCallback, useEffect, useState } from 'react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '@/lib/api';
import { Zap } from 'lucide-react';
import { motion } from 'framer-motion';

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

  let accuracyColor = 'text-gray-400';
  let accuracyBg = 'bg-gray-800';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) {
      accuracyColor = 'text-emerald-400';
      accuracyBg = 'bg-emerald-500/10';
    } else if (accuracy.accuracy_pct >= 40) {
      accuracyColor = 'text-amber-400';
      accuracyBg = 'bg-amber-500/10';
    } else {
      accuracyColor = 'text-red-400';
      accuracyBg = 'bg-red-500/10';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
        Prediction Market
      </span>

      {/* Conviction card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 flex flex-col gap-2"
      >
        {direction ? (
          <>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span className="text-sm font-semibold text-white">{stats.token_symbol} Price Direction</span>
            </div>
            <div className="flex items-center justify-between">
              <span
                className={
                  direction === 'UP'
                    ? 'text-xs text-emerald-400'
                    : 'text-xs text-red-400'
                }
              >
                Conviction {direction}
              </span>
              <span
                className={
                  direction === 'UP'
                    ? 'font-mono text-sm font-bold tabular-nums text-emerald-400'
                    : 'font-mono text-sm font-bold tabular-nums text-red-400'
                }
              >
                {conviction.toFixed(0)}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-black/50">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${conviction}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className={
                  direction === 'UP'
                    ? 'bg-emerald-500 rounded-full'
                    : 'bg-red-500 rounded-full'
                }
              />
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400">No clear directional consensus</p>
        )}
      </motion.div>

      {/* Historical Accuracy */}
      {accuracy && accuracy.total_predictions > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="rounded-xl border border-neutral-800/50 bg-neutral-900/50 p-3 flex flex-col gap-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wider text-gray-500">Accuracy</span>
            <span className={`font-mono text-sm font-bold tabular-nums rounded-md px-2 py-0.5 ${accuracyColor} ${accuracyBg}`}>
              {accuracy.accuracy_pct.toFixed(0)}%
            </span>
          </div>
          <span className="text-[10px] text-gray-500">
            {accuracy.correct_predictions} of {accuracy.total_predictions} calls correct
          </span>
          {accuracy.streak > 1 && (
            <span className="text-[10px] text-gray-500">
              On a {accuracy.streak}-call streak
            </span>
          )}
        </motion.div>
      )}
    </div>
  );
}
