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
import { buildShareUrl } from './ShareCard';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import type { AppTheme } from '@/lib/chart-theme';

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



function TradingPairsRow({ contract }: { contract: ContractListItem; raceCfg: PublicApiConfig }) {
  const pairs = (contract.trading_pairs ?? '').split(',').map((p) => p.trim()).filter(Boolean);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm opacity-60 shrink-0">Trading Pairs</div>
      <div className="flex items-center gap-1 flex-wrap justify-end">
        {pairs.map((p) => (
          <span key={p} className="badge badge-sm badge-primary">{p}</span>
        ))}
      </div>
    </div>
  );
}

type ContractDetailPanelProps = {
  contract: ContractListItem;
  raceCfg: PublicApiConfig;
  theme: AppTheme;
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

/* ---------- Balance Chart (Recharts) ---------- */

type ChartPoint = { time: number; value: number };

const CHART_GREEN = '#00C389';

type TimeRange = '1h' | '6h' | '24h' | '7d';
const TIME_RANGES: { key: TimeRange; label: string; ms: number }[] = [
  { key: '1h', label: '1h', ms: 60 * 60 * 1000 },
  { key: '6h', label: '6h', ms: 6 * 60 * 60 * 1000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
];

function BalanceChart({ points }: { points: ChartPoint[]; theme: AppTheme }) {
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
          <div className="text-xs opacity-50">Balance (USD) <span className="opacity-60">· at last decision</span></div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold mono tabular-nums">
              ${currentBalance.toFixed(2)}
            </span>
            <span className={`text-sm font-bold mono tabular-nums ${changePositive ? 'text-success' : 'text-error'}`}>
              {changePositive ? '+' : ''}{changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-0.5 bg-base-300 rounded-lg p-0.5">
          {TIME_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`btn btn-xs px-3 ${range === r.key ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <span className="text-sm opacity-60">No balance data for chart.</span>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
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
            <Tooltip
              contentStyle={{
                backgroundColor: 'oklch(var(--b2))',
                border: '1px solid oklch(var(--bc) / 0.1)',
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

/* ---------- Main Component ---------- */

export function ContractDetailPanel({ contract, raceCfg, theme, onDeleted, onStatusChanged }: ContractDetailPanelProps) {
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

  // AI responses: load from cache first, then refresh
  const aiCacheKey = aiResponsesCacheKey(contract.id);
  const cachedAi = useMemo(() => {
    const raw = readCache<AiResponse[]>(aiCacheKey);
    return Array.isArray(raw) ? raw : null;
  }, [aiCacheKey]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>(cachedAi ?? []);
  const [aiLoading, setAiLoading] = useState(!cachedAi); // only show spinner if no cache
  const [aiRefreshing, setAiRefreshing] = useState(false); // background refresh indicator
  const [aiError, setAiError] = useState<string | null>(null);

  // Share copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Token balances (TON + jettons) — cached
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
  const [withdrawBusy, setWithdrawBusy] = useState<string | null>(null); // 'jetton' | 'ton' | 'close' | 'delete' | 'pause'
  const [withdrawDone, setWithdrawDone] = useState<Set<string>>(new Set()); // tracks completed steps
  const [jettonInfo, setJettonInfo] = useState<WithdrawJettonResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailTab, setDetailTab] = useState<'overview' | 'orders' | 'ai'>('overview');

  // DEX order stats
  const [dexOpenOrders, setDexOpenOrders] = useState(0);
  const [dexClosedOrders, setDexClosedOrders] = useState(0);

  // Address copy feedback
  const [addrCopied, setAddrCopied] = useState(false);

  // Fetch contract detail for ai_model
  useEffect(() => {
    getRaceContractDetail(raceCfg, contract.id)
      .then((detail) => {
        setAiModel(detail.ai_model || null);
        setIsActive(detail.is_active);
      })
      .catch(() => setAiModel(null));
  }, [raceCfg, contract.id]);

  // Fetch prompt on demand via /api/contracts/{id}/prompt (owner-only)
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

      // Jetton rows — collect tokens needing DEX price lookup
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

      // Fetch DEX prices for tokens without race API price (e.g. AgentM)
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
        // Jetton transfer
        if (!tonAddress) throw new Error('Wallet not connected');
        const tokens = await getRaceTokens(raceCfg);
        const tokenInfo = tokens.find((t) => t.symbol.toUpperCase() === topupToken.toUpperCase());
        if (!tokenInfo) throw new Error(`Token ${topupToken} not found`);
        const nano = BigInt(Math.round(amt * 10 ** tokenInfo.decimals));
        // Resolve user's jetton wallet
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

      // Fetch jetton balances to get master addresses, then withdraw each
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

      // TON withdraw — send full balance, attach 0.11 TON for gas
      // Try fresh fetch first, fall back to cached tokenBalances
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

      // TON message
      if (tonResult.status === 'fulfilled' && tonResult.value.body_hex) {
        messages.push({
          address: bounceable,
          amount: nanoFromTon('0.11'),
          payload: hexBocToBase64(tonResult.value.body_hex),
        });
        setWithdrawDone((s) => new Set(s).add('ton'));
      }

      // Send all messages in a single transaction (up to 4 supported)
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
      // set_signature_allowed: op=0x73657473, query_id=0, new_status=false(-1 is true, 0 is false)
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

  const canDelete = withdrawDone.has('jetton') && withdrawDone.has('ton');

  // Chart data: sorted oldest → newest
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
    <div className="mt-4 flex flex-col gap-4">
      {/* ===== 1. Agent Header Card ===== */}
      <div className="card bg-base-200 shadow-md">
        <div className="card-body py-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Bot icon */}
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/15 shrink-0">
              <Bot className="h-5 w-5 text-primary" />
            </div>

            {/* Name + status */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold truncate">{contract.name || 'Agent'}</span>
                {aiResponses.length === 0 && !aiLoading ? (
                  <span className="badge badge-sm badge-warning animate-pulse">Deploying...</span>
                ) : (
                  <span className={`badge badge-sm ${isActive ? 'badge-success' : 'badge-ghost'}`}>
                    {isActive ? 'Active' : 'Paused'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="mono text-xs opacity-50">{fmtAddr(contract.address)}</span>
                <button
                  className={`btn btn-ghost btn-xs px-1 ${addrCopied ? 'text-success' : ''}`}
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

            {/* Spacer */}
            <div className="flex-1" />

            {/* Pause + Delete buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={`btn btn-sm btn-outline gap-1 ${isActive ? 'btn-warning' : 'btn-success'}`}
                onClick={() => void handleTogglePause()}
                disabled={pauseBusy}
                type="button"
              >
                {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {pauseBusy ? 'Updating...' : isActive ? 'Pause' : 'Resume'}
              </button>

              {!confirmDelete ? (
                <button
                  className="btn btn-error btn-sm btn-outline gap-1"
                  onClick={() => setConfirmDelete(true)}
                  disabled={!!withdrawBusy}
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-error font-medium">
                    {canDelete ? 'Sure?' : 'Delete anyway?'}
                  </span>
                  <button
                    className="btn btn-error btn-xs gap-1"
                    onClick={() => void handleDelete()}
                    disabled={withdrawBusy === 'delete'}
                    type="button"
                  >
                    {withdrawBusy === 'delete' ? 'Deleting...' : 'Yes'}
                  </button>
                  <button
                    className="btn btn-ghost btn-xs"
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

          {/* Confirm delete warning */}
          {confirmDelete && !canDelete && (
            <div className="flex items-start gap-2 text-warning mt-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="text-xs">
                Please withdraw all tokens (jettons & TON) before deleting. Tokens left in the contract will be lost!
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Stop reason banner */}
      {stopReason && (
        <div className="card bg-error/10 border border-error/20 shadow-sm">
          <div className="card-body p-3 flex-row items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-error mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-error">Agent Stopped</div>
              <div className="text-xs opacity-70 mt-0.5">{stopReason}</div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 2. Five Stat Cards ===== */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {/* Model */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body py-3 px-4 gap-1">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-warning" />
              <span className="text-xs opacity-60">Model</span>
            </div>
            <div className="text-lg font-bold truncate">{modelShort}</div>
            <div className="text-xs opacity-40 truncate">{modelProvider}</div>
          </div>
        </div>

        {/* Balance */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body py-3 px-4 gap-1">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-success" />
              <span className="text-xs opacity-60">Balance</span>
            </div>
            <div className="text-lg font-bold mono">
              {totalUsdBalance > 0 ? `$${totalUsdBalance.toFixed(2)}` : '$0.00'}
            </div>
            <div className="text-xs opacity-40">USD equiv.</div>
          </div>
        </div>

        {/* Decisions */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body py-3 px-4 gap-1">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-info" />
              <span className="text-xs opacity-60">Decisions</span>
            </div>
            <div className="text-lg font-bold mono">
              {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
            </div>
            <div className="text-xs opacity-40">{maxDec > 0 ? `${decPct}% used` : 'Unlimited'}</div>
          </div>
        </div>

        {/* Open Orders */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body py-3 px-4 gap-1">
            <div className="flex items-center gap-1.5">
              <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs opacity-60">Open Orders</span>
            </div>
            <div className="text-lg font-bold mono">{openOrders}</div>
            <div className="text-xs opacity-40">{closedOrders} closed</div>
          </div>
        </div>

        {/* Created */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body py-3 px-4 gap-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-secondary" />
              <span className="text-xs opacity-60">Created</span>
            </div>
            <div className="text-lg font-bold">{createdDay}</div>
            <div className="text-xs opacity-40">{createdTime}</div>
          </div>
        </div>
      </div>

      {/* ===== Error display ===== */}
      {error ? (
        <div role="alert" className="alert alert-error">
          <span className="mono text-xs">{error}</span>
        </div>
      ) : null}

      {/* ===== 3. Tabs ===== */}
      <div className="tabs tabs-bordered">
        <button
          className={`tab ${detailTab === 'overview' ? 'tab-active' : ''}`}
          onClick={() => setDetailTab('overview')}
          type="button"
        >
          Overview
        </button>
        <button
          className={`tab ${detailTab === 'orders' ? 'tab-active' : ''}`}
          onClick={() => setDetailTab('orders')}
          type="button"
        >
          DEX Orders
        </button>
        <button
          className={`tab ${detailTab === 'ai' ? 'tab-active' : ''}`}
          onClick={() => setDetailTab('ai')}
          type="button"
        >
          AI Responses
        </button>
      </div>

      {/* ===== 4. Tab Content ===== */}

      {/* --- Overview Tab --- */}
      {detailTab === 'overview' && (
        <>
          {/* Balance Chart */}
          <div className="card bg-base-200 shadow-md overflow-hidden">
            <div className="card-body">
              <BalanceChart points={chartPoints} theme={theme} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
            {/* Left: Contract Details */}
            <div className="card bg-base-200 shadow-md h-full">
              <div className="card-body gap-3">
                <h2 className="card-title text-sm">Contract Details</h2>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm opacity-60">ID</span>
                  <span className="mono text-xs break-all text-right">{contract.id}</span>
                </div>
                <div className="divider my-0" />

                <TradingPairsRow contract={contract} raceCfg={raceCfg} />
                <div className="divider my-0" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm opacity-60">Prompt</span>
                  <button
                    className="btn btn-ghost btn-xs gap-1"
                    onClick={() => void handleViewPrompt()}
                    disabled={promptLoading}
                    type="button"
                  >
                    {promptLoading ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    View Prompt
                  </button>
                </div>
                <div className="divider my-0" />

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm opacity-60">Explorer</span>
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

                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm opacity-60">Decisions</span>
                  <div className="flex items-center gap-2">
                    <span className="mono text-xs">
                      {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
                    </span>
                    {maxDec > 0 && (
                      <progress
                        className="progress progress-success w-16 h-2"
                        value={usedDec}
                        max={maxDec}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col gap-4">
              {/* Wallet card */}
              <div className="card bg-base-200 shadow-md">
                <div className="card-body gap-3">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 opacity-60" />
                    <h2 className="card-title text-sm">Wallet</h2>
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

                  <div className="divider my-0" />

                  {/* Top Up */}
                  <div className="flex items-center gap-2">
                    <ArrowUpFromLine className="h-4 w-4 opacity-60" />
                    <span className="text-sm opacity-60">Top Up</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <input
                        id="detail-topup"
                        type="text"
                        className="input input-bordered input-xs w-16 text-xs mono text-right"
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                      <select
                        className="select select-bordered select-xs text-xs mono"
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
                        className={`btn btn-outline btn-xs gap-1 ${topupBusy ? 'btn-disabled' : ''}`}
                        onClick={() => void topupContract()}
                        type="button"
                      >
                        {topupBusy ? 'Sending...' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions card */}
              <div className="card bg-base-200 shadow-md flex-1">
                <div className="card-body gap-3">
                  <h2 className="card-title text-sm">Quick Actions</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={`btn btn-outline btn-sm gap-1 ${withdrawDone.has('close') ? 'btn-success' : ''}`}
                      onClick={() => void handleCloseOrders()}
                      disabled={!!withdrawBusy || withdrawDone.has('close')}
                      type="button"
                    >
                      <XCircle className="h-4 w-4" />
                      {withdrawBusy === 'close' ? 'Closing...' : withdrawDone.has('close') ? 'Orders closed' : 'Close orders'}
                    </button>

                    <button
                      className={`btn btn-outline btn-sm gap-1 ${withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'btn-success' : ''}`}
                      onClick={() => void handleWithdrawAll()}
                      disabled={!!withdrawBusy || (withdrawDone.has('jetton') && withdrawDone.has('ton'))}
                      type="button"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                      {withdrawBusy === 'withdraw' ? 'Withdrawing...' : withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'All withdrawn' : 'Withdraw all'}
                    </button>

                    <button
                      className={`btn btn-outline btn-sm gap-1 ${revokeSuccess ? 'btn-success' : 'btn-error'}`}
                      onClick={() => void handleRevokeAccess()}
                      disabled={revokeBusy || revokeSuccess}
                      type="button"
                    >
                      <ShieldOff className="h-4 w-4" />
                      {revokeBusy ? 'Revoking...' : revokeSuccess ? 'Access revoked' : 'Revoke access'}
                    </button>
                  </div>

                  {/* Jetton info */}
                  {jettonInfo && jettonInfo.jettons?.length > 0 && (
                    <div className="text-xs opacity-60">
                      Jettons: {jettonInfo.jettons.map((j) => `${(j.balance / 10 ** j.decimals).toFixed(j.decimals > 4 ? 4 : j.decimals)} ${j.symbol}`).join(', ')}
                    </div>
                  )}
                </div>
              </div>
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
            <div className="flex items-center gap-1 text-xs opacity-50">
              <RefreshCw className="h-3 w-3 animate-spin" /> Updating...
            </div>
          )}

          {aiError ? (
            <div className="text-sm text-error">{aiError}</div>
          ) : aiResponses.length === 0 && !aiLoading ? (
            <div className="card bg-base-200 shadow-md">
              <div className="card-body"><span className="text-sm opacity-60">No AI responses yet.</span></div>
            </div>
          ) : aiLoading ? (
            <div className="flex justify-center py-4">
              <span className="loading loading-spinner loading-md" />
            </div>
          ) : (
            aiResponses.map((r) => {
              const pp = r.parsed_params as Record<string, unknown> | null;
              const reason = pp?.reasoning as string | undefined;
              const shareUrl = reason ? buildShareUrl(r.id) : null;
              const actionColor = r.action === 'create_order' ? 'badge-success' : r.action === 'close_order' ? 'badge-warning' : r.action === 'hold' ? 'badge-ghost' : 'badge-info';
              return (
                <div key={r.id} className="card bg-base-200 shadow-sm border-l-4 border-base-content/10">
                  <div className="card-body p-4 gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-base-300 mt-0.5">
                          <Activity className="h-4 w-4 opacity-50" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <span className={`badge badge-sm ${actionColor}`}>{r.action}</span>
                            <span className="mono text-sm font-bold">
                              {r.balance_usd != null ? `$${r.balance_usd.toFixed(2)}` : ''}
                            </span>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] opacity-40">
                            <Clock className="h-3 w-3" />
                            {new Date(r.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      {shareUrl && (
                        <button
                          className={`btn btn-xs btn-ghost ${copiedId === r.id ? 'text-success' : 'opacity-40'}`}
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
                    {reason && <p className="text-xs leading-relaxed opacity-60 mt-1">{reason}</p>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Prompt Modal */}
      {promptOpen && prompt && (
        <dialog className="modal modal-open" onClick={() => { setPromptOpen(false); setPromptEditing(false); }}>
          <div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-lg">Agent Prompt</h3>
              <div className="flex items-center gap-1">
                {!promptEditing && (
                  <button
                    className="btn btn-sm btn-ghost gap-1.5"
                    onClick={() => { setPromptDraft(prompt); setPromptEditing(true); }}
                    type="button"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                )}
                <button
                  className={`btn btn-sm btn-ghost gap-1.5 ${promptCopied ? 'text-success' : ''}`}
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
                className="textarea textarea-bordered w-full text-sm mono min-h-[40vh] max-h-[60vh]"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                disabled={promptSaving}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm bg-base-300 rounded-lg p-4 max-h-[60vh] overflow-y-auto mono">{prompt}</pre>
            )}
            <div className="modal-action">
              {promptEditing ? (
                <>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setPromptEditing(false)}
                    disabled={promptSaving}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-sm btn-primary gap-1.5"
                    onClick={() => void handleSavePrompt()}
                    disabled={promptSaving || !promptDraft.trim() || promptDraft.trim() === prompt}
                    type="button"
                  >
                    {promptSaving ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    {promptSaving ? 'Saving...' : 'Save'}
                  </button>
                </>
              ) : (
                <button className="btn btn-sm" onClick={() => setPromptOpen(false)} type="button">Close</button>
              )}
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
