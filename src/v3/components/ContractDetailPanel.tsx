import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Trash2, ArrowDownToLine, XCircle,
  Check, Pause, Play, Wallet, AlertTriangle, RefreshCw,
  FileText, Copy, Pencil, Save,
  Bot, Zap, Activity, ArrowUpRight, Clock, ShieldOff,
  Share2, ArrowUpFromLine,
} from 'lucide-react';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';

/* ---------- helpers ---------- */

type TokenBalanceRow = {
  symbol: string;
  name: string;
  amount: number;
  usdValue: number;
};

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

function buildShareUrl(responseId: string): string {
  return `https://agentmeme.ai/#share/r/${responseId}`;
}

function TradingPairsRow({ contract }: { contract: ContractListItem }) {
  const pairs = (contract.trading_pairs ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-gray-500">Trading Pairs</div>
      <div className="flex flex-wrap items-center gap-1 justify-end">
        {pairs.map((p) => (
          <span key={p} className="rounded-full border border-[#00C389]/30 bg-[#00C389]/10 px-2 py-0.5 text-[10px] font-medium text-[#00C389]">{p}</span>
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

const CHART_GREEN = '#00C389';

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
          <div className="text-xs text-gray-500">Balance (USD) <span className="text-gray-600">at last decision</span></div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-bold tabular-nums text-white">
              ${currentBalance.toFixed(2)}
            </span>
            <span className={`font-mono text-sm font-bold tabular-nums ${changePositive ? 'text-[#00C389]' : 'text-red-400'}`}>
              {changePositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-0.5 rounded-lg bg-gray-800/60 p-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                range === r.key ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <span className="text-sm text-gray-600">No balance data for chart.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={filtered} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="v3BalGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_GREEN} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_GREEN} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="time"
              tickFormatter={fmtTime}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fontSize: 11, fill: '#6B7280' }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
                padding: '6px 10px',
                color: '#E5E7EB',
              }}
              labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Balance']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART_GREEN}
              strokeWidth={2.5}
              fill="url(#v3BalGrad)"
              dot={false}
              activeDot={{ r: 4, fill: CHART_GREEN, strokeWidth: 0 }}
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
            : 'Not authenticated — reconnect your wallet to view the prompt.',
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

  const loadTokenBalances = useCallback(async (isBackground = false) => {
    if (isBackground) { setBalancesRefreshing(true); } else { setBalancesLoading(true); }
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
      // keep existing data
    } finally {
      setBalancesLoading(false);
      setBalancesRefreshing(false);
    }
  }, [contract.address, raceCfg, balCacheKey]);

  useEffect(() => { void loadTokenBalances(!!cachedBalances); }, [loadTokenBalances, cachedBalances]);

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
    if (isBackground) { setAiRefreshing(true); } else { setAiLoading(true); }
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

  useEffect(() => { void loadAiResponses(!!cachedAi); }, [loadAiResponses, cachedAi]);

  // DEX order stats
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rawAddr = Address.parse(contract.address).toRawString();
        const stats = await getDexOrderStats(rawAddr);
        if (!cancelled) { setDexOpenOrders(stats.open); setDexClosedOrders(stats.closed); }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [contract.address]);

  // Withdrawal handlers
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
      {/* 1. Agent Header Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-white/5 bg-gray-900/80 p-4 backdrop-blur-sm"
      >
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#00C389]/15">
            <Bot className="h-5 w-5 text-[#00C389]" />
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate text-xl font-bold text-white">{contract.name || 'Agent'}</span>
              {aiResponses.length === 0 && !aiLoading ? (
                <span className="animate-pulse rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] font-medium text-yellow-400">Deploying...</span>
              ) : (
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                  isActive
                    ? 'border-[#00C389]/30 bg-[#00C389]/10 text-[#00C389]'
                    : 'border-gray-600 bg-gray-800 text-gray-400'
                }`}>
                  {isActive ? 'Active' : 'Paused'}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              <span className="font-mono text-xs text-gray-500">{fmtAddr(contract.address)}</span>
              <button
                className={`rounded p-0.5 transition-colors hover:bg-white/5 ${addrCopied ? 'text-[#00C389]' : 'text-gray-500'}`}
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

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/10'
                  : 'border-[#00C389]/30 text-[#00C389] hover:bg-[#00C389]/10'
              }`}
              onClick={() => void handleTogglePause()}
              disabled={pauseBusy}
              type="button"
            >
              {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {pauseBusy ? 'Updating...' : isActive ? 'Pause' : 'Resume'}
            </button>

            {!confirmDelete ? (
              <button
                className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/10"
                onClick={() => setConfirmDelete(true)}
                disabled={!!withdrawBusy}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-red-400">
                  {canDelete ? 'Sure?' : 'Delete anyway?'}
                </span>
                <button
                  className="rounded-lg bg-red-500 px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80"
                  onClick={() => void handleDelete()}
                  disabled={withdrawBusy === 'delete'}
                  type="button"
                >
                  {withdrawBusy === 'delete' ? 'Deleting...' : 'Yes'}
                </button>
                <button
                  className="rounded-lg px-3 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5"
                  onClick={() => setConfirmDelete(false)}
                  disabled={withdrawBusy === 'delete'}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {confirmDelete && !canDelete && (
          <div className="mt-2 flex items-start gap-2 text-yellow-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-xs">
              Please withdraw all tokens (jettons & TON) before deleting. Tokens left in the contract will be lost!
            </span>
          </div>
        )}
      </motion.div>

      {/* Stop reason banner */}
      {stopReason && !isActive && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-red-400/20 bg-red-500/5 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-red-400">Agent Stopped</div>
              <div className="mt-0.5 text-xs text-gray-400">{stopReason}</div>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5"
              onClick={() => { setPromptOpen(true); setDetailTab('overview'); }}
            >
              <FileText className="h-3 w-3" />
              Edit Prompt
            </button>
          </div>
        </motion.div>
      )}

      {/* 2. Five Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          {
            icon: <Zap className="h-3.5 w-3.5 text-yellow-400" />,
            label: 'Model',
            value: modelShort,
            sub: modelProvider,
          },
          {
            icon: <Wallet className="h-3.5 w-3.5 text-[#00C389]" />,
            label: 'Balance',
            value: totalUsdBalance > 0 ? `$${totalUsdBalance.toFixed(2)}` : '$0.00',
            sub: 'USD equiv.',
          },
          {
            icon: <Activity className="h-3.5 w-3.5 text-blue-400" />,
            label: 'Decisions',
            value: `${usedDec}${maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}`,
            sub: maxDec > 0 ? `${decPct}% used` : 'Unlimited',
          },
          {
            icon: <ArrowUpRight className="h-3.5 w-3.5 text-[#00C389]" />,
            label: 'Open Orders',
            value: String(openOrders),
            sub: `${closedOrders} closed`,
          },
          {
            icon: <Clock className="h-3.5 w-3.5 text-purple-400" />,
            label: 'Created',
            value: createdDay,
            sub: createdTime,
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
            className="rounded-xl border border-white/5 bg-gray-900/60 p-3 backdrop-blur-sm"
          >
            <div className="flex items-center gap-1.5">
              {card.icon}
              <span className="text-xs text-gray-500">{card.label}</span>
            </div>
            <div className="mt-1 truncate font-mono text-lg font-bold text-white">{card.value}</div>
            <div className="truncate text-xs text-gray-600">{card.sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-2">
          <span className="font-mono text-xs text-red-400">{error}</span>
        </div>
      )}

      {/* 3. Tabs */}
      <div className="flex gap-1 border-b border-white/5">
        {(['overview', 'orders', 'ai'] as const).map((t) => (
          <button
            key={t}
            className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              detailTab === t
                ? 'border-[#00C389] text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
            onClick={() => setDetailTab(t)}
            type="button"
          >
            {t === 'overview' ? 'Overview' : t === 'orders' ? 'DEX Orders' : 'AI Responses'}
          </button>
        ))}
      </div>

      {/* 4. Tab Content */}

      {/* Overview */}
      <AnimatePresence mode="wait">
        {detailTab === 'overview' && (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            {/* Balance Chart */}
            <div className="overflow-hidden rounded-xl border border-white/5 bg-gray-900/60 p-5 backdrop-blur-sm">
              <BalanceChart points={chartPoints} />
            </div>

            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              {/* Left: Contract Details */}
              <div className="h-full rounded-xl border border-white/5 bg-gray-900/60 p-5 backdrop-blur-sm">
                <h2 className="mb-3 text-sm font-bold text-white">Contract Details</h2>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500">ID</span>
                  <span className="break-all text-right font-mono text-xs text-gray-300">{contract.id}</span>
                </div>
                <div className="my-2 border-t border-white/5" />

                <TradingPairsRow contract={contract} />
                <div className="my-2 border-t border-white/5" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500">Prompt</span>
                  <button
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => void handleViewPrompt()}
                    disabled={promptLoading}
                    type="button"
                  >
                    {promptLoading ? (
                      <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-[#00C389]" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    View Prompt
                  </button>
                </div>
                <div className="my-2 border-t border-white/5" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500">Explorer</span>
                  <div className="flex items-center gap-2 text-xs">
                    <a className="text-[#00C389] hover:underline" href={explorerLink(contract.address)} target="_blank" rel="noreferrer">Tonviewer</a>
                    <span className="text-gray-600">|</span>
                    <a className="text-[#00C389] hover:underline" href={tonscanLink(contract.address)} target="_blank" rel="noreferrer">Tonscan</a>
                  </div>
                </div>
                <div className="my-2 border-t border-white/5" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-gray-500">Decisions</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-300">
                      {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
                    </span>
                    {maxDec > 0 && (
                      <div className="relative h-2 w-16 overflow-hidden rounded-full bg-gray-800">
                        <div className="absolute left-0 top-0 h-full rounded-full bg-[#00C389]" style={{ width: `${Math.min(decPct, 100)}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="flex flex-col gap-4">
                {/* Wallet card */}
                <div className="rounded-xl border border-white/5 bg-gray-900/60 p-5 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-gray-500" />
                    <h2 className="text-sm font-bold text-white">Wallet</h2>
                    {balancesRefreshing && (
                      <RefreshCw className="h-3 w-3 animate-spin text-gray-600" />
                    )}
                    {totalUsdBalance > 0 && (
                      <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] text-gray-400">~${totalUsdBalance.toFixed(2)}</span>
                    )}
                  </div>

                  {balancesLoading && tokenBalances.length === 0 ? (
                    <div className="flex justify-center py-2">
                      <div className="h-4 w-4 animate-spin rounded-full border border-gray-600 border-t-[#00C389]" />
                    </div>
                  ) : tokenBalances.length === 0 ? (
                    <div className="py-1 text-center text-xs text-gray-600">No tokens found</div>
                  ) : (
                    <div className="mt-3 flex flex-col gap-1.5">
                      {tokenBalances.map((t) => (
                        <div key={t.symbol} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{t.symbol}</span>
                            <span className="text-gray-600">{t.name}</span>
                          </div>
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-gray-300">{t.amount >= 1000 ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : t.amount >= 1 ? t.amount.toFixed(4) : t.amount.toFixed(6)}</span>
                            {t.usdValue > 0 && (
                              <span className="text-[10px] text-gray-600">~${t.usdValue.toFixed(2)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="my-3 border-t border-white/5" />

                  {/* Top Up */}
                  <div className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-500">Top Up</span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <input
                        id="detail-topup"
                        type="text"
                        className="w-16 rounded border border-white/10 bg-gray-950 px-2 py-1 text-right font-mono text-xs text-white outline-none focus:border-[#00C389]/50"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                      <select
                        className="rounded border border-white/10 bg-gray-950 px-2 py-1 font-mono text-xs text-white outline-none focus:border-[#00C389]/50"
                        value={topupToken}
                        onChange={(e) => setTopupToken(e.target.value)}
                      >
                        <option value="TON">TON</option>
                        <option value="AGNT">AGNT</option>
                        <option value="NOT">NOT</option>
                        <option value="BUILD">BUILD</option>
                        <option value="USDT">USDT</option>
                      </select>
                      <button
                        className={`rounded-lg border border-white/10 px-3 py-1 text-xs text-white transition-colors hover:bg-white/5 ${topupBusy ? 'pointer-events-none opacity-40' : ''}`}
                        onClick={() => void topupContract()}
                        type="button"
                      >
                        {topupBusy ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex-1 rounded-xl border border-white/5 bg-gray-900/60 p-5 backdrop-blur-sm">
                  <h2 className="mb-3 text-sm font-bold text-white">Quick Actions</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        withdrawDone.has('close')
                          ? 'border-[#00C389]/30 text-[#00C389]'
                          : 'border-white/10 text-gray-300 hover:bg-white/5'
                      }`}
                      onClick={() => void handleCloseOrders()}
                      disabled={!!withdrawBusy || withdrawDone.has('close')}
                      type="button"
                    >
                      <XCircle className="h-4 w-4" />
                      {withdrawBusy === 'close' ? 'Closing...' : withdrawDone.has('close') ? 'Orders closed' : 'Close orders'}
                    </button>

                    <button
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        withdrawDone.has('jetton') && withdrawDone.has('ton')
                          ? 'border-[#00C389]/30 text-[#00C389]'
                          : 'border-white/10 text-gray-300 hover:bg-white/5'
                      }`}
                      onClick={() => void handleWithdrawAll()}
                      disabled={!!withdrawBusy || (withdrawDone.has('jetton') && withdrawDone.has('ton'))}
                      type="button"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      {withdrawBusy === 'withdraw' ? 'Withdrawing...' : withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'All withdrawn' : 'Withdraw all'}
                    </button>

                    <button
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        revokeSuccess
                          ? 'border-[#00C389]/30 text-[#00C389]'
                          : 'border-red-400/30 text-red-400 hover:bg-red-400/5'
                      }`}
                      onClick={() => void handleRevokeAccess()}
                      disabled={revokeBusy || revokeSuccess}
                      type="button"
                    >
                      <ShieldOff className="h-4 w-4" />
                      {revokeBusy ? 'Revoking...' : revokeSuccess ? 'Access revoked' : 'Revoke access'}
                    </button>
                  </div>

                  {jettonInfo && jettonInfo.jettons?.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      Jettons: {jettonInfo.jettons.map((j) => `${(j.balance / 10 ** j.decimals).toFixed(j.decimals > 4 ? 4 : j.decimals)} ${j.symbol}`).join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* DEX Orders */}
        {detailTab === 'orders' && (
          <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <OrdersPanel contractAddress={contract.address} />
          </motion.div>
        )}

        {/* AI Responses */}
        {detailTab === 'ai' && (
          <motion.div
            key="ai"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            {aiRefreshing && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <RefreshCw className="h-3 w-3 animate-spin" /> Updating...
              </div>
            )}

            {aiError ? (
              <div className="text-sm text-red-400">{aiError}</div>
            ) : aiResponses.length === 0 && !aiLoading ? (
              <div className="rounded-xl border border-white/5 bg-gray-900/60 p-5">
                <span className="text-sm text-gray-500">No AI responses yet.</span>
              </div>
            ) : aiLoading ? (
              <div className="flex justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-[#00C389]" />
              </div>
            ) : (
              aiResponses.map((r) => {
                const pp = r.parsed_params as Record<string, unknown> | null;
                const reason = pp?.reasoning as string | undefined;
                const shareUrl = reason ? buildShareUrl(r.id) : null;
                const actionColor =
                  r.action === 'create_order' ? 'border-[#00C389]/50 text-[#00C389]'
                    : r.action === 'close_order' ? 'border-yellow-400/50 text-yellow-400'
                      : r.action === 'hold' ? 'border-gray-500/50 text-gray-400'
                        : 'border-blue-400/50 text-blue-400';
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border-l-4 border-white/5 bg-gray-900/60 p-4"
                    style={{ borderLeftColor: r.action === 'create_order' ? CHART_GREEN : r.action === 'close_order' ? '#FBBF24' : '#6B7280' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800">
                          <Activity className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${actionColor}`}>{r.action}</span>
                            <span className="font-mono text-sm font-bold text-white">
                              {r.balance_usd != null ? `$${r.balance_usd.toFixed(2)}` : ''}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] text-gray-600">
                            <Clock className="h-3 w-3" />
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {shareUrl && (
                        <button
                          className={`rounded p-1 transition-colors hover:bg-white/5 ${copiedId === r.id ? 'text-[#00C389]' : 'text-gray-600'}`}
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
                    {reason && <p className="mt-1 text-xs leading-relaxed text-gray-400">{reason}</p>}
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prompt Modal */}
      {promptOpen && prompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { setPromptOpen(false); setPromptEditing(false); }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-4 max-w-2xl rounded-xl border border-white/10 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Agent Prompt</h3>
              <div className="flex items-center gap-1">
                {!promptEditing && (
                  <button
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                    onClick={() => { setPromptDraft(prompt); setPromptEditing(true); }}
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                <button
                  className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors hover:bg-white/5 ${promptCopied ? 'text-[#00C389]' : 'text-gray-400'}`}
                  onClick={() => {
                    void navigator.clipboard.writeText(promptEditing ? promptDraft : prompt).then(() => {
                      setPromptCopied(true);
                      setTimeout(() => setPromptCopied(false), 2000);
                    });
                  }}
                  type="button"
                >
                  {promptCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {promptCopied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
            {promptEditing ? (
              <textarea
                className="min-h-[40vh] max-h-[60vh] w-full rounded-lg border border-white/10 bg-gray-950 p-4 font-mono text-sm text-gray-200 outline-none focus:border-[#00C389]/50"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                disabled={promptSaving}
              />
            ) : (
              <pre className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-950 p-4 font-mono text-sm text-gray-300">{prompt}</pre>
            )}
            <div className="mt-4 flex justify-end gap-2">
              {promptEditing ? (
                <>
                  <button
                    className="rounded-lg px-3 py-1.5 text-sm text-gray-400 transition-colors hover:bg-white/5"
                    onClick={() => setPromptEditing(false)}
                    disabled={promptSaving}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#00C389] px-4 py-1.5 text-sm font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-40"
                    onClick={() => void handleSavePrompt()}
                    disabled={promptSaving || !promptDraft.trim() || promptDraft.trim() === prompt}
                    type="button"
                  >
                    {promptSaving ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border border-black/30 border-t-black" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {promptSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              ) : (
                <button className="rounded-lg border border-white/10 px-4 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5" onClick={() => setPromptOpen(false)} type="button">Close</button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
