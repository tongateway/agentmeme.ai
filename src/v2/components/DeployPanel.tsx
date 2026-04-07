import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  Box,
  Flex,
  Grid,
  Heading,
  Text,
  Button,
  IconButton,
  Input,
  Textarea,
  Spinner,
  Badge,
  Icon,
  Link,
  Separator,
  HStack,
  VStack,
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogCloseTrigger,
  DialogBackdrop,
  DialogTitle,
  DialogPositioner,
  MenuRoot,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuPositioner,
} from '@chakra-ui/react';

/* ------------------------------------------------------------------ */
/* Utility functions                                                   */
/* ------------------------------------------------------------------ */

/** Build a jetton transfer body cell (op 0xf8a7ea5). */
function buildJettonTransferBody(opts: {
  queryId?: number;
  amount: bigint;
  destination: Address;
  responseDestination: Address;
  forwardTonAmount?: bigint;
}): string {
  const cell = beginCell()
    .storeUint(0xf8a7ea5, 32)           // op: transfer
    .storeUint(opts.queryId ?? 0, 64)    // query_id
    .storeCoins(opts.amount)             // jetton amount
    .storeAddress(opts.destination)       // to (agent contract)
    .storeAddress(opts.responseDestination) // response_destination (owner)
    .storeBit(false)                     // no custom_payload
    .storeCoins(opts.forwardTonAmount ?? 0n) // forward_ton_amount
    .storeBit(false)                     // no forward_payload
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

/** Extract short model name from description (strip "— long subtitle" suffix) */
function shortModelName(name: string): string {
  const sep = name.indexOf(' — ');
  return sep > 0 ? name.slice(0, sep).trim() : name;
}

/* ------------------------------------------------------------------ */
/* Strategy templates                                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Exported types                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Style helpers                                                       */
/* ------------------------------------------------------------------ */

const sectionNumberStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  h: '28px',
  w: '28px',
  borderRadius: 'full',
  bg: 'green.500/20',
  fontSize: '11px',
  fontWeight: 'bold',
  color: 'green.400',
} as const;


/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

type DeployPanelProps = {
  persisted: Persisted;
  setPersisted: React.Dispatch<React.SetStateAction<Persisted>>;
  raceCfg: PublicApiConfig;
  onContractRegistered?: (contractId: string) => void;
};

export function DeployPanel({ persisted, setPersisted, raceCfg, onContractRegistered }: DeployPanelProps) {
  const wallet = useTonWallet();
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

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
        const grouped = await getRaceAiModels(raceCfg);
        if (!cancelled && grouped.length > 0) {
          setAiModelGroups(grouped);
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    void loadModels();
    return () => { cancelled = true; };
  }, [raceCfg]);

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
    // Fallback: group FALLBACK_AI_MODELS by provider
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
        const vars = await getPromptVariables(raceCfg);
        if (!cancelled) setPromptVars(vars);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [raceCfg]);

  const insertPromptVar = useCallback((variable: PromptVariable) => {
    const ta = promptRef.current;
    const varText = variable.example; // e.g. "{market_prices}"
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const current = persisted.prompt;
      const newPrompt = current.substring(0, start) + varText + current.substring(end);
      setPersisted((p) => ({ ...p, prompt: newPrompt }));
      // Restore cursor position after the inserted text
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = start + varText.length;
        ta.setSelectionRange(newPos, newPos);
      });
    } else {
      // Fallback: append to end
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

  /* ---------------------------------------------------------------- */
  /* Business logic callbacks                                          */
  /* ---------------------------------------------------------------- */

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
      const created = await registerRaceContract(raceCfg, {
        prompt: persisted.prompt,
        pricing_id: pricingId,
        ...(selectedProvider ? { ai_provider: selectedProvider } : {}),
        ...(persisted.agentName?.trim() ? { name: persisted.agentName.trim() } : {}),
        trading_pairs: tradingPairs,
      });
      setPersisted((p) => ({ ...p, contractAddress: created.address, raceContractId: created.id }));
      onContractRegistered?.(created.id);
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
    persisted.baseToken,
    persisted.quoteToken,
    persisted.agentName,
    raceCfg,
    selectedModelOption,
    selectedProvider,
    setPersisted,
    onContractRegistered,
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
        // 1. Register with backend — it creates the contract and returns the address
        const base2 = persisted.baseToken ?? 'AGNT';
        const quote2 = persisted.quoteToken ?? 'NOT';
        const tradingPairs2 = `${base2}/${quote2}`;
        const pricingId2 = selectedModelOption.pricing?.[0]?.id;
        if (!pricingId2) throw new Error('No pricing tier available for this model');
        const created = await registerRaceContract(raceCfg, {
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

      // 2. Deploy MintKeeper via the data returned by the backend
      //    value_nanoton = claimMintFlowFees + protocolFee (from backend)
      const deployTonStr = String(Math.max(0, parseFloat(persisted.deployAmountTon || '0') || 0));
      const userFundsNano = BigInt(nanoFromTon(deployTonStr));
      const deployFeeNano = BigInt(Math.max(0, Math.floor(Number(deployData.value_nanoton) || 0)));
      const gasNano = BigInt(nanoFromTon('0.1'));
      const totalNano = deployFeeNano + gasNano + userFundsNano;

      // Use non-bounceable address for deploy (contract doesn't exist yet)
      const deployAddress = Address.parse(deployData.mint_keeper_address).toString({ bounceable: false });
      // Agent's final wallet address (not the MintKeeper) — jetton topups go here
      const agentWalletAddr = persisted.contractAddress
        ? Address.parse(persisted.contractAddress)
        : Address.parse(deployData.mint_keeper_address);
      const ownerAddr = Address.parse(tonAddress);

      const messages: { address: string; amount: string; stateInit?: string; payload?: string }[] = [
        {
          address: deployAddress,
          amount: String(totalNano),
          stateInit: hexBocToBase64(deployData.state_init_boc_hex),
          payload: hexBocToBase64(deployData.body_boc_hex),
        },
      ];

      // 3. Build jetton transfer messages for AGNT + quote token topups
      const agntAmount = parseFloat(persisted.agntTopup || '0') || 0;
      const quoteAmount = parseFloat(persisted.quoteTopup || '0') || 0;
      const base = persisted.baseToken ?? 'AGNT';
      const quote = persisted.quoteToken;

      if (agntAmount > 0 || quoteAmount > 0) {
        const tokens = await getRaceTokens(raceCfg);
        const tokenMap = new Map<string, RaceToken>();
        for (const t of tokens) tokenMap.set(t.symbol.toUpperCase(), t);

        const addJettonMsg = async (symbol: string, amount: number) => {
          const tokenInfo = tokenMap.get(symbol.toUpperCase());
          if (!tokenInfo) throw new Error(`Token ${symbol} not found`);
          const nano = BigInt(Math.round(amount * 10 ** tokenInfo.decimals));
          if (nano <= 0n) return;
          const jettonWallet = await resolveJettonWallet(tonAddress, tokenInfo.address);
          const payload = buildJettonTransferBody({
            amount: nano,
            destination: agentWalletAddr,
            responseDestination: ownerAddr,
            forwardTonAmount: 1n, // minimal forward for notification
          });
          messages.push({
            address: Address.parse(jettonWallet).toString({ bounceable: true }),
            amount: nanoFromTon('0.065'), // gas for jetton transfer
            payload,
          });
        };

        if (agntAmount > 0) await addJettonMsg(base, agntAmount);
        if (quoteAmount > 0 && quote) await addJettonMsg(quote, quoteAmount);
      }

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages,
      });

      // Transaction signed — clear pending state
      setPersisted((p) => ({ ...p, pendingDeploy: null }));
      onContractRegistered?.(contractId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [ownerAddressRaw, persisted, setPersisted, tonConnectUI, isConnected, tonAddress, raceCfg, selectedModelOption, selectedProvider, onContractRegistered]);

  /* ---------------------------------------------------------------- */
  /* Derived state                                                     */
  /* ---------------------------------------------------------------- */

  const busyLabel = busy === 'deploy' ? 'Deploying contract...' : busy === 'register' ? 'Registering agent...' : busy === 'topup' ? 'Sending TON...' : null;
  const canRetryRegisterOnly = !!persisted.contractAddress && !persisted.raceContractId;
  const totalDeployTon = (0.6 + parseFloat(persisted.deployAmountTon || '0')).toFixed(1);
  const hasName = !!(persisted.agentName?.trim());
  const hasPair = !!(persisted.quoteToken);
  const hasStrategy = !!(persisted.prompt?.trim());

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  return (
    <Box mt={4} mx="auto" maxW="2xl">
      <Box
        bg="gray.900"
        borderRadius="xl"
        overflow="hidden"
        borderWidth="1px"
        borderColor="whiteAlpha.100"
        shadow="md"
      >
        {/* Header */}
        <Box borderBottomWidth="1px" borderColor="whiteAlpha.50" px={6} py={5}>
          <Flex alignItems="center" gap={3}>
            <Flex
              h={10}
              w={10}
              alignItems="center"
              justifyContent="center"
              borderRadius="full"
              bg="green.500/20"
            >
              <Icon asChild color="green.400" boxSize={5}>
                <Zap />
              </Icon>
            </Flex>
            <Box>
              <Heading size="lg" fontWeight="bold" letterSpacing="tight">
                Deploy New Agent
              </Heading>
              <Text fontSize="xs" color="whiteAlpha.400" mt={0.5}>
                Configure, deploy on-chain, and enter the Trading Race
              </Text>
            </Box>
          </Flex>
        </Box>

        <Box px={6} py={6}>
          <VStack gap={6} align="stretch">
            {/* ========= Section 1: Choose AI Model ========= */}
            <Box>
              <Flex alignItems="center" gap={2} mb={3}>
                <Box {...sectionNumberStyles}>1</Box>
                <Text fontSize="md" fontWeight="bold">Choose AI Model</Text>
                {modelsLoading && <Spinner size="xs" ml={1} />}
              </Flex>

              {/* Collapsed: show selected model */}
              {!modelListOpen && selectedModelOption && (
                <Box
                  as="button"
                  display="flex"
                  alignItems="center"
                  w="full"
                  textAlign="left"
                  cursor="pointer"
                  p="10px 12px"
                  borderRadius="lg"
                  borderWidth="2px"
                  borderColor="green.500"
                  bg="green.500/8"
                  onClick={() => setModelListOpen(true)}
                >
                  <Box flex={1} minW={0}>
                    <Text
                      fontSize="10px"
                      fontWeight="medium"
                      lineHeight="tight"
                      color="whiteAlpha.500"
                      textTransform="capitalize"
                      truncate
                    >
                      {selectedModelOption.provider?.trim() || 'Unknown'}
                    </Text>
                    <Text fontSize="xs" fontWeight="bold" lineHeight="tight" truncate>
                      {shortModelName(selectedModelOption.name)}
                    </Text>
                  </Box>
                  <Badge
                    ml={2}
                    borderRadius="full"
                    px={2.5}
                    py={0.5}
                    fontSize="10px"
                    fontWeight="semibold"
                    bg={
                      selectedModelOption.isThinking
                        ? '#E6F1FB'
                        : selectedModelOption.isThinking === false
                          ? '#FAEEDA'
                          : '#D4EDDA'
                    }
                    color={
                      selectedModelOption.isThinking
                        ? '#185FA5'
                        : selectedModelOption.isThinking === false
                          ? '#854F0B'
                          : '#155724'
                    }
                  >
                    {selectedModelOption.isThinking ? 'Thinking' : selectedModelOption.isThinking === false ? 'Fast' : 'Balanced'}
                  </Badge>
                  {selectedModelOption.pricing?.[0] && (
                    <Text ml={2} fontSize="11px" color="whiteAlpha.400" fontFamily="mono" flexShrink={0}>
                      {selectedModelOption.pricing[0].price} {selectedModelOption.pricing[0].currency}/{selectedModelOption.pricing[0].cntDecisions} dec
                    </Text>
                  )}
                  <Icon asChild ml={2} color="whiteAlpha.400" boxSize="14px" flexShrink={0}>
                    <ChevronDown />
                  </Icon>
                </Box>
              )}

              {/* Expanded: show all models */}
              {modelListOpen && (
                <Grid templateColumns={{ base: '1fr', sm: '1fr 1fr' }} gap="6px">
                  {displayGroups.flatMap((group) =>
                    group.models.map((m) => {
                      const modelProvider = m.provider?.trim() ?? '';
                      const isSelected =
                        selectedModel === m.id &&
                        (selectedProvider ?? '') === modelProvider;
                      const lowestTier = m.pricing?.[0];
                      return (
                        <Box
                          as="button"
                          key={`${modelProvider || 'p'}:${m.id}`}
                          display="flex"
                          alignItems="center"
                          textAlign="left"
                          cursor="pointer"
                          p="10px 12px"
                          borderRadius="lg"
                          borderWidth={isSelected ? '2px' : '0.5px'}
                          borderColor={isSelected ? 'green.500' : 'whiteAlpha.100'}
                          bg={isSelected ? 'green.500/8' : 'transparent'}
                          _hover={{ bg: isSelected ? 'green.500/8' : 'whiteAlpha.50' }}
                          w="full"
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
                          <Box flex={1} minW={0}>
                            <Text
                              fontSize="10px"
                              fontWeight="medium"
                              lineHeight="tight"
                              color="whiteAlpha.500"
                              textTransform="capitalize"
                              truncate
                            >
                              {modelProvider || 'Unknown'}
                            </Text>
                            <Text fontSize="xs" fontWeight="bold" lineHeight="tight" truncate>
                              {shortModelName(m.name)}
                            </Text>
                          </Box>
                          {m.isThinking != null && (
                            <Badge
                              ml={2}
                              borderRadius="full"
                              px={2}
                              py={0.5}
                              fontSize="10px"
                              fontWeight="semibold"
                              flexShrink={0}
                              bg={m.isThinking ? '#E6F1FB' : '#FAEEDA'}
                              color={m.isThinking ? '#185FA5' : '#854F0B'}
                            >
                              {m.isThinking ? 'Thinking' : 'Fast'}
                            </Badge>
                          )}
                          {lowestTier && (
                            <Text ml={2} fontSize="10px" color="whiteAlpha.400" fontFamily="mono" flexShrink={0}>
                              {lowestTier.price} {lowestTier.currency}/{lowestTier.cntDecisions}
                            </Text>
                          )}
                          {isSelected && (
                            <Box
                              ml={2}
                              flexShrink={0}
                              h="16px"
                              w="16px"
                              borderRadius="full"
                              bg="green.500"
                              display="flex"
                              alignItems="center"
                              justifyContent="center"
                            >
                              <Icon asChild color="white" boxSize="10px">
                                <Check />
                              </Icon>
                            </Box>
                          )}
                        </Box>
                      );
                    })
                  )}
                </Grid>
              )}
            </Box>

            {/* ========= Section 2: Trading Pair ========= */}
            <Box>
              <Flex alignItems="center" gap={2} mb={2}>
                <Box {...sectionNumberStyles}>2</Box>
                <Text fontSize="md" fontWeight="bold">Trading Pair</Text>
                <Text fontSize="10px" color="whiteAlpha.400" ml={1}>(1 pair per agent)</Text>
              </Flex>

              <Flex alignItems="center" gap={2}>
                {/* Base token dropdown */}
                <Box position="relative">
                  <Box
                    as="button"
                    display="inline-flex"
                    alignItems="center"
                    gap={1.5}
                    borderRadius="full"
                    pl={3}
                    pr={2.5}
                    py={1.5}
                    fontSize="sm"
                    fontWeight="bold"
                    cursor="pointer"
                    bg="whiteAlpha.100"
                    _hover={{ bg: 'whiteAlpha.200' }}
                    outline={pickingSide === 'base' ? '2px solid' : 'none'}
                    outlineColor="green.500/50"
                    onClick={() => setPickingSide(pickingSide === 'base' ? null : 'base')}
                  >
                    <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS[persisted.baseToken ?? 'AGNT']} />
                    {persisted.baseToken ?? 'AGNT'}
                    <Icon asChild boxSize={3} color="whiteAlpha.400">
                      <ChevronDown />
                    </Icon>
                  </Box>
                  {pickingSide === 'base' && (
                    <Box
                      position="absolute"
                      top="100%"
                      left={0}
                      mt={1}
                      zIndex={20}
                      borderRadius="lg"
                      bg="gray.800"
                      borderWidth="1px"
                      borderColor="whiteAlpha.100"
                      shadow="lg"
                      py={1}
                      minW="120px"
                    >
                      {BASE_TOKENS.map((token) => {
                        const isTokenSelected = token === (persisted.baseToken ?? 'AGNT');
                        return (
                          <Box
                            as="button"
                            key={token}
                            display="flex"
                            alignItems="center"
                            gap={2}
                            w="full"
                            px={3}
                            py={2}
                            fontSize="sm"
                            _hover={{ bg: 'whiteAlpha.100' }}
                            fontWeight={isTokenSelected ? 'bold' : 'normal'}
                            cursor="pointer"
                            onClick={() => {
                              const curQuote = persisted.quoteToken;
                              const newQuotes = quotesForBase(token);
                              const keepQuote = curQuote && newQuotes.includes(curQuote) ? curQuote : newQuotes[0];
                              setPersisted((p) => ({ ...p, baseToken: token, quoteToken: keepQuote }));
                              setPickingSide(null);
                            }}
                          >
                            <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS[token] ?? '#888'} />
                            {token}
                            {isTokenSelected && (
                              <Icon asChild ml="auto" color="green.400" boxSize="14px">
                                <Check />
                              </Icon>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>

                <Text color="whiteAlpha.400" fontSize="sm" fontWeight="bold">/</Text>

                {/* Quote token dropdown */}
                <Box position="relative">
                  {persisted.quoteToken ? (
                    <Box
                      as="button"
                      display="inline-flex"
                      alignItems="center"
                      gap={1.5}
                      borderRadius="full"
                      pl={3}
                      pr={2.5}
                      py={1.5}
                      fontSize="sm"
                      fontWeight="bold"
                      cursor="pointer"
                      bg="whiteAlpha.100"
                      _hover={{ bg: 'whiteAlpha.200' }}
                      outline={pickingSide === 'quote' ? '2px solid' : 'none'}
                      outlineColor="green.500/50"
                      onClick={() => setPickingSide(pickingSide === 'quote' ? null : 'quote')}
                    >
                      <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS[persisted.quoteToken] ?? '#888'} />
                      {persisted.quoteToken}
                      <Icon asChild boxSize={3} color="whiteAlpha.400">
                        <ChevronDown />
                      </Icon>
                    </Box>
                  ) : (
                    <Button size="sm" colorPalette="green" borderRadius="full" gap={1} px={3} onClick={() => setPickingSide('quote')}>
                      pick <Icon asChild boxSize={3}><ArrowRight /></Icon>
                    </Button>
                  )}
                  {pickingSide === 'quote' && (
                    <Box
                      position="absolute"
                      top="100%"
                      left={0}
                      mt={1}
                      zIndex={20}
                      borderRadius="lg"
                      bg="gray.800"
                      borderWidth="1px"
                      borderColor="whiteAlpha.100"
                      shadow="lg"
                      py={1}
                      minW="120px"
                    >
                      {quotesForBase(persisted.baseToken ?? 'AGNT').map((token) => {
                        const isTokenSelected = token === persisted.quoteToken;
                        return (
                          <Box
                            as="button"
                            key={token}
                            display="flex"
                            alignItems="center"
                            gap={2}
                            w="full"
                            px={3}
                            py={2}
                            fontSize="sm"
                            _hover={{ bg: 'whiteAlpha.100' }}
                            fontWeight={isTokenSelected ? 'bold' : 'normal'}
                            cursor="pointer"
                            onClick={() => {
                              setPersisted((p) => ({ ...p, quoteToken: token }));
                              setPickingSide(null);
                            }}
                          >
                            <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS[token] ?? '#888'} />
                            {token}
                            {isTokenSelected && (
                              <Icon asChild ml="auto" color="green.400" boxSize="14px">
                                <Check />
                              </Icon>
                            )}
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Flex>
            </Box>

            {/* ========= Section 3: Trading Strategy ========= */}
            <Box>
              <Flex alignItems="center" gap={2} mb={3}>
                <Box {...sectionNumberStyles}>3</Box>
                <Text fontSize="md" fontWeight="bold">Trading Strategy</Text>
              </Flex>

              <Flex alignItems="center" justifyContent="flex-end" gap={1.5} mb={1.5}>
                {isConnected && (
                  <Button
                    variant="ghost"
                    size="xs"
                    gap={1}
                    opacity={0.6}
                    _hover={{ opacity: 1 }}
                    disabled={generating}
                    onClick={async () => {
                      if (!ownerAddressRaw) return;
                      setGenerating(true);
                      setErr(null);
                      try {
                        const result = await generateStrategy(raceCfg, ownerAddressRaw);
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
                      <Spinner size="xs" />
                    ) : (
                      <Icon asChild boxSize={3}><Rocket /></Icon>
                    )}
                    {generating ? 'Analyzing wallet...' : 'Auto-generate from wallet'}
                  </Button>
                )}

                {/* Template dropdown */}
                <MenuRoot>
                  <MenuTrigger asChild>
                    <Button variant="ghost" size="xs" gap={1} opacity={0.6} _hover={{ opacity: 1 }}>
                      <Icon asChild boxSize={3}><FileText /></Icon>
                      Use template
                      <Icon asChild boxSize={3}><ChevronDown /></Icon>
                    </Button>
                  </MenuTrigger>
                  <MenuPositioner>
                    <MenuContent
                      bg="gray.800"
                      borderColor="whiteAlpha.100"
                      shadow="lg"
                      minW="224px"
                      p={1}
                      zIndex={10}
                    >
                      {STRATEGY_TEMPLATES.map((t) => (
                        <MenuItem
                          key={t.name}
                          value={t.name}
                          fontSize="xs"
                          _hover={{ bg: 'whiteAlpha.100' }}
                          borderRadius="md"
                          cursor="pointer"
                          onClick={() => {
                            setPersisted((p) => ({ ...p, prompt: t.prompt }));
                          }}
                        >
                          {t.name}
                        </MenuItem>
                      ))}
                    </MenuContent>
                  </MenuPositioner>
                </MenuRoot>
              </Flex>

              <Textarea
                ref={promptRef}
                value={persisted.prompt}
                onChange={(e) => setPersisted((p) => ({ ...p, prompt: e.target.value }))}
                placeholder="Describe your trading strategy..."
                rows={6}
                maxLength={5000}
                fontSize="sm"
                lineHeight="relaxed"
                bg="whiteAlpha.50"
                borderColor={persisted.prompt.length > 5000 ? 'red.500' : 'whiteAlpha.100'}
                _hover={{ borderColor: 'whiteAlpha.200' }}
                _focus={{ borderColor: 'green.500', outline: 'none' }}
              />
              <Flex justifyContent="flex-end" mt={1}>
                <Text
                  fontFamily="mono"
                  fontSize="10px"
                  color={
                    persisted.prompt.length > 5000
                      ? 'red.400'
                      : persisted.prompt.length > 4800
                        ? 'yellow.400'
                        : 'whiteAlpha.300'
                  }
                >
                  {persisted.prompt.length} / 5000
                </Text>
              </Flex>

              {/* Prompt Variables */}
              {promptVars.length > 0 && (
                <Box
                  mt={2}
                  borderRadius="lg"
                  bg="whiteAlpha.50"
                  borderWidth="1px"
                  borderColor="whiteAlpha.50"
                  px={3}
                  py={2.5}
                >
                  <Flex alignItems="center" justifyContent="space-between" mb={2}>
                    <Text fontSize="10px" textTransform="uppercase" letterSpacing="wider" color="whiteAlpha.400">
                      Available variables <Text as="span" textTransform="none" color="whiteAlpha.500">(click to insert)</Text>
                    </Text>
                    <Button
                      variant="ghost"
                      size="xs"
                      gap={1}
                      opacity={0.5}
                      _hover={{ opacity: 1 }}
                      onClick={() => setVarsHelpOpen(true)}
                    >
                      <Icon asChild boxSize={3}><Info /></Icon>
                      <Text fontSize="10px">Help</Text>
                    </Button>
                  </Flex>
                  <Flex flexWrap="wrap" gap={1.5}>
                    {promptVars.map((v) => {
                      const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                      return (
                        <Box key={v.key} position="relative">
                          <Button
                            size="xs"
                            gap={1}
                            fontFamily="mono"
                            variant={inPrompt ? 'solid' : 'ghost'}
                            colorPalette={inPrompt ? 'green' : undefined}
                            borderWidth={inPrompt ? '1px' : '1px'}
                            borderColor={inPrompt ? 'green.500/40' : 'whiteAlpha.100'}
                            _hover={inPrompt ? {} : { borderColor: 'green.500/40', bg: 'green.500/10' }}
                            onClick={() => insertPromptVar(v)}
                          >
                            <Text color={inPrompt ? undefined : 'green.400/80'}>{`{${v.key}}`}</Text>
                            {inPrompt && <Icon asChild boxSize={3}><Check /></Icon>}
                          </Button>
                        </Box>
                      );
                    })}
                  </Flex>
                  <Flex mt={1.5} alignItems="center" gap={1.5}>
                    <Box
                      h="6px"
                      w="6px"
                      borderRadius="full"
                      bg="green.400"
                      flexShrink={0}
                      animation="pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                    />
                    <Text fontSize="10px" color="whiteAlpha.300">
                      Variables are replaced with live data before each AI decision — prices sync every 10s
                    </Text>
                  </Flex>
                </Box>
              )}
            </Box>

            {/* ========= Section 4: Name & Fund ========= */}
            <VStack gap={3} align="stretch">
              <Flex alignItems="center" gap={2} mb={3}>
                <Box {...sectionNumberStyles}>4</Box>
                <Text fontSize="md" fontWeight="bold">Name & Fund</Text>
              </Flex>

              {/* Agent Name */}
              <Input
                value={persisted.agentName ?? ''}
                onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
                placeholder="Agent name, e.g. Moon Hunter"
                maxLength={40}
                bg="whiteAlpha.50"
                borderColor="whiteAlpha.100"
                _hover={{ borderColor: 'whiteAlpha.200' }}
                _focus={{ borderColor: 'green.500', outline: 'none' }}
              />

              {/* Fund rows */}
              <Box borderRadius="lg" borderWidth="1px" borderColor="whiteAlpha.100" overflow="hidden">
                {/* Extra TON */}
                <Flex alignItems="center" justifyContent="space-between" px={4} py={3}>
                  <Flex alignItems="center" gap={2}>
                    <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS.TON} />
                    <Text fontSize="sm" fontWeight="semibold">Extra TON</Text>
                    <Text fontSize="10px" color="whiteAlpha.400">gas & fees</Text>
                  </Flex>
                  <Flex alignItems="center" gap={1.5}>
                    <IconButton
                      aria-label="Decrease TON"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        const cur = parseFloat(persisted.deployAmountTon || '0');
                        if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                      }}
                    >
                      <Minus size={12} />
                    </IconButton>
                    <Input
                      size="sm"
                      w="64px"
                      textAlign="center"
                      fontFamily="mono"
                      fontWeight="semibold"
                      value={persisted.deployAmountTon}
                      onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))}
                      inputMode="decimal"
                      bg="whiteAlpha.50"
                      borderColor="whiteAlpha.100"
                    />
                    <IconButton
                      aria-label="Increase TON"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        const cur = parseFloat(persisted.deployAmountTon || '0');
                        setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                      }}
                    >
                      <Plus size={12} />
                    </IconButton>
                  </Flex>
                </Flex>

                {/* AGNT topup */}
                <Flex
                  alignItems="center"
                  justifyContent="space-between"
                  px={4}
                  py={3}
                  borderTopWidth="1px"
                  borderColor="whiteAlpha.50"
                >
                  <Flex alignItems="center" gap={2}>
                    <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS.AGNT} />
                    <Text fontSize="sm" fontWeight="semibold">AGNT topup</Text>
                    <Text fontSize="10px" color="whiteAlpha.400">base capital</Text>
                  </Flex>
                  <Flex alignItems="center" gap={1.5}>
                    <IconButton
                      aria-label="Decrease AGNT"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        const cur = parseFloat(persisted.agntTopup || '0');
                        if (cur > 0) setPersisted((p) => ({ ...p, agntTopup: String(Math.max(0, cur - 1)) }));
                      }}
                    >
                      <Minus size={12} />
                    </IconButton>
                    <Input
                      size="sm"
                      w="64px"
                      textAlign="center"
                      fontFamily="mono"
                      fontWeight="semibold"
                      value={persisted.agntTopup ?? '0'}
                      onChange={(e) => setPersisted((p) => ({ ...p, agntTopup: e.target.value }))}
                      inputMode="decimal"
                      bg="whiteAlpha.50"
                      borderColor="whiteAlpha.100"
                    />
                    <IconButton
                      aria-label="Increase AGNT"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        const cur = parseFloat(persisted.agntTopup || '0');
                        setPersisted((p) => ({ ...p, agntTopup: String(cur + 1) }));
                      }}
                    >
                      <Plus size={12} />
                    </IconButton>
                  </Flex>
                </Flex>

                {/* Quote token topup */}
                {persisted.quoteToken && persisted.quoteToken !== 'AGNT' && (
                  <Flex
                    alignItems="center"
                    justifyContent="space-between"
                    px={4}
                    py={3}
                    borderTopWidth="1px"
                    borderColor="whiteAlpha.50"
                  >
                    <Flex alignItems="center" gap={2}>
                      <Box h="10px" w="10px" borderRadius="full" bg={TOKEN_COLORS[persisted.quoteToken] ?? '#888'} />
                      <Text fontSize="sm" fontWeight="semibold">{persisted.quoteToken} topup</Text>
                      <Text fontSize="10px" color="whiteAlpha.400">quote capital</Text>
                    </Flex>
                    <Flex alignItems="center" gap={1.5}>
                      <IconButton
                        aria-label={`Decrease ${persisted.quoteToken}`}
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          const cur = parseFloat(persisted.quoteTopup || '0');
                          if (cur > 0) setPersisted((p) => ({ ...p, quoteTopup: String(Math.max(0, cur - 1)) }));
                        }}
                      >
                        <Minus size={12} />
                      </IconButton>
                      <Input
                        size="sm"
                        w="64px"
                        textAlign="center"
                        fontFamily="mono"
                        fontWeight="semibold"
                        value={persisted.quoteTopup ?? '0'}
                        onChange={(e) => setPersisted((p) => ({ ...p, quoteTopup: e.target.value }))}
                        inputMode="decimal"
                        bg="whiteAlpha.50"
                        borderColor="whiteAlpha.100"
                      />
                      <IconButton
                        aria-label={`Increase ${persisted.quoteToken}`}
                        variant="ghost"
                        size="xs"
                        onClick={() => {
                          const cur = parseFloat(persisted.quoteTopup || '0');
                          setPersisted((p) => ({ ...p, quoteTopup: String(cur + 1) }));
                        }}
                      >
                        <Plus size={12} />
                      </IconButton>
                    </Flex>
                  </Flex>
                )}

                {/* WHERE YOUR TON GOES */}
                <Box borderTopWidth="1px" borderColor="whiteAlpha.100" px={4} py={3}>
                  <VStack gap={1.5} align="stretch">
                    <Text fontSize="10px" textTransform="uppercase" letterSpacing="wider" fontWeight="semibold" color="whiteAlpha.400">
                      Where your TON goes
                    </Text>
                    <Flex alignItems="center" justifyContent="space-between" fontSize="xs">
                      <Flex alignItems="center" gap={1.5}>
                        <Box h="6px" w="6px" borderRadius="full" bg="purple.400" />
                        <Text color="whiteAlpha.600">AI service provider</Text>
                        {selectedModelOption && (
                          <Text color="whiteAlpha.400">({shortModelName(selectedModelOption.name)})</Text>
                        )}
                      </Flex>
                      <Text fontFamily="mono" color="whiteAlpha.600">
                        {selectedModelOption?.pricing?.[0]
                          ? `${selectedModelOption.pricing[0].price} ${selectedModelOption.pricing[0].currency}/${selectedModelOption.pricing[0].cntDecisions} dec`
                          : '\u2014'}
                      </Text>
                    </Flex>
                    <Flex alignItems="center" justifyContent="space-between" fontSize="xs">
                      <Flex alignItems="center" gap={1.5}>
                        <Box h="6px" w="6px" borderRadius="full" bg="orange.400" />
                        <Text color="whiteAlpha.600">Service fee for deploying agent</Text>
                      </Flex>
                      <Text fontFamily="mono" color="whiteAlpha.600">~0.6 TON</Text>
                    </Flex>
                    <Flex alignItems="center" justifyContent="space-between" fontSize="xs">
                      <Flex alignItems="center" gap={1.5}>
                        <Box h="6px" w="6px" borderRadius="full" bg="blue.400" />
                        <Text color="whiteAlpha.600">Gas</Text>
                        <Text color="whiteAlpha.300">(stays on agent wallet for orders)</Text>
                      </Flex>
                      <Text fontFamily="mono" color="whiteAlpha.600">{persisted.deployAmountTon || '0'} TON</Text>
                    </Flex>
                  </VStack>
                </Box>

                {/* Total */}
                <Flex
                  borderTopWidth="1px"
                  borderColor="whiteAlpha.100"
                  px={4}
                  py={2.5}
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Text fontSize="xs" color="whiteAlpha.500">
                    Deploy ~0.6 TON &nbsp;+ {persisted.deployAmountTon || '0'} TON gas
                  </Text>
                  <Text fontSize="sm" fontWeight="bold" fontFamily="mono">
                    Total: {totalDeployTon} TON
                  </Text>
                </Flex>
              </Box>

              {/* Footer note */}
              <Flex alignItems="center" gap={1.5}>
                <Icon asChild boxSize={3} color="whiteAlpha.400" flexShrink={0}>
                  <Info />
                </Icon>
                <Text fontSize="10px" color="whiteAlpha.400">
                  Tokens transferred to agent&apos;s on-chain wallet for{' '}
                  <Text as="strong" color="whiteAlpha.600">{persisted.baseToken ?? 'AGNT'}/{persisted.quoteToken ?? '...'}</Text>.
                  Signed via TonConnect.
                </Text>
              </Flex>

              {/* Validation checklist */}
              <HStack gap={3} fontSize="xs">
                <Text color={hasName ? 'whiteAlpha.700' : 'whiteAlpha.300'}>&middot; Name</Text>
                <Text color={hasPair ? 'whiteAlpha.700' : 'whiteAlpha.300'}>&middot; Pair</Text>
                <Text color={hasStrategy ? 'whiteAlpha.700' : 'whiteAlpha.300'}>&middot; Strategy</Text>
              </HStack>

              {/* Deploy button */}
              <Button
                colorPalette="green"
                size="lg"
                w="full"
                gap={2}
                fontSize="md"
                fontWeight="semibold"
                shadow="md"
                disabled={!!busy}
                onClick={() => void deployAndRegister()}
              >
                {busy ? (
                  <Spinner size="sm" />
                ) : (
                  <Icon asChild boxSize={4.5}><Rocket /></Icon>
                )}
                {busyLabel ?? `Deploy \u00B7 ${totalDeployTon} TON`}
              </Button>

              {canRetryRegisterOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  w="full"
                  opacity={0.6}
                  disabled={!!busy}
                  onClick={() => void registerOnly()}
                >
                  {busy === 'register' && <Spinner size="xs" />}
                  Retry registration only
                </Button>
              )}

              <Text textAlign="center" fontSize="xs" color="whiteAlpha.400">
                Agent starts trading immediately
              </Text>
            </VStack>

            {/* Contract Address (shown after deploy) */}
            {persisted.contractAddress && (
              <Flex
                alignItems="center"
                justifyContent="space-between"
                gap={3}
                borderRadius="lg"
                bg="whiteAlpha.50"
                borderWidth="1px"
                borderColor="whiteAlpha.50"
                px={3.5}
                py={2.5}
              >
                <Text fontSize="xs" color="whiteAlpha.500">Contract</Text>
                <Link
                  href={explorerLink(persisted.contractAddress)}
                  target="_blank"
                  rel="noreferrer"
                  fontFamily="mono"
                  fontSize="xs"
                  display="inline-flex"
                  alignItems="center"
                  gap={1}
                  _hover={{ textDecoration: 'underline' }}
                  color="green.400"
                >
                  {fmtAddr(persisted.contractAddress)}
                  <Icon asChild boxSize={3} color="whiteAlpha.400">
                    <ExternalLink />
                  </Icon>
                </Link>
              </Flex>
            )}

            {/* Top-up (collapsible, only after deploy) */}
            {persisted.contractAddress && (
              <>
                <Separator borderColor="whiteAlpha.200" />
                <Box>
                  <Button
                    variant="ghost"
                    size="sm"
                    w="full"
                    justifyContent="space-between"
                    fontWeight="normal"
                    opacity={0.6}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    <Flex alignItems="center" gap={2}>
                      <Icon asChild boxSize="14px"><Wallet /></Icon>
                      Add more funds
                    </Flex>
                    <Icon asChild boxSize="14px">
                      {showAdvanced ? <ChevronUp /> : <ChevronDown />}
                    </Icon>
                  </Button>

                  {showAdvanced && (
                    <Flex mt={3} gap={2}>
                      <Input
                        size="sm"
                        flex={1}
                        value={persisted.topupAmountTon}
                        onChange={(e) => setPersisted((p) => ({ ...p, topupAmountTon: e.target.value }))}
                        inputMode="decimal"
                        placeholder="Amount in TON"
                        bg="whiteAlpha.50"
                        borderColor="whiteAlpha.100"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!busy}
                        onClick={() => void topUpExistingContract()}
                      >
                        {busy === 'topup' ? <Spinner size="xs" /> : 'Send TON'}
                      </Button>
                    </Flex>
                  )}
                </Box>
              </>
            )}
          </VStack>
        </Box>

        {/* Error bar */}
        {err && (
          <Box borderTopWidth="1px" borderColor="red.500/20" bg="red.500/10" px={6} py={3}>
            <Text fontFamily="mono" fontSize="xs" color="red.400">{err}</Text>
          </Box>
        )}

        {/* Wallet warning */}
        {!isConnected && (
          <Box borderTopWidth="1px" borderColor="yellow.500/20" bg="yellow.500/10" px={6} py={3}>
            <Text fontSize="xs" color="yellow.400" fontWeight="medium">
              Connect a TON wallet to deploy your agent.
            </Text>
          </Box>
        )}
      </Box>

      {/* Variables Help Modal */}
      <DialogRoot open={varsHelpOpen} onOpenChange={(e) => setVarsHelpOpen(e.open)}>
        <DialogBackdrop />
        <DialogPositioner>
          <DialogContent bg="gray.800" borderColor="whiteAlpha.100" maxW="2xl" maxH="80vh" overflow="auto">
            <DialogHeader>
              <Flex alignItems="center" justifyContent="space-between">
                <DialogTitle fontSize="lg" fontWeight="bold">Variable Reference</DialogTitle>
                <DialogCloseTrigger />
              </Flex>
            </DialogHeader>
            <DialogBody pb={6}>
              <Text fontSize="xs" color="whiteAlpha.500" mb={4}>
                Variables are placeholders replaced with live data before each AI decision. Click a variable name to insert it into your strategy.
              </Text>
              <VStack gap={3} align="stretch">
                {promptVars.map((v) => {
                  const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                  return (
                    <Box
                      key={v.key}
                      borderRadius="lg"
                      borderWidth="1px"
                      borderColor="whiteAlpha.100"
                      p={3}
                    >
                      <Flex alignItems="center" justifyContent="space-between" mb={1}>
                        <Box
                          as="button"
                          fontFamily="mono"
                          fontSize="sm"
                          fontWeight="bold"
                          color={inPrompt ? 'green.400' : 'green.400/70'}
                          _hover={{ color: 'green.400' }}
                          cursor="pointer"
                          onClick={() => { insertPromptVar(v); setVarsHelpOpen(false); }}
                        >
                          {`{${v.key}}`}
                          {inPrompt && (
                            <Icon asChild boxSize="14px" ml={1} color="green.400" display="inline">
                              <Check />
                            </Icon>
                          )}
                        </Box>
                        {v.prompt_section && (
                          <Badge variant="subtle" size="sm" colorPalette="gray" opacity={0.5}>
                            {v.prompt_section}
                          </Badge>
                        )}
                      </Flex>
                      {v.name && v.name !== v.key && (
                        <Text fontSize="xs" fontWeight="semibold" color="whiteAlpha.600" mb={0.5}>
                          {v.name}
                        </Text>
                      )}
                      <Text fontSize="xs" color="whiteAlpha.500" lineHeight="relaxed">
                        {v.description}
                      </Text>
                    </Box>
                  );
                })}
              </VStack>
            </DialogBody>
          </DialogContent>
        </DialogPositioner>
      </DialogRoot>
    </Box>
  );
}
