import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts';
import {
  getRaceAiResponses,
  getRaceContractDetail,
  getRaceTokens,
  getJettonBalances,
  getTonPriceUsd,
  updateRaceContract,
  withdrawJetton,
  withdrawTon,
  closeAllOrders,
  deleteRaceContract,
  hexBocToBase64,
  type AiResponse,
  type ContractListItem,
  type PublicApiConfig,
  type RaceToken,
  type WithdrawJettonResult,
} from '@/lib/api';
import { readCache, writeCache, aiResponsesCacheKey, balancesCacheKey } from '@/lib/cache';
import { OrdersPanel } from './OrdersPanel';
import {
  Trash2, ArrowDownToLine, ArrowUpFromLine, Coins, XCircle,
  Share2, Check, Pause, Play, Wallet, AlertTriangle, ChevronDown, RefreshCw,
} from 'lucide-react';
import { buildShareUrl } from './ShareCard';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import { getChartOptions, lineSeriesOptions, dedupeChartData, type AppTheme } from '@/lib/chart-theme';

/** A resolved token balance row for display. */
type TokenBalanceRow = {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
};

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

type ContractDetailPanelProps = {
  contract: ContractListItem;
  raceCfg: PublicApiConfig;
  theme: AppTheme;
  onDeleted?: (contractId: string) => void;
};

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

/* ---------- Balance Chart (Lightweight Charts) ---------- */

type ChartPoint = { time: number; value: number };

const CHART_GREEN = '#00C389';

function BalanceChart({ points, theme }: { points: ChartPoint[]; theme: AppTheme }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const [chartReady, setChartReady] = useState(false);

  // Create chart once container is in DOM
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      ...getChartOptions(theme),
      width: container.clientWidth,
      height: 330,
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const series = chart.addSeries(LineSeries as any, {
      ...lineSeriesOptions(CHART_GREEN),
      lineWidth: 3,
      lastValueVisible: true,
      priceLineVisible: true,
      priceLineColor: CHART_GREEN,
      priceLineWidth: 1,
      priceLineStyle: 2, // dashed
    });

    chartRef.current = chart;
    seriesRef.current = series;
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
      seriesRef.current = null;
      setChartReady(false);
    };
  }, []);

  // Update theme
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.applyOptions(getChartOptions(theme));
    }
  }, [theme]);

  // Update data — depend on chartReady so it runs after chart creation
  useEffect(() => {
    if (!seriesRef.current || !chartReady) return;
    const deduped = dedupeChartData(points);
    if (deduped.length > 0) {
      seriesRef.current.setData(deduped.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      chartRef.current?.timeScale().fitContent();
    }
  }, [points, chartReady]);

  return (
    <div className="relative w-full" style={{ minHeight: 330 }}>
      <div ref={containerRef} className="w-full" style={{ minHeight: 330 }} />
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm opacity-60">No balance data for chart.</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Main Component ---------- */

export function ContractDetailPanel({ contract, raceCfg, theme, onDeleted }: ContractDetailPanelProps) {
  const [tonConnectUI] = useTonConnectUI();

  const [topupAmount, setTopupAmount] = useState('5');
  const [topupBusy, setTopupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiModel, setAiModel] = useState<string | null>(null);

  // AI responses: load from cache first, then refresh
  const aiCacheKey = aiResponsesCacheKey(contract.id);
  const cachedAi = useMemo(() => readCache<AiResponse[]>(aiCacheKey), [aiCacheKey]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>(cachedAi ?? []);
  const [aiLoading, setAiLoading] = useState(!cachedAi); // only show spinner if no cache
  const [aiRefreshing, setAiRefreshing] = useState(false); // background refresh indicator
  const [aiError, setAiError] = useState<string | null>(null);

  // Share copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Token balances (TON + jettons) — cached
  const balCacheKey = balancesCacheKey(contract.address);
  const cachedBalances = useMemo(() => readCache<TokenBalanceRow[]>(balCacheKey), [balCacheKey]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>(cachedBalances ?? []);
  const [balancesLoading, setBalancesLoading] = useState(!cachedBalances);
  const [balancesRefreshing, setBalancesRefreshing] = useState(false);

  // Agent active/pause state
  const [isActive, setIsActive] = useState(contract.is_active);
  const [pauseBusy, setPauseBusy] = useState(false);

  // Withdrawal & delete state
  const [withdrawBusy, setWithdrawBusy] = useState<string | null>(null); // 'jetton' | 'ton' | 'close' | 'delete' | 'pause'
  const [withdrawDone, setWithdrawDone] = useState<Set<string>>(new Set()); // tracks completed steps
  const [jettonInfo, setJettonInfo] = useState<WithdrawJettonResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Fetch contract detail for ai_model
  useEffect(() => {
    getRaceContractDetail(raceCfg, contract.id)
      .then((detail) => {
        setAiModel(detail.ai_model || null);
        setIsActive(detail.is_active);
      })
      .catch(() => setAiModel(null));
  }, [raceCfg, contract.id]);

  // Load all token balances (TON + jettons with USD prices)
  const loadTokenBalances = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setBalancesRefreshing(true);
    } else {
      setBalancesLoading(true);
    }
    try {
      // Fetch TON balance, TON price, jetton balances, and token metadata in parallel
      const [tonBal, tonPrice, jettons, tokens] = await Promise.all([
        fetchTonBalance(contract.address),
        getTonPriceUsd(),
        getJettonBalances(contract.address),
        getRaceTokens(raceCfg),
      ]);

      const rows: TokenBalanceRow[] = [];

      // TON row
      const tonAmt = parseFloat(tonBal) || 0;
      if (tonAmt > 0) {
        rows.push({
          symbol: 'TON',
          name: 'Toncoin',
          amount: tonAmt,
          usdValue: tonPrice ? tonAmt * tonPrice : 0,
        });
      }

      // Build a lookup: raw hex (no 0: prefix, lowercase) → token metadata
      const tokenByRaw = new Map<string, RaceToken>();
      for (const t of tokens) {
        tokenByRaw.set(friendlyToRawHex(t.address), t);
      }

      // Jetton rows
      for (const j of jettons) {
        const rawHex = normalizeRaw(j.jettonAddress);
        const meta = tokenByRaw.get(rawHex);
        const decimals = meta?.decimals ?? 9;
        const amt = Number(BigInt(j.balance)) / 10 ** decimals;
        if (amt <= 0) continue;
        rows.push({
          symbol: meta?.symbol ?? 'Unknown',
          name: meta?.name ?? 'Unknown token',
          amount: amt,
          usdValue: meta?.price_usd ? amt * meta.price_usd : 0,
        });
      }

      setTokenBalances(rows);
      writeCache(balCacheKey, rows);
    } catch {
      // non-critical — keep whatever we already have
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
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [
          {
            address: Address.parse(contract.address).toString({ bounceable: false }),
            amount: nanoFromTon(topupAmount),
          },
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTopupBusy(false);
    }
  }, [contract.address, topupAmount, tonConnectUI]);

  const loadAiResponses = useCallback(async (isBackground = false) => {
    if (isBackground) {
      setAiRefreshing(true);
    } else {
      setAiLoading(true);
    }
    setAiError(null);
    try {
      const data = await getRaceAiResponses(raceCfg, {
        smartContractId: contract.id,
        limit: 50,
      });
      setAiResponses(data);
      writeCache(aiCacheKey, data);
    } catch (e) {
      // Only show error if no cached data
      if (!isBackground) {
        setAiError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setAiLoading(false);
      setAiRefreshing(false);
    }
  }, [raceCfg, contract.id, aiCacheKey]);

  useEffect(() => {
    // If we have cached data, do a background refresh; otherwise foreground load
    void loadAiResponses(!!cachedAi);
  }, [loadAiResponses, cachedAi]);

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
      // Not an error if no deployed orders
      if (msg.includes('No deployed orders')) {
        setWithdrawDone((s) => new Set(s).add('close'));
      } else {
        setError(msg);
      }
    } finally {
      setWithdrawBusy(null);
    }
  }, [raceCfg, contract.id, contract.address, tonConnectUI]);

  const handleWithdrawJetton = useCallback(async () => {
    setWithdrawBusy('jetton');
    setError(null);
    try {
      const result = await withdrawJetton(raceCfg, contract.id);
      setJettonInfo(result);
      if (result.body_hex) {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
          messages: [{
            address: Address.parse(contract.address).toString({ bounceable: true }),
            amount: nanoFromTon('0.1'),
            payload: hexBocToBase64(result.body_hex),
          }],
        });
      }
      setWithdrawDone((s) => new Set(s).add('jetton'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('No jetton balances')) {
        setWithdrawDone((s) => new Set(s).add('jetton'));
      } else {
        setError(msg);
      }
    } finally {
      setWithdrawBusy(null);
    }
  }, [raceCfg, contract.id, contract.address, tonConnectUI]);

  const handleWithdrawTon = useCallback(async () => {
    setWithdrawBusy('ton');
    setError(null);
    try {
      const result = await withdrawTon(raceCfg, contract.id);
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
      setWithdrawDone((s) => new Set(s).add('ton'));
      void loadTokenBalances();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWithdrawBusy(null);
    }
  }, [raceCfg, contract.id, contract.address, tonConnectUI, loadTokenBalances]);

  const handleDelete = useCallback(async () => {
    setWithdrawBusy('delete');
    setError(null);
    try {
      await deleteRaceContract(raceCfg, contract.id);
      onDeleted?.(contract.id);
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
      const newActive = !isActive;
      await updateRaceContract(raceCfg, contract.id, { is_active: newActive });
      setIsActive(newActive);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPauseBusy(false);
    }
  }, [raceCfg, contract.id, isActive]);

  const canDelete = withdrawDone.has('jetton') && withdrawDone.has('ton');

  // Chart data: sorted oldest → newest
  const chartPoints = useMemo<ChartPoint[]>(() => {
    return aiResponses
      .filter((r) => r.balance_usd != null)
      .map((r) => ({ time: new Date(r.created_at).getTime(), value: r.balance_usd! }))
      .sort((a, b) => a.time - b.time);
  }, [aiResponses]);

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Contract Info */}
      <div className="card bg-base-200 shadow-md sm:col-span-2 lg:col-span-1">
        <div className="card-body gap-3">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Contract Info</h2>
            <div className="flex items-center gap-1.5">
              {aiResponses.length === 0 && !aiLoading ? (
                <span className="badge badge-sm badge-warning animate-pulse">Deploying…</span>
              ) : (
                <span className={`badge badge-sm ${isActive ? 'badge-success' : 'badge-ghost'}`}>
                  {isActive ? 'Active' : 'Paused'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm opacity-60">Address</div>
            <a
              className="mono text-xs underline-offset-4 hover:underline link link-hover"
              href={explorerLink(contract.address)}
              target="_blank"
              rel="noreferrer"
            >
              {fmtAddr(contract.address)}
            </a>
          </div>
          <div className="divider my-0" />
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm opacity-60">Model</div>
            <div className="mono text-xs">
              {aiModel ? (
                <span className="badge badge-outline badge-sm">{aiModel}</span>
              ) : (
                <span className="opacity-40">—</span>
              )}
            </div>
          </div>
          <div className="divider my-0" />
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm opacity-60">ID</div>
            <div className="mono text-xs break-all text-right">{contract.id}</div>
          </div>
          <div className="divider my-0" />
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm opacity-60">Created</div>
            <div className="mono text-xs">{new Date(contract.created_at).toLocaleString()}</div>
          </div>
          <div className="divider my-0" />
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm opacity-60">Explorer</div>
            <div className="flex items-center gap-2 text-xs">
              <a
                className="underline-offset-4 hover:underline link link-primary"
                href={explorerLink(contract.address)}
                target="_blank"
                rel="noreferrer"
              >
                Tonviewer
              </a>
              <span className="opacity-50">|</span>
              <a
                className="underline-offset-4 hover:underline link link-primary"
                href={tonscanLink(contract.address)}
                target="_blank"
                rel="noreferrer"
              >
                Tonscan
              </a>
            </div>
          </div>
          <div className="divider my-0" />

          {/* Extended Balance — TON + jettons */}
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 opacity-60" />
            <span className="text-sm opacity-60">Wallet Balance</span>
            {balancesRefreshing && (
              <span className="flex items-center gap-1 text-xs opacity-40">
                <RefreshCw className="h-3 w-3 animate-spin" />
              </span>
            )}
            {totalUsdBalance > 0 && (
              <span className="badge badge-sm badge-ghost mono ml-auto">~${totalUsdBalance.toFixed(2)}</span>
            )}
          </div>

          {balancesLoading && tokenBalances.length === 0 ? (
            <div className="flex justify-center py-2">
              <span className="loading loading-spinner loading-xs" />
            </div>
          ) : tokenBalances.length === 0 ? (
            <div className="text-xs opacity-40 text-center py-1">No tokens found</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tokenBalances.map((t) => (
                <div key={t.symbol} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{t.symbol}</span>
                    <span className="opacity-40">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-3 mono">
                    <span>{t.amount >= 1000 ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : t.amount >= 1 ? t.amount.toFixed(4) : t.amount.toFixed(6)}</span>
                    {t.usdValue > 0 && (
                      <span className="opacity-50 text-[10px]">~${t.usdValue.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Balance Chart */}
      <div className="card bg-base-200 shadow-md sm:col-span-2 lg:col-span-1 overflow-hidden">
        <div className="card-body">
          <h2 className="card-title">Balance (USD)</h2>
          <BalanceChart points={chartPoints} theme={theme} />
        </div>
      </div>

      {/* Agent Actions — collapsible */}
      <details className="card bg-base-200 shadow-md sm:col-span-2 group">
        <summary className="card-body py-4 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <div className="flex items-center justify-between">
            <h2 className="card-title text-sm">Agent Actions</h2>
            <ChevronDown className="h-4 w-4 opacity-40 transition-transform group-open:rotate-180" />
          </div>
        </summary>
        <div className="card-body pt-0 gap-4">
          {/* Top Up */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs opacity-60 w-20">Top Up</span>
            <input
              id="detail-topup"
              type="text"
              className="input input-bordered input-sm w-24 text-xs mono"
              value={topupAmount}
              onChange={(e) => setTopupAmount(e.target.value)}
              inputMode="decimal"
              placeholder="TON"
            />
            <button
              className={`btn btn-outline btn-sm gap-1 ${topupBusy ? 'btn-disabled' : ''}`}
              onClick={() => void topupContract()}
              type="button"
            >
              <ArrowUpFromLine className="h-4 w-4" />
              {topupBusy ? 'Sending\u2026' : 'Top Up'}
            </button>
          </div>

          <div className="divider my-0" />

          {/* Pause / Resume */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs opacity-60 w-20">{isActive ? 'Active' : 'Paused'}</span>
            <button
              className={`btn btn-sm gap-1 ${isActive ? 'btn-warning btn-outline' : 'btn-success btn-outline'}`}
              onClick={() => void handleTogglePause()}
              disabled={pauseBusy}
              type="button"
            >
              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {pauseBusy ? 'Updating\u2026' : isActive ? 'Pause Agent' : 'Resume Agent'}
            </button>
          </div>

          <div className="divider my-0" />

          {/* Withdraw */}
          <div className="flex flex-col gap-2">
            <span className="text-xs opacity-60">Withdraw</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={`btn btn-outline btn-sm gap-1 ${withdrawDone.has('close') ? 'btn-success' : ''}`}
                onClick={() => void handleCloseOrders()}
                disabled={!!withdrawBusy || withdrawDone.has('close')}
                type="button"
              >
                <XCircle className="h-4 w-4" />
                {withdrawBusy === 'close' ? 'Closing\u2026' : withdrawDone.has('close') ? 'Orders closed' : 'Close orders'}
              </button>

              <button
                className={`btn btn-outline btn-sm gap-1 ${withdrawDone.has('jetton') ? 'btn-success' : ''}`}
                onClick={() => void handleWithdrawJetton()}
                disabled={!!withdrawBusy || withdrawDone.has('jetton')}
                type="button"
              >
                <Coins className="h-4 w-4" />
                {withdrawBusy === 'jetton' ? 'Withdrawing\u2026' : withdrawDone.has('jetton') ? 'Jettons withdrawn' : 'Withdraw jettons'}
              </button>

              <button
                className={`btn btn-outline btn-sm gap-1 ${withdrawDone.has('ton') ? 'btn-success' : ''}`}
                onClick={() => void handleWithdrawTon()}
                disabled={!!withdrawBusy || withdrawDone.has('ton')}
                type="button"
              >
                <ArrowDownToLine className="h-4 w-4" />
                {withdrawBusy === 'ton' ? 'Withdrawing\u2026' : withdrawDone.has('ton') ? 'TON withdrawn' : 'Withdraw TON'}
              </button>
            </div>

            {/* Jetton info */}
            {jettonInfo && jettonInfo.jettons.length > 0 && (
              <div className="text-xs opacity-60">
                Jettons: {jettonInfo.jettons.map((j) => `${(j.balance / 10 ** j.decimals).toFixed(j.decimals > 4 ? 4 : j.decimals)} ${j.symbol}`).join(', ')}
              </div>
            )}
          </div>

          <div className="divider my-0" />

          {/* Delete */}
          <div className="flex flex-col gap-2">
            <span className="text-xs opacity-60">Delete Agent</span>
            {!confirmDelete ? (
              <div>
                <button
                  className="btn btn-error btn-sm btn-outline gap-1"
                  onClick={() => setConfirmDelete(true)}
                  disabled={!!withdrawBusy}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete agent
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-error/30 p-3">
                {!canDelete && (
                  <div className="flex items-start gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span className="text-xs">
                      Please withdraw all tokens (jettons & TON) before deleting. Tokens left in the contract will be lost!
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-error font-medium">
                    {canDelete ? 'Are you sure you want to delete this agent?' : 'Delete anyway?'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn btn-error btn-sm gap-1"
                    onClick={() => void handleDelete()}
                    disabled={withdrawBusy === 'delete'}
                    type="button"
                  >
                    {withdrawBusy === 'delete' ? 'Deleting\u2026' : 'Yes, delete'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmDelete(false)}
                    disabled={withdrawBusy === 'delete'}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </details>

      {/* DEX Orders */}
      <OrdersPanel contractAddress={contract.address} />

      {/* AI Responses */}
      <div className="card bg-base-200 shadow-md sm:col-span-2">
        <div className="card-body">
          <div className="flex items-center gap-2">
            <h2 className="card-title">AI Responses</h2>
            {aiRefreshing && (
              <span className="flex items-center gap-1 text-xs opacity-50">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Updating…
              </span>
            )}
          </div>

          {aiError ? (
            <div className="text-sm text-error">{aiError}</div>
          ) : aiResponses.length === 0 && !aiLoading ? (
            <div className="text-sm opacity-60">No AI responses yet.</div>
          ) : aiLoading ? (
            <div className="flex justify-center py-4">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th className="text-right">Balance</th>
                    <th>Reason</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {aiResponses.map((r) => {
                    const pp = r.parsed_params as Record<string, unknown> | null;
                    const reason = pp?.reasoning as string | undefined;
                    // Short share link — just the response ID
                    const shareUrl = reason ? buildShareUrl(r.id) : null;
                    return (
                      <tr key={r.id} className="hover">
                        <td className="mono text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td>
                          <span className="badge badge-outline badge-sm">
                            {r.action}
                          </span>
                        </td>
                        <td className="mono text-xs text-right whitespace-nowrap">
                          {r.balance_usd != null ? `$${r.balance_usd.toFixed(2)}` : '\u2014'}
                        </td>
                        <td className="text-xs opacity-60 max-w-[400px]">
                          {reason || '\u2014'}
                        </td>
                        <td>
                          {shareUrl && (
                            <button
                              className={`btn btn-xs ${copiedId === r.id ? 'btn-success' : 'btn-ghost'}`}
                              title="Copy share link"
                              onClick={() => {
                                void navigator.clipboard.writeText(shareUrl);
                                setCopiedId(r.id);
                                setTimeout(() => setCopiedId(null), 2000);
                              }}
                            >
                              {copiedId === r.id ? (
                                <Check className="h-3 w-3" />
                              ) : (
                                <Share2 className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {error ? (
        <div className="sm:col-span-2">
          <div role="alert" className="alert alert-error">
            <span className="mono text-xs">{error}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
