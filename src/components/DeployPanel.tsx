import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Rocket, Wallet, ChevronDown, ChevronUp, ExternalLink, Minus, Plus, FileText, Zap, Check, ArrowRight, Info } from 'lucide-react';
import {
  nanoFromTon,
} from '@/lib/ton/agentWalletV5';
import { getRaceAiModels, getPromptVariables, registerRaceContract, generateStrategy, hexBocToBase64, type AiModelOption, type AiModelsByProvider, type PromptVariable, type PublicApiConfig } from '@/lib/api';

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
    prompt: `You are a high-frequency scalper on TON. Use live data: {market_prices}, {wallet_balances}, {open_orders}, {order_book}, {price_changes}. Target small 1-3% gains per trade. Open and close positions quickly. Use the full portfolio but split across 2-3 simultaneous orders max. Prefer high-volume tokens with tight spreads. Use low slippage (1-2%). Close orders as soon as they reach target profit OR if they go 2% against you. Never hold positions longer than necessary. Check open orders before opening new ones — close stale ones first.

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
      const userFundsNano = BigInt(nanoFromTon(persisted.deployAmountTon || '0'));
      const deployFeeNano = BigInt(deployData.value_nanoton);
      const gasNano = BigInt(nanoFromTon('0.1'));
      const totalNano = deployFeeNano + gasNano + userFundsNano;

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [
          {
            address: deployData.mint_keeper_address,
            amount: String(totalNano),
            stateInit: hexBocToBase64(deployData.state_init_boc_hex),
            payload: hexBocToBase64(deployData.body_boc_hex),
          },
        ],
      });

      // Transaction signed — clear pending state
      setPersisted((p) => ({ ...p, pendingDeploy: null }));
      onContractRegistered?.(contractId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [ownerAddressRaw, persisted, setPersisted, tonConnectUI, isConnected, tonAddress, raceCfg, selectedModel, selectedProvider, onContractRegistered]);

  const busyLabel = busy === 'deploy' ? 'Deploying contract...' : busy === 'register' ? 'Registering agent...' : busy === 'topup' ? 'Sending TON...' : null;
  const canRetryRegisterOnly = !!persisted.contractAddress && !persisted.raceContractId;

  const totalDeployTon = (0.6 + parseFloat(persisted.deployAmountTon || '0')).toFixed(1);
  const hasName = !!(persisted.agentName?.trim());
  const hasPair = !!(persisted.quoteToken);
  const hasStrategy = !!(persisted.prompt?.trim());

  return (
    <div className="mt-4 mx-auto max-w-2xl">
      <div className="card bg-base-200 shadow-md overflow-hidden">
        {/* Header */}
        <div className="border-b border-base-content/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
              <Zap className="h-5 w-5 text-success" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Deploy New Agent</h2>
              <p className="text-xs opacity-40 mt-0.5">Configure, deploy on-chain, and enter the Trading Race</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Section 1: Choose AI Model */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20 text-[11px] font-bold text-success">1</div>
              <span className="text-base font-bold">Choose AI Model</span>
              {modelsLoading && <span className="ml-1 loading loading-dots loading-xs" />}
            </div>

            {/* Collapsed: show selected model */}
            {!modelListOpen && selectedModelOption && (
              <button
                type="button"
                className="flex items-center w-full text-left cursor-pointer"
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '2px solid #1D9E75',
                  background: 'oklch(0.85 0.08 165 / 0.08)',
                }}
                onClick={() => setModelListOpen(true)}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] font-medium leading-tight opacity-50 capitalize truncate">
                    {selectedModelOption.provider?.trim() || 'Unknown'}
                  </span>
                  <span className="text-xs font-bold leading-tight truncate">
                    {shortModelName(selectedModelOption.name)}
                  </span>
                </div>
                <span
                  className="flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ml-2"
                  style={
                    selectedModelOption.isThinking
                      ? { background: '#E6F1FB', color: '#185FA5' }
                      : selectedModelOption.isThinking === false
                        ? { background: '#FAEEDA', color: '#854F0B' }
                        : { background: '#D4EDDA', color: '#155724' }
                  }
                >
                  {selectedModelOption.isThinking ? 'Thinking' : selectedModelOption.isThinking === false ? 'Fast' : 'Balanced'}
                </span>
                {selectedModelOption.pricing?.[0] && (
                  <span className="flex-shrink-0 text-[11px] opacity-40 ml-2 mono">
                    {selectedModelOption.pricing[0].price} {selectedModelOption.pricing[0].currency}/{selectedModelOption.pricing[0].cntDecisions} dec
                  </span>
                )}
                <svg className="flex-shrink-0 ml-2 opacity-40" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            )}

            {/* Expanded: show all models */}
            {modelListOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 6 }}>
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
                        className="flex items-center text-left cursor-pointer"
                        style={{
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: isSelected ? '2px solid #1D9E75' : '0.5px solid oklch(var(--bc) / 0.12)',
                          background: isSelected ? 'oklch(0.85 0.08 165 / 0.08)' : 'transparent',
                        }}
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
                        {/* Provider + model name */}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[10px] font-medium leading-tight opacity-50 capitalize truncate">
                            {modelProvider || 'Unknown'}
                          </span>
                          <span className="text-xs font-bold leading-tight truncate">
                            {shortModelName(m.name)}
                          </span>
                        </div>
                        {/* Speed badge */}
                        {m.isThinking != null && (
                          <span
                            className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ml-2"
                            style={
                              m.isThinking
                                ? { background: '#E6F1FB', color: '#185FA5' }
                                : { background: '#FAEEDA', color: '#854F0B' }
                            }
                          >
                            {m.isThinking ? 'Thinking' : 'Fast'}
                          </span>
                        )}
                        {/* Price */}
                        {lowestTier && (
                          <span className="flex-shrink-0 text-[10px] opacity-40 ml-2 mono">
                            {lowestTier.price} {lowestTier.currency}/{lowestTier.cntDecisions}
                          </span>
                        )}
                        {/* Checkmark */}
                        {isSelected && (
                          <svg className="flex-shrink-0 ml-2" width={16} height={16} viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="11" fill="#1D9E75" />
                            <path d="M7 12.5l3 3 7-7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="my-2" />

          {/* Section 2: Trading Pair */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20 text-[11px] font-bold text-success">2</div>
              <span className="text-base font-bold">Trading Pair</span>
              <span className="text-[10px] opacity-40 ml-1">(1 pair per agent)</span>
            </div>

            {/* Selected pair display — click either side to pick */}
            <div className="flex items-center gap-2 mb-3">
              {/* Base token — click to switch to picking base */}
              {pickingSide === 'base' ? (
                <button type="button" className="btn btn-sm btn-primary rounded-full gap-1 px-3" onClick={() => setPickingSide(null)}>
                  pick <ArrowRight className="h-3 w-3" />
                </button>
              ) : (persisted.baseToken ?? 'AGNT') ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ background: 'oklch(var(--bc) / 0.08)' }}
                  onClick={() => setPickingSide('base')}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.baseToken ?? 'AGNT'] }} />
                  {persisted.baseToken ?? 'AGNT'}
                </button>
              ) : null}

              <span className="opacity-40">/</span>

              {/* Quote token — click to switch to picking quote */}
              {pickingSide === 'quote' ? (
                <button type="button" className="btn btn-sm btn-primary rounded-full gap-1 px-3" onClick={() => setPickingSide(null)}>
                  pick <ArrowRight className="h-3 w-3" />
                </button>
              ) : persisted.quoteToken ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ background: 'oklch(var(--bc) / 0.08)' }}
                  onClick={() => setPickingSide('quote')}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.quoteToken] ?? '#888' }} />
                  {persisted.quoteToken}
                </button>
              ) : (
                <button type="button" className="btn btn-sm btn-primary rounded-full gap-1 px-3" onClick={() => setPickingSide('quote')}>
                  pick <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Token picker pills — picks base or quote depending on pickingSide */}
            <div className="flex flex-wrap gap-2 mb-2">
              {(() => {
                const curBase = persisted.baseToken ?? 'AGNT';
                const curQuote = persisted.quoteToken;
                const options = pickingSide === 'base' ? BASE_TOKENS : quotesForBase(curBase);
                return options.map((token) => {
                  const isSelected = pickingSide === 'base' ? token === curBase : token === curQuote;
                  return (
                    <button
                      key={token}
                      type="button"
                      className={`btn btn-sm rounded-full px-4 gap-1.5 ${
                        isSelected ? 'btn-primary' : 'btn-ghost border border-base-content/15'
                      }`}
                      onClick={() => {
                        if (pickingSide === 'base') {
                          const newQuotes = quotesForBase(token);
                          const keepQuote = curQuote && newQuotes.includes(curQuote) ? curQuote : newQuotes[0];
                          setPersisted((p) => ({ ...p, baseToken: token, quoteToken: keepQuote }));
                        } else {
                          setPersisted((p) => ({ ...p, quoteToken: token }));
                        }
                        setPickingSide(null);
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: TOKEN_COLORS[token] ?? '#888' }} />
                      {token}
                    </button>
                  );
                });
              })()}
            </div>

          </div>

          <div className="my-2" />

          {/* Section 3: Trading Strategy */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20 text-[11px] font-bold text-success">3</div>
              <span className="text-base font-bold">Trading Strategy</span>
            </div>
            <div className="flex items-center justify-end gap-1.5 mb-1.5">
              {isConnected && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs gap-1 opacity-60 hover:opacity-100"
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
                    <span className="loading loading-spinner loading-xs" />
                  ) : (
                    <Rocket className="h-3 w-3" />
                  )}
                  {generating ? 'Analyzing wallet...' : 'Auto-generate from wallet'}
                </button>
              )}
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
                  {promptVars.map((v) => {
                    const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                    return (
                      <button
                        key={v.key}
                        type="button"
                        className={`btn btn-xs gap-1 font-mono transition-colors ${
                          inPrompt
                            ? 'btn-primary border-primary/40'
                            : 'btn-ghost border border-base-content/10 hover:border-primary/40 hover:bg-primary/10'
                        }`}
                        title={v.description}
                        onClick={() => insertPromptVar(v)}
                      >
                        <span className={inPrompt ? '' : 'text-primary/80'}>{`{${v.key}}`}</span>
                        {inPrompt && <Check className="h-3 w-3" />}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 text-[10px] opacity-30 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse shrink-0" />
                  Variables are replaced with live data before each AI decision — prices sync every 10s
                </div>
              </div>
            )}
          </div>

          <div className="my-2" />

          {/* Section 4: Name & Fund */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20 text-[11px] font-bold text-success">4</div>
              <span className="text-base font-bold">Name & Fund</span>
            </div>

            {/* Agent Name */}
            <input
              id="agentName"
              type="text"
              className="input input-bordered w-full"
              value={persisted.agentName ?? ''}
              onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
              placeholder="Agent name, e.g. Moon Hunter"
              maxLength={40}
            />

            {/* Fund rows */}
            <div className="rounded-lg border border-base-content/10 overflow-hidden">
              {/* Extra TON */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS.TON }} />
                  <span className="text-sm font-semibold">Extra TON</span>
                  <span className="text-[10px] opacity-40">gas & fees</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="btn btn-ghost btn-xs btn-square" type="button" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                  }}><Minus className="h-3 w-3" /></button>
                  <input type="text" className="input input-bordered input-sm w-16 text-center mono font-semibold" value={persisted.deployAmountTon} onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))} inputMode="decimal" />
                  <button className="btn btn-ghost btn-xs btn-square" type="button" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                  }}><Plus className="h-3 w-3" /></button>
                </div>
              </div>

              {/* AGNT topup */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-base-content/5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS.AGNT }} />
                  <span className="text-sm font-semibold">AGNT topup</span>
                  <span className="text-[10px] opacity-40">base capital</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="btn btn-ghost btn-xs btn-square" type="button" onClick={() => {
                    const cur = parseFloat(persisted.agntTopup || '0');
                    if (cur > 0) setPersisted((p) => ({ ...p, agntTopup: String(Math.max(0, cur - 1)) }));
                  }}><Minus className="h-3 w-3" /></button>
                  <input type="text" className="input input-bordered input-sm w-16 text-center mono font-semibold" value={persisted.agntTopup ?? '0'} onChange={(e) => setPersisted((p) => ({ ...p, agntTopup: e.target.value }))} inputMode="decimal" />
                  <button className="btn btn-ghost btn-xs btn-square" type="button" onClick={() => {
                    const cur = parseFloat(persisted.agntTopup || '0');
                    setPersisted((p) => ({ ...p, agntTopup: String(cur + 1) }));
                  }}><Plus className="h-3 w-3" /></button>
                </div>
              </div>

              {/* Quote token topup */}
              {persisted.quoteToken && persisted.quoteToken !== 'AGNT' && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-base-content/5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.quoteToken] ?? '#888' }} />
                    <span className="text-sm font-semibold">{persisted.quoteToken} topup</span>
                    <span className="text-[10px] opacity-40">quote capital</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="btn btn-ghost btn-xs btn-square" type="button" onClick={() => {
                      const cur = parseFloat(persisted.quoteTopup || '0');
                      if (cur > 0) setPersisted((p) => ({ ...p, quoteTopup: String(Math.max(0, cur - 1)) }));
                    }}><Minus className="h-3 w-3" /></button>
                    <input type="text" className="input input-bordered input-sm w-16 text-center mono font-semibold" value={persisted.quoteTopup ?? '0'} onChange={(e) => setPersisted((p) => ({ ...p, quoteTopup: e.target.value }))} inputMode="decimal" />
                    <button className="btn btn-ghost btn-xs btn-square" type="button" onClick={() => {
                      const cur = parseFloat(persisted.quoteTopup || '0');
                      setPersisted((p) => ({ ...p, quoteTopup: String(cur + 1) }));
                    }}><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
              )}

              {/* WHERE YOUR TON GOES */}
              <div className="border-t border-base-content/10 px-4 py-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold opacity-40">Where your TON goes</div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span className="opacity-60">AI service provider</span>
                    {selectedModelOption && (
                      <span className="opacity-40">({shortModelName(selectedModelOption.name)})</span>
                    )}
                  </div>
                  <span className="mono opacity-60">
                    {selectedModelOption?.pricing?.[0]
                      ? `${selectedModelOption.pricing[0].price} ${selectedModelOption.pricing[0].currency}/${selectedModelOption.pricing[0].cntDecisions} dec`
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    <span className="opacity-60">Service fee for deploying agent</span>
                  </div>
                  <span className="mono opacity-60">~0.6 TON</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span className="opacity-60">Gas</span>
                    <span className="opacity-30">(stays on agent wallet for orders)</span>
                  </div>
                  <span className="mono opacity-60">{persisted.deployAmountTon || '0'} TON</span>
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-base-content/10 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs opacity-50">Deploy ~0.6 TON &nbsp;+ {persisted.deployAmountTon || '0'} TON gas</span>
                <span className="text-sm font-bold mono">Total: {totalDeployTon} TON</span>
              </div>
            </div>

            {/* Footer note */}
            <div className="flex items-center gap-1.5 text-[10px] opacity-40">
              <Info className="h-3 w-3 shrink-0" />
              Tokens transferred to agent&apos;s on-chain wallet for <strong className="opacity-70">{persisted.baseToken ?? 'AGNT'}/{persisted.quoteToken ?? '...'}</strong>. Signed via TonConnect.
            </div>

            {/* Validation checklist */}
            <div className="flex items-center gap-3 text-xs">
              <span className={hasName ? 'opacity-80' : 'opacity-30'}>&middot; Name</span>
              <span className={hasPair ? 'opacity-80' : 'opacity-30'}>&middot; Pair</span>
              <span className={hasStrategy ? 'opacity-80' : 'opacity-30'}>&middot; Strategy</span>
            </div>

            {/* Deploy button */}
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
              {busyLabel ?? `Deploy \u00B7 ${totalDeployTon} TON`}
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

            <p className="text-center text-xs opacity-40">Agent starts trading immediately</p>
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
