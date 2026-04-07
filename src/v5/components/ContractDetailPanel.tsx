import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell } from '@ton/core';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
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
  deleteRaceContract,
  getDexOrderStats,
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
  Trash2, ArrowDownToLine, ArrowUpFromLine, XCircle,
  Share2, Check, Pause, Play, Wallet, AlertTriangle, RefreshCw,
  FileText, Copy, Pencil, Save,
  Bot, Zap, Activity, ArrowUpRight, Clock, ShieldOff,
} from 'lucide-react';
import { buildShareUrl } from '@/components/ShareCard';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';
import { cn } from '../lib/utils';

/* ---------- Types ---------- */

type TokenBalanceRow = {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
};

/* ---------- Helpers ---------- */

function normalizeRaw(addr: string): string {
  return addr.toLowerCase().replace(/^0:/, '');
}

function friendlyToRawHex(addr: string): string {
  try {
    const raw = Address.parse(addr).toRawString();
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

function TradingPairsRow({ contract }: { contract: ContractListItem }) {
  const pairs = (contract.trading_pairs ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-neutral-500">Trading Pairs</div>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {pairs.map((p) => (
          <Badge key={p} className="text-[10px]">{p}</Badge>
        ))}
      </div>
    </div>
  );
}

type ContractDetailPanelProps = {
  contract: ContractListItem;
  raceCfg: PublicApiConfig;
  onDeleted?: (contractId: string) => void;
  onStatusChanged?: (contractId: string, isActive: boolean) => void;
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

/* ---------- Balance Chart ---------- */

type ChartPoint = { time: number; value: number };

const CHART_VIOLET = '#8b5cf6';

type TimeRange = '1h' | '6h' | '24h' | '7d';
const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

function BalanceChart({ points }: { points: ChartPoint[] }) {
  const [range, setRange] = useState<TimeRange>('1h');

  const filtered = useMemo(() => {
    const rangeMs = TIME_RANGES.find((r) => r.key === range)?.ms ?? 60 * 60 * 1000;
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
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-neutral-500">Balance (USD) <span className="opacity-60">at last decision</span></div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono tabular-nums">
              ${currentBalance.toFixed(2)}
            </span>
            <span className={cn(
              'text-sm font-bold font-mono tabular-nums',
              changePositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            )}>
              {changePositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={cn(
                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                range === r.key
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-50 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
              )}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <span className="text-sm text-neutral-500">No balance data for chart.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={filtered} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="v5BalanceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_VIOLET} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_VIOLET} stopOpacity={0.02} />
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
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-neutral-900, #171717)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
                padding: '6px 10px',
                color: '#fff',
              }}
              labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Balance']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_VIOLET}
              strokeWidth={2.5}
              fill="url(#v5BalanceGradient)"
              dot={false}
              activeDot={{ r: 4, fill: CHART_VIOLET, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/* ---------- Main Component ---------- */

export function ContractDetailPanel({ contract, raceCfg, onDeleted, onStatusChanged }: ContractDetailPanelProps) {
  const [tonConnectUI] = useTonConnectUI();
  const tonAddress = useTonAddress();

  const [topupAmount, setTopupAmount] = useState('5');
  const [topupToken, setTopupToken] = useState('TON');
  const [topupBusy, setTopupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [aiModel, setAiModel] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [promptEditing, setPromptEditing] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  const aiCacheKey = aiResponsesCacheKey(contract.id);
  const cachedAi = useMemo(() => {
    const raw = readCache<AiResponse[]>(aiCacheKey);
    return Array.isArray(raw) ? raw : null;
  }, [aiCacheKey]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>(cachedAi ?? []);
  const [aiLoading, setAiLoading] = useState(!cachedAi);
  const [aiRefreshing, setAiRefreshing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const balCacheKey = balancesCacheKey(contract.address);
  const cachedBalances = useMemo(() => {
    const raw = readCache<TokenBalanceRow[]>(balCacheKey);
    return Array.isArray(raw) ? raw : null;
  }, [balCacheKey]);
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>(cachedBalances ?? []);
  const [balancesLoading, setBalancesLoading] = useState(!cachedBalances);
  const [balancesRefreshing, setBalancesRefreshing] = useState(false);

  const [isActive, setIsActive] = useState(contract.is_active);
  const [pauseBusy, setPauseBusy] = useState(false);

  const [withdrawBusy, setWithdrawBusy] = useState<string | null>(null);
  const [withdrawDone, setWithdrawDone] = useState<Set<string>>(new Set());
  const [jettonInfo, setJettonInfo] = useState<WithdrawJettonResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'orders' | 'ai'>('overview');

  const [dexOpenOrders, setDexOpenOrders] = useState(0);
  const [dexClosedOrders, setDexClosedOrders] = useState(0);

  const [addrCopied, setAddrCopied] = useState(false);

  // Fetch contract detail
  useEffect(() => {
    getRaceContractDetail(raceCfg, contract.id)
      .then((detail) => {
        setAiModel(detail.ai_model || null);
        setIsActive(detail.is_active);
      })
      .catch(() => setAiModel(null));
  }, [raceCfg, contract.id]);

  const handleViewPrompt = useCallback(async () => {
    if (prompt) { setPromptOpen(true); return; }
    setPromptLoading(true);
    try {
      const p = await getRaceContractPrompt(raceCfg, contract.id);
      if (p) { setPrompt(p); setPromptOpen(true); }
      else {
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

  // Load token balances
  const loadTokenBalances = useCallback(async (isBackground = false) => {
    if (isBackground) setBalancesRefreshing(true);
    else setBalancesLoading(true);
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
        rows.push({ symbol: 'TON', name: 'Toncoin', amount: tonAmt, usdValue: tonPrice ? tonAmt * tonPrice : 0 });
      }

      const tokenByRaw = new Map<string, RaceToken>();
      for (const t of tokens) tokenByRaw.set(friendlyToRawHex(t.address), t);

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
        const priceResults = await Promise.all(needsDexPrice.map((t) => getDexCoinPrice(t.symbol)));
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
      // non-critical
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

  // Topup
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

  // AI Responses
  const loadAiResponses = useCallback(async (isBackground = false) => {
    if (isBackground) setAiRefreshing(true);
    else setAiLoading(true);
    setAiError(null);
    try {
      const { results: data } = await getRaceAiResponses(raceCfg, { smartContractId: contract.id, limit: 50 });
      setAiResponses(data);
      writeCache(aiCacheKey, data);
    } catch (e) {
      if (!isBackground) setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiLoading(false);
      setAiRefreshing(false);
    }
  }, [raceCfg, contract.id, aiCacheKey]);

  useEffect(() => {
    void loadAiResponses(!!cachedAi);
  }, [loadAiResponses, cachedAi]);

  // DEX order stats
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
      const newStatus = isActive ? 'paused' : 'active' as const;
      await updateRaceContract(raceCfg, contract.id, { status: newStatus });
      const newIsActive = newStatus === 'active';
      setIsActive(newIsActive);
      onStatusChanged?.(contract.id, newIsActive);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPauseBusy(false);
    }
  }, [raceCfg, contract.id, isActive, onStatusChanged]);

  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState(false);

  const handleRevokeAccess = useCallback(async () => {
    setRevokeBusy(true);
    setError(null);
    try {
      const bounceable = Address.parse(contract.address).toString({ bounceable: true });
      const body = beginCell()
        .storeUint(0x73657473, 32)
        .storeUint(0, 64)
        .storeInt(0, 1)
        .endCell();
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [{
          address: bounceable,
          amount: nanoFromTon('0.05'),
          payload: body.toBoc().toString('base64'),
        }],
      });
      setRevokeSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokeBusy(false);
    }
  }, [contract.address, tonConnectUI]);

  const canDelete = withdrawDone.has('jetton') && withdrawDone.has('ton');

  const chartPoints = useMemo<ChartPoint[]>(() => {
    return aiResponses
      .filter((r) => r.balance_usd != null)
      .map((r) => ({ time: new Date(r.created_at).getTime(), value: r.balance_usd! }))
      .sort((a, b) => a.time - b.time);
  }, [aiResponses]);

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
    <div className="mt-4 flex flex-col gap-4">
      {/* ===== 1. Agent Header Card ===== */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 shrink-0">
              <Bot className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold truncate">{contract.name || 'Agent'}</span>
                {aiResponses.length === 0 && !aiLoading ? (
                  <Badge variant="warning" className="animate-pulse">Deploying...</Badge>
                ) : (
                  <Badge variant={isActive ? 'success' : 'secondary'}>
                    {isActive ? 'Active' : 'Paused'}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="font-mono text-xs text-neutral-500">{fmtAddr(contract.address)}</span>
                <button
                  className={cn(
                    'inline-flex items-center justify-center h-6 w-6 rounded-md transition-colors',
                    addrCopied ? 'text-emerald-500' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
                  )}
                  onClick={() => {
                    void navigator.clipboard.writeText(contract.address);
                    setAddrCopied(true);
                    setTimeout(() => setAddrCopied(false), 2000);
                  }}
                  type="button"
                  title="Copy address"
                >
                  {addrCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={isActive ? 'outline' : 'success'}
                size="sm"
                className="gap-1"
                onClick={() => void handleTogglePause()}
                disabled={pauseBusy}
              >
                {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {pauseBusy ? 'Updating...' : isActive ? 'Pause' : 'Resume'}
              </Button>

              {!confirmDelete ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => setConfirmDelete(true)}
                  disabled={!!withdrawBusy}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                    {canDelete ? 'Sure?' : 'Delete anyway?'}
                  </span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1"
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

          {confirmDelete && !canDelete && (
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 mt-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-xs">
                Please withdraw all tokens (jettons & TON) before deleting. Tokens left in the contract will be lost!
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stop reason banner */}
      {stopReason && !isActive && (
        <Card className="border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-red-600 dark:text-red-400">Agent Stopped</div>
              <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">{stopReason}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 shrink-0"
              onClick={() => { setPromptOpen(true); setDetailTab('overview'); }}
            >
              <FileText className="h-3 w-3" />
              Edit Prompt
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ===== 2. Five Stat Cards ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-neutral-500">Model</span>
            </div>
            <div className="text-lg font-bold truncate">{modelShort}</div>
            <div className="text-xs text-neutral-500 truncate">{modelProvider}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-neutral-500">Balance</span>
            </div>
            <div className="text-lg font-bold font-mono">
              {totalUsdBalance > 0 ? `$${totalUsdBalance.toFixed(2)}` : '$0.00'}
            </div>
            <div className="text-xs text-neutral-500">USD equiv.</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-neutral-500">Decisions</span>
            </div>
            <div className="text-lg font-bold font-mono">
              {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
            </div>
            <div className="text-xs text-neutral-500">{maxDec > 0 ? `${decPct}% used` : 'Unlimited'}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-xs text-neutral-500">Open Orders</span>
            </div>
            <div className="text-lg font-bold font-mono">{openOrders}</div>
            <div className="text-xs text-neutral-500">{closedOrders} closed</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-3 px-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-neutral-500" />
              <span className="text-xs text-neutral-500">Created</span>
            </div>
            <div className="text-lg font-bold">{createdDay}</div>
            <div className="text-xs text-neutral-500">{createdTime}</div>
          </CardContent>
        </Card>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-900/30 bg-red-50 dark:bg-red-900/10 px-4 py-3">
          <span className="font-mono text-xs text-red-600 dark:text-red-400">{error}</span>
        </div>
      )}

      {/* ===== 3. Tabs ===== */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        {(['overview', 'orders', 'ai'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              detailTab === t
                ? 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300',
            )}
            onClick={() => setDetailTab(t)}
          >
            {t === 'overview' ? 'Overview' : t === 'orders' ? 'DEX Orders' : 'AI Responses'}
          </button>
        ))}
      </div>

      {/* ===== 4. Tab Content ===== */}

      {detailTab === 'overview' && (
        <>
          {/* Balance Chart */}
          <Card>
            <CardContent className="pt-6">
              <BalanceChart points={chartPoints} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
            {/* Left: Contract Details */}
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-sm">Contract Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-500">ID</span>
                  <span className="font-mono text-xs break-all text-right">{contract.id}</span>
                </div>
                <Separator />

                <TradingPairsRow contract={contract} />
                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-500">Prompt</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                    onClick={() => void handleViewPrompt()}
                    disabled={promptLoading}
                  >
                    {promptLoading ? (
                      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    View Prompt
                  </Button>
                </div>
                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-500">Explorer</span>
                  <div className="flex items-center gap-2 text-xs">
                    <a
                      className="text-violet-600 dark:text-violet-400 hover:underline underline-offset-4"
                      href={explorerLink(contract.address)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tonviewer
                    </a>
                    <span className="text-neutral-400">|</span>
                    <a
                      className="text-violet-600 dark:text-violet-400 hover:underline underline-offset-4"
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
                  <span className="text-sm text-neutral-500">Decisions</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">
                      {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
                    </span>
                    {maxDec > 0 && (
                      <div className="w-16 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, decPct)}%` }}
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
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-neutral-500" />
                    <CardTitle className="text-sm">Wallet</CardTitle>
                    {balancesRefreshing && (
                      <span className="flex items-center gap-1 text-xs text-neutral-400">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      </span>
                    )}
                    {totalUsdBalance > 0 && (
                      <Badge variant="outline" className="font-mono ml-auto text-[10px]">~${totalUsdBalance.toFixed(2)}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {balancesLoading && tokenBalances.length === 0 ? (
                    <div className="flex justify-center py-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                    </div>
                  ) : tokenBalances.length === 0 ? (
                    <div className="text-xs text-neutral-500 text-center py-1">No tokens found</div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {tokenBalances.map((t) => (
                        <div key={t.symbol} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{t.symbol}</span>
                            <span className="text-neutral-500">{t.name}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono">
                            <span>{t.amount >= 1000 ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : t.amount >= 1 ? t.amount.toFixed(4) : t.amount.toFixed(6)}</span>
                            {t.usdValue > 0 && (
                              <span className="text-neutral-500 text-[10px]">~${t.usdValue.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Separator />

                  {/* Top Up */}
                  <div className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-neutral-500" />
                    <span className="text-sm text-neutral-500">Top Up</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Input
                        id="detail-topup"
                        type="text"
                        className="h-7 w-16 text-xs font-mono text-right"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                      <select
                        className="h-7 rounded-md border border-neutral-300 bg-transparent px-2 text-xs font-mono dark:border-neutral-700"
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
                        className="h-7 gap-1"
                        disabled={topupBusy}
                        onClick={() => void topupContract()}
                      >
                        {topupBusy ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions card */}
              <Card className="flex-1">
                <CardHeader>
                  <CardTitle className="text-sm">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant={withdrawDone.has('close') ? 'success' : 'outline'}
                      size="sm"
                      className="gap-1"
                      onClick={() => void handleCloseOrders()}
                      disabled={!!withdrawBusy || withdrawDone.has('close')}
                    >
                      <XCircle className="h-4 w-4" />
                      {withdrawBusy === 'close' ? 'Closing...' : withdrawDone.has('close') ? 'Orders closed' : 'Close orders'}
                    </Button>

                    <Button
                      variant={withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'success' : 'outline'}
                      size="sm"
                      className="gap-1"
                      onClick={() => void handleWithdrawAll()}
                      disabled={!!withdrawBusy || (withdrawDone.has('jetton') && withdrawDone.has('ton'))}
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      {withdrawBusy === 'withdraw' ? 'Withdrawing...' : withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'All withdrawn' : 'Withdraw all'}
                    </Button>

                    <Button
                      variant={revokeSuccess ? 'success' : 'destructive'}
                      size="sm"
                      className="gap-1"
                      onClick={() => void handleRevokeAccess()}
                      disabled={revokeBusy || revokeSuccess}
                    >
                      <ShieldOff className="h-4 w-4" />
                      {revokeBusy ? 'Revoking...' : revokeSuccess ? 'Access revoked' : 'Revoke access'}
                    </Button>
                  </div>

                  {jettonInfo && jettonInfo.jettons?.length > 0 && (
                    <div className="text-xs text-neutral-500 mt-2">
                      Jettons: {jettonInfo.jettons.map((j) => `${(j.balance / 10 ** j.decimals).toFixed(j.decimals > 4 ? 4 : j.decimals)} ${j.symbol}`).join(', ')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* --- DEX Orders Tab --- */}
      {detailTab === 'orders' && (
        <OrdersPanel contractAddress={contract.address} />
      )}

      {/* --- AI Responses Tab --- */}
      {detailTab === 'ai' && (
        <div className="flex flex-col gap-3">
          {aiRefreshing && (
            <div className="flex items-center gap-1 text-xs text-neutral-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> Updating...
            </div>
          )}

          {aiError ? (
            <div className="text-sm text-red-600 dark:text-red-400">{aiError}</div>
          ) : aiResponses.length === 0 && !aiLoading ? (
            <Card>
              <CardContent className="py-6">
                <span className="text-sm text-neutral-500">No AI responses yet.</span>
              </CardContent>
            </Card>
          ) : aiLoading ? (
            <div className="flex justify-center py-4">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : (
            aiResponses.map((r) => {
              const pp = r.parsed_params as Record<string, unknown> | null;
              const reason = pp?.reasoning as string | undefined;
              const shareUrl = reason ? buildShareUrl(r.id) : null;
              const actionVariant: 'success' | 'warning' | 'secondary' | 'default' =
                r.action === 'create_order' ? 'success' :
                r.action === 'close_order' ? 'warning' :
                r.action === 'hold' ? 'secondary' : 'default';
              return (
                <Card key={r.id} className="border-l-4 border-l-neutral-200 dark:border-l-neutral-700">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 mt-0.5">
                          <Activity className="h-4 w-4 text-neutral-500" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <Badge variant={actionVariant} className="text-[10px]">{r.action}</Badge>
                            <span className="font-mono text-sm font-bold">
                              {r.balance_usd != null ? `$${r.balance_usd.toFixed(2)}` : ''}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] text-neutral-500">
                            <Clock className="h-3 w-3" />
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {shareUrl && (
                        <button
                          className={cn(
                            'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                            copiedId === r.id
                              ? 'text-emerald-500'
                              : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200',
                          )}
                          title="Copy share link"
                          onClick={() => {
                            void navigator.clipboard.writeText(shareUrl);
                            setCopiedId(r.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          {copiedId === r.id ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                    {reason && <p className="text-xs leading-relaxed text-neutral-500 mt-1">{reason}</p>}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* Prompt Modal */}
      {promptOpen && prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setPromptOpen(false); setPromptEditing(false); }}>
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xl max-w-2xl w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 pb-3">
              <h3 className="font-bold text-lg">Agent Prompt</h3>
              <div className="flex items-center gap-1">
                {!promptEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => { setPromptDraft(prompt); setPromptEditing(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('gap-1.5', promptCopied && 'text-emerald-500')}
                  onClick={() => {
                    void navigator.clipboard.writeText(promptEditing ? promptDraft : prompt).then(() => {
                      setPromptCopied(true);
                      setTimeout(() => setPromptCopied(false), 2000);
                    });
                  }}
                >
                  {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {promptCopied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>
            <div className="px-6 pb-6">
              {promptEditing ? (
                <Textarea
                  className="w-full text-sm font-mono min-h-[40vh] max-h-[60vh]"
                  value={promptDraft}
                  onChange={(e) => setPromptDraft(e.target.value)}
                  disabled={promptSaving}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 max-h-[60vh] overflow-y-auto font-mono">{prompt}</pre>
              )}
              <div className="flex justify-end gap-2 mt-4">
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
                      className="gap-1.5"
                      onClick={() => void handleSavePrompt()}
                      disabled={promptSaving || !promptDraft.trim() || promptDraft.trim() === prompt}
                    >
                      {promptSaving ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      {promptSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setPromptOpen(false)}>Close</Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
