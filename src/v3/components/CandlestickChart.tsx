import { useCallback, useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { getCandles, type CandleInterval, type PublicApiConfig } from '@/lib/api';
import { cn } from '../utils/cn';

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

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 350,
      layout: {
        background: { color: 'transparent' },
        textColor: 'rgba(255,255,255,0.5)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255,255,255,0.1)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.1)',
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
          upColor: '#34d399',
          downColor: '#ef4444',
          borderUpColor: '#34d399',
          borderDownColor: '#ef4444',
          wickUpColor: '#34d399',
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
          color: '#34d39940',
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
            color: c.c >= c.o ? '#34d39940' : '#ef444440',
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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-gray-900/50">
      <div className="p-4 flex flex-col gap-3">
        {/* Header with interval selector */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {fromSymbol}/{toSymbol} Price Chart
          </span>
          <div className="flex gap-0.5 rounded-lg bg-black/50 border border-white/5 p-0.5">
            {INTERVALS.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInterval(i)}
                className={cn(
                  'h-6 px-2 text-xs rounded-md font-medium transition-all',
                  interval === i
                    ? 'bg-white text-black shadow-sm'
                    : 'text-neutral-500 hover:text-white',
                )}
              >
                {i}
              </button>
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
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
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
              <span className="text-sm text-gray-400">{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
