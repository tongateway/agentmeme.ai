import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid,
} from 'recharts';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, Activity, Loader2 } from 'lucide-react';
import {
  getProviderStats, getProviderLogs,
  type PublicApiConfig, type ProviderStat, type ProviderLog,
} from '@/lib/api';
import { Card, CardContent } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';
import { Button } from '@/v2/components/ui/button';
import { Separator } from '@/v2/components/ui/separator';

const raceCfg: PublicApiConfig = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz',
};

const STATUS_META: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; colorClass: string; Icon: typeof CheckCircle }> = {
  up:       { label: 'Operational', variant: 'default',     colorClass: 'text-green-500', Icon: CheckCircle },
  degraded: { label: 'Degraded',    variant: 'secondary',   colorClass: 'text-yellow-500', Icon: AlertTriangle },
  down:     { label: 'Down',        variant: 'destructive', colorClass: 'text-red-500',    Icon: XCircle },
};

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Bucket logs into time intervals for charts. */
function bucketLogs(logs: ProviderLog[], bucketMinutes = 30): { time: number; success: number; fail: number; avgMs: number }[] {
  if (logs.length === 0) return [];
  const bucketMs = bucketMinutes * 60 * 1000;
  const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const min = new Date(sorted[0].created_at).getTime();
  const max = new Date(sorted[sorted.length - 1].created_at).getTime();
  const buckets = new Map<number, { success: number; fail: number; totalMs: number; count: number }>();

  // Pre-fill empty buckets
  for (let t = Math.floor(min / bucketMs) * bucketMs; t <= max + bucketMs; t += bucketMs) {
    buckets.set(t, { success: 0, fail: 0, totalMs: 0, count: 0 });
  }

  for (const log of sorted) {
    const ts = new Date(log.created_at).getTime();
    const key = Math.floor(ts / bucketMs) * bucketMs;
    const b = buckets.get(key) ?? { success: 0, fail: 0, totalMs: 0, count: 0 };
    if (log.success) b.success++; else b.fail++;
    b.totalMs += log.elapsed_ms;
    b.count++;
    buckets.set(key, b);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, b]) => ({
      time,
      success: b.success,
      fail: b.fail,
      avgMs: b.count > 0 ? b.totalMs / b.count : 0,
    }));
}

function ProviderCard({ stat }: { stat: ProviderStat }) {
  const [logs, setLogs] = useState<ProviderLog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const meta = STATUS_META[stat.status] ?? STATUS_META.up;
  const Icon = meta.Icon;

  const loadLogs = useCallback(async () => {
    if (logs) return;
    setLoading(true);
    try {
      const data = await getProviderLogs(raceCfg, stat.provider, 24, 200);
      setLogs(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [stat.provider, logs]);

  useEffect(() => {
    if (expanded && !logs) void loadLogs();
  }, [expanded, logs, loadLogs]);

  const chartData = useMemo(() => logs ? bucketLogs(logs) : [], [logs]);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <Card className="shadow-md">
      <CardContent
        className="p-4 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon className={`h-5 w-5 ${meta.colorClass}`} />
            <div>
              <div className="font-bold text-base capitalize">{stat.provider}</div>
              <div className="text-xs text-muted-foreground">{stat.total_requests.toLocaleString()} total requests</div>
            </div>
          </div>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Success Rate</div>
            <div className={`text-lg font-bold font-mono ${stat.success_rate >= 80 ? 'text-green-500' : stat.success_rate >= 50 ? 'text-yellow-500' : 'text-red-500'}`}>
              {stat.success_rate.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Avg Latency</div>
            <div className="text-lg font-bold font-mono">{fmtMs(stat.avg_elapsed_ms)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Success</div>
            <div className="text-xs font-mono text-muted-foreground">{fmtDate(stat.last_success)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Failure</div>
            <div className="text-xs font-mono text-muted-foreground">{fmtDate(stat.last_failure)}</div>
          </div>
        </div>
      </CardContent>

      {/* Expanded: charts */}
      {expanded && (
        <div className="px-6 pb-4 space-y-4">
          <Separator />
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">No log data available</div>
          ) : (
            <>
              {/* Success / Fail bar chart */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">Requests (24h)</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="time"
                      tickFormatter={fmtTime}
                      tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.4 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={50}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.4 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8, fontSize: 12, padding: '6px 10px',
                      }}
                      labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
                    />
                    <Bar dataKey="success" stackId="a" fill="#00C389" name="Success" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="fail" stackId="a" fill="#FF5470" name="Fail" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Latency area chart */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">Avg Latency (24h)</div>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id={`lat-${stat.provider}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6C9CFF" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6C9CFF" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      tickFormatter={fmtTime}
                      tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.4 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={50}
                    />
                    <YAxis
                      tickFormatter={(v: number) => fmtMs(v)}
                      tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.4 }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8, fontSize: 12, padding: '6px 10px',
                      }}
                      labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
                      formatter={(value) => [fmtMs(Number(value)), 'Avg Latency']}
                    />
                    <Area
                      type="monotone"
                      dataKey="avgMs"
                      stroke="#6C9CFF"
                      strokeWidth={2}
                      fill={`url(#lat-${stat.provider})`}
                      dot={false}
                      activeDot={{ r: 3, fill: '#6C9CFF', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

export function StatusPage() {
  const [stats, setStats] = useState<ProviderStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProviderStats(raceCfg);
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load provider stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const allUp = stats.length > 0 && stats.every((s) => s.status === 'up');
  const anyDown = stats.some((s) => s.status === 'down');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Provider Status</h1>
            <p className="text-xs text-muted-foreground">AI provider health and performance</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Overall status banner */}
      {!loading && stats.length > 0 && (
        <Card className={`border-l-4 ${allUp ? 'border-l-green-500' : anyDown ? 'border-l-red-500' : 'border-l-yellow-500'}`}>
          <CardContent className="flex items-center gap-3 py-3">
            {allUp ? (
              <><CheckCircle className="h-5 w-5 text-green-500" /><span>All systems operational</span></>
            ) : anyDown ? (
              <><XCircle className="h-5 w-5 text-red-500" /><span>Some providers are experiencing outages</span></>
            ) : (
              <><AlertTriangle className="h-5 w-5 text-yellow-500" /><span>Some providers are degraded</span></>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && stats.length === 0 && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="flex items-center gap-3 py-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Provider cards */}
      <div className="space-y-4">
        {stats.map((s) => (
          <ProviderCard key={s.provider} stat={s} />
        ))}
      </div>

      {!loading && stats.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-muted-foreground">No provider data available</div>
      )}
    </div>
  );
}
