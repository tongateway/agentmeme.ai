import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { getCandles, type CandleInterval, type PublicApiConfig } from '@/lib/api';
import { Button } from '@/v2/components/ui/button';
import { Loader2 } from 'lucide-react';

type CandlestickChartProps = {
  raceCfg: PublicApiConfig;
  fromSymbol: string;
  toSymbol: string;
  height?: number;
};

const INTERVALS: CandleInterval[] = ['1m', '5m', '15m', '1h', '1d'];

const PERIOD_MAP: Record<CandleInterval, string> = {
  '1m': '1h',
  '5m': '6h',
  '15m': '4d',
  '1h': '7d',
  '1d': '30d',
};

const CHART_GREEN = '#22c55e';
const CHART_RED = '#ef4444';

export function CandlestickChart({ raceCfg, fromSymbol, toSymbol, height = 380 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [interval, setInterval] = useState<CandleInterval>('1h');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const buildChart = useCallback(() => {
    if (!containerRef.current) return null;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
    const gridColor = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    const crosshairColor = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
    const labelBg = isDark ? '#1a1a1a' : '#ffffff';

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { color: 'transparent' },
        textColor,
        fontSize: 11,
        fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor,
        rightOffset: 6,
        barSpacing: 8,
        fixLeftEdge: false,
        lockVisibleTimeRangeOnResize: true,
      },
      rightPriceScale: {
        borderColor,
        scaleMargins: { top: 0.08, bottom: 0.25 },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: crosshairColor,
          width: 1,
          style: 2,
          labelBackgroundColor: labelBg,
        },
        horzLine: {
          color: crosshairColor,
          width: 1,
          style: 2,
          labelBackgroundColor: labelBg,
        },
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    return chart;
  }, [height]);

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

        // Determine price precision from data range
        const prices = candles.flatMap((c) => [c.o, c.h, c.l, c.c]).filter((p) => p > 0);
        const minPrice = Math.min(...prices);
        const precision = minPrice >= 1 ? 4 : minPrice >= 0.01 ? 6 : minPrice >= 0.0001 ? 8 : 10;

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: CHART_GREEN,
          downColor: CHART_RED,
          borderUpColor: CHART_GREEN,
          borderDownColor: CHART_RED,
          wickUpColor: CHART_GREEN,
          wickDownColor: CHART_RED,
          priceFormat: {
            type: 'price',
            precision,
            minMove: 1 / Math.pow(10, precision),
          },
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
          priceFormat: { type: 'volume' },
          priceScaleId: '',
        });

        chart.priceScale('').applyOptions({
          scaleMargins: { top: 0.82, bottom: 0 },
        });

        volumeSeries.setData(
          candles.map((c) => ({
            time: c.t as UTCTimestamp,
            value: c.v,
            color: c.c >= c.o ? `${CHART_GREEN}40` : `${CHART_RED}40`,
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
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted-foreground">
          {fromSymbol}/{toSymbol} Price Chart
        </span>
        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
          {INTERVALS.map((i) => (
            <Button
              key={i}
              type="button"
              variant={interval === i ? 'secondary' : 'ghost'}
              size="sm"
              className="px-2.5 h-7 text-xs font-mono"
              onClick={() => setInterval(i)}
            >
              {i}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative" style={{ height }}>
        <div ref={containerRef} style={{ height }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
