import { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { getCandles, type CandleInterval, type PublicApiConfig } from '@/lib/api';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

type CandlestickChartProps = {
  raceCfg: PublicApiConfig;
  fromSymbol: string;
  toSymbol: string;
};

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '1d'];

const PERIOD_MAP: Record<CandleInterval, string> = {
  '1m': '1h',
  '5m': '6h',
  '15m': '4d',
  '1h': '7d',
  '1d': '30d',
};

export function CandlestickChart({ raceCfg, fromSymbol, toSymbol }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [interval, setInterval] = useState<CandleInterval>('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildChart = useCallback(() => {
    if (!containerRef.current) return null;

    const isDark = document.documentElement.classList.contains('dark');

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 350,
      layout: {
        background: { color: 'transparent' },
        textColor: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      },
      rightPriceScale: {
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      },
      crosshair: {
        mode: 0,
      },
    });

    return chart;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = buildChart();
    if (!chart) return;
    chartRef.current = chart;

    let cancelled = false;

    setLoading(true);
    setError(null);

    getCandles(raceCfg, fromSymbol, toSymbol, {
      interval,
      period: PERIOD_MAP[interval],
    })
      .then((candles) => {
        if (cancelled) return;
        setLoading(false);

        if (candles.length === 0) {
          setError('No chart data available for this period.');
          return;
        }

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#10b981',
          downColor: '#ef4444',
          borderUpColor: '#10b981',
          borderDownColor: '#ef4444',
          wickUpColor: '#10b981',
          wickDownColor: '#ef4444',
        });

        candleSeries.setData(
          candles.map((c) => ({
            time: c.t as UTCTimestamp,
            open: c.o,
            high: c.h,
            low: c.l,
            close: c.c,
          })),
        );

        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#8b5cf680',
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });

        chart.priceScale('').applyOptions({
          scaleMargins: { top: 0.8, bottom: 0 },
        });

        volumeSeries.setData(
          candles.map((c) => ({
            time: c.t as UTCTimestamp,
            value: c.v,
            color: c.c >= c.o ? '#10b98140' : '#ef444440',
          })),
        );

        chart.timeScale().fitContent();
      })
      .catch((e) => {
        if (cancelled) return;
        setLoading(false);
        setError('Chart data unavailable.');
        console.error('CandlestickChart error:', e);
      });

    const ro = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [raceCfg, fromSymbol, toSymbol, interval, buildChart]);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Header with interval selector */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            {fromSymbol}/{toSymbol} Price Chart
          </span>
          <div className="flex gap-0.5 rounded-lg bg-neutral-100 p-0.5 dark:bg-neutral-800">
            {INTERVALS.map((i) => (
              <Button
                key={i}
                type="button"
                variant={interval === i ? 'secondary' : 'ghost'}
                size="sm"
                className={cn(
                  'h-6 px-2 text-xs',
                  interval === i && 'bg-white text-violet-700 shadow-sm dark:bg-neutral-700 dark:text-violet-300',
                )}
                onClick={() => setInterval(i)}
              >
                {i}
              </Button>
            ))}
          </div>
        </div>

        {/* Chart area */}
        <div style={{ position: 'relative', height: 350 }}>
          <div ref={containerRef} style={{ height: 350 }} />
          {loading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}
          {!loading && error && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span className="text-sm text-neutral-400">{error}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
