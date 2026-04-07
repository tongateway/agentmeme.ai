import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { Box, Flex, Text, Button, HStack, Spinner } from '@chakra-ui/react';
import { getCandles, type CandleInterval, type PublicApiConfig } from '@/lib/api';

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

  // Detect dark mode
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') !== 'light',
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const buildChart = useCallback(() => {
    if (!containerRef.current) return null;
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
  }, [isDark]);

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
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [raceCfg, fromSymbol, toSymbol, interval, buildChart]);

  return (
    <Flex direction="column" gap={2}>
      <Flex align="center" justify="space-between">
        <Text fontSize="xs" fontWeight="semibold" opacity={0.5}>
          {fromSymbol}/{toSymbol} Price Chart
        </Text>
        <HStack gap={0.5} bg={isDark ? 'gray.800' : 'gray.200'} borderRadius="lg" p={0.5}>
          {INTERVALS.map((i) => (
            <Button
              key={i}
              size="xs"
              variant={interval === i ? 'solid' : 'ghost'}
              colorPalette={interval === i ? 'brand' : undefined}
              color={
                interval === i ? undefined : isDark ? 'gray.400' : 'gray.600'
              }
              onClick={() => setInterval(i)}
              minW="auto"
              px={2}
              h={6}
              fontSize="xs"
            >
              {i}
            </Button>
          ))}
        </HStack>
      </Flex>

      <Box position="relative" h="350px">
        <div ref={containerRef} style={{ height: 350 }} />
        {loading && (
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
          >
            <Spinner size="md" color="brand.500" />
          </Flex>
        )}
        {!loading && error && (
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
          >
            <Text fontSize="sm" opacity={0.5} color={isDark ? 'white' : 'gray.700'}>
              {error}
            </Text>
          </Flex>
        )}
      </Box>
    </Flex>
  );
}
