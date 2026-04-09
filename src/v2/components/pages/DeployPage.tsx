import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address, beginCell } from '@ton/core';
import {
  Rocket,
  Wallet,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Minus,
  Plus,
  FileText,
  Zap,
  Check,
  ArrowRight,
  Info,
  Loader2,
} from 'lucide-react';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import {
  getRaceAiModels,
  getRaceTokens,
  getPromptVariables,
  registerRaceContract,
  generateStrategy,
  hexBocToBase64,
  type AiModelOption,
  type AiModelsByProvider,
  type PromptVariable,
  type PublicApiConfig,
  type RaceToken,
} from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { useLocalStorageState } from '@/lib/storage';

import { ContractTabBar } from '@/v2/components/layout/ContractTabBar';
import { Button } from '@/v2/components/ui/button';
import { Card, CardContent } from '@/v2/components/ui/card';
import { Input } from '@/v2/components/ui/input';
import { Textarea } from '@/v2/components/ui/textarea';
import { Badge } from '@/v2/components/ui/badge';
import { Separator } from '@/v2/components/ui/separator';
import { Skeleton } from '@/v2/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/v2/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/v2/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/v2/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a jetton transfer body cell (op 0xf8a7ea5). */
function buildJettonTransferBody(opts: {
  queryId?: number;
  amount: bigint;
  destination: Address;
  responseDestination: Address;
  forwardTonAmount?: bigint;
}): string {
  const cell = beginCell()
    .storeUint(0xf8a7ea5, 32)
    .storeUint(opts.queryId ?? 0, 64)
    .storeCoins(opts.amount)
    .storeAddress(opts.destination)
    .storeAddress(opts.responseDestination)
    .storeBit(false)
    .storeCoins(opts.forwardTonAmount ?? 0n)
    .storeBit(false)
    .endCell();
  return cell.toBoc().toString('base64');
}

/** Resolve the user's jetton wallet address for a given jetton master. */
async function resolveJettonWallet(ownerAddress: string, jettonMaster: string): Promise<string> {
  const res = await fetch(
    `https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(ownerAddress)}&jetton_address=${encodeURIComponent(jettonMaster)}&limit=1`,
  );
  const data = (await res.json()) as { jetton_wallets?: { address: string }[] };
  const addr = data.jetton_wallets?.[0]?.address;
  if (!addr) throw new Error('Jetton wallet not found — do you hold this token?');
  return addr;
}

function fmtAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}\u2026${addr.slice(-8)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRADABLE_TOKENS = ['AGNT', 'TON', 'NOT', 'BUILD', 'USDT'];

const SUPPORTED_PAIRS: [string, string][] = [['AGNT', 'USDT'], ['USDT', 'NOT'], ['USDT', 'BUILD']];
const BASE_TOKENS = [...new Set(SUPPORTED_PAIRS.map(([b]) => b))];

function quotesForBase(base: string): string[] {
  return SUPPORTED_PAIRS.filter(([b]) => b === base).map(([, q]) => q);
}

const TOKEN_COLORS: Record<string, string> = {
  AGNT: '#F5A623',
  NOT: '#4A90D9',
  BUILD: '#50C878',
  USDT: '#50C878',
  TON: '#888',
};

const TOKEN_LOGOS: Record<string, string> = {
  AGNT: '/logo.png',
  TON: 'https://assets.dedust.io/images/ton.webp',
  NOT: 'https://assets.dedust.io/images/not.webp',
  BUILD: 'https://cdn.joincommunity.xyz/build/build_logo.png',
  USDT: 'https://assets.dedust.io/images/usdt.webp',
};

/** Parse suggested_pairs from API into a token set for tradingTokens state. */
function parseSuggestedTokens(pairs: string): string[] {
  const tokens = new Set<string>(['AGNT']);
  for (const pair of pairs.split(',')) {
    for (const t of pair.trim().split('/')) {
      const upper = t.trim().toUpperCase();
      if (upper && TRADABLE_TOKENS.includes(upper)) tokens.add(upper);
    }
  }
  return Array.from(tokens);
}

const FALLBACK_AI_MODELS: AiModelOption[] = [
  { id: 'Qwen/Qwen3-32B', name: 'Qwen3-32B', provider: 'Qwen' },
  { id: 'gpt-5.2', name: 'GPT 5.2', provider: 'OpenAI' },
  { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek V3.2', provider: 'DeepSeek' },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google' },
  { id: 'grok-4', name: 'Grok 4', provider: 'xAI' },
];

const PROVIDER_LOGOS: Record<string, string> = {
  Qwen: 'https://cdn.simpleicons.org/alibabadotcom/ffffff',
  OpenAI: 'https://cdn.simpleicons.org/openai/ffffff',
  Anthropic: 'https://cdn.simpleicons.org/anthropic/ffffff',
  DeepSeek: 'https://cdn.simpleicons.org/deepseek/ffffff',
  Google: 'https://cdn.simpleicons.org/google/ffffff',
  xAI: 'https://cdn.simpleicons.org/x/ffffff',
};

function TokenIcon({ symbol, size = 'h-4 w-4' }: { symbol: string; size?: string }) {
  const logo = TOKEN_LOGOS[symbol];
  if (logo) {
    // AGNT uses a text-based logo: white bg so the dark text is readable
    if (symbol === 'AGNT') {
      return (
        <span className={`${size} rounded-full bg-white flex items-center justify-center overflow-hidden shrink-0`}>
          <img src={logo} alt={symbol} className="w-[85%] object-contain" />
        </span>
      );
    }
    return <img src={logo} alt={symbol} className={`${size} rounded-full object-cover shrink-0`} />;
  }
  return <span className={`${size} rounded-full shrink-0`} style={{ background: TOKEN_COLORS[symbol] ?? '#888' }} />;
}

function ProviderIcon({ provider }: { provider: string }) {
  const logo = PROVIDER_LOGOS[provider];
  if (!logo) return null;
  return <img src={logo} alt={provider} className="h-4 w-4" />;
}

/** Extract short model name from description (strip "--- long subtitle" suffix) */
function shortModelName(name: string): string {
  const sep = name.indexOf(' \u2014 ');
  return sep > 0 ? name.slice(0, sep).trim() : name;
}

type StrategyTemplate = {
  name: string;
  prompt: string;
};

const AGGRESSIVE_DIP_BUYER = `Aggressive dip-buying strategy for TON pairs. Use live data: {market_prices}, {wallet_balances}, {open_orders}, {order_book}, {price_changes}, {token_fundamentals}.

CORE LOGIC
Trade sharp short-term dips with fast mean reversion. Focus on TON/USDT and TON/NOT. Prioritize high-probability bounces supported by order book liquidity.

DIP DETECTION
Trigger dip when:
* 1m drop >= 0.4% from local high OR
* 5m drop >= 1.0%
Confirm with sell pressure followed by bid replenishment or improving bid/ask imbalance.

ORDER BOOK ANALYSIS
Identify strong bid walls:
* Bid size >= 3x median nearby levels
* Persists across multiple updates
Cluster large bids into a support band.
Do not trade if book is thin or spread is abnormally wide.

ENTRY
When dip confirmed and support band exists:
* Place 3-6 layered limit buys from best bid into support band
* Allocate larger size near strongest wall
* Use post-only when possible
* If rapid bounce starts (spread narrows + aggressive bid replenishment), allow one small aggressive order.

POSITION SIZING
* Max 20-25% capital exposure per pair
* Risk per trade cycle <= 1% equity
* Reduce size if both TON/USDT and TON/NOT show heavy sell imbalance.

INVALIDATION
Exit immediately if:
* Price breaks below support band and bid wall disappears
* Dip extends beyond 2% without recovery
* 3 consecutive stop-outs occur in short window

TAKE PROFIT
Place layered exits:
* TP1: +0.3%
* TP2: +0.6%
* TP3: +1.0% or trail if momentum strong
Use tighter targets in low volatility, wider in high volatility.
If bounce stalls or ask walls form overhead, reduce or exit early.
If no bounce within 2-3 minutes, reduce position (time stop).

ORDER MANAGEMENT
Do NOT cancel existing orders for now.
Keep previously placed orders active unless invalidation rule triggers.
Avoid placing overlapping or self-crossing orders.
Maintain sufficient free balance and gas buffer.

PAIR LOGIC
Use TON/USDT as primary market signal.
If TON/NOT shows relative strength during TON dip, increase confidence.
If both pairs dump with thin bids, reduce size or skip trade.

=== GAS INFO ===
Create order(from=ton): 0.022 TON
Create order(from=jetton): 0.026 TON
Close Order(): 0.006 TON

IMPORTANT: Each round-trip costs ~0.03 TON.
Only trade when expected profit > gas cost with margin.
Target minimum net profit >= 2-3x gas cost.
For small balances, prefer fewer larger trades instead of many micro-trades.

OBJECTIVE
Capture fast liquidity-driven bounces while strictly controlling exposure and ensuring gas-adjusted profitability.`;

const AGGRESSIVE_DEGEN = `Ultra Aggressive Degen Dip Strategy for TON pairs. Use live data: {market_prices}, {wallet_balances}, {open_orders}, {order_book}, {price_changes}, {token_fundamentals}.

MODE
High risk. High turnover. Trade volatility expansion and violent dips. Prioritize speed over precision. Accept higher drawdown for higher upside.

DIP TRIGGER
Enter aggressively when:
* 1m drop \u2265 0.6% OR
* 5m drop \u2265 1.5%
OR sudden sell sweep removes top 2\u20133 bid levels within seconds.
No need for perfect confirmation. Speed matters.

ORDER BOOK LOGIC
If large bids appear immediately after sweep, treat as bounce setup.
If book is thin but spread tight, still allow entry (degen mode).
Ignore minor imbalance noise. Focus on liquidity reaction after flush.

ENTRY
* Deploy 30\u201350% of available capital per strong dip.
* Place 2\u20134 large layered buys instead of many small ones.
* Allow partial aggressive entries near best ask if bounce starts.
* Do not wait for perfect structure.

POSITION ESCALATION
If price bounces \u2265 0.3% after entry and OBI turns positive, allow one additional momentum add.
Do not average endlessly in freefall. Max 2 scale-ins.

INVALIDATION
Hard stop if:
* Price drops additional 1.5\u20132% below average entry
* Bid walls vanish and no replenishment
* Spread explodes abnormally
No emotional holding. Cut fast.

TAKE PROFIT
Fast exits:
* TP1: +0.4%
* TP2: +0.8%
* TP3: +1.5% if momentum strong
If rapid spike occurs (>1% in seconds), take profit aggressively into strength.
Time stop: If no bounce within 60\u2013120 seconds, reduce exposure.

EXPOSURE RULES
* Max 50% capital deployed at once.
* Never use 100% balance.
* Maintain gas reserve at all times.

ORDER MANAGEMENT
Do not cancel existing orders unless stop condition triggers.
Avoid overlapping orders.
Allow stacking positions if capital permits.

PAIR LOGIC
Trade the pair showing stronger bounce reaction.
If TON/USDT dumps but TON/NOT holds structure, increase confidence.
If both collapse with heavy sell flow, reduce aggression.

\u2550\u2550\u2550 GAS INFO \u2550\u2550\u2550
Create order(from=ton): 0.022 TON
Create order(from=jetton): 0.026 TON
Close Order(): 0.006 TON

IMPORTANT: Each round-trip costs ~0.03 TON.
Only enter if expected move \u2265 0.8\u20131.0% to justify gas in degen mode.
Prefer fewer high-conviction trades over spam.

OBJECTIVE
Exploit panic flushes and volatility spikes for fast asymmetric gains while enforcing strict hard stops and gas-aware profitability.`;

const MEME_MODE = `MEME MODE: PANIC BUY THE DIP BOT

This bot trades like a caffeinated degen who believes every red candle is a gift from the market gods.

DATA USED
{market_prices}
{wallet_balances}
{open_orders}
{order_book}
{price_changes}

PHILOSOPHY
If it dumps hard, it must bounce.
If it bounces, we say "I told you."
If it keeps dumping, we call it "long-term investment."

ENTRY LOGIC
If 1m candle is very red (\u2265 0.7% down), shout internally "DISCOUNT!" and buy.
If order book shows a scary sell wall but tiny bids start appearing under it, assume whales are playing games and buy slightly above them.
If price nukes 1.5% fast, enter bigger because "panic creates opportunity."

POSITION SIZE
* Small dip: 20% balance
* Big scary dip: 35% balance
* Flash crash vibes: 45% balance
Never 100%. We are degen, not suicidal.

CONFIRMATION SIGNALS
* If Telegram chat would panic \u2192 buy.
* If chart looks ugly \u2192 buy faster.
* If bounce starts and you hesitated \u2192 FOMO buy smaller size.

TAKE PROFIT
Take profit quickly because we don't trust happiness:
* +0.5%: secure dopamine
* +1.0%: screenshot worthy
* +2.0%: act like a genius
If price spikes violently, sell into green candle like a responsible adult.

STOP RULE
If price keeps dumping another 2% and order book looks empty, exit and pretend it was a "scalp test."

TIME RULE
If nothing happens in 90 seconds, reduce position because memes age fast.

GAS AWARENESS
\u2550\u2550\u2550 GAS INFO \u2550\u2550\u2550
Create order(from=ton): 0.022 TON
Create order(from=jetton): 0.026 TON
Close Order(): 0.006 TON

Round-trip \u2248 0.03 TON.
If expected gain < gas, do NOT trade. Even memes respect math.

FINAL OBJECTIVE
Buy fear. Sell relief.
Avoid becoming the liquidity.
Stay chaotic, but not broke.`;

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  {
    name: 'Aggressive Dip Buyer',
    prompt: AGGRESSIVE_DIP_BUYER,
  },
  {
    name: 'Aggressive Degen',
    prompt: AGGRESSIVE_DEGEN,
  },
  {
    name: 'Conservative DCA',
    prompt: `You are a conservative autonomous trader on TON. Use live data: {market_prices}, {wallet_balances}, {open_orders}, {price_changes}, {token_fundamentals}. Protect capital above all. Use dollar-cost averaging: split available balance into 4-5 equal parts and deploy them gradually. Never put more than 20% of portfolio into a single trade. Prefer top tokens by market cap and liquidity. Use tight slippage (1-3%). When market is bearish or uncertain, HOLD or keep funds in stablecoins. Only buy dips on strong tokens with proven recovery history. Always keep at least 30% in TON as reserve. Close losing positions early if down more than 10%. One sentence reasoning.

=== GAS INFO ===
Create order(from=ton): 0.022 TON | Create order(from=jetton): 0.026 TON | Close Order(): 0.006 TON
IMPORTANT: Each round-trip costs ~0.03 TON. Only trade when expected gain > gas cost.`,
  },
  {
    name: 'Scalper',
    prompt: `You are a high-frequency scalper on TON. Use live data: {market_prices}, {wallet_balances}, {open_orders}, {order_book}, {price_changes}. Target small 1-3% gains per trade. Open and close positions quickly. Use the full portfolio but split across 2-3 simultaneous orders max. Prefer high-volume tokens with tight spreads. Use low slippage (1-2%). Close orders as soon as they reach target profit OR if they go 2% against you. Never hold positions longer than necessary. Check open orders before opening new ones \u2014 close stale ones first.

=== GAS INFO ===
Create order(from=ton): 0.022 TON | Close Order(): 0.006 TON
CRITICAL: Each round-trip costs ~0.03 TON. With 1-3% targets, minimum trade size should be at least 1 TON to make profit after gas. Never scalp with less than 1 TON position size.

=== RISK MANAGEMENT ===
- Max 3 open orders at once.
- Max 30% of portfolio per single order.
- Hard stop-loss: close any position down more than 2%.
- If 3 consecutive losses, switch to HOLD for next cycle.`,
  },
  {
    name: 'Meme Mode',
    prompt: MEME_MODE,
  },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PendingDeploy = {
  mint_keeper_address: string;
  state_init_boc_hex: string;
  body_boc_hex: string;
  value_nanoton: number;
};

export type Persisted = {
  prompt: string;
  deployAmountTon: string;
  topupAmountTon: string;
  walletId: number;
  agentPublicKeyHex: string;
  agentSecretKeyHex: string;
  contractAddress: string | null;
  raceContractId: string | null;
  aiModel?: string;
  aiProvider?: string;
  agentName?: string;
  tradingTokens?: string[];
  baseToken?: string;
  quoteToken?: string;
  agntTopup?: string;
  quoteTopup?: string;
  pendingDeploy?: PendingDeploy | null;
};

const DEFAULT_PERSISTED: Persisted = {
  prompt: '',
  deployAmountTon: '1',
  topupAmountTon: '1',
  walletId: 0,
  agentPublicKeyHex: '',
  agentSecretKeyHex: '',
  contractAddress: null,
  raceContractId: null,
};

// ---------------------------------------------------------------------------
// API_BASE
// ---------------------------------------------------------------------------

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

// ---------------------------------------------------------------------------
// TopupJettonForm (sub-component)
// ---------------------------------------------------------------------------

function TopupJettonForm({
  agentAddress,
  baseToken,
  quoteToken,
  raceCfg,
  tonAddress,
  tonConnectUI,
  isConnected,
}: {
  agentAddress: string;
  baseToken: string;
  quoteToken: string | null;
  raceCfg: PublicApiConfig;
  tonAddress: string;
  tonConnectUI: ReturnType<typeof useTonConnectUI>[0];
  isConnected: boolean;
}) {
  const [baseAmount, setBaseAmount] = useState('0');
  const [quoteAmount, setQuoteAmount] = useState('0');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleTopup = useCallback(async () => {
    setErr(null);
    if (!isConnected || !tonAddress) { setErr('Connect wallet first.'); return; }
    const bAmt = parseFloat(baseAmount) || 0;
    const qAmt = parseFloat(quoteAmount) || 0;
    if (bAmt <= 0 && qAmt <= 0) { setErr('Enter an amount to send.'); return; }

    try {
      setBusy(true);
      const tokens = await getRaceTokens(raceCfg);
      const tokenMap = new Map<string, RaceToken>();
      for (const t of tokens) tokenMap.set(t.symbol.toUpperCase(), t);

      const destination = Address.parse(agentAddress);
      const owner = Address.parse(tonAddress);
      const messages: { address: string; amount: string; payload?: string }[] = [];

      const addMsg = async (symbol: string, amount: number) => {
        const info = tokenMap.get(symbol.toUpperCase());
        if (!info) throw new Error(`Token ${symbol} not found`);
        const nano = BigInt(Math.round(amount * 10 ** info.decimals));
        if (nano <= 0n) return;
        const jettonWallet = await resolveJettonWallet(tonAddress, info.address);
        const payload = buildJettonTransferBody({
          amount: nano,
          destination,
          responseDestination: owner,
          forwardTonAmount: 1n,
        });
        messages.push({
          address: Address.parse(jettonWallet).toString({ bounceable: true }),
          amount: nanoFromTon('0.065'),
          payload,
        });
      };

      if (bAmt > 0) await addMsg(baseToken, bAmt);
      if (qAmt > 0 && quoteToken) await addMsg(quoteToken, qAmt);

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [agentAddress, baseAmount, quoteAmount, baseToken, quoteToken, tonAddress, tonConnectUI, isConnected, raceCfg]);

  if (done) {
    return (
      <div className="flex items-center gap-2 text-green-500 text-xs py-1">
        <Check className="h-3.5 w-3.5" />
        Tokens sent to agent
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Send tokens to agent</div>
      <div className="text-[10px] text-muted-foreground/50 font-mono break-all">Agent: {agentAddress}</div>

      {/* Base token */}
      <div className="flex items-center gap-2">
        <TokenIcon symbol={baseToken} size="h-4 w-4" />
        <span className="text-xs font-semibold w-14">{baseToken}</span>
        <Input
          type="text"
          className="flex-1 font-mono h-8 text-sm"
          value={baseAmount}
          onChange={(e) => setBaseAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0"
        />
      </div>

      {/* Quote token */}
      {quoteToken && quoteToken !== baseToken && (
        <div className="flex items-center gap-2">
          <TokenIcon symbol={quoteToken} size="h-4 w-4" />
          <span className="text-xs font-semibold w-14">{quoteToken}</span>
          <Input
            type="text"
            className="flex-1 font-mono h-8 text-sm"
            value={quoteAmount}
            onChange={(e) => setQuoteAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0"
          />
        </div>
      )}

      {err && <p className="text-xs text-red-500">{err}</p>}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1"
        onClick={() => void handleTopup()}
        disabled={busy}
        type="button"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
        {busy ? 'Sending...' : 'Send tokens'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeployPage (main component)
// ---------------------------------------------------------------------------

export function DeployPage() {
  const navigate = useNavigate();
  const wallet = useTonWallet();
  const rawAddr = useTonAddress(false);
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const raceCfg: PublicApiConfig = useMemo(() => ({ baseUrl: API_BASE }), []);
  const { jwtToken } = useAuth(raceCfg);

  // Merge JWT into raceCfg when available
  const authedCfg: PublicApiConfig = useMemo(
    () => (jwtToken ? { ...raceCfg, jwtToken } : raceCfg),
    [raceCfg, jwtToken],
  );

  const [persisted, setPersisted] = useLocalStorageState<Persisted>('deploy-panel:v2', DEFAULT_PERSISTED);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiModelGroups, setAiModelGroups] = useState<AiModelsByProvider[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelListOpen, setModelListOpen] = useState(!persisted.aiModel);
  const [pickingSide, setPickingSide] = useState<'base' | 'quote' | null>(persisted.quoteToken ? null : 'quote');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [promptVars, setPromptVars] = useState<PromptVariable[]>([]);
  const [generating, setGenerating] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [varsHelpOpen, setVarsHelpOpen] = useState(false);

  const isConnected = !!wallet && !!tonAddress;

  // Auto-fill first template when prompt is empty (new agent)
  useEffect(() => {
    if (!persisted.prompt) {
      setPersisted((p) => ({ ...p, prompt: STRATEGY_TEMPLATES[0].prompt }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ownerAddressParsed = useMemo(() => {
    try {
      return isConnected ? Address.parse(tonAddress) : null;
    } catch {
      return null;
    }
  }, [isConnected, tonAddress]);

  // Raw format (0:hex) for API registration
  const ownerAddressRaw = useMemo(
    () => ownerAddressParsed?.toRawString() ?? null,
    [ownerAddressParsed],
  );

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const grouped = await getRaceAiModels(authedCfg);
        if (!cancelled && grouped.length > 0) {
          setAiModelGroups(grouped);
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    void loadModels();
    return () => { cancelled = true; };
  }, [authedCfg]);

  const aiModels = useMemo(() => {
    if (aiModelGroups.length === 0) return FALLBACK_AI_MODELS;
    const all = aiModelGroups.flatMap((g) => g.models);
    const seen = new Set<string>();
    return all.filter((m) => {
      const key = `${(m.provider ?? '').toLowerCase()}::${m.id.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [aiModelGroups]);

  const displayGroups = useMemo((): AiModelsByProvider[] => {
    if (aiModelGroups.length > 0) return aiModelGroups;
    const map = new Map<string, AiModelOption[]>();
    for (const m of FALLBACK_AI_MODELS) {
      const p = m.provider ?? 'Other';
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(m);
    }
    return Array.from(map.entries()).map(([provider, models]) => ({ provider, models }));
  }, [aiModelGroups]);

  // Fetch prompt variables
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vars = await getPromptVariables(authedCfg);
        if (!cancelled) setPromptVars(vars);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [authedCfg]);

  const insertPromptVar = useCallback((variable: PromptVariable) => {
    const ta = promptRef.current;
    const varText = variable.example;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const current = persisted.prompt;
      const newPrompt = current.substring(0, start) + varText + current.substring(end);
      setPersisted((p) => ({ ...p, prompt: newPrompt }));
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = start + varText.length;
        ta.setSelectionRange(newPos, newPos);
      });
    } else {
      setPersisted((p) => ({ ...p, prompt: p.prompt + (p.prompt.endsWith('\n') || !p.prompt ? '' : '\n') + varText }));
    }
  }, [persisted.prompt, setPersisted]);

  const selectedModelOption = useMemo(() => {
    const currentModel = persisted.aiModel?.trim();
    const currentProvider = persisted.aiProvider?.trim().toLowerCase();
    if (currentModel) {
      const exact = aiModels.find((m) => (
        m.id === currentModel &&
        (m.provider ?? '').trim().toLowerCase() === (currentProvider ?? '')
      ));
      if (exact) return exact;
      const byModel = aiModels.find((m) => m.id === currentModel);
      if (byModel) return byModel;
    }
    return aiModels[0] ?? FALLBACK_AI_MODELS[0];
  }, [persisted.aiModel, persisted.aiProvider, aiModels]);

  const selectedModel = selectedModelOption.id;
  const selectedProvider = selectedModelOption.provider?.trim() || undefined;

  useEffect(() => {
    const currentModel = persisted.aiModel?.trim() ?? '';
    const currentProvider = persisted.aiProvider?.trim() ?? '';
    const nextModel = selectedModel;
    const nextProvider = selectedProvider ?? '';
    if (currentModel !== nextModel || currentProvider !== nextProvider) {
      setPersisted((p) => ({ ...p, aiModel: nextModel, aiProvider: nextProvider || undefined }));
    }
  }, [persisted.aiModel, persisted.aiProvider, selectedModel, selectedProvider, setPersisted]);

  // ---- Actions ----

  const registerOnly = useCallback(async () => {
    setErr(null);
    if (!isConnected || !tonAddress || !ownerAddressRaw) {
      setErr('Connect a TON wallet first.');
      return;
    }
    if (!persisted.prompt.trim()) {
      setErr('Prompt cannot be empty.');
      return;
    }

    try {
      setBusy('register');
      const base = persisted.baseToken ?? 'AGNT';
      const quote = persisted.quoteToken ?? 'NOT';
      const tradingPairs = `${base}/${quote}`;
      const pricingId = selectedModelOption.pricing?.[0]?.id;
      if (!pricingId) throw new Error('No pricing tier available for this model');
      const created = await registerRaceContract(authedCfg, {
        prompt: persisted.prompt,
        pricing_id: pricingId,
        ...(selectedProvider ? { ai_provider: selectedProvider } : {}),
        ...(persisted.agentName?.trim() ? { name: persisted.agentName.trim() } : {}),
        trading_pairs: tradingPairs,
      });
      setPersisted((p) => ({ ...p, contractAddress: created.address, raceContractId: created.id }));
      navigate(`/trader/${created.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [
    isConnected,
    tonAddress,
    ownerAddressRaw,
    persisted.prompt,
    persisted.agentName,
    persisted.baseToken,
    persisted.quoteToken,
    authedCfg,
    selectedModel,
    selectedProvider,
    selectedModelOption.pricing,
    setPersisted,
    navigate,
  ]);

  const topUpExistingContract = useCallback(async () => {
    setErr(null);
    if (!persisted.contractAddress) {
      setErr('Contract address is missing.');
      return;
    }
    if (!isConnected) {
      setErr('Connect a TON wallet first.');
      return;
    }
    if (parseFloat(persisted.topupAmountTon || '0') <= 0) {
      setErr('Top-up amount must be greater than 0 TON.');
      return;
    }

    try {
      setBusy('topup');
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [
          {
            address: persisted.contractAddress,
            amount: nanoFromTon(String(parseFloat(persisted.topupAmountTon || '0') || 0)),
          },
        ],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [persisted.contractAddress, persisted.topupAmountTon, isConnected, tonConnectUI]);

  const deployAndRegister = useCallback(async () => {
    setErr(null);

    if (!ownerAddressRaw) {
      setErr('Connect a TON wallet first.');
      return;
    }
    if (!persisted.prompt.trim()) {
      setErr('Prompt cannot be empty.');
      return;
    }
    if (!isConnected || !tonAddress) {
      setErr('Connect a TON wallet first.');
      return;
    }
    const deployAmount = parseFloat(persisted.deployAmountTon || '0');
    if (deployAmount < 0) {
      setErr('Fund amount cannot be negative.');
      return;
    }

    try {
      setBusy('deploy');

      let deployData: PendingDeploy;
      let contractId: string;

      // Reuse cached registration if user cancelled the previous transaction
      if (persisted.raceContractId && persisted.pendingDeploy) {
        deployData = persisted.pendingDeploy;
        contractId = persisted.raceContractId;
      } else {
        const base2 = persisted.baseToken ?? 'AGNT';
        const quote2 = persisted.quoteToken ?? 'NOT';
        const tradingPairs2 = `${base2}/${quote2}`;
        const pricingId2 = selectedModelOption.pricing?.[0]?.id;
        if (!pricingId2) throw new Error('No pricing tier available for this model');
        const created = await registerRaceContract(authedCfg, {
          prompt: persisted.prompt,
          pricing_id: pricingId2,
          ...(selectedProvider ? { ai_provider: selectedProvider } : {}),
          ...(persisted.agentName?.trim() ? { name: persisted.agentName.trim() } : {}),
          trading_pairs: tradingPairs2,
        });

        contractId = created.id;
        deployData = {
          mint_keeper_address: created.mint_keeper_address,
          state_init_boc_hex: created.state_init_boc_hex,
          body_boc_hex: created.body_boc_hex,
          value_nanoton: created.value_nanoton,
        };

        setPersisted((p) => ({
          ...p,
          contractAddress: created.address,
          raceContractId: contractId,
          pendingDeploy: deployData,
        }));
      }

      // Deploy MintKeeper via the data returned by the backend
      const deployTonStr = String(Math.max(0, parseFloat(persisted.deployAmountTon || '0') || 0));
      const userFundsNano = BigInt(nanoFromTon(deployTonStr));
      const deployFeeNano = BigInt(Math.max(0, Math.floor(Number(deployData.value_nanoton) || 0)));
      const gasNano = BigInt(nanoFromTon('0.1'));
      const totalNano = deployFeeNano + gasNano + userFundsNano;

      // Use non-bounceable address for deploy (contract doesn't exist yet)
      const deployAddress = Address.parse(deployData.mint_keeper_address).toString({ bounceable: false });

      const messages: { address: string; amount: string; stateInit?: string; payload?: string }[] = [
        {
          address: deployAddress,
          amount: String(totalNano),
          stateInit: hexBocToBase64(deployData.state_init_boc_hex),
          payload: hexBocToBase64(deployData.body_boc_hex),
        },
      ];

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages,
      });

      // Transaction signed -- clear pending state
      setPersisted((p) => ({ ...p, pendingDeploy: null }));
      navigate(`/trader/${contractId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [ownerAddressRaw, persisted, setPersisted, tonConnectUI, isConnected, tonAddress, authedCfg, selectedModel, selectedProvider, selectedModelOption.pricing, navigate]);

  const busyLabel = busy === 'deploy' ? 'Deploying contract...' : busy === 'register' ? 'Registering agent...' : busy === 'topup' ? 'Sending TON...' : null;
  const canRetryRegisterOnly = !!persisted.contractAddress && !persisted.raceContractId;

  const totalDeployTon = (0.6 + parseFloat(persisted.deployAmountTon || '0')).toFixed(1);
  const hasName = !!(persisted.agentName?.trim());
  const hasPair = !!(persisted.quoteToken);
  const hasStrategy = !!(persisted.prompt?.trim());

  // Suppress unused-var lint for rawAddr — it is used implicitly via TonConnect
  void rawAddr;

  return (
    <div className="flex flex-col gap-4">
      <ContractTabBar />
      <Card className="overflow-hidden mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="border-b border-border/50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/20">
              <Zap className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Deploy New Agent</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Configure, deploy on-chain, and enter the Trading Race</p>
            </div>
          </div>
        </div>

        <CardContent className="py-6 space-y-6">
          {/* =============================================================== */}
          {/* Section 1: Choose AI Model                                      */}
          {/* =============================================================== */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/20 text-[11px] font-bold text-green-500">1</div>
              <span className="text-base font-bold">Choose AI Model</span>
              {modelsLoading && <Skeleton className="ml-1 h-4 w-16 inline-block" />}
            </div>

            {/* Collapsed: show selected model */}
            {!modelListOpen && selectedModelOption && (
              <button
                type="button"
                className="flex items-center w-full text-left cursor-pointer rounded-lg border-2 border-green-600 bg-green-500/[0.08] px-3 py-2.5"
                onClick={() => setModelListOpen(true)}
              >
                <ProviderIcon provider={selectedModelOption.provider?.trim() || ''} />
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] font-medium leading-tight text-muted-foreground capitalize truncate">
                    {selectedModelOption.provider?.trim() || 'Unknown'}
                  </span>
                  <span className="text-xs font-bold leading-tight truncate">
                    {shortModelName(selectedModelOption.name)}
                  </span>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    selectedModelOption.isThinking
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                      : selectedModelOption.isThinking === false
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                  }
                >
                  {selectedModelOption.isThinking ? 'Thinking' : selectedModelOption.isThinking === false ? 'Fast' : 'Balanced'}
                </Badge>
                {selectedModelOption.pricing?.[0] && (
                  <span className="flex-shrink-0 text-[11px] text-muted-foreground ml-2 font-mono">
                    {selectedModelOption.pricing[0].price} {selectedModelOption.pricing[0].currency}/{selectedModelOption.pricing[0].cntDecisions} dec
                  </span>
                )}
                <ChevronDown className="flex-shrink-0 ml-2 h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}

            {/* Expanded: show all models */}
            {modelListOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {displayGroups.flatMap((group) =>
                  group.models.map((m) => {
                    const modelProvider = m.provider?.trim() ?? '';
                    const isSelected =
                      selectedModel === m.id &&
                      (selectedProvider ?? '') === modelProvider;
                    const lowestTier = m.pricing?.[0];
                    return (
                      <button
                        key={`${modelProvider || 'p'}:${m.id}`}
                        type="button"
                        className={`flex items-center text-left cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${
                          isSelected
                            ? 'border-2 border-green-600 bg-green-500/[0.08]'
                            : 'border border-border/50 hover:border-border'
                        }`}
                        onClick={() => {
                          setPersisted((p) => ({
                            ...p,
                            aiModel: m.id,
                            aiProvider: m.provider?.trim() || undefined,
                          }));
                          setModelListOpen(false);
                        }}
                        title={m.description ?? undefined}
                      >
                        <ProviderIcon provider={modelProvider} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[10px] font-medium leading-tight text-muted-foreground capitalize truncate">
                            {modelProvider || 'Unknown'}
                          </span>
                          <span className="text-xs font-bold leading-tight truncate">
                            {shortModelName(m.name)}
                          </span>
                        </div>
                        {m.isThinking != null && (
                          <Badge
                            variant="secondary"
                            className={
                              m.isThinking
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                            }
                          >
                            {m.isThinking ? 'Thinking' : 'Fast'}
                          </Badge>
                        )}
                        {lowestTier && (
                          <span className="flex-shrink-0 text-[10px] text-muted-foreground ml-2 font-mono">
                            {lowestTier.price} {lowestTier.currency}/{lowestTier.cntDecisions}
                          </span>
                        )}
                        {isSelected && (
                          <div className="flex-shrink-0 ml-2 h-4 w-4 rounded-full bg-green-600 flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="my-2" />

          {/* =============================================================== */}
          {/* Section 2: Trading Pair                                         */}
          {/* =============================================================== */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/20 text-[11px] font-bold text-green-500">2</div>
              <span className="text-base font-bold">Trading Pair</span>
              <span className="text-[10px] text-muted-foreground ml-1">(1 pair per agent)</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Base token dropdown */}
              <div className="relative">
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-bold transition-all cursor-pointer bg-muted ${pickingSide === 'base' ? 'ring-2 ring-primary/50' : 'hover:ring-2 hover:ring-primary/20'}`}
                  onClick={() => setPickingSide(pickingSide === 'base' ? null : 'base')}
                >
                  <TokenIcon symbol={persisted.baseToken ?? 'AGNT'} size="h-5 w-5" />
                  {persisted.baseToken ?? 'AGNT'}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                {pickingSide === 'base' && (
                  <div className="absolute top-full left-0 mt-1 z-20 rounded-lg bg-popover border border-border shadow-lg py-1 min-w-[120px]">
                    {BASE_TOKENS.map((token) => {
                      const isSelected = token === (persisted.baseToken ?? 'AGNT');
                      return (
                        <button
                          key={token}
                          type="button"
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${isSelected ? 'font-bold' : ''}`}
                          onClick={() => {
                            const curQuote = persisted.quoteToken;
                            const newQuotes = quotesForBase(token);
                            const keepQuote = curQuote && newQuotes.includes(curQuote) ? curQuote : newQuotes[0];
                            setPersisted((p) => ({ ...p, baseToken: token, quoteToken: keepQuote }));
                            setPickingSide(null);
                          }}
                        >
                          <TokenIcon symbol={token} size="h-5 w-5" />
                          {token}
                          {isSelected && <Check className="h-3.5 w-3.5 ml-auto text-green-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <span className="text-muted-foreground text-sm font-bold">/</span>

              {/* Quote token dropdown */}
              <div className="relative">
                {persisted.quoteToken ? (
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-bold transition-all cursor-pointer bg-muted ${pickingSide === 'quote' ? 'ring-2 ring-primary/50' : 'hover:ring-2 hover:ring-primary/20'}`}
                    onClick={() => setPickingSide(pickingSide === 'quote' ? null : 'quote')}
                  >
                    <TokenIcon symbol={persisted.quoteToken} size="h-5 w-5" />
                    {persisted.quoteToken}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                ) : (
                  <Button size="sm" className="rounded-full gap-1 px-3" onClick={() => setPickingSide('quote')}>
                    pick <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
                {pickingSide === 'quote' && (
                  <div className="absolute top-full left-0 mt-1 z-20 rounded-lg bg-popover border border-border shadow-lg py-1 min-w-[120px]">
                    {quotesForBase(persisted.baseToken ?? 'AGNT').map((token) => {
                      const isSelected = token === persisted.quoteToken;
                      return (
                        <button
                          key={token}
                          type="button"
                          className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors ${isSelected ? 'font-bold' : ''}`}
                          onClick={() => {
                            setPersisted((p) => ({ ...p, quoteToken: token }));
                            setPickingSide(null);
                          }}
                        >
                          <TokenIcon symbol={token} size="h-5 w-5" />
                          {token}
                          {isSelected && <Check className="h-3.5 w-3.5 ml-auto text-green-500" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="my-2" />

          {/* =============================================================== */}
          {/* Section 3: Trading Strategy                                     */}
          {/* =============================================================== */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/20 text-[11px] font-bold text-green-500">3</div>
              <span className="text-base font-bold">Trading Strategy</span>
            </div>
            <div className="flex items-center justify-end gap-1.5 mb-1.5">
              {isConnected && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-muted-foreground hover:text-foreground"
                  disabled={generating}
                  onClick={async () => {
                    if (!ownerAddressRaw) return;
                    setGenerating(true);
                    setErr(null);
                    try {
                      const result = await generateStrategy(authedCfg, ownerAddressRaw);
                      setPersisted((p) => ({
                        ...p,
                        prompt: result.prompt,
                        ...(result.suggested_pairs ? (() => {
                          const tokens = parseSuggestedTokens(result.suggested_pairs);
                          const quote = tokens.find((t) => t !== 'AGNT') ?? 'NOT';
                          return { quoteToken: quote };
                        })() : {}),
                      }));
                    } catch (e) {
                      setErr(e instanceof Error ? e.message : 'Failed to generate strategy');
                    } finally {
                      setGenerating(false);
                    }
                  }}
                >
                  {generating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Rocket className="h-3 w-3" />
                  )}
                  {generating ? 'Analyzing wallet...' : 'Auto-generate from wallet'}
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="xs" className="gap-1 text-muted-foreground hover:text-foreground">
                    <FileText className="h-3 w-3" />
                    Use template
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {STRATEGY_TEMPLATES.map((t) => (
                    <DropdownMenuItem
                      key={t.name}
                      className="text-xs cursor-pointer"
                      onClick={() => {
                        setPersisted((p) => ({ ...p, prompt: t.prompt }));
                      }}
                    >
                      {t.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Textarea
              ref={promptRef}
              id="prompt"
              className={`w-full text-sm leading-relaxed ${persisted.prompt.length > 5000 ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/50' : ''}`}
              value={persisted.prompt}
              onChange={(e) => setPersisted((p) => ({ ...p, prompt: e.target.value }))}
              placeholder="Describe your trading strategy..."
              rows={6}
              maxLength={5000}
            />
            <div className="flex justify-end mt-1">
              <span className={`font-mono text-[10px] ${persisted.prompt.length > 4800 ? (persisted.prompt.length > 5000 ? 'text-red-500' : 'text-yellow-500') : 'text-muted-foreground/50'}`}>
                {persisted.prompt.length} / 5000
              </span>
            </div>

            {/* Prompt Variables */}
            {promptVars.length > 0 && (
              <div className="mt-2 rounded-lg bg-muted/50 border border-border/50 px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Available variables <span className="normal-case text-muted-foreground/70">(click to insert)</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => setVarsHelpOpen(true)}
                  >
                    <Info className="h-3 w-3" />
                    <span className="text-[10px]">Help</span>
                  </Button>
                </div>
                <TooltipProvider>
                  <div className="flex flex-wrap gap-1.5">
                    {promptVars.map((v) => {
                      const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                      return (
                        <Tooltip key={v.key}>
                          <TooltipTrigger asChild>
                            <Button
                              variant={inPrompt ? 'default' : 'ghost'}
                              size="xs"
                              className={`gap-1 font-mono ${
                                inPrompt
                                  ? ''
                                  : 'border border-border/50 hover:border-primary/40 hover:bg-primary/10'
                              }`}
                              onClick={() => insertPromptVar(v)}
                            >
                              <span className={inPrompt ? '' : 'text-primary/80'}>{`{${v.key}}`}</span>
                              {inPrompt && <Check className="h-3 w-3" />}
                            </Button>
                          </TooltipTrigger>
                          {v.description && (
                            <TooltipContent>
                              {v.description}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      );
                    })}
                  </div>
                </TooltipProvider>
                <div className="mt-1.5 text-[10px] text-muted-foreground/50 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                  Variables are replaced with live data before each AI decision -- prices sync every 10s
                </div>
              </div>
            )}
          </div>

          <div className="my-2" />

          {/* =============================================================== */}
          {/* Section 4: Name & Fund                                         */}
          {/* =============================================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500/20 text-[11px] font-bold text-green-500">4</div>
              <span className="text-base font-bold">Name & Fund</span>
            </div>

            {/* Agent Name */}
            <Input
              id="agentName"
              type="text"
              value={persisted.agentName ?? ''}
              onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
              placeholder="Agent name, e.g. Moon Hunter"
              maxLength={40}
            />

            {/* Fund rows */}
            <div className="rounded-lg border border-border overflow-hidden">
              {/* Extra TON */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <TokenIcon symbol="TON" size="h-5 w-5" />
                  <span className="text-sm font-semibold">Extra TON</span>
                  <span className="text-[10px] text-muted-foreground">gas & fees</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="icon-xs" type="button" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                  }}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <Input
                    type="text"
                    className="w-16 text-center font-mono font-semibold h-8"
                    value={persisted.deployAmountTon}
                    onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))}
                    inputMode="decimal"
                  />
                  <Button variant="ghost" size="icon-xs" type="button" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                  }}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* WHERE YOUR TON GOES */}
              <div className="border-t border-border px-4 py-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Where your TON goes</div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span className="text-muted-foreground">AI service provider</span>
                    {selectedModelOption && (
                      <span className="text-muted-foreground/60">({shortModelName(selectedModelOption.name)})</span>
                    )}
                  </div>
                  <span className="font-mono text-muted-foreground">
                    {selectedModelOption?.pricing?.[0]
                      ? `${selectedModelOption.pricing[0].price} ${selectedModelOption.pricing[0].currency}/${selectedModelOption.pricing[0].cntDecisions} dec`
                      : '\u2014'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    <span className="text-muted-foreground">Service fee for deploying agent</span>
                  </div>
                  <span className="font-mono text-muted-foreground">~0.6 TON</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span className="text-muted-foreground">Gas</span>
                    <span className="text-muted-foreground/50">(stays on agent wallet for orders)</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{persisted.deployAmountTon || '0'} TON</span>
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Deploy ~0.6 TON &nbsp;+ {persisted.deployAmountTon || '0'} TON gas</span>
                <span className="text-sm font-bold font-mono">Total: {totalDeployTon} TON</span>
              </div>
            </div>

            {/* Footer note */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Info className="h-3 w-3 shrink-0" />
              TON is used for gas fees. Fund tokens after deploy. Signed via TonConnect.
            </div>

            {/* Validation checklist */}
            <div className="flex items-center gap-3 text-xs">
              <span className={hasName ? 'text-foreground/80' : 'text-muted-foreground/40'}>&middot; Name</span>
              <span className={hasPair ? 'text-foreground/80' : 'text-muted-foreground/40'}>&middot; Pair</span>
              <span className={hasStrategy ? 'text-foreground/80' : 'text-muted-foreground/40'}>&middot; Strategy</span>
            </div>

            {/* Deploy button */}
            <Button
              size="lg"
              className="w-full gap-2 text-base font-semibold shadow-md bg-green-600 hover:bg-green-700 text-white"
              onClick={() => void deployAndRegister()}
              disabled={!!busy}
              type="button"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {busyLabel ?? `Deploy \u00B7 ${totalDeployTon} TON`}
            </Button>

            {canRetryRegisterOnly && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                onClick={() => void registerOnly()}
                disabled={!!busy}
                type="button"
              >
                {busy === 'register' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Retry registration only
              </Button>
            )}

            <p className="text-center text-xs text-muted-foreground">Agent starts trading immediately</p>
          </div>

          {/* Contract Address (shown after deploy) */}
          {persisted.contractAddress && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 border border-border/50 px-3.5 py-2.5">
              <span className="text-xs text-muted-foreground">Contract</span>
              <a
                className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1"
                href={explorerLink(persisted.contractAddress)}
                target="_blank"
                rel="noreferrer"
              >
                {fmtAddr(persisted.contractAddress)}
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </a>
            </div>
          )}

          {/* Top-up (shown after deploy) */}
          {persisted.contractAddress && (
            <>
              <Separator className="my-0 opacity-30" />
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between font-normal text-muted-foreground"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5" />
                    Fund agent with tokens
                  </span>
                  {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </Button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    {/* TON top-up */}
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        className="flex-1 h-8"
                        value={persisted.topupAmountTon}
                        onChange={(e) => setPersisted((p) => ({ ...p, topupAmountTon: e.target.value }))}
                        inputMode="decimal"
                        placeholder="Amount in TON"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void topUpExistingContract()}
                        disabled={!!busy}
                        type="button"
                      >
                        {busy === 'topup' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          'Send TON'
                        )}
                      </Button>
                    </div>

                    {/* Jetton top-up */}
                    <TopupJettonForm
                      agentAddress={persisted.contractAddress}
                      baseToken={persisted.baseToken ?? 'AGNT'}
                      quoteToken={persisted.quoteToken ?? null}
                      raceCfg={authedCfg}
                      tonAddress={tonAddress}
                      tonConnectUI={tonConnectUI}
                      isConnected={isConnected}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </CardContent>

        {/* Error bar */}
        {err && (
          <div className="border-t border-red-500/20 bg-red-500/10 px-6 py-3">
            <p className="font-mono text-xs text-red-500">{err}</p>
          </div>
        )}

        {/* Wallet warning */}
        {!isConnected && (
          <div className="border-t border-yellow-500/20 bg-yellow-500/10 px-6 py-3">
            <p className="text-xs text-yellow-500 font-medium">Connect a TON wallet to deploy your agent.</p>
          </div>
        )}
      </Card>

      {/* Variables Help Modal */}
      <Dialog open={varsHelpOpen} onOpenChange={setVarsHelpOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Variable Reference</DialogTitle>
            <DialogDescription>
              Variables are placeholders replaced with live data before each AI decision. Click a variable name to insert it into your strategy.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {promptVars.map((v) => {
              const inPrompt = persisted.prompt.includes(`{${v.key}}`);
              return (
                <div key={v.key} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      className={`font-mono text-sm font-bold ${inPrompt ? 'text-primary' : 'text-primary/70 hover:text-primary'}`}
                      onClick={() => { insertPromptVar(v); setVarsHelpOpen(false); }}
                    >
                      {`{${v.key}}`}
                      {inPrompt && <Check className="inline h-3.5 w-3.5 ml-1 text-green-500" />}
                    </button>
                    {v.prompt_section && (
                      <Badge variant="secondary" className="text-[10px]">{v.prompt_section}</Badge>
                    )}
                  </div>
                  {v.name && v.name !== v.key && (
                    <div className="text-xs font-semibold text-foreground/70 mb-0.5">{v.name}</div>
                  )}
                  <div className="text-xs text-muted-foreground leading-relaxed">{v.description}</div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
