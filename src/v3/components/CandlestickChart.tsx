import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { getCandles, type CandleInterval, type PublicApiConfig } from '../../lib/api';
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
        textColor: 'rgba(255,255,255,0.4)',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: 'rgba(255,255,255,0.08)',
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
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
          upColor: '#00C389',
          downColor: '#FF5353',
          borderUpColor: '#00C389',
          borderDownColor: '#FF5353',
          wickUpColor: '#00C389',
          wickDownColor: '#FF5353',
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
          color: '#26a69a80',
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
            color: c.c >= c.o ? '#00C38940' : '#FF535340',
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500">
          {fromSymbol}/{toSymbol} Price Chart
        </span>
        <div className="flex gap-0.5 rounded-lg bg-gray-800 p-0.5">
          {INTERVALS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterval(i)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors',
                interval === i
                  ? 'bg-[#00C389] text-black'
                  : 'text-gray-400 hover:text-white',
              )}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

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
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />
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
            <span className="text-sm text-gray-500">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
