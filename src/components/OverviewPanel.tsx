import { useState, useEffect, useRef } from 'react';
import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import { getRaceAiResponses, type ContractListItem, type PublicApiConfig } from '@/lib/api';
import { getChartOptions, SERIES_COLORS, lineSeriesOptions, dedupeChartData, type AppTheme } from '@/lib/chart-theme';

type OverviewPanelProps = {
  contracts: ContractListItem[];
  raceCfg: PublicApiConfig;
  theme: AppTheme;
};

type BalancePoint = { time: number; value: number };

type ContractSeries = {
  contractId: string;
  address: string;
  name?: string | null;
  points: BalancePoint[];
  color: string;
};

function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function contractLabel(name: string | null | undefined, address: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length ? trimmed : shortAddr(address);
}

function OverviewChart({ seriesData, theme }: { seriesData: ContractSeries[]; theme: AppTheme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any[]>([]);

  const [chartReady, setChartReady] = useState(false);

  // Create chart
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...getChartOptions(theme),
      width: container.clientWidth,
      height: 420,
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
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
  }, []);

  // Update theme
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions(getChartOptions(theme));
    }
  }, [theme]);

  // Update series data — depend on chartReady so it runs after chart creation
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !chartReady) return;

    // Remove old series
    for (const s of seriesRef.current) {
      chart.removeSeries(s);
    }
    seriesRef.current = [];

    // Add new
    for (const sd of seriesData) {
      const deduped = dedupeChartData(sd.points);
      if (deduped.length < 2) continue;
      const series = chart.addSeries(LineSeries as any, lineSeriesOptions(sd.color));
      series.setData(deduped.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      seriesRef.current.push(series);
    }

    chart.timeScale().fitContent();
  }, [seriesData, chartReady]);

  return <div ref={containerRef} className="w-full" style={{ minHeight: 420 }} />;
}

function LatestLegend({ seriesData }: { seriesData: ContractSeries[] }) {
  const latest = seriesData.map((s) => ({
    contractId: s.contractId,
    address: s.address,
    name: s.name,
    color: s.color,
    value: s.points.length ? s.points[s.points.length - 1].value : null,
  }));

  return (
    <div className="flex flex-wrap gap-2">
      {latest.map((item) => (
        <span key={item.contractId} className="badge badge-outline gap-2 py-3" style={{ borderColor: item.color }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="mono text-xs">{contractLabel(item.name, item.address)}</span>
          <span className="mono text-xs opacity-70">{item.value == null ? '—' : `$${item.value.toFixed(2)}`}</span>
        </span>
      ))}
    </div>
  );
}

export function OverviewPanel({ contracts, raceCfg, theme }: OverviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesData, setSeriesData] = useState<ContractSeries[]>([]);

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
            const responses = await getRaceAiResponses(raceCfg, {
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

  return (
    <div className="mt-4 card bg-base-200 shadow-md">
      <div className="card-body gap-4">
        <h2 className="card-title">Overview</h2>
        <p className="text-xs opacity-60">Single chart for all your wallets.</p>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : error ? (
          <div className="text-sm text-error">{error}</div>
        ) : seriesData.length === 0 ? (
          <div className="text-sm opacity-60">No chart data for agents yet.</div>
        ) : (
          <>
            <LatestLegend seriesData={seriesData} />
            <OverviewChart seriesData={seriesData} theme={theme} />
          </>
        )}
      </div>
    </div>
  );
}
