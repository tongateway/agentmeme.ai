import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell } from '@ton/core';
import { AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import {
  getRaceAiResponses,
  getRaceContractDetail,
  getRaceContractPrompt,
  updateRaceContractPrompt,
  getRaceTokens,
  getJettonBalances,
  getTonPriceUsd,
  getDexCoinPrice,
  updateRaceContract,
  withdrawJetton,
  withdrawTon,
  closeAllOrders,
  createOrGetTelegramBot,
  deleteRaceContract,
  getDexOrderStats,
  hexBocToBase64,
  listRaceContracts,
  getDexOrders,
  resolveCoinSymbols,
  fromNanoToken,
  type AiResponse,
  type ContractListItem,
  type ContractDetail,
  type PublicApiConfig,
  type RaceToken,
  type TelegramBotResponse,
  type WithdrawJettonResult,
  type DexOrder,
  type DexOrderStats,
} from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import {
  readCache, writeCache,
  aiResponsesCacheKey, balancesCacheKey,
  ordersCacheKey, orderStatsCacheKey, coinMapCacheKey,
} from '@/lib/cache';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import {
  Trash2, ArrowDownToLine, ArrowUpFromLine, XCircle,
  Share2, Check, Pause, Play, Wallet, AlertTriangle, RefreshCw,
  FileText, Copy, Pencil, Save, Loader2,
  Bot, Zap, Activity, ArrowUpRight, Clock, ShieldOff, TrendingUp, TrendingDown,
  ArrowRightLeft, ExternalLink, Send,
} from 'lucide-react';

import { ContractTabBar } from '@/v2/components/layout/ContractTabBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/v2/components/ui/card';
import { Button } from '@/v2/components/ui/button';
import { Badge } from '@/v2/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/v2/components/ui/tabs';
import { Input } from '@/v2/components/ui/input';
import { Textarea } from '@/v2/components/ui/textarea';
import { Separator } from '@/v2/components/ui/separator';
import { Skeleton } from '@/v2/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/v2/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/v2/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

/** A resolved token balance row for display. */
type TokenBalanceRow = {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
};

type ChartPoint = { time: number; value: number };

type TimeRange = '1h' | '6h' | '24h' | '7d';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Normalize a raw address (0:hex) to lowercase for matching. */
function normalizeRaw(addr: string): string {
  return addr.toLowerCase().replace(/^0:/, '');
}

/** Convert a friendly EQ/UQ address to raw hex (lowercase, no 0: prefix). */
function friendlyToRawHex(addr: string): string {
  try {
    const raw = Address.parse(addr).toRawString(); // "0:HEX"
    return raw.replace(/^0:/, '').toLowerCase();
  } catch {
    return addr.toLowerCase();
  }
}

function fmtAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}\u2026${addr.slice(-8)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
}

function tonscanLink(addr: string): string {
  return `https://tonscan.org/address/${addr}`;
}

async function fetchTonBalance(address: string): Promise<string> {
  const resp = await fetch(
    `https://toncenter.com/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`,
  );
  const json = await resp.json() as { ok: boolean; result: string };
  if (!json.ok) return '\u2014';
  const nano = BigInt(json.result);
  const whole = nano / 1_000_000_000n;
  const frac = nano % 1_000_000_000n;
  const fracStr = frac.toString().padStart(9, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : `${whole}`;
}

function buildShareUrl(responseId: string): string {
  return `https://agentmeme.ai/#share/r/${responseId}`;
}

/* ---------- Orders helpers ---------- */

function toRawAddress(friendlyAddr: string): string {
  try {
    return Address.parse(friendlyAddr).toRawString();
  } catch {
    return friendlyAddr;
  }
}

function coinLabel(coinId: number, coinMap: Map<number, string>): string {
  return coinMap.get(coinId) || (coinId === 0 ? 'TON' : `#${coinId}`);
}

function orderStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'completed') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'created' || status === 'deployed' || status === 'pending_match') return 'secondary';
  return 'outline';
}

function fmtAmount(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtOrderTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function explorerOrderLink(rawAddr: string): string {
  return `https://tonviewer.com/${rawAddr}`;
}

/* ------------------------------------------------------------------ */
/*  Chart Constants                                                   */
/* ------------------------------------------------------------------ */

const CHART_GREEN = '#00C389';

const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

/* ------------------------------------------------------------------ */
/*  Sub-components: Charts                                            */
/* ------------------------------------------------------------------ */

function BalanceChart({ points }: { points: ChartPoint[] }) {
  const [range, setRange] = useState<TimeRange>('24h');

  const filtered = useMemo(() => {
    const rangeMs = TIME_RANGES.find((r) => r.key === range)?.ms ?? 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - rangeMs;
    const result = points.filter((p) => p.time >= cutoff);
    return result.length > 0 ? result : points.slice(-20);
  }, [points, range]);

  const currentBalance = filtered.length > 0 ? filtered[filtered.length - 1].value : 0;
  const startBalance = filtered.length > 0 ? filtered[0].value : 0;
  const changePct = startBalance > 0 ? ((currentBalance - startBalance) / startBalance) * 100 : 0;
  const changePositive = changePct >= 0;

  const fmtTime = (ts: number) => {
    const d = new Date(ts);
    if (range === '7d') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Balance (USD)</div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono tabular-nums">
              ${currentBalance.toFixed(2)}
            </span>
            <span className={`text-xs font-bold font-mono tabular-nums ${changePositive ? 'text-green-500' : 'text-red-500'}`}>
              {changePositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
          {TIME_RANGES.map((r) => (
            <Button
              key={r.key}
              variant={range === r.key ? 'secondary' : 'ghost'}
              size="sm"
              className="px-3 h-6 text-xs"
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 250 }}>
          <span className="text-sm text-muted-foreground">No balance data yet.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={filtered} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tickFormatter={fmtTime}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.4 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.4 }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
                padding: '6px 10px',
              }}
              labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Balance']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_GREEN}
              strokeWidth={2.5}
              fill="url(#balanceGradient)"
              dot={false}
              activeDot={{ r: 4, fill: CHART_GREEN, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: TradingPairsRow                                    */
/* ------------------------------------------------------------------ */

function TradingPairsRow({ tradingPairs }: { tradingPairs: string | null | undefined }) {
  const pairs = (tradingPairs ?? '').split(',').map((p) => p.trim()).filter(Boolean);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-muted-foreground shrink-0">Trading Pairs</div>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {pairs.map((p) => (
          <Badge key={p} variant="secondary" className="text-xs">{p}</Badge>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-component: OrdersSection (inline OrdersPanel)                 */
/* ------------------------------------------------------------------ */

type OrderTabFilter = 'active' | 'history';

function OrdersSection({ contractAddress }: { contractAddress: string }) {
  const rawAddress = useMemo(() => toRawAddress(contractAddress), [contractAddress]);

  const ordCacheKey = ordersCacheKey(contractAddress);
  const statsCacheKey = orderStatsCacheKey(contractAddress);
  const coinCacheKey = coinMapCacheKey(contractAddress);

  const cachedOrders = useMemo(() => readCache<DexOrder[]>(ordCacheKey), [ordCacheKey]);
  const cachedStats = useMemo(() => readCache<DexOrderStats>(statsCacheKey), [statsCacheKey]);
  const cachedCoinEntries = useMemo(() => readCache<[number, string][]>(coinCacheKey), [coinCacheKey]);

  const [tab, setTab] = useState<OrderTabFilter>('active');
  const [allOrders, setAllOrders] = useState<DexOrder[]>(cachedOrders ?? []);
  const [loading, setLoading] = useState(!cachedOrders);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<DexOrderStats | null>(cachedStats);
  const [coinMap, setCoinMap] = useState<Map<number, string>>(
    cachedCoinEntries ? new Map(cachedCoinEntries) : new Map([[0, 'TON']]),
  );
  const [tonPrice, setTonPrice] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ACTIVE_SET = useMemo(() => new Set(['created', 'deployed', 'pending_match']), []);
  const INITIAL_LIMIT = 10;

  const loadAll = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [statsData, price] = await Promise.all([
        getDexOrderStats(rawAddress),
        getTonPriceUsd(),
      ]);
      setStats(statsData);
      writeCache(statsCacheKey, statsData);
      if (price != null) setTonPrice(price);
      await new Promise((r) => setTimeout(r, 1100));
      const [activeOrders, recentOrders] = await Promise.all([
        getDexOrders(rawAddress, { status: 'deployed', limit: 100 }),
        getDexOrders(rawAddress, { limit: 200 }),
      ]);
      const byId = new Map<number, DexOrder>();
      for (const o of recentOrders) byId.set(o.id, o);
      for (const o of activeOrders) byId.set(o.id, o);
      const orders = Array.from(byId.values());
      orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAllOrders(orders);
      writeCache(ordCacheKey, orders);
      const coinIds = orders.flatMap((o) => [o.from_coin_id, o.to_coin_id]);
      if (coinIds.length > 0) {
        await new Promise((r) => setTimeout(r, 1100));
        const resolved = await resolveCoinSymbols(coinIds);
        setCoinMap(resolved);
        writeCache(coinCacheKey, Array.from(resolved.entries()));
      }
    } catch (e) {
      if (!isBackground) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [rawAddress, ordCacheKey, statsCacheKey, coinCacheKey]);

  useEffect(() => {
    void loadAll(!!cachedOrders);
  }, [loadAll, cachedOrders]);

  const filteredOrders = useMemo(() => {
    if (tab === 'active') return allOrders.filter((o) => ACTIVE_SET.has(o.status));
    return allOrders.filter((o) => !ACTIVE_SET.has(o.status));
  }, [allOrders, tab, ACTIVE_SET]);

  const orders = useMemo(
    () => showAll ? filteredOrders : filteredOrders.slice(0, INITIAL_LIMIT),
    [filteredOrders, showAll],
  );
  const hasMore = filteredOrders.length > INITIAL_LIMIT;

  useEffect(() => { setShowAll(false); }, [tab]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            <CardTitle>DEX Orders</CardTitle>
            {refreshing && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating...
              </span>
            )}
            {stats && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">{stats.total} total</Badge>
                {stats.open > 0 && (
                  <Badge variant="secondary" className="text-[10px]">{stats.open} open</Badge>
                )}
                <Badge variant="outline" className="text-[10px]">{stats.closed} closed</Badge>
              </div>
            )}
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as OrderTabFilter)}>
            <TabsList className="h-8">
              <TabsTrigger value="active" className="text-xs">
                Active{stats?.open ? ` (${stats.open})` : ''}
              </TabsTrigger>
              <TabsTrigger value="history" className="text-xs">
                History{stats?.closed ? ` (${stats.closed})` : ''}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-red-500 mt-2">{error}</div>
        ) : loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {tab === 'active' ? 'No active orders.' : 'No order history yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0 mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Rate</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">~ Receive</TableHead>
                  <TableHead className="hidden sm:table-cell">Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const fromLabel = coinLabel(o.from_coin_id, coinMap);
                  const toLabel = coinLabel(o.to_coin_id, coinMap);
                  const humanAmount = fromNanoToken(o.initial_amount, fromLabel);
                  const humanRate = o.price_rate / 1e18;
                  const usdValue =
                    o.from_coin_id === 0 && tonPrice != null
                      ? humanAmount * tonPrice
                      : null;
                  const receiveAmount = humanRate > 0 ? humanAmount * humanRate : null;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{fmtOrderTime(o.created_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium text-xs">{fromLabel}</span>
                        <span className="text-muted-foreground mx-1">-&gt;</span>
                        <span className="font-medium text-xs">{toLabel}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right whitespace-nowrap">
                        <div>{fmtAmount(humanAmount)} {fromLabel}</div>
                        {usdValue != null && (
                          <div className="text-muted-foreground text-[10px]">~${usdValue.toFixed(2)}</div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right whitespace-nowrap hidden sm:table-cell">
                        {humanRate > 0 ? fmtAmount(humanRate) : '\u2014'}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-right whitespace-nowrap hidden sm:table-cell">
                        {receiveAmount != null ? (
                          <span>~{fmtAmount(receiveAmount)} {toLabel}</span>
                        ) : '\u2014'}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={orderStatusVariant(o.status)} className="text-[10px]">
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {o.raw_address && (
                          <a
                            href={explorerOrderLink(o.raw_address)}
                            target="_blank"
                            rel="noreferrer"
                            title="View on Tonviewer"
                          >
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {hasMore && (
              <div className="flex justify-center mt-3">
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Show less' : `Show all ${filteredOrders.length} orders`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                    */
/* ------------------------------------------------------------------ */

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress();

  const raceCfg: PublicApiConfig = useMemo(() => ({ baseUrl: API_BASE }), []);
  const { jwtToken } = useAuth(raceCfg);
  const authedCfg: PublicApiConfig = useMemo(
    () => (jwtToken ? { ...raceCfg, jwtToken } : raceCfg),
    [raceCfg, jwtToken],
  );

  /* ---- Page-level loading state ---- */
  const [contract, setContract] = useState<ContractListItem | null>(null);
  const [detail, setDetail] = useState<ContractDetail | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  /* ---- Fetch contract data on mount ---- */
  useEffect(() => {
    if (!id) { setPageError('No contract ID'); setPageLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // Fetch the detail and the full list in parallel
        const [det, list] = await Promise.all([
          getRaceContractDetail(authedCfg, id),
          listRaceContracts(authedCfg),
        ]);
        if (cancelled) return;
        setDetail(det);
        // Find the ContractListItem from the list
        const listItem = list.find((c) => c.id === id);
        if (listItem) {
          setContract(listItem);
        } else {
          // Construct a ContractListItem from ContractDetail
          setContract({
            id: det.id,
            address: det.address,
            name: det.name,
            owner_address: det.owner_address,
            is_active: det.is_active,
            status: det.status,
            ai_model: det.ai_model,
            ai_provider: det.ai_provider,
            created_at: det.created_at,
            updated_at: det.updated_at,
            total_decisions: null,
            max_decisions: null,
            used_decisions: null,
            trading_pairs: null,
            profit_usd: null,
          });
        }
      } catch (e) {
        if (!cancelled) setPageError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, authedCfg]);

  /* ---- Show loading / error ---- */
  if (pageLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 flex flex-col gap-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (pageError || !contract) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-3" />
            <p className="text-red-500">{pageError || 'Contract not found'}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ContractDetailInner
      contract={contract}
      detail={detail}
      raceCfg={authedCfg}
      tonConnectUI={tonConnectUI}
      tonAddress={tonAddress}
      onDeleted={() => navigate('/')}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Inner Component (once contract is loaded)                         */
/* ------------------------------------------------------------------ */

type InnerProps = {
  contract: ContractListItem;
  detail: ContractDetail | null;
  raceCfg: PublicApiConfig;
  tonConnectUI: ReturnType<typeof useTonConnectUI>[0];
  tonAddress: string;
  onDeleted: () => void;
};

function ContractDetailInner({ contract, detail, raceCfg, tonConnectUI, tonAddress, onDeleted }: InnerProps) {
  const [topupAmount, setTopupAmount] = useState('5');
  const [topupToken, setTopupToken] = useState('TON');
  const [topupBusy, setTopupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiModel, setAiModel] = useState<string | null>(detail?.ai_model || null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptEditing, setPromptEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  // AI responses: load from cache first, then refresh
  const aiCacheKey = aiResponsesCacheKey(contract.id);
  const cachedAi = useMemo(() => {
    const raw = readCache<AiResponse[]>(aiCacheKey);
    return Array.isArray(raw) ? raw : null;
  }, [aiCacheKey]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>(cachedAi ?? []);
  const [aiLoading, setAiLoading] = useState(!cachedAi);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Share copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Token balances (TON + jettons) -- cached
  const balCacheKey = balancesCacheKey(contract.address);
  const cachedBalances = useMemo(() => {
    const raw = readCache<TokenBalanceRow[]>(balCacheKey);
    return Array.isArray(raw) ? raw : null;
  }, [balCacheKey]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>(cachedBalances ?? []);
  const [balancesLoading, setBalancesLoading] = useState(!cachedBalances);
  const [balancesRefreshing, setBalancesRefreshing] = useState(false);

  // Agent active/pause state
  const [isActive, setIsActive] = useState(contract.is_active);
  const [pauseBusy, setPauseBusy] = useState(false);

  // Withdrawal & delete state
  const [withdrawBusy, setWithdrawBusy] = useState<string | null>(null);
  const [withdrawDone, setWithdrawDone] = useState<Set<string>>(new Set());
  const [jettonInfo, setJettonInfo] = useState<WithdrawJettonResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // DEX order stats
  const [dexOpenOrders, setDexOpenOrders] = useState(0);
  const [dexClosedOrders, setDexClosedOrders] = useState(0);

  // Address copy feedback
  const [addrCopied, setAddrCopied] = useState(false);

  // Revoke access
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState(false);

  // Telegram bot connect
  const [tgDialogOpen, setTgDialogOpen] = useState(false);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);
  const [tgResponse, setTgResponse] = useState<TelegramBotResponse | null>(null);
  const [tgConnected, setTgConnected] = useState<boolean>(Boolean(detail?.telegram_bot_connected));
  const [tgUsername, setTgUsername] = useState<string | null>(detail?.telegram_bot_username ?? null);

  // Fetch ai_model from detail if not already set
  useEffect(() => {
    if (detail) {
      setAiModel(detail.ai_model || null);
      setIsActive(detail.is_active);
      setTgConnected(Boolean(detail.telegram_bot_connected));
      setTgUsername(detail.telegram_bot_username ?? null);
    }
  }, [detail]);

  // Fetch prompt on demand
  const handleViewPrompt = useCallback(async () => {
    if (prompt) {
      setPromptOpen(true);
      return;
    }
    setPromptLoading(true);
    try {
      const p = await getRaceContractPrompt(raceCfg, contract.id);
      if (p) {
        setPrompt(p);
        setPromptOpen(true);
      } else {
        setError(
          raceCfg.jwtToken
            ? 'Could not load prompt. Only the contract owner can view it.'
            : 'Not authenticated \u2014 reconnect your wallet to view the prompt.',
        );
      }
    } finally {
      setPromptLoading(false);
    }
  }, [raceCfg, contract.id, prompt]);

  const handleSavePrompt = useCallback(async () => {
    if (!promptDraft.trim()) return;
    setPromptSaving(true);
    setError(null);
    try {
      const saved = await updateRaceContractPrompt(raceCfg, contract.id, promptDraft.trim());
      setPrompt(saved);
      setPromptEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPromptSaving(false);
    }
  }, [raceCfg, contract.id, promptDraft]);

  // Load all token balances (TON + jettons with USD prices)
  const loadTokenBalances = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setBalancesRefreshing(true);
    } else {
      setBalancesLoading(true);
    }
    try {
      const [tonBal, tonPrice, jettons, tokens] = await Promise.all([
        fetchTonBalance(contract.address),
        getTonPriceUsd(),
        getJettonBalances(contract.address),
        getRaceTokens(raceCfg),
      ]);

      const rows: TokenBalanceRow[] = [];

      const tonAmt = parseFloat(tonBal) || 0;
      if (tonAmt > 0) {
        rows.push({
          symbol: 'TON',
          name: 'Toncoin',
          amount: tonAmt,
          usdValue: tonPrice ? tonAmt * tonPrice : 0,
        });
      }

      const tokenByRaw = new Map<string, RaceToken>();
      for (const t of tokens) {
        tokenByRaw.set(friendlyToRawHex(t.address), t);
      }

      const needsDexPrice: { symbol: string; index: number }[] = [];

      for (const j of jettons) {
        const rawHex = normalizeRaw(j.jettonAddress);
        const meta = tokenByRaw.get(rawHex);
        const decimals = meta?.decimals ?? 9;
        const amt = Number(BigInt(j.balance)) / 10 ** decimals;
        if (amt <= 0) continue;
        const symbol = meta?.symbol ?? 'Unknown';
        const hasPrice = meta?.price_usd != null && meta.price_usd > 0 && meta.price_usd < 1_000_000;
        rows.push({
          symbol,
          name: meta?.name ?? 'Unknown token',
          amount: amt,
          usdValue: hasPrice ? amt * meta!.price_usd : 0,
        });
        if (!hasPrice && symbol !== 'Unknown') {
          needsDexPrice.push({ symbol, index: rows.length - 1 });
        }
      }

      if (needsDexPrice.length > 0) {
        const priceResults = await Promise.all(
          needsDexPrice.map((t) => getDexCoinPrice(t.symbol)),
        );
        for (let i = 0; i < needsDexPrice.length; i++) {
          const price = priceResults[i]?.priceUsd;
          if (price != null && price > 0) {
            const row = rows[needsDexPrice[i].index];
            row.usdValue = row.amount * price;
          }
        }
      }

      setTokenBalances(rows);
      writeCache(balCacheKey, rows);
    } catch {
      // non-critical -- keep whatever we already have
    } finally {
      setBalancesLoading(false);
      setBalancesRefreshing(false);
    }
  }, [contract.address, raceCfg, balCacheKey]);

  useEffect(() => {
    void loadTokenBalances(!!cachedBalances);
  }, [loadTokenBalances, cachedBalances]);

  const totalUsdBalance = useMemo(
    () => tokenBalances.reduce((sum, t) => sum + t.usdValue, 0),
    [tokenBalances],
  );

  const topupContract = useCallback(async () => {
    setTopupBusy(true);
    setError(null);
    try {
      const amt = parseFloat(topupAmount || '0') || 0;
      if (amt <= 0) throw new Error('Amount must be greater than 0');
      const contractAddr = Address.parse(contract.address);

      if (topupToken === 'TON') {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
          messages: [{
            address: contractAddr.toString({ bounceable: false }),
            amount: nanoFromTon(String(amt)),
          }],
        });
      } else {
        if (!tonAddress) throw new Error('Wallet not connected');
        const tokens = await getRaceTokens(raceCfg);
        const tokenInfo = tokens.find((t) => t.symbol.toUpperCase() === topupToken.toUpperCase());
        if (!tokenInfo) throw new Error(`Token ${topupToken} not found`);
        const nano = BigInt(Math.round(amt * 10 ** tokenInfo.decimals));
        const jwRes = await fetch(
          `https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(tonAddress)}&jetton_address=${encodeURIComponent(tokenInfo.address)}&limit=1`,
        );
        const jwData = (await jwRes.json()) as { jetton_wallets?: { address: string }[] };
        const jwAddr = jwData.jetton_wallets?.[0]?.address;
        if (!jwAddr) throw new Error(`You don't hold ${topupToken}`);
        const ownerAddr = Address.parse(tonAddress);
        const body = beginCell()
          .storeUint(0xf8a7ea5, 32)
          .storeUint(0, 64)
          .storeCoins(nano)
          .storeAddress(contractAddr)
          .storeAddress(ownerAddr)
          .storeBit(false)
          .storeCoins(1n)
          .storeBit(false)
          .endCell();
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
          messages: [{
            address: Address.parse(jwAddr).toString({ bounceable: true }),
            amount: nanoFromTon('0.065'),
            payload: body.toBoc().toString('base64'),
          }],
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTopupBusy(false);
    }
  }, [contract.address, topupAmount, topupToken, tonAddress, raceCfg, tonConnectUI]);

  const loadAiResponses = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setAiRefreshing(true);
    } else {
      setAiLoading(true);
    }
    setAiError(null);
    try {
      const { results: data } = await getRaceAiResponses(raceCfg, {
        smartContractId: contract.id,
        limit: 50,
      });
      setAiResponses(data);
      writeCache(aiCacheKey, data);
    } catch (e) {
      if (!isBackground) {
        setAiError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setAiLoading(false);
      setAiRefreshing(false);
    }
  }, [raceCfg, contract.id, aiCacheKey]);

  useEffect(() => {
    void loadAiResponses(!!cachedAi);
  }, [loadAiResponses, cachedAi]);

  // Fetch DEX order stats
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rawAddr = Address.parse(contract.address).toRawString();
        const stats = await getDexOrderStats(rawAddr);
        if (!cancelled) {
          setDexOpenOrders(stats.open);
          setDexClosedOrders(stats.closed);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [contract.address]);

  // --- Withdrawal handlers ---

  const handleCloseOrders = useCallback(async () => {
    setWithdrawBusy('close');
    setError(null);
    try {
      const result = await closeAllOrders(raceCfg, contract.id);
      if (result.body_hex) {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
          messages: [{
            address: Address.parse(contract.address).toString({ bounceable: true }),
            amount: nanoFromTon('0.05'),
            payload: hexBocToBase64(result.body_hex),
          }],
        });
      }
      setWithdrawDone((s) => new Set(s).add('close'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('No deployed orders')) {
        setWithdrawDone((s) => new Set(s).add('close'));
      } else {
        setError(msg);
      }
    } finally {
      setWithdrawBusy(null);
    }
  }, [raceCfg, contract.id, contract.address, tonConnectUI]);

  const handleWithdrawAll = useCallback(async () => {
    setWithdrawBusy('withdraw');
    setError(null);
    try {
      const bounceable = Address.parse(contract.address).toString({ bounceable: true });
      const messages: { address: string; amount: string; payload?: string }[] = [];

      const jettons = await getJettonBalances(contract.address).catch(() => []);
      if (jettons.length > 0) {
        const jettonResults = await Promise.allSettled(
          jettons.map((j) => withdrawJetton(raceCfg, contract.id, j.jettonAddress)),
        );
        for (const jr of jettonResults) {
          if (jr.status === 'fulfilled' && jr.value.body_hex) {
            setJettonInfo(jr.value);
            messages.push({
              address: bounceable,
              amount: nanoFromTon('0.1'),
              payload: hexBocToBase64(jr.value.body_hex),
            });
          }
        }
        setWithdrawDone((s) => new Set(s).add('jetton'));
      } else {
        setWithdrawDone((s) => new Set(s).add('jetton'));
      }

      const tonBal = await fetchTonBalance(contract.address).catch(() => '0');
      let tonAmount = parseFloat(tonBal) || 0;
      if (tonAmount <= 0) {
        const tonRow = tokenBalances.find((t) => t.symbol === 'TON');
        tonAmount = tonRow?.amount ?? 0;
      }
      const tonResult = await withdrawTon(raceCfg, contract.id, tonAmount).then(
        (v) => ({ status: 'fulfilled' as const, value: v }),
        (e) => ({ status: 'rejected' as const, reason: e }),
      );

      if (tonResult.status === 'fulfilled' && tonResult.value.body_hex) {
        messages.push({
          address: bounceable,
          amount: nanoFromTon('0.11'),
          payload: hexBocToBase64(tonResult.value.body_hex),
        });
        setWithdrawDone((s) => new Set(s).add('ton'));
      }

      if (messages.length > 0) {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
          messages,
        });
      }

      void loadTokenBalances();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWithdrawBusy(null);
    }
  }, [raceCfg, contract.id, contract.address, tonConnectUI, loadTokenBalances, tokenBalances]);

  const handleDelete = useCallback(async () => {
    setWithdrawBusy('delete');
    setError(null);
    try {
      await deleteRaceContract(raceCfg, contract.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWithdrawBusy(null);
    }
  }, [raceCfg, contract.id, onDeleted]);

  const handleTogglePause = useCallback(async () => {
    setPauseBusy(true);
    setError(null);
    try {
      const newStatus = isActive ? 'paused' : 'active' as const;
      await updateRaceContract(raceCfg, contract.id, { status: newStatus });
      const newIsActive = newStatus === 'active';
      setIsActive(newIsActive);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPauseBusy(false);
    }
  }, [raceCfg, contract.id, isActive]);

  const handleRevokeAccess = useCallback(async () => {
    setRevokeBusy(true);
    setError(null);
    try {
      const bounceable = Address.parse(contract.address).toString({ bounceable: true });
      const body = beginCell()
        .storeUint(0x73657473, 32) // op: set_signature_allowed ("sets")
        .storeUint(0, 64)          // query_id
        .storeInt(0, 1)            // new_status = false
        .endCell();

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [
          {
            address: bounceable,
            amount: nanoFromTon('0.05'),
            payload: body.toBoc().toString('base64'),
          },
        ],
      });
      setRevokeSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokeBusy(false);
    }
  }, [contract.address, tonConnectUI]);

  const refreshTelegramState = useCallback(async () => {
    try {
      const fresh = await getRaceContractDetail(raceCfg, contract.id);
      setTgConnected(Boolean(fresh.telegram_bot_connected));
      setTgUsername(fresh.telegram_bot_username ?? null);
    } catch {
      // Swallow: page-level error path handles hard failures.
    }
  }, [raceCfg, contract.id]);

  const handleConnectTelegram = useCallback(async () => {
    if (tgConnected && tgUsername) {
      window.open(`https://t.me/${tgUsername}`, '_blank', 'noopener,noreferrer');
      return;
    }
    if (tgResponse) {
      setTgDialogOpen(true);
      return;
    }
    setTgBusy(true);
    setTgError(null);
    try {
      const resp = await createOrGetTelegramBot(raceCfg, contract.id);
      setTgResponse(resp);
      if (resp.connected) {
        setTgConnected(true);
        setTgUsername(resp.bot_username || null);
        return;
      }
      if (resp.deeplink) {
        window.open(resp.deeplink, '_blank', 'noopener,noreferrer');
      }
      setTgDialogOpen(true);
    } catch (e) {
      setTgError(e instanceof Error ? e.message : String(e));
      setTgDialogOpen(true);
    } finally {
      setTgBusy(false);
    }
  }, [raceCfg, contract.id, tgConnected, tgUsername, tgResponse]);

  // Re-fetch telegram state whenever the tab regains focus while the dialog is open.
  useEffect(() => {
    if (!tgDialogOpen) return;
    const onFocus = () => { void refreshTelegramState(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [tgDialogOpen, refreshTelegramState]);

  const canDelete = withdrawDone.has('jetton') && withdrawDone.has('ton');

  // Chart data: sorted oldest -> newest
  const chartPoints = useMemo<ChartPoint[]>(() => {
    return aiResponses
      .filter((r) => r.balance_usd != null)
      .map((r) => ({ time: new Date(r.created_at).getTime(), value: r.balance_usd! }))
      .sort((a, b) => a.time - b.time);
  }, [aiResponses]);

  // Check if agent was stopped by AI (action=stop)
  const stopResponse = useMemo(() => {
    return aiResponses.find((r) => r.action === 'stop') ?? null;
  }, [aiResponses]);
  const stopReason = stopResponse?.parsed_params
    ? ((stopResponse.parsed_params as Record<string, unknown>).human_opinion as string)
      ?? ((stopResponse.parsed_params as Record<string, unknown>).reasoning as string)
      ?? ((stopResponse.parsed_params as Record<string, unknown>).short_reason as string)
      ?? null
    : null;

  const usedDec = contract.used_decisions ?? 0;
  const maxDec = contract.max_decisions ?? 0;
  const decPct = maxDec > 0 ? Math.round((usedDec / maxDec) * 100) : 0;

  const openOrders = dexOpenOrders;
  const closedOrders = dexClosedOrders;

  const createdDate = new Date(contract.created_at);
  const createdDay = createdDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const createdTime = createdDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const modelShort = aiModel ? aiModel.split('/').pop()?.split('-').slice(0, 2).join('-') ?? aiModel : '\u2014';
  const modelProvider = aiModel ? (aiModel.includes('/') ? aiModel.split('/')[0] : contract.ai_provider ?? 'AI') : '\u2014';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 flex flex-col gap-4">
      <ContractTabBar />
      {/* ===== 1. Agent Header Card ===== */}
      <Card className="py-0">
        <CardContent className="p-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Bot icon */}
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 shrink-0">
              <Bot className="h-4 w-4 text-foreground" />
            </div>

            {/* Name + status */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold truncate">{contract.name || 'Agent'}</span>
                {aiResponses.length === 0 && !aiLoading ? (
                  <Badge variant="secondary" className="animate-pulse h-4 text-[9px] px-1.5">Deploying...</Badge>
                ) : (
                  <Badge variant={isActive ? 'default' : 'outline'} className="h-4 text-[9px] px-1.5">
                    {isActive ? 'Active' : 'Paused'}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">{fmtAddr(contract.address)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-4 w-4 p-0 ${addrCopied ? 'text-green-500' : ''}`}
                  onClick={() => {
                    void navigator.clipboard.writeText(contract.address);
                    setAddrCopied(true);
                    setTimeout(() => setAddrCopied(false), 2000);
                  }}
                  title="Copy address"
                >
                  {addrCopied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                </Button>
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Telegram + Pause + Delete buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className={tgConnected ? 'text-green-500 border-green-500/30' : ''}
                onClick={() => void handleConnectTelegram()}
                disabled={tgBusy}
              >
                {tgConnected
                  ? <ExternalLink className="h-4 w-4 mr-1" />
                  : tgBusy
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <Send className="h-4 w-4 mr-1" />}
                {tgConnected
                  ? (tgUsername ? `@${tgUsername}` : 'Telegram connected')
                  : tgBusy
                    ? 'Connecting...'
                    : tgResponse
                      ? 'Waiting for /start...'
                      : 'Connect Telegram'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className={isActive ? 'text-yellow-500 border-yellow-500/30' : 'text-green-500 border-green-500/30'}
                onClick={() => void handleTogglePause()}
                disabled={pauseBusy}
              >
                {isActive ? <Pause className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
                {pauseBusy ? 'Updating...' : isActive ? 'Pause' : 'Resume'}
              </Button>

              {!confirmDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-500 border-red-500/30"
                  onClick={() => setConfirmDelete(true)}
                  disabled={!!withdrawBusy}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-500 font-medium">
                    {canDelete ? 'Sure?' : 'Delete anyway?'}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleDelete()}
                    disabled={withdrawBusy === 'delete'}
                  >
                    {withdrawBusy === 'delete' ? 'Deleting...' : 'Yes'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={withdrawBusy === 'delete'}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Confirm delete warning */}
          {confirmDelete && !canDelete && (
            <div className="flex items-start gap-2 text-yellow-500 mt-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-xs">
                Please withdraw all tokens (jettons &amp; TON) before deleting. Tokens left in the contract will be lost!
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stop reason banner -- only show when agent is not active */}
      {stopReason && !isActive && (
        <Card className="border-red-500/20 bg-red-500/10">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-red-500">Agent Stopped</div>
              <div className="text-xs text-muted-foreground mt-0.5">{stopReason}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => { setPromptOpen(true); }}
            >
              <FileText className="h-3 w-3 mr-1" />
              Edit Prompt
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== 2. Stat Cards ===== */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Model */}
        <Card className="py-0">
          <CardContent className="p-2.5 flex flex-col gap-0">
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Model</span>
            </div>
            <div className="text-sm font-bold truncate">{modelShort}</div>
            <div className="text-[10px] text-muted-foreground truncate">{modelProvider}</div>
          </CardContent>
        </Card>

        {/* Balance */}
        <Card className="py-0">
          <CardContent className="p-2.5 flex flex-col gap-0">
            <div className="flex items-center gap-1">
              <Wallet className="h-3 w-3 text-green-500" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</span>
            </div>
            <div className="text-sm font-bold font-mono">
              {totalUsdBalance > 0 ? `$${totalUsdBalance.toFixed(2)}` : '$0.00'}
            </div>
            <div className="text-[10px] text-muted-foreground">USD equiv.</div>
          </CardContent>
        </Card>

        {/* Profit */}
        <Card className="py-0">
          <CardContent className="p-2.5 flex flex-col gap-0">
            <div className="flex items-center gap-1">
              {(contract.profit_usd ?? 0) >= 0
                ? <TrendingUp className="h-3 w-3 text-green-500" />
                : <TrendingDown className="h-3 w-3 text-red-500" />}
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit</span>
            </div>
            <div className={`text-sm font-bold font-mono ${(contract.profit_usd ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {contract.profit_usd != null ? `${contract.profit_usd >= 0 ? '+' : ''}$${contract.profit_usd.toFixed(2)}` : '$0.00'}
            </div>
            <div className="text-[10px] text-muted-foreground">Total P&amp;L</div>
          </CardContent>
        </Card>

        {/* Decisions */}
        <Card className="py-0">
          <CardContent className="p-2.5 flex flex-col gap-0">
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-blue-500" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Decisions</span>
            </div>
            <div className="text-sm font-bold font-mono">
              {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
            </div>
            <div className="text-[10px] text-muted-foreground">{maxDec > 0 ? `${decPct}% used` : 'Unlimited'}</div>
          </CardContent>
        </Card>

        {/* Open Orders */}
        <Card className="py-0">
          <CardContent className="p-2.5 flex flex-col gap-0">
            <div className="flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3 text-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Open Orders</span>
            </div>
            <div className="text-sm font-bold font-mono">{openOrders}</div>
            <div className="text-[10px] text-muted-foreground">{closedOrders} closed</div>
          </CardContent>
        </Card>

        {/* Created */}
        <Card className="py-0">
          <CardContent className="p-2.5 flex flex-col gap-0">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</span>
            </div>
            <div className="text-sm font-bold">{createdDay}</div>
            <div className="text-[10px] text-muted-foreground">{createdTime}</div>
          </CardContent>
        </Card>
      </div>

      {/* ===== Fund Agent Banner ===== */}
      {!balancesLoading && isActive && (() => {
        // Check if the agent has trading pair tokens but no balance
        const pairs = (contract.trading_pairs ?? '').split(',').map((p) => p.trim()).filter(Boolean);
        const pairTokens = new Set<string>();
        for (const pair of pairs) {
          for (const t of pair.split('/')) {
            const upper = t.trim().toUpperCase();
            if (upper && upper !== 'TON') pairTokens.add(upper);
          }
        }
        const missingTokens = [...pairTokens].filter((sym) => {
          const row = tokenBalances.find((b) => b.symbol.toUpperCase() === sym);
          return !row || row.amount <= 0;
        });
        if (missingTokens.length === 0) return null;
        return (
          <Card className="border-yellow-500/30 bg-yellow-500/10 py-0">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Wallet className="h-4 w-4 text-yellow-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-bold">Fund your agent</div>
                  <div className="text-xs text-muted-foreground">
                    Send <span className="font-bold">{missingTokens.join(', ')}</span> to start trading
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {missingTokens.map((sym) => (
                  <Button
                    key={sym}
                    size="sm"
                    variant="outline"
                    className="gap-1 border-yellow-500/40 hover:bg-yellow-500/10"
                    onClick={() => {
                      setTopupToken(sym);
                      setTopupAmount(sym === 'USDT' ? '10' : sym === 'AGNT' ? '100' : '5');
                      // Scroll to topup section
                      const el = document.getElementById('topup-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    Send {sym}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* ===== Error display ===== */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="py-3">
            <span className="font-mono text-xs text-red-500">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* ===== 3. Tabs ===== */}
      <Tabs defaultValue="overview">
        <TabsList variant="line">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">DEX Orders</TabsTrigger>
          <TabsTrigger value="ai">AI Responses</TabsTrigger>
        </TabsList>

        {/* --- Overview Tab --- */}
        <TabsContent value="overview" className="flex flex-col gap-4 mt-4">
          {/* Balance Chart */}
          <Card className="overflow-hidden">
            <CardContent className="pt-6">
              <BalanceChart points={chartPoints} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
            {/* Left: Contract Details */}
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Contract Details</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">ID</span>
                  <span className="font-mono text-xs break-all text-right">{contract.id}</span>
                </div>
                <Separator />

                <TradingPairsRow tradingPairs={contract.trading_pairs} />
                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Prompt</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleViewPrompt()}
                    disabled={promptLoading}
                  >
                    {promptLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <FileText className="h-3 w-3 mr-1" />
                    )}
                    View Prompt
                  </Button>
                </div>
                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Explorer</span>
                  <div className="flex items-center gap-2 text-xs">
                    <a
                      className="underline-offset-4 hover:underline text-foreground"
                      href={explorerLink(contract.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tonviewer
                    </a>
                    <span className="text-muted-foreground">|</span>
                    <a
                      className="underline-offset-4 hover:underline text-foreground"
                      href={tonscanLink(contract.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tonscan
                    </a>
                  </div>
                </div>
                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Decisions</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
                    </span>
                    {maxDec > 0 && (
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${decPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Wallet card */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm">Wallet</CardTitle>
                    {balancesRefreshing && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      </span>
                    )}
                    {totalUsdBalance > 0 && (
                      <Badge variant="outline" className="font-mono ml-auto">~${totalUsdBalance.toFixed(2)}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {balancesLoading && tokenBalances.length === 0 ? (
                    <div className="flex justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : tokenBalances.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-1">No tokens found</div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {tokenBalances.map((t) => (
                        <div key={t.symbol} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{t.symbol}</span>
                            <span className="text-muted-foreground">{t.name}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono">
                            <span>{t.amount >= 1000 ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : t.amount >= 1 ? t.amount.toFixed(4) : t.amount.toFixed(6)}</span>
                            {t.usdValue > 0 && (
                              <span className="text-muted-foreground text-[10px]">~${t.usdValue.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Top Up */}
                  <div id="topup-section" className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Top Up</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Input
                        type="text"
                        className="w-16 text-xs font-mono text-right h-7"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                      <select
                        className="h-7 rounded-md border border-input bg-background px-2 text-xs font-mono"
                        value={topupToken}
                        onChange={(e) => setTopupToken(e.target.value)}
                      >
                        <option value="TON">TON</option>
                        <option value="AGNT">AGNT</option>
                        <option value="NOT">NOT</option>
                        <option value="BUILD">BUILD</option>
                        <option value="USDT">USDT</option>
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => void topupContract()}
                        disabled={topupBusy}
                      >
                        {topupBusy ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions card */}
              <Card className="flex-1">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className={withdrawDone.has('close') ? 'text-green-500 border-green-500/30' : ''}
                      onClick={() => void handleCloseOrders()}
                      disabled={!!withdrawBusy || withdrawDone.has('close')}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      {withdrawBusy === 'close' ? 'Closing...' : withdrawDone.has('close') ? 'Orders closed' : 'Close orders'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className={withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'text-green-500 border-green-500/30' : ''}
                      onClick={() => void handleWithdrawAll()}
                      disabled={!!withdrawBusy || (withdrawDone.has('jetton') && withdrawDone.has('ton'))}
                    >
                      <ArrowDownToLine className="h-4 w-4 mr-1" />
                      {withdrawBusy === 'withdraw' ? 'Withdrawing...' : withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'All withdrawn' : 'Withdraw all'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className={revokeSuccess ? 'text-green-500 border-green-500/30' : 'text-red-500 border-red-500/30'}
                      onClick={() => void handleRevokeAccess()}
                      disabled={revokeBusy || revokeSuccess}
                    >
                      <ShieldOff className="h-4 w-4 mr-1" />
                      {revokeBusy ? 'Revoking...' : revokeSuccess ? 'Access revoked' : 'Revoke access'}
                    </Button>
                  </div>

                  {/* Jetton info */}
                  {jettonInfo && jettonInfo.jettons?.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Jettons: {jettonInfo.jettons.map((j) => `${(j.balance / 10 ** j.decimals).toFixed(j.decimals > 4 ? 4 : j.decimals)} ${j.symbol}`).join(', ')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* --- DEX Orders Tab --- */}
        <TabsContent value="orders" className="mt-4">
          <OrdersSection contractAddress={contract.address} />
        </TabsContent>

        {/* --- AI Responses Tab --- */}
        <TabsContent value="ai" className="flex flex-col gap-3 mt-4">
          {aiRefreshing && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" /> Updating...
            </div>
          )}

          {aiError ? (
            <div className="text-sm text-red-500">{aiError}</div>
          ) : aiResponses.length === 0 && !aiLoading ? (
            <Card>
              <CardContent className="py-6">
                <span className="text-sm text-muted-foreground">No AI responses yet.</span>
              </CardContent>
            </Card>
          ) : aiLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="py-0 overflow-hidden">
              <div className="divide-y divide-border/30">
                {aiResponses.map((r) => {
                  const pp = r.parsed_params as Record<string, unknown> | null;
                  const reason = pp?.reasoning as string | undefined;
                  const humanOpinion = pp?.human_opinion as string | undefined;
                  const text = humanOpinion || reason || '';
                  const shareUrl = text ? buildShareUrl(r.id) : null;
                  const actionColor =
                    r.action === 'create_order' ? 'text-green-500'
                    : r.action === 'close_order' ? 'text-yellow-500'
                    : r.action === 'stop' ? 'text-red-500'
                    : 'text-muted-foreground';

                  // For create_order: show tokens + amount
                  let orderInfo = '';
                  if (r.action === 'create_order' && pp) {
                    const from = typeof pp.from_token === 'string' ? pp.from_token.toUpperCase() : '';
                    const to = typeof pp.to_token === 'string' ? pp.to_token.toUpperCase() : '';
                    if (from && to) orderInfo = `${from}\u2192${to}`;
                  }

                  return (
                    <div key={r.id} className="px-3 py-2 hover:bg-accent/20 transition-colors">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-mono ${actionColor} border-current/30`}>
                          {r.action}
                        </Badge>
                        {orderInfo && (
                          <span className="text-[10px] font-mono text-muted-foreground">{orderInfo}</span>
                        )}
                        {r.balance_usd != null && (
                          <span className="font-mono text-sm font-bold">${r.balance_usd.toFixed(2)}</span>
                        )}
                        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(r.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {shareUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-5 w-5 p-0 shrink-0 ${copiedId === r.id ? 'text-green-500' : 'text-muted-foreground'}`}
                            title="Copy share link"
                            onClick={() => {
                              void navigator.clipboard.writeText(shareUrl);
                              setCopiedId(r.id);
                              setTimeout(() => setCopiedId(null), 2000);
                            }}
                          >
                            {copiedId === r.id ? <Check className="h-3 w-3" /> : <Share2 className="h-3 w-3" />}
                          </Button>
                        )}
                      </div>
                      {text && (
                        <p className="text-sm leading-snug text-muted-foreground mt-1 line-clamp-2">{text}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Prompt Dialog */}
      <Dialog open={promptOpen} onOpenChange={(open) => { if (!open) { setPromptOpen(false); setPromptEditing(false); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Agent Prompt</DialogTitle>
              <div className="flex items-center gap-1">
                {!promptEditing && prompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setPromptDraft(prompt); setPromptEditing(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    Edit
                  </Button>
                )}
                {prompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={promptCopied ? 'text-green-500' : ''}
                    onClick={() => {
                      void navigator.clipboard.writeText(promptEditing ? promptDraft : (prompt ?? '')).then(() => {
                        setPromptCopied(true);
                        setTimeout(() => setPromptCopied(false), 2000);
                      });
                    }}
                  >
                    {promptCopied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {promptCopied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>
          {promptEditing ? (
            <Textarea
              className="min-h-[40vh] max-h-[60vh] text-sm font-mono"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              disabled={promptSaving}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm bg-muted rounded-lg p-4 max-h-[60vh] overflow-y-auto font-mono">{prompt}</pre>
          )}
          <DialogFooter>
            {promptEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPromptEditing(false)}
                  disabled={promptSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSavePrompt()}
                  disabled={promptSaving || !promptDraft.trim() || promptDraft.trim() === prompt}
                >
                  {promptSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  )}
                  {promptSaving ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setPromptOpen(false)}>Close</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Telegram Connect Dialog */}
      <Dialog
        open={tgDialogOpen}
        onOpenChange={(open) => {
          setTgDialogOpen(open);
          if (!open) void refreshTelegramState();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Telegram Notifications</DialogTitle>
          </DialogHeader>

          {tgError && (
            <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-md p-2">
              {tgError}
            </div>
          )}

          <ol className="flex flex-col gap-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Open the link below to create your bot in Telegram.</li>
            <li>Follow BotFather's prompts to finish creating the bot.</li>
            <li>
              Open <span className="font-mono">@{tgResponse?.bot_username || 'your-bot'}</span> and send{' '}
              <span className="font-mono">/start</span>.
            </li>
          </ol>

          {tgResponse?.deeplink && (
            <Button
              className="w-full"
              onClick={() => {
                window.open(tgResponse.deeplink, '_blank', 'noopener,noreferrer');
              }}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Open Telegram
            </Button>
          )}

          {tgResponse?.bot_username && (
            <div className="text-xs text-muted-foreground text-center">
              Bot: <span className="font-mono">@{tgResponse.bot_username}</span>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTgDialogOpen(false)}>
              {tgConnected ? 'Done' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
