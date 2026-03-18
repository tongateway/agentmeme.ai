import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Rocket, Wallet, ChevronDown, ChevronUp, ExternalLink, Minus, Plus, FileText } from 'lucide-react';
import {
  nanoFromTon,
} from '@/lib/ton/agentWalletV5';
import { getRaceAiModels, getPromptVariables, registerRaceContract, hexBocToBase64, type AiModelOption, type AiModelsByProvider, type PromptVariable, type PublicApiConfig } from '@/lib/api';

function fmtAddr(addr: string): string {
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}\u2026${addr.slice(-8)}`;
}

function explorerLink(addr: string): string {
  return `https://tonviewer.com/${addr}`;
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

/** Brand colors & SVG logos per provider */
const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#D97706',
  openai: '#10A37F',
  google: '#4285F4',
  grok: '#000000',
  xai: '#000000',
  qwen: '#7C3AED',
  openrouter: '#6366F1',
  deepseek: '#0EA5E9',
};

function ProviderLogo({ provider, size = 18 }: { provider: string; size?: number }) {
  const p = provider.toLowerCase();
  const color = PROVIDER_COLORS[p] ?? '#888';

  // Anthropic — abstract "A" mark (two crossing strokes)
  if (p === 'anthropic') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M14.2 3.5L21 20.5h-4.1L10.1 3.5h4.1z" fill={color} />
      <path d="M9.8 3.5L3 20.5h4.1l6.8-17h-4.1z" fill={color} />
    </svg>
  );

  // OpenAI — hexagonal knot
  if (p === 'openai') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" stroke={color} strokeWidth="1.4" />
      <path d="M12 2V22M2.5 7.5L21.5 16.5M21.5 7.5L2.5 16.5" stroke={color} strokeWidth="1.2" />
    </svg>
  );

  // Google — multicolor G
  if (p === 'google') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M22 12.23c0-.79-.07-1.55-.2-2.28H12v4.51h5.62a4.86 4.86 0 0 1-2.09 3.18v2.61h3.36C21.09 18.28 22 15.53 22 12.23z" fill="#4285F4" />
      <path d="M12 23c2.82 0 5.19-.94 6.92-2.54l-3.36-2.61c-.94.63-2.14 1-3.56 1-2.73 0-5.05-1.84-5.88-4.32H2.64v2.7A10.97 10.97 0 0 0 12 23z" fill="#34A853" />
      <path d="M6.12 14.53A6.62 6.62 0 0 1 5.77 12c0-.88.15-1.73.35-2.53v-2.7H2.64A10.97 10.97 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.94-2.42z" fill="#FBBC05" />
      <path d="M12 5.15c1.54 0 2.92.53 4.01 1.56l2.99-2.99C17.18 1.79 14.82.77 12 .77A10.97 10.97 0 0 0 2.64 6.77l3.48 2.7C6.95 7 9.27 5.15 12 5.15z" fill="#EA4335" />
    </svg>
  );

  // xAI / Grok — bold X
  if (p === 'grok' || p === 'xai') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4.5 4L12 12.5L19.5 4" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 20L12 11.5L19.5 20" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  // Qwen — cloud shape (Alibaba Cloud)
  if (p === 'qwen') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 19a4 4 0 0 1-.68-7.95A5.5 5.5 0 0 1 16.15 8 4.5 4.5 0 1 1 18 17H6z" fill={color} />
    </svg>
  );

  // OpenRouter — three connected nodes
  if (p === 'openrouter') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="5" r="2.5" fill={color} />
      <circle cx="5" cy="19" r="2.5" fill={color} />
      <circle cx="19" cy="19" r="2.5" fill={color} />
      <path d="M12 7.5V12M12 12L5.5 17M12 12L18.5 17" stroke={color} strokeWidth="1.8" />
    </svg>
  );

  // DeepSeek — whale tail / sea wave
  if (p === 'deepseek') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 12c2-4 5-6 9-6s7 2 9 6c-2 4-5 6-9 6s-7-2-9-6z" stroke={color} strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill={color} />
    </svg>
  );

  // Fallback — colored circle with first letter
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill={color} />
      <text x="12" y="16" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#fff">
        {provider.charAt(0).toUpperCase()}
      </text>
    </svg>
  );
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
* 1m drop ≥ 0.6% OR
* 5m drop ≥ 1.5%
OR sudden sell sweep removes top 2–3 bid levels within seconds.
No need for perfect confirmation. Speed matters.

ORDER BOOK LOGIC
If large bids appear immediately after sweep, treat as bounce setup.
If book is thin but spread tight, still allow entry (degen mode).
Ignore minor imbalance noise. Focus on liquidity reaction after flush.

ENTRY
* Deploy 30–50% of available capital per strong dip.
* Place 2–4 large layered buys instead of many small ones.
* Allow partial aggressive entries near best ask if bounce starts.
* Do not wait for perfect structure.

POSITION ESCALATION
If price bounces ≥ 0.3% after entry and OBI turns positive, allow one additional momentum add.
Do not average endlessly in freefall. Max 2 scale-ins.

INVALIDATION
Hard stop if:
* Price drops additional 1.5–2% below average entry
* Bid walls vanish and no replenishment
* Spread explodes abnormally
No emotional holding. Cut fast.

TAKE PROFIT
Fast exits:
* TP1: +0.4%
* TP2: +0.8%
* TP3: +1.5% if momentum strong
If rapid spike occurs (>1% in seconds), take profit aggressively into strength.
Time stop: If no bounce within 60–120 seconds, reduce exposure.

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

═══ GAS INFO ═══
Create order(from=ton): 0.022 TON
Create order(from=jetton): 0.026 TON
Close Order(): 0.006 TON

IMPORTANT: Each round-trip costs ~0.03 TON.
Only enter if expected move ≥ 0.8–1.0% to justify gas in degen mode.
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
If 1m candle is very red (≥ 0.7% down), shout internally "DISCOUNT!" and buy.
If order book shows a scary sell wall but tiny bids start appearing under it, assume whales are playing games and buy slightly above them.
If price nukes 1.5% fast, enter bigger because "panic creates opportunity."

POSITION SIZE
* Small dip: 20% balance
* Big scary dip: 35% balance
* Flash crash vibes: 45% balance
Never 100%. We are degen, not suicidal.

CONFIRMATION SIGNALS
* If Telegram chat would panic → buy.
* If chart looks ugly → buy faster.
* If bounce starts and you hesitated → FOMO buy smaller size.

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
═══ GAS INFO ═══
Create order(from=ton): 0.022 TON
Create order(from=jetton): 0.026 TON
Close Order(): 0.006 TON

Round-trip ≈ 0.03 TON.
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
    prompt: `You are a high-frequency scalper on TON. Use live data: {market_prices}, {wallet_balances}, {open_orders}, {order_book:TON/USDT,TON/NOT}, {price_changes}. Target small 1-3% gains per trade. Open and close positions quickly. Use the full portfolio but split across 2-3 simultaneous orders max. Prefer high-volume tokens with tight spreads. Use low slippage (1-2%). Close orders as soon as they reach target profit OR if they go 2% against you. Never hold positions longer than necessary. Check open orders before opening new ones — close stale ones first.

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
};

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [promptVars, setPromptVars] = useState<PromptVariable[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);

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

  // Non-bounceable friendly form for API registration
  const ownerAddressNonBounce = useMemo(
    () => ownerAddressParsed?.toString({ bounceable: false }) ?? null,
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

  const registerOnly = useCallback(async () => {
    setErr(null);
    if (!isConnected || !tonAddress || !ownerAddressNonBounce) {
      setErr('Connect a TON wallet first.');
      return;
    }
    if (!persisted.prompt.trim()) {
      setErr('Prompt cannot be empty.');
      return;
    }

    try {
      setBusy('register');
      const created = await registerRaceContract(raceCfg, {
        prompt: persisted.prompt,
        owner_address: ownerAddressNonBounce,
        ai_model: selectedModel,
        ...(selectedProvider ? { ai_provider: selectedProvider } : {}),
        ...(persisted.agentName?.trim() ? { name: persisted.agentName.trim() } : {}),
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
    ownerAddressNonBounce,
    persisted.prompt,
    persisted.agentName,
    raceCfg,
    selectedModel,
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
            amount: nanoFromTon(persisted.topupAmountTon),
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

    if (!ownerAddressNonBounce) {
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

      // 1. Register with backend — it creates the contract and returns the address
      const created = await registerRaceContract(raceCfg, {
        prompt: persisted.prompt,
        owner_address: ownerAddressNonBounce,
        ai_model: selectedModel,
        ...(selectedProvider ? { ai_provider: selectedProvider } : {}),
        ...(persisted.agentName?.trim() ? { name: persisted.agentName.trim() } : {}),
      });

      const contractAddr = created.address;
      setPersisted((p) => ({ ...p, contractAddress: contractAddr, raceContractId: created.id }));

      // 2. Deploy MintKeeper via the data returned by the backend
      //    Total = backend deploy fee + user-specified funds
      const userFundsNano = BigInt(nanoFromTon(persisted.deployAmountTon || '0'));
      const deployFeeNano = BigInt(created.value_nanoton);
      const totalNano = deployFeeNano + userFundsNano;

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [
          {
            address: created.mint_keeper_address,
            amount: String(totalNano),
            stateInit: hexBocToBase64(created.state_init_boc_hex),
            payload: hexBocToBase64(created.body_boc_hex),
          },
        ],
      });

      onContractRegistered?.(created.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [ownerAddressNonBounce, persisted, setPersisted, tonConnectUI, isConnected, tonAddress, raceCfg, selectedModel, selectedProvider, onContractRegistered]);

  const busyLabel = busy === 'deploy' ? 'Deploying contract...' : busy === 'register' ? 'Registering agent...' : busy === 'topup' ? 'Sending TON...' : null;
  const canRetryRegisterOnly = !!persisted.contractAddress && !persisted.raceContractId;

  return (
    <div className="mt-4 mx-auto max-w-2xl">
      <div className="card bg-base-200 shadow-md overflow-hidden">
        {/* Header */}
        <div className="border-b border-base-content/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/15">
              <Rocket className="h-4.5 w-4.5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Deploy New Agent</h2>
              <p className="text-xs opacity-40 mt-0.5">Configure, deploy on-chain, and enter the Trading Race</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Section 1: Choose AI Model */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-base-content/8 text-[10px] font-bold opacity-50">1</div>
              <span className="text-sm font-semibold">Choose AI Model</span>
              {modelsLoading && <span className="ml-1 loading loading-dots loading-xs" />}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {displayGroups.flatMap((group) =>
                group.models.map((m) => {
                  const modelProvider = m.provider?.trim() ?? '';
                  const isSelected =
                    selectedModel === m.id &&
                    (selectedProvider ?? '') === modelProvider;
                  const price = m.price ?? 0;
                  const currency = m.priceCurrency ?? 'TON';
                  return (
                    <button
                      key={`${modelProvider || 'p'}:${m.id}`}
                      type="button"
                      className={`
                        relative flex flex-col items-start gap-1.5 rounded-lg border-2 px-3 py-2.5
                        transition-all duration-150 text-left cursor-pointer
                        ${isSelected
                          ? 'border-success bg-success/5 shadow-sm'
                          : 'border-base-content/8 hover:border-base-content/20 hover:bg-base-300/30'
                        }
                      `}
                      onClick={() =>
                        setPersisted((p) => ({
                          ...p,
                          aiModel: m.id,
                          aiProvider: m.provider?.trim() || undefined,
                        }))
                      }
                      title={m.description ?? undefined}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-success text-success-content">
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="flex-shrink-0">
                          <ProviderLogo provider={modelProvider} size={20} />
                        </div>
                        <span className="text-sm font-bold leading-tight">{shortModelName(m.name)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {m.isThinking != null && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              m.isThinking
                                ? 'bg-info/15 text-info'
                                : 'bg-warning/15 text-warning'
                            }`}
                          >
                            {m.isThinking ? 'Thinking' : 'Fast'}
                          </span>
                        )}
                        <span className="text-[10px] opacity-40 ml-auto">
                          {price > 0 ? `${parseFloat(price.toFixed(4))} ${currency}` : `Free`}
                          {' '}<span className="opacity-70">(500 dec.)</span>
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="divider my-1 opacity-20" />

          {/* Section 2: Trading Strategy */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-base-content/8 text-[10px] font-bold opacity-50">2</div>
              <span className="text-sm font-semibold">Trading Strategy</span>
            </div>
            <div className="flex items-center justify-end mb-1.5">
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-ghost btn-xs gap-1 opacity-60 hover:opacity-100">
                  <FileText className="h-3 w-3" />
                  Use template
                  <ChevronDown className="h-3 w-3" />
                </div>
                <ul tabIndex={0} className="dropdown-content menu bg-base-300 rounded-box z-10 w-56 p-1 shadow-lg border border-base-content/10">
                  {STRATEGY_TEMPLATES.map((t) => (
                    <li key={t.name}>
                      <button
                        type="button"
                        className="text-xs"
                        onClick={() => {
                          setPersisted((p) => ({ ...p, prompt: t.prompt }));
                          // Close dropdown by blurring
                          (document.activeElement as HTMLElement)?.blur();
                        }}
                      >
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <textarea
              ref={promptRef}
              id="prompt"
              className={`textarea textarea-bordered w-full text-sm leading-relaxed ${persisted.prompt.length > 5000 ? 'textarea-error' : ''}`}
              value={persisted.prompt}
              onChange={(e) => setPersisted((p) => ({ ...p, prompt: e.target.value }))}
              placeholder="Describe your trading strategy..."
              rows={6}
              maxLength={5000}
            />
            <div className="flex justify-end mt-1">
              <span className={`mono text-[10px] ${persisted.prompt.length > 4800 ? (persisted.prompt.length > 5000 ? 'text-error' : 'text-warning') : 'opacity-30'}`}>
                {persisted.prompt.length} / 5000
              </span>
            </div>

            {/* Prompt Variables */}
            {promptVars.length > 0 && (
              <div className="mt-2 rounded-lg bg-base-300/50 border border-base-content/5 px-3 py-2.5">
                <div className="text-[10px] uppercase tracking-wider opacity-40 mb-2">
                  Available variables <span className="normal-case opacity-70">(click to insert)</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {promptVars.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className="btn btn-xs btn-ghost border border-base-content/10 hover:border-primary/40 hover:bg-primary/10 gap-1 font-mono transition-colors"
                      title={v.description}
                      onClick={() => insertPromptVar(v)}
                    >
                      <span className="text-primary/80">{`{${v.key}}`}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-1.5 text-[10px] opacity-30">
                  Variables are replaced with live data before each AI decision
                </div>
              </div>
            )}
          </div>

          <div className="divider my-1 opacity-20" />

          {/* Section 3: Name & Deploy */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-base-content/8 text-[10px] font-bold opacity-50">3</div>
              <span className="text-sm font-semibold">Name & Deploy</span>
            </div>

            {/* Agent Name */}
            <div>
              <label className="text-xs font-medium opacity-60 mb-1.5 block" htmlFor="agentName">
                Agent Name
              </label>
              <input
                id="agentName"
                type="text"
                className="input input-bordered w-full"
                value={persisted.agentName ?? ''}
                onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
                placeholder="e.g. Moon Hunter, Degen Alpha, TON Shark..."
                maxLength={40}
              />
            </div>

            <label className="text-xs opacity-50 block">Extra Funds (TON) <span className="opacity-60">— added on top of deploy fee</span></label>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost btn-sm btn-square"
                type="button"
                onClick={() => {
                  const cur = parseFloat(persisted.deployAmountTon || '0');
                  if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                }}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="text"
                className="input input-bordered flex-1 text-center mono text-lg font-semibold"
                value={persisted.deployAmountTon}
                onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))}
                inputMode="decimal"
                placeholder="5"
              />
              <button
                className="btn btn-ghost btn-sm btn-square"
                type="button"
                onClick={() => {
                  const cur = parseFloat(persisted.deployAmountTon || '0');
                  setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 text-[11px] opacity-40">
              <span>~0.6 TON deploy fee + your funds</span>
              <span className="opacity-40">&middot;</span>
              <span>Agent starts trading immediately</span>
            </div>

            <button
              className={`btn btn-success btn-lg w-full gap-2 text-base font-semibold shadow-md ${busy ? 'btn-disabled' : ''}`}
              onClick={() => void deployAndRegister()}
              type="button"
            >
              {busy ? (
                <span className="loading loading-spinner loading-sm" />
              ) : (
                <Rocket className="h-4.5 w-4.5" />
              )}
              {busyLabel ?? (
                parseFloat(persisted.deployAmountTon || '0') > 0
                  ? `Deploy + Fund ${persisted.deployAmountTon} TON`
                  : 'Deploy Agent'
              )}
            </button>

            {canRetryRegisterOnly && (
              <button
                className={`btn btn-ghost btn-sm w-full opacity-60 ${busy ? 'btn-disabled' : ''}`}
                onClick={() => void registerOnly()}
                type="button"
              >
                {busy === 'register' && <span className="loading loading-spinner loading-xs" />}
                Retry registration only
              </button>
            )}
          </div>

          {/* Contract Address (shown after deploy) */}
          {persisted.contractAddress && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-base-300/50 border border-base-content/5 px-3.5 py-2.5">
              <span className="text-xs opacity-50">Contract</span>
              <a
                className="mono text-xs link link-hover inline-flex items-center gap-1"
                href={explorerLink(persisted.contractAddress)}
                target="_blank"
                rel="noreferrer"
              >
                {fmtAddr(persisted.contractAddress)}
                <ExternalLink className="h-3 w-3 opacity-40" />
              </a>
            </div>
          )}

          {/* Top-up (collapsible, only after deploy) */}
          {persisted.contractAddress && (
            <>
              <div className="divider my-0 opacity-30" />
              <div>
                <button
                  className="btn btn-ghost btn-sm w-full justify-between font-normal opacity-60"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5" />
                    Add more funds
                  </span>
                  {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 flex gap-2">
                    <input
                      id="topupAmount"
                      type="text"
                      className="input input-bordered input-sm flex-1"
                      value={persisted.topupAmountTon}
                      onChange={(e) => setPersisted((p) => ({ ...p, topupAmountTon: e.target.value }))}
                      inputMode="decimal"
                      placeholder="Amount in TON"
                    />
                    <button
                      className={`btn btn-outline btn-sm ${busy ? 'btn-disabled' : ''}`}
                      onClick={() => void topUpExistingContract()}
                      type="button"
                    >
                      {busy === 'topup' ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        'Send TON'
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Error bar — sticks to bottom of card */}
        {err && (
          <div className="border-t border-error/20 bg-error/10 px-6 py-3">
            <p className="mono text-xs text-error">{err}</p>
          </div>
        )}

        {/* Wallet warning — sticks to bottom */}
        {!isConnected && (
          <div className="border-t border-warning/20 bg-warning/10 px-6 py-3">
            <p className="text-xs text-warning font-medium">Connect a TON wallet to deploy your agent.</p>
          </div>
        )}
      </div>
    </div>
  );
}
