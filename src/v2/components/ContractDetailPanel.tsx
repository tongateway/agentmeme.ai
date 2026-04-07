import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell } from '@ton/core';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Box,
  Flex,
  Text,
  Button,
  HStack,
  VStack,
  Icon,
  Badge,
  Spinner,
  Input,
  Textarea,
  NativeSelect,
  Link,
} from '@chakra-ui/react';
import {
  Trash2, ArrowDownToLine, ArrowUpFromLine, XCircle,
  Share2, Check, Pause, Play, Wallet, AlertTriangle, RefreshCw,
  FileText, Copy, Pencil, Save,
  Bot, Zap, Activity, ArrowUpRight, Clock, ShieldOff,
} from 'lucide-react';
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
import { buildShareUrl } from '../../components/ShareCard';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import type { AppTheme } from '@/lib/chart-theme';

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

/* ---------- Trading Pairs Row ---------- */

function TradingPairsRow({ contract, isDark }: { contract: ContractListItem; isDark: boolean }) {
  const pairs = (contract.trading_pairs ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  const textMuted = isDark ? 'gray.400' : 'gray.500';

  return (
    <Flex align="center" justify="space-between" gap={4}>
      <Text fontSize="sm" color={textMuted}>Trading Pairs</Text>
      <Flex align="center" gap={1} flexWrap="wrap" justify="flex-end">
        {pairs.map((p) => (
          <Badge key={p} size="sm" colorPalette="green">{p}</Badge>
        ))}
      </Flex>
    </Flex>
  );
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

function BalanceChart({ points, isDark }: { points: ChartPoint[]; isDark: boolean }) {
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

  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const rangeBg = isDark ? 'gray.800' : 'gray.200';
  const activeRangeBg = isDark ? 'gray.600' : 'white';
  const tooltipBg = isDark ? '#1a1a2e' : '#ffffff';
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

  return (
    <Box display="flex" flexDirection="column" gap={3}>
      <Flex align="center" justify="space-between">
        <Box>
          <Text fontSize="xs" color={textMuted}>
            Balance (USD) <Text as="span" opacity={0.6}>&middot; at last decision</Text>
          </Text>
          <Flex align="baseline" gap={2}>
            <Text fontSize="3xl" fontWeight="bold" fontFamily="mono" color={textMain}>
              ${currentBalance.toFixed(2)}
            </Text>
            <Text
              fontSize="sm"
              fontWeight="bold"
              fontFamily="mono"
              color={changePositive ? 'green.400' : 'red.400'}
            >
              {changePositive ? '+' : ''}{changePct.toFixed(2)}%
            </Text>
          </Flex>
        </Box>
        <Flex gap={0.5} bg={rangeBg} borderRadius="lg" p={0.5}>
          {TIME_RANGES.map((r) => (
            <Button
              key={r.key}
              size="xs"
              px={3}
              variant={range === r.key ? 'solid' : 'ghost'}
              bg={range === r.key ? activeRangeBg : undefined}
              shadow={range === r.key ? 'sm' : undefined}
              color={textMain}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </Flex>
      </Flex>

      {filtered.length === 0 ? (
        <Flex align="center" justify="center" h="280px">
          <Text fontSize="sm" color={textMuted}>No balance data for chart.</Text>
        </Flex>
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
              tick={{ fontSize: 11, fill: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              tick={{ fontSize: 11, fill: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}
              axisLine={false}
              tickLine={false}
              width={65}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
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
    </Box>
  );
}

/* ---------- Main Component ---------- */

type ContractDetailPanelProps = {
  contract: ContractListItem;
  raceCfg: PublicApiConfig;
  theme: AppTheme;
  isDark: boolean;
  onDeleted?: (contractId: string) => void;
  onStatusChanged?: (contractId: string, isActive: boolean) => void;
};

export function ContractDetailPanel({
  contract,
  raceCfg,
  theme: _theme,
  isDark,
  onDeleted,
  onStatusChanged,
}: ContractDetailPanelProps) {
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

  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState(false);

  // Colors
  const cardBg = isDark ? 'gray.900' : 'gray.100';
  const textMain = isDark ? 'white' : 'gray.900';
  const textMuted = isDark ? 'gray.400' : 'gray.500';
  const dividerColor = isDark ? 'gray.700' : 'gray.200';
  const inputBg = isDark ? 'gray.800' : 'white';
  const inputBorder = isDark ? 'gray.600' : 'gray.300';

  // Fetch contract detail for ai_model
  useEffect(() => {
    getRaceContractDetail(raceCfg, contract.id)
      .then((detail) => {
        setAiModel(detail.ai_model || null);
        setIsActive(detail.is_active);
      })
      .catch(() => setAiModel(null));
  }, [raceCfg, contract.id]);

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

  // Load all token balances
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

  // Chart data
  const chartPoints = useMemo<ChartPoint[]>(() => {
    return aiResponses
      .filter((r) => r.balance_usd != null)
      .map((r) => ({ time: new Date(r.created_at).getTime(), value: r.balance_usd! }))
      .sort((a, b) => a.time - b.time);
  }, [aiResponses]);

  // Stop response detection
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

  // Stat card styles
  const statCardBg = cardBg;

  return (
    <VStack mt={4} gap={4} align="stretch">
      {/* ===== 1. Agent Header Card ===== */}
      <Box bg={cardBg} borderRadius="xl" shadow="md">
        <Box py={4} px={{ base: 4, md: 6 }}>
          <Flex align="center" gap={4} flexWrap="wrap">
            {/* Bot icon */}
            <Flex
              align="center"
              justify="center"
              w={10}
              h={10}
              borderRadius="lg"
              bg={isDark ? 'green.900' : 'green.100'}
              flexShrink={0}
            >
              <Icon as={Bot} boxSize={5} color="green.400" />
            </Flex>

            {/* Name + status */}
            <Box minW={0}>
              <Flex align="center" gap={2}>
                <Text fontSize="xl" fontWeight="bold" truncate color={textMain}>
                  {contract.name || 'Agent'}
                </Text>
                {aiResponses.length === 0 && !aiLoading ? (
                  <Badge size="sm" colorPalette="yellow" animation="pulse 2s infinite">Deploying...</Badge>
                ) : (
                  <Badge size="sm" colorPalette={isActive ? 'green' : 'gray'}>
                    {isActive ? 'Active' : 'Paused'}
                  </Badge>
                )}
              </Flex>
              <HStack gap={1} mt={0.5}>
                <Text fontFamily="mono" fontSize="xs" opacity={0.5} color={textMuted}>
                  {fmtAddr(contract.address)}
                </Text>
                <Button
                  variant="ghost"
                  size="xs"
                  px={1}
                  minW={0}
                  color={addrCopied ? 'green.400' : textMuted}
                  onClick={() => {
                    void navigator.clipboard.writeText(contract.address);
                    setAddrCopied(true);
                    setTimeout(() => setAddrCopied(false), 2000);
                  }}
                  title="Copy address"
                >
                  <Icon as={addrCopied ? Check : Copy} boxSize={3} />
                </Button>
              </HStack>
            </Box>

            {/* Spacer */}
            <Box flex={1} />

            {/* Pause + Delete buttons */}
            <Flex align="center" gap={2} flexWrap="wrap">
              <Button
                size="sm"
                variant="outline"
                colorPalette={isActive ? 'yellow' : 'green'}
                onClick={() => void handleTogglePause()}
                disabled={pauseBusy}
              >
                <Icon as={isActive ? Pause : Play} boxSize={4} />
                {pauseBusy ? 'Updating...' : isActive ? 'Pause' : 'Resume'}
              </Button>

              {!confirmDelete ? (
                <Button
                  size="sm"
                  variant="outline"
                  colorPalette="red"
                  onClick={() => setConfirmDelete(true)}
                  disabled={!!withdrawBusy}
                >
                  <Icon as={Trash2} boxSize={4} />
                  Delete
                </Button>
              ) : (
                <Flex align="center" gap={2}>
                  <Text fontSize="xs" color="red.400" fontWeight="medium">
                    {canDelete ? 'Sure?' : 'Delete anyway?'}
                  </Text>
                  <Button
                    size="xs"
                    colorPalette="red"
                    onClick={() => void handleDelete()}
                    disabled={withdrawBusy === 'delete'}
                  >
                    {withdrawBusy === 'delete' ? 'Deleting...' : 'Yes'}
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => setConfirmDelete(false)}
                    disabled={withdrawBusy === 'delete'}
                  >
                    Cancel
                  </Button>
                </Flex>
              )}
            </Flex>
          </Flex>

          {/* Delete warning */}
          {confirmDelete && !canDelete && (
            <HStack gap={2} mt={2} color="yellow.400" align="flex-start">
              <Icon as={AlertTriangle} boxSize={4} mt={0.5} flexShrink={0} />
              <Text fontSize="xs">
                Please withdraw all tokens (jettons & TON) before deleting. Tokens left in the contract will be lost!
              </Text>
            </HStack>
          )}
        </Box>
      </Box>

      {/* Stop reason banner */}
      {stopReason && !isActive && (
        <Box
          bg={isDark ? 'red.950' : 'red.50'}
          border="1px solid"
          borderColor={isDark ? 'red.800' : 'red.200'}
          borderRadius="xl"
          shadow="sm"
        >
          <Flex p={3} align="flex-start" gap={2}>
            <Icon as={AlertTriangle} boxSize={4} color="red.400" mt={0.5} flexShrink={0} />
            <Box flex={1}>
              <Text fontSize="xs" fontWeight="semibold" color="red.400">Agent Stopped</Text>
              <Text fontSize="xs" opacity={0.7} mt={0.5} color={textMuted}>{stopReason}</Text>
            </Box>
            <Button
              size="xs"
              variant="ghost"
              flexShrink={0}
              onClick={() => { setPromptOpen(true); setDetailTab('overview'); }}
            >
              <Icon as={FileText} boxSize={3} />
              Edit Prompt
            </Button>
          </Flex>
        </Box>
      )}

      {/* ===== 2. Five Stat Cards ===== */}
      <Box
        display="grid"
        gridTemplateColumns={{
          base: 'repeat(2, 1fr)',
          sm: 'repeat(3, 1fr)',
          lg: 'repeat(5, 1fr)',
        }}
        gap={3}
      >
        {/* Model */}
        <Box bg={statCardBg} borderRadius="xl" shadow="sm" py={3} px={4}>
          <HStack gap={1.5}>
            <Icon as={Zap} boxSize={3.5} color="yellow.400" />
            <Text fontSize="xs" color={textMuted}>Model</Text>
          </HStack>
          <Text fontSize="lg" fontWeight="bold" truncate mt={1} color={textMain}>{modelShort}</Text>
          <Text fontSize="xs" color={textMuted} truncate>{modelProvider}</Text>
        </Box>

        {/* Balance */}
        <Box bg={statCardBg} borderRadius="xl" shadow="sm" py={3} px={4}>
          <HStack gap={1.5}>
            <Icon as={Wallet} boxSize={3.5} color="green.400" />
            <Text fontSize="xs" color={textMuted}>Balance</Text>
          </HStack>
          <Text fontSize="lg" fontWeight="bold" fontFamily="mono" mt={1} color={textMain}>
            {totalUsdBalance > 0 ? `$${totalUsdBalance.toFixed(2)}` : '$0.00'}
          </Text>
          <Text fontSize="xs" color={textMuted}>USD equiv.</Text>
        </Box>

        {/* Decisions */}
        <Box bg={statCardBg} borderRadius="xl" shadow="sm" py={3} px={4}>
          <HStack gap={1.5}>
            <Icon as={Activity} boxSize={3.5} color="blue.400" />
            <Text fontSize="xs" color={textMuted}>Decisions</Text>
          </HStack>
          <Text fontSize="lg" fontWeight="bold" fontFamily="mono" mt={1} color={textMain}>
            {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
          </Text>
          <Text fontSize="xs" color={textMuted}>{maxDec > 0 ? `${decPct}% used` : 'Unlimited'}</Text>
        </Box>

        {/* Open Orders */}
        <Box bg={statCardBg} borderRadius="xl" shadow="sm" py={3} px={4}>
          <HStack gap={1.5}>
            <Icon as={ArrowUpRight} boxSize={3.5} color="purple.400" />
            <Text fontSize="xs" color={textMuted}>Open Orders</Text>
          </HStack>
          <Text fontSize="lg" fontWeight="bold" fontFamily="mono" mt={1} color={textMain}>{openOrders}</Text>
          <Text fontSize="xs" color={textMuted}>{closedOrders} closed</Text>
        </Box>

        {/* Created */}
        <Box bg={statCardBg} borderRadius="xl" shadow="sm" py={3} px={4}>
          <HStack gap={1.5}>
            <Icon as={Clock} boxSize={3.5} color="pink.400" />
            <Text fontSize="xs" color={textMuted}>Created</Text>
          </HStack>
          <Text fontSize="lg" fontWeight="bold" mt={1} color={textMain}>{createdDay}</Text>
          <Text fontSize="xs" color={textMuted}>{createdTime}</Text>
        </Box>
      </Box>

      {/* ===== Error display ===== */}
      {error && (
        <Box bg={isDark ? 'red.950' : 'red.50'} borderRadius="lg" p={3} border="1px solid" borderColor={isDark ? 'red.800' : 'red.200'}>
          <Text fontFamily="mono" fontSize="xs" color="red.400">{error}</Text>
        </Box>
      )}

      {/* ===== 3. Tabs ===== */}
      <HStack gap={0} borderBottom="2px solid" borderColor={dividerColor}>
        {(['overview', 'orders', 'ai'] as const).map((t) => {
          const label = t === 'overview' ? 'Overview' : t === 'orders' ? 'DEX Orders' : 'AI Responses';
          return (
            <Button
              key={t}
              variant="ghost"
              size="sm"
              borderBottom="2px solid"
              borderColor={detailTab === t ? 'brand.500' : 'transparent'}
              borderRadius={0}
              mb="-2px"
              color={detailTab === t ? textMain : textMuted}
              fontWeight={detailTab === t ? 'bold' : 'normal'}
              onClick={() => setDetailTab(t)}
            >
              {label}
            </Button>
          );
        })}
      </HStack>

      {/* ===== 4. Tab Content ===== */}

      {/* --- Overview Tab --- */}
      {detailTab === 'overview' && (
        <>
          {/* Balance Chart */}
          <Box bg={cardBg} borderRadius="xl" shadow="md" overflow="hidden">
            <Box p={{ base: 4, md: 6 }}>
              <BalanceChart points={chartPoints} isDark={isDark} />
            </Box>
          </Box>

          <Box
            display="grid"
            gridTemplateColumns={{ base: '1fr', lg: '1fr 1fr' }}
            gap={4}
            alignItems="start"
          >
            {/* Left: Contract Details */}
            <Box bg={cardBg} borderRadius="xl" shadow="md" h="full">
              <VStack p={{ base: 4, md: 6 }} gap={3} align="stretch">
                <Text fontWeight="bold" fontSize="sm" color={textMain}>Contract Details</Text>

                <Flex align="center" justify="space-between" gap={4}>
                  <Text fontSize="sm" color={textMuted}>ID</Text>
                  <Text fontFamily="mono" fontSize="xs" textAlign="end" wordBreak="break-all" color={textMain}>
                    {contract.id}
                  </Text>
                </Flex>
                <Box borderBottom="1px solid" borderColor={dividerColor} />

                <TradingPairsRow contract={contract} isDark={isDark} />
                <Box borderBottom="1px solid" borderColor={dividerColor} />

                <Flex align="center" justify="space-between" gap={4}>
                  <Text fontSize="sm" color={textMuted}>Prompt</Text>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void handleViewPrompt()}
                    disabled={promptLoading}
                  >
                    {promptLoading ? <Spinner size="xs" /> : <Icon as={FileText} boxSize={3} />}
                    View Prompt
                  </Button>
                </Flex>
                <Box borderBottom="1px solid" borderColor={dividerColor} />

                <Flex align="center" justify="space-between" gap={4}>
                  <Text fontSize="sm" color={textMuted}>Explorer</Text>
                  <HStack gap={2} fontSize="xs">
                    <Link
                      href={explorerLink(contract.address)}
                      target="_blank"
                      rel="noreferrer"
                      color="green.400"
                      _hover={{ textDecoration: 'underline' }}
                    >
                      Tonviewer
                    </Link>
                    <Text opacity={0.5} color={textMuted}>|</Text>
                    <Link
                      href={tonscanLink(contract.address)}
                      target="_blank"
                      rel="noreferrer"
                      color="green.400"
                      _hover={{ textDecoration: 'underline' }}
                    >
                      Tonscan
                    </Link>
                  </HStack>
                </Flex>
                <Box borderBottom="1px solid" borderColor={dividerColor} />

                <Flex align="center" justify="space-between" gap={4}>
                  <Text fontSize="sm" color={textMuted}>Decisions</Text>
                  <HStack gap={2}>
                    <Text fontFamily="mono" fontSize="xs" color={textMain}>
                      {usedDec}{maxDec > 0 ? ` / ${maxDec}` : ' / \u221E'}
                    </Text>
                    {maxDec > 0 && (
                      <Box
                        w={16}
                        h={2}
                        bg={isDark ? 'gray.700' : 'gray.300'}
                        borderRadius="full"
                        overflow="hidden"
                      >
                        <Box
                          h="full"
                          bg="green.400"
                          borderRadius="full"
                          w={`${decPct}%`}
                          transition="width 0.3s"
                        />
                      </Box>
                    )}
                  </HStack>
                </Flex>
              </VStack>
            </Box>

            {/* Right column */}
            <VStack gap={4} align="stretch">
              {/* Wallet card */}
              <Box bg={cardBg} borderRadius="xl" shadow="md">
                <VStack p={{ base: 4, md: 6 }} gap={3} align="stretch">
                  <Flex align="center" gap={2}>
                    <Icon as={Wallet} boxSize={4} opacity={0.6} color={textMuted} />
                    <Text fontWeight="bold" fontSize="sm" color={textMain}>Wallet</Text>
                    {balancesRefreshing && (
                      <Icon as={RefreshCw} boxSize={3} opacity={0.4} animation="spin 1s linear infinite" color={textMuted} />
                    )}
                    {totalUsdBalance > 0 && (
                      <Badge size="sm" variant="subtle" fontFamily="mono" ml="auto">
                        ~${totalUsdBalance.toFixed(2)}
                      </Badge>
                    )}
                  </Flex>

                  {balancesLoading && tokenBalances.length === 0 ? (
                    <Flex justify="center" py={2}>
                      <Spinner size="xs" />
                    </Flex>
                  ) : tokenBalances.length === 0 ? (
                    <Text fontSize="xs" opacity={0.4} textAlign="center" py={1} color={textMuted}>
                      No tokens found
                    </Text>
                  ) : (
                    <VStack gap={1.5} align="stretch">
                      {tokenBalances.map((t) => (
                        <Flex key={t.symbol} align="center" justify="space-between" fontSize="xs">
                          <HStack gap={2}>
                            <Text fontWeight="semibold" color={textMain}>{t.symbol}</Text>
                            <Text opacity={0.4} color={textMuted}>{t.name}</Text>
                          </HStack>
                          <HStack gap={3} fontFamily="mono">
                            <Text color={textMain}>
                              {t.amount >= 1000
                                ? t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
                                : t.amount >= 1 ? t.amount.toFixed(4) : t.amount.toFixed(6)}
                            </Text>
                            {t.usdValue > 0 && (
                              <Text opacity={0.5} fontSize="10px" color={textMuted}>
                                ~${t.usdValue.toFixed(2)}
                              </Text>
                            )}
                          </HStack>
                        </Flex>
                      ))}
                    </VStack>
                  )}

                  <Box borderBottom="1px solid" borderColor={dividerColor} />

                  {/* Top Up */}
                  <Flex align="center" gap={2}>
                    <Icon as={ArrowUpFromLine} boxSize={4} opacity={0.6} color={textMuted} />
                    <Text fontSize="sm" color={textMuted}>Top Up</Text>
                    <HStack gap={1.5} ml="auto">
                      <Input
                        size="xs"
                        w={16}
                        fontFamily="mono"
                        fontSize="xs"
                        textAlign="end"
                        bg={inputBg}
                        borderColor={inputBorder}
                        value={topupAmount}
                        onChange={(e) => setTopupAmount(e.target.value)}
                        inputMode="decimal"
                        placeholder="0"
                      />
                      <NativeSelect.Root size="xs">
                        <NativeSelect.Field
                          fontFamily="mono"
                          fontSize="xs"
                          bg={inputBg}
                          borderColor={inputBorder}
                          value={topupToken}
                          onChange={(e) => setTopupToken(e.target.value)}
                        >
                          <option value="TON">TON</option>
                          <option value="AGNT">AGNT</option>
                          <option value="NOT">NOT</option>
                          <option value="BUILD">BUILD</option>
                          <option value="USDT">USDT</option>
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => void topupContract()}
                        disabled={topupBusy}
                      >
                        {topupBusy ? 'Sending...' : 'Send'}
                      </Button>
                    </HStack>
                  </Flex>
                </VStack>
              </Box>

              {/* Quick Actions card */}
              <Box bg={cardBg} borderRadius="xl" shadow="md" flex={1}>
                <VStack p={{ base: 4, md: 6 }} gap={3} align="stretch">
                  <Text fontWeight="bold" fontSize="sm" color={textMain}>Quick Actions</Text>
                  <Flex flexWrap="wrap" align="center" gap={2}>
                    <Button
                      size="sm"
                      variant="outline"
                      colorPalette={withdrawDone.has('close') ? 'green' : undefined}
                      onClick={() => void handleCloseOrders()}
                      disabled={!!withdrawBusy || withdrawDone.has('close')}
                    >
                      <Icon as={XCircle} boxSize={4} />
                      {withdrawBusy === 'close'
                        ? 'Closing...'
                        : withdrawDone.has('close') ? 'Orders closed' : 'Close orders'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      colorPalette={withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'green' : undefined}
                      onClick={() => void handleWithdrawAll()}
                      disabled={!!withdrawBusy || (withdrawDone.has('jetton') && withdrawDone.has('ton'))}
                    >
                      <Icon as={ArrowDownToLine} boxSize={4} />
                      {withdrawBusy === 'withdraw'
                        ? 'Withdrawing...'
                        : withdrawDone.has('jetton') && withdrawDone.has('ton') ? 'All withdrawn' : 'Withdraw all'}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      colorPalette={revokeSuccess ? 'green' : 'red'}
                      onClick={() => void handleRevokeAccess()}
                      disabled={revokeBusy || revokeSuccess}
                    >
                      <Icon as={ShieldOff} boxSize={4} />
                      {revokeBusy ? 'Revoking...' : revokeSuccess ? 'Access revoked' : 'Revoke access'}
                    </Button>
                  </Flex>

                  {jettonInfo && jettonInfo.jettons?.length > 0 && (
                    <Text fontSize="xs" opacity={0.6} color={textMuted}>
                      Jettons: {jettonInfo.jettons.map((j) =>
                        `${(j.balance / 10 ** j.decimals).toFixed(j.decimals > 4 ? 4 : j.decimals)} ${j.symbol}`,
                      ).join(', ')}
                    </Text>
                  )}
                </VStack>
              </Box>
            </VStack>
          </Box>
        </>
      )}

      {/* --- DEX Orders Tab --- */}
      {detailTab === 'orders' && (
        <OrdersPanel contractAddress={contract.address} isDark={isDark} />
      )}

      {/* --- AI Responses Tab --- */}
      {detailTab === 'ai' && (
        <VStack gap={3} align="stretch">
          {aiRefreshing && (
            <HStack gap={1} opacity={0.5}>
              <Icon as={RefreshCw} boxSize={3} animation="spin 1s linear infinite" color={textMuted} />
              <Text fontSize="xs" color={textMuted}>Updating...</Text>
            </HStack>
          )}

          {aiError ? (
            <Text fontSize="sm" color="red.400">{aiError}</Text>
          ) : aiResponses.length === 0 && !aiLoading ? (
            <Box bg={cardBg} borderRadius="xl" shadow="md">
              <Box p={{ base: 4, md: 6 }}>
                <Text fontSize="sm" opacity={0.6} color={textMuted}>No AI responses yet.</Text>
              </Box>
            </Box>
          ) : aiLoading ? (
            <Flex justify="center" py={4}>
              <Spinner size="md" />
            </Flex>
          ) : (
            aiResponses.map((r) => {
              const pp = r.parsed_params as Record<string, unknown> | null;
              const reason = pp?.reasoning as string | undefined;
              const shareUrl = reason ? buildShareUrl(r.id) : null;
              const actionColor: Record<string, string> = {
                create_order: 'green',
                close_order: 'yellow',
                hold: 'gray',
              };
              const palette = actionColor[r.action] ?? 'blue';

              return (
                <Box
                  key={r.id}
                  bg={cardBg}
                  borderRadius="xl"
                  shadow="sm"
                  borderLeft="4px solid"
                  borderLeftColor={isDark ? 'gray.700' : 'gray.300'}
                >
                  <Box p={4}>
                    <Flex align="flex-start" justify="space-between" gap={2}>
                      <HStack align="flex-start" gap={3}>
                        <Flex
                          h={9}
                          w={9}
                          flexShrink={0}
                          align="center"
                          justify="center"
                          borderRadius="full"
                          bg={isDark ? 'gray.800' : 'gray.200'}
                          mt={0.5}
                        >
                          <Icon as={Activity} boxSize={4} opacity={0.5} color={textMuted} />
                        </Flex>
                        <Box>
                          <HStack gap={2}>
                            <Badge size="sm" colorPalette={palette}>{r.action}</Badge>
                            <Text fontFamily="mono" fontSize="sm" fontWeight="bold" color={textMain}>
                              {r.balance_usd != null ? `$${r.balance_usd.toFixed(2)}` : ''}
                            </Text>
                          </HStack>
                          <HStack gap={1} mt={0.5}>
                            <Icon as={Clock} boxSize={3} opacity={0.4} color={textMuted} />
                            <Text fontSize="11px" opacity={0.4} color={textMuted}>
                              {new Date(r.created_at).toLocaleString()}
                            </Text>
                          </HStack>
                        </Box>
                      </HStack>
                      {shareUrl && (
                        <Button
                          size="xs"
                          variant="ghost"
                          color={copiedId === r.id ? 'green.400' : textMuted}
                          opacity={copiedId === r.id ? 1 : 0.4}
                          title="Copy share link"
                          onClick={() => {
                            void navigator.clipboard.writeText(shareUrl);
                            setCopiedId(r.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                        >
                          <Icon as={copiedId === r.id ? Check : Share2} boxSize={3.5} />
                        </Button>
                      )}
                    </Flex>
                    {reason && (
                      <Text fontSize="xs" lineHeight="relaxed" opacity={0.6} mt={2} color={textMuted}>
                        {reason}
                      </Text>
                    )}
                  </Box>
                </Box>
              );
            })
          )}
        </VStack>
      )}

      {/* Prompt Modal */}
      {promptOpen && prompt && (
        <Box
          position="fixed"
          inset={0}
          zIndex={50}
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="blackAlpha.600"
          onClick={() => { setPromptOpen(false); setPromptEditing(false); }}
        >
          <Box
            bg={isDark ? 'gray.900' : 'white'}
            borderRadius="xl"
            shadow="xl"
            maxW="2xl"
            w="full"
            mx={4}
            p={6}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Flex align="center" justify="space-between" mb={3}>
              <Text fontWeight="bold" fontSize="lg" color={textMain}>Agent Prompt</Text>
              <HStack gap={1}>
                {!promptEditing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setPromptDraft(prompt); setPromptEditing(true); }}
                  >
                    <Icon as={Pencil} boxSize={3.5} />
                    Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  color={promptCopied ? 'green.400' : textMain}
                  onClick={() => {
                    void navigator.clipboard.writeText(promptEditing ? promptDraft : prompt).then(() => {
                      setPromptCopied(true);
                      setTimeout(() => setPromptCopied(false), 2000);
                    });
                  }}
                >
                  <Icon as={promptCopied ? Check : Copy} boxSize={3.5} />
                  {promptCopied ? 'Copied' : 'Copy'}
                </Button>
              </HStack>
            </Flex>

            {promptEditing ? (
              <Textarea
                fontFamily="mono"
                fontSize="sm"
                bg={inputBg}
                borderColor={inputBorder}
                minH="40vh"
                maxH="60vh"
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                disabled={promptSaving}
              />
            ) : (
              <Box
                as="pre"
                whiteSpace="pre-wrap"
                fontSize="sm"
                bg={isDark ? 'gray.800' : 'gray.100'}
                borderRadius="lg"
                p={4}
                maxH="60vh"
                overflowY="auto"
                fontFamily="mono"
                color={textMain}
              >
                {prompt}
              </Box>
            )}

            <Flex justify="flex-end" gap={2} mt={4}>
              {promptEditing ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPromptEditing(false)}
                    disabled={promptSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    colorPalette="green"
                    onClick={() => void handleSavePrompt()}
                    disabled={promptSaving || !promptDraft.trim() || promptDraft.trim() === prompt}
                  >
                    {promptSaving ? <Spinner size="xs" /> : <Icon as={Save} boxSize={3.5} />}
                    {promptSaving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => setPromptOpen(false)}>Close</Button>
              )}
            </Flex>
          </Box>
        </Box>
      )}
    </VStack>
  );
}
