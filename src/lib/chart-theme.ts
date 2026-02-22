import type { DeepPartial, ChartOptions, LineSeriesPartialOptions } from 'lightweight-charts';

export type AppTheme = 'light' | 'dark';

const DARK: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: 'transparent' },
    textColor: 'rgba(255, 255, 255, 0.5)',
    fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
    horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
  },
  crosshair: {
    vertLine: { color: 'rgba(255, 255, 255, 0.15)', labelBackgroundColor: '#1e293b' },
    horzLine: { color: 'rgba(255, 255, 255, 0.15)', labelBackgroundColor: '#1e293b' },
  },
  timeScale: {
    borderColor: 'rgba(255, 255, 255, 0.06)',
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: {
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
};

const LIGHT: DeepPartial<ChartOptions> = {
  layout: {
    background: { color: 'transparent' },
    textColor: 'rgba(15, 23, 42, 0.5)',
    fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    attributionLogo: false,
  },
  grid: {
    vertLines: { color: 'rgba(15, 23, 42, 0.05)' },
    horzLines: { color: 'rgba(15, 23, 42, 0.05)' },
  },
  crosshair: {
    vertLine: { color: 'rgba(15, 23, 42, 0.2)', labelBackgroundColor: '#f1f5f9' },
    horzLine: { color: 'rgba(15, 23, 42, 0.2)', labelBackgroundColor: '#f1f5f9' },
  },
  timeScale: {
    borderColor: 'rgba(15, 23, 42, 0.08)',
    timeVisible: true,
    secondsVisible: false,
  },
  rightPriceScale: {
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
};

export function getChartOptions(theme: AppTheme): DeepPartial<ChartOptions> {
  return theme === 'dark' ? DARK : LIGHT;
}

export const SERIES_COLORS = [
  '#00C389', // green
  '#3B82F6', // blue
  '#F97316', // orange
  '#A855F7', // purple
  '#EF4444', // red
  '#14B8A6', // teal
  '#F59E0B', // amber
  '#6366F1', // indigo
];

/**
 * Deduplicate + sort data points for Lightweight Charts.
 * LC v5 requires strictly increasing timestamps; duplicates cause silent data loss.
 * Keeps the last value per unique second.
 */
export function dedupeChartData(points: { time: number; value: number }[]): { time: number; value: number }[] {
  if (points.length === 0) return [];
  // Sort by time ascending
  const sorted = [...points].sort((a, b) => a.time - b.time);
  // Dedupe: keep last value per second (time is in ms, LC wants seconds)
  const map = new Map<number, number>();
  for (const p of sorted) {
    const sec = Math.floor(p.time / 1000);
    map.set(sec, p.value);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));
}

export function lineSeriesOptions(color: string): LineSeriesPartialOptions {
  return {
    color,
    lineWidth: 2,
    crosshairMarkerRadius: 4,
    crosshairMarkerBorderWidth: 1,
    crosshairMarkerBackgroundColor: color,
    priceFormat: {
      type: 'custom',
      formatter: (price: number) => `$${price.toFixed(2)}`,
    },
  };
}
