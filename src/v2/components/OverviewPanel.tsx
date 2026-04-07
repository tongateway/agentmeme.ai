import { useState, useEffect, useRef, useMemo } from 'react';
import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { Box, Flex, Text, Button, HStack, Spinner, Badge } from '@chakra-ui/react';
import { getRaceAiResponses, type ContractListItem, type PublicApiConfig } from '@/lib/api';
import { getChartOptions, SERIES_COLORS, lineSeriesOptions, dedupeChartData, type AppTheme } from '@/lib/chart-theme';

type OverviewPanelProps = {
  contracts: ContractListItem[];
  raceCfg: PublicApiConfig;
  theme: AppTheme;
  isDark: boolean;
};

type BalancePoint = { time: number; value: number };

type ContractSeries = {
  contractId: string;
  address: string;
  name?: string | null;
  points: BalancePoint[];
  color: string;
};

type ChartMode = 'usd' | 'pct';

function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function contractLabel(name: string | null | undefined, address: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length ? trimmed : shortAddr(address);
}

function OverviewChart({ seriesData, theme, mode }: { seriesData: ContractSeries[]; theme: AppTheme; mode: ChartMode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any[]>([]);
  const [chartReady, setChartReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...getChartOptions(theme),
      width: container.clientWidth,
      height: 420,
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      localization: mode === 'pct'
        ? { priceFormatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }
        : { priceFormatter: (v: number) => `$${v.toFixed(2)}` },
    });

    chartRef.current = chart;
    setChartReady(true);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) chart.applyOptions({ width: w });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = [];
      setChartReady(false);
    };
  }, [mode]);

  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions(getChartOptions(theme));
    }
  }, [theme]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    for (const s of seriesRef.current) {
      chart.removeSeries(s);
    }
    seriesRef.current = [];

    for (const sd of seriesData) {
      const deduped = dedupeChartData(sd.points);
      if (deduped.length < 2) continue;
      const series = chart.addSeries(LineSeries as any, lineSeriesOptions(sd.color));
      series.setData(deduped.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      seriesRef.current.push(series);
    }

    chart.timeScale().fitContent();
  }, [seriesData, chartReady]);

  return <Box ref={containerRef} w="full" minH="420px" />;
}

function LatestLegend({ seriesData, isDark }: { seriesData: ContractSeries[]; isDark: boolean }) {
  const latest = seriesData.map((s) => ({
    contractId: s.contractId,
    address: s.address,
    name: s.name,
    color: s.color,
    value: s.points.length ? s.points[s.points.length - 1].value : null,
  }));

  const textColor = isDark ? 'white' : 'gray.800';

  return (
    <Flex flexWrap="wrap" gap={2}>
      {latest.map((item) => (
        <Badge
          key={item.contractId}
          variant="outline"
          py={1.5}
          px={2}
          display="flex"
          alignItems="center"
          gap={2}
          borderColor={item.color}
        >
          <Box display="inline-block" h={2.5} w={2.5} borderRadius="full" bg={item.color} />
          <Text fontFamily="mono" fontSize="xs" color={textColor}>
            {contractLabel(item.name, item.address)}
          </Text>
          <Text fontFamily="mono" fontSize="xs" opacity={0.7} color={textColor}>
            {item.value == null ? '\u2014' : `$${item.value.toFixed(2)}`}
          </Text>
        </Badge>
      ))}
    </Flex>
  );
}

/** Convert series to % change from first data point */
function toPctSeries(series: ContractSeries[]): ContractSeries[] {
  return series.map((s) => {
    if (s.points.length === 0) return s;
    const base = s.points[0].value;
    if (base === 0) return s;
    return {
      ...s,
      points: s.points.map((p) => ({
        time: p.time,
        value: ((p.value - base) / base) * 100,
      })),
    };
  });
}

export function OverviewPanel({ contracts, raceCfg, theme, isDark }: OverviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesData, setSeriesData] = useState<ContractSeries[]>([]);
  const [mode, setMode] = useState<ChartMode>('pct');

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!contracts.length) {
        setSeriesData([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const all = await Promise.all(
          contracts.map(async (c, idx) => {
            const { results: responses } = await getRaceAiResponses(raceCfg, {
              smartContractId: c.id,
              limit: 120,
            });

            const points = responses
              .filter((r) => r.balance_usd != null)
              .map((r) => ({ time: new Date(r.created_at).getTime(), value: r.balance_usd! }))
              .sort((a, b) => a.time - b.time);

            return {
              contractId: c.id,
              address: c.address,
              name: c.name,
              points,
              color: SERIES_COLORS[idx % SERIES_COLORS.length],
            } satisfies ContractSeries;
          }),
        );

        if (alive) {
          setSeriesData(all.filter((s) => s.points.length > 1));
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [contracts, raceCfg]);

  const displaySeries = useMemo(
    () => (mode === 'pct' ? toPctSeries(seriesData) : seriesData),
    [seriesData, mode],
  );

  const cardBg = isDark ? 'gray.900' : 'gray.100';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const activeBtnBg = isDark ? 'gray.700' : 'white';
  const inactiveBorder = isDark ? 'gray.600' : 'gray.300';

  return (
    <Box mt={4} bg={cardBg} borderRadius="xl" shadow="md">
      <Box p={{ base: 4, md: 6 }} display="flex" flexDirection="column" gap={4}>
        <Flex align="center" justify="space-between">
          <Box>
            <Text fontWeight="bold" fontSize="lg" color={textMain}>Overview</Text>
            <Text fontSize="xs" opacity={0.6} color={textMuted}>Single chart for all your wallets.</Text>
          </Box>
          <HStack gap={0}>
            <Button
              size="xs"
              variant={mode === 'pct' ? 'solid' : 'outline'}
              colorPalette={mode === 'pct' ? 'brand' : undefined}
              bg={mode === 'pct' ? activeBtnBg : undefined}
              borderColor={mode !== 'pct' ? inactiveBorder : undefined}
              borderTopRightRadius={0}
              borderBottomRightRadius={0}
              onClick={() => setMode('pct')}
            >
              % Change
            </Button>
            <Button
              size="xs"
              variant={mode === 'usd' ? 'solid' : 'outline'}
              colorPalette={mode === 'usd' ? 'brand' : undefined}
              bg={mode === 'usd' ? activeBtnBg : undefined}
              borderColor={mode !== 'usd' ? inactiveBorder : undefined}
              borderTopLeftRadius={0}
              borderBottomLeftRadius={0}
              onClick={() => setMode('usd')}
            >
              USD
            </Button>
          </HStack>
        </Flex>

        {loading ? (
          <Flex justify="center" py={8}>
            <Spinner size="md" />
          </Flex>
        ) : error ? (
          <Text fontSize="sm" color="red.400">{error}</Text>
        ) : seriesData.length === 0 ? (
          <Text fontSize="sm" opacity={0.6} color={textMuted}>No chart data for agents yet.</Text>
        ) : (
          <>
            <LatestLegend seriesData={seriesData} isDark={isDark} />
            <OverviewChart seriesData={displaySeries} theme={theme} mode={mode} />
          </>
        )}
      </Box>
    </Box>
  );
}
