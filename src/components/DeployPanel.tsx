import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Rocket, Wallet, ChevronDown, ChevronUp, ExternalLink, Minus, Plus, FileText } from 'lucide-react';
import { agentKeypairFromSecretOrSeedHex, generateAgentKeypair } from '@/lib/crypto';
import { sha256BigInt } from '@/lib/hash';
import {
  agentWalletV5Address,
  agentWalletV5StateInitBocBase64,
  nanoFromTon,
} from '@/lib/ton/agentWalletV5';
import { getRaceAiModels, getPromptVariables, registerRaceContract, type AiModelOption, type PromptVariable, type PublicApiConfig } from '@/lib/api';

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

import type { PendingDeploy } from '../App';

type DeployPanelProps = {
  persisted: Persisted;
  setPersisted: React.Dispatch<React.SetStateAction<Persisted>>;
  raceCfg: PublicApiConfig;
  onContractRegistered?: (contractId: string) => void;
  setPendingDeploy?: React.Dispatch<React.SetStateAction<PendingDeploy | null>>;
};

export function DeployPanel({ persisted, setPersisted, raceCfg, onContractRegistered, setPendingDeploy }: DeployPanelProps) {
  const wallet = useTonWallet();
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiModels, setAiModels] = useState<AiModelOption[]>(FALLBACK_AI_MODELS);
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

  const agentPublicKeyHexRaw = (persisted as Partial<Persisted>).agentPublicKeyHex;
  const agentSecretKeyHexRaw = (persisted as Partial<Persisted>).agentSecretKeyHex;

  const agentPublicKeyOk = useMemo(() => /^[0-9a-fA-F]{64}$/.test((agentPublicKeyHexRaw ?? '').trim()), [agentPublicKeyHexRaw]);
  const agentSecretKeyOk = useMemo(
    () => /^[0-9a-fA-F]{64}$/.test((agentSecretKeyHexRaw ?? '').trim()) || /^[0-9a-fA-F]{128}$/.test((agentSecretKeyHexRaw ?? '').trim()),
    [agentSecretKeyHexRaw],
  );

  // Auto-generate keys if missing
  useEffect(() => {
    const pubRaw = typeof agentPublicKeyHexRaw === 'string' ? agentPublicKeyHexRaw.trim() : '';
    const secRaw = typeof agentSecretKeyHexRaw === 'string' ? agentSecretKeyHexRaw.trim() : '';
    const pubOk = /^[0-9a-fA-F]{64}$/.test(pubRaw);
    const secOk = /^[0-9a-fA-F]{64}$/.test(secRaw) || /^[0-9a-fA-F]{128}$/.test(secRaw);

    if (pubOk && secOk) return;

    if (!pubOk && !secOk) {
      const kp = generateAgentKeypair();
      setPersisted((p) => ({
        ...p,
        agentPublicKeyHex: kp.publicKeyHex,
        agentSecretKeyHex: kp.secretKeyHex,
        contractAddress: null,
        raceContractId: null,
      }));
      return;
    }

    if (!pubOk && secOk) {
      const derived = agentKeypairFromSecretOrSeedHex(secRaw);
      if (!derived) return;
      setPersisted((p) => ({
        ...p,
        agentPublicKeyHex: derived.publicKeyHex,
        agentSecretKeyHex: secRaw,
        contractAddress: null,
        raceContractId: null,
      }));
    }
  }, [agentPublicKeyHexRaw, agentSecretKeyHexRaw, setPersisted]);

  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const grouped = await getRaceAiModels(raceCfg);
        const all = grouped.flatMap((g) => g.models);
        const seen = new Set<string>();
        const unique = all.filter((m) => {
          const id = m.id.trim();
          const provider = (m.provider ?? '').trim().toLowerCase();
          const key = `${provider}::${id.toLowerCase()}`;
          if (!id || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (!cancelled && unique.length > 0) {
          setAiModels(unique);
        }
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    };
    void loadModels();
    return () => {
      cancelled = true;
    };
  }, [raceCfg]);

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

  const registerOnly = useCallback(async (addressToRegister: string) => {
    setErr(null);
    if (!isConnected || !tonAddress || !ownerAddressNonBounce) {
      setErr('Connect a TON wallet first.');
      return;
    }
    if (!agentPublicKeyOk || !agentSecretKeyOk) {
      setErr('Agent keys are invalid. Please refresh the page.');
      return;
    }
    if (!persisted.prompt.trim()) {
      setErr('Prompt cannot be empty.');
      return;
    }

    try {
      setBusy('register');
      const created = await registerRaceContract(raceCfg, {
        address: addressToRegister,
        public_key: persisted.agentPublicKeyHex,
        secret_key: persisted.agentSecretKeyHex,
        wallet_id: 0,
        prompt: persisted.prompt,
        owner_address: ownerAddressNonBounce,
        ai_model: selectedModel,
        ...(selectedProvider ? { ai_provider: selectedProvider } : {}),
        ...(persisted.agentName?.trim() ? { name: persisted.agentName.trim() } : {}),
      });
      setPersisted((p) => ({ ...p, contractAddress: addressToRegister, raceContractId: created.id }));
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
    agentPublicKeyOk,
    agentSecretKeyOk,
    persisted.prompt,
    persisted.agentPublicKeyHex,
    persisted.agentSecretKeyHex,
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

    if (!ownerAddressParsed || !ownerAddressNonBounce) {
      setErr('Connect a TON wallet first.');
      return;
    }
    if (!agentPublicKeyOk || !agentSecretKeyOk) {
      setErr('Agent keys are invalid. Please refresh the page.');
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
    if (deployAmount < 1) {
      setErr('Minimum deploy amount is 1 TON.');
      return;
    }

    try {
      setBusy('deploy');
      const promptHash = await sha256BigInt(persisted.prompt);
      const addr = agentWalletV5Address({
        ownerAddress: ownerAddressParsed,
        walletId: 0,
        publicKeyHex: persisted.agentPublicKeyHex,
        promptHash,
      });
      const addrStr = addr.toString({ bounceable: true });
      const stateInit = agentWalletV5StateInitBocBase64({
        ownerAddress: ownerAddressParsed,
        walletId: 0,
        publicKeyHex: persisted.agentPublicKeyHex,
        promptHash,
      });

      setPersisted((p) => ({ ...p, contractAddress: addrStr, raceContractId: null }));

      // Save pending deploy BEFORE sending tx — so if window closes after tx but before
      // backend registration, we can auto-retry on next visit
      setPendingDeploy?.({
        address: addrStr,
        publicKey: persisted.agentPublicKeyHex,
        secretKey: persisted.agentSecretKeyHex,
        prompt: persisted.prompt,
        ownerAddress: ownerAddressNonBounce,
        aiModel: selectedModel,
        aiProvider: selectedProvider,
        name: persisted.agentName?.trim() || undefined,
        createdAt: Date.now(),
      });

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [
          {
            address: addrStr,
            amount: nanoFromTon(persisted.deployAmountTon || '1'),
            stateInit,
          },
        ],
      });

      await registerOnly(addrStr);
      // Clear pending after successful registration
      setPendingDeploy?.(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [ownerAddressParsed, ownerAddressNonBounce, agentPublicKeyOk, agentSecretKeyOk, persisted, setPersisted, tonConnectUI, isConnected, tonAddress, registerOnly]);

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

          {/* AI Model Selection */}
          <div>
            <label className="text-xs font-medium opacity-60 mb-1.5 block">
              AI Model
              {modelsLoading && <span className="ml-2 loading loading-dots loading-xs" />}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {aiModels.map((m) => {
                const modelProvider = m.provider?.trim() ?? '';
                const isSelected = (
                  selectedModel === m.id &&
                  (selectedProvider ?? '') === modelProvider
                );
                return (
                <button
                  key={`${modelProvider || 'provider'}:${m.id}`}
                  className={`
                    btn btn-sm border transition-all duration-150
                    ${isSelected
                      ? 'btn-primary shadow-sm'
                      : 'btn-ghost border-base-content/10 hover:border-base-content/20'
                    }
                  `}
                  type="button"
                  onClick={() => setPersisted((p) => ({ ...p, aiModel: m.id, aiProvider: m.provider?.trim() || undefined }))}
                  title={m.description ?? undefined}
                >
                  <span className="text-xs">{m.name}</span>
                  {m.provider && <span className="text-[10px] opacity-70">({m.provider})</span>}
                </button>
                );
              })}
            </div>
          </div>

          {/* Trading Strategy */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium opacity-60" htmlFor="prompt">
                Trading Strategy
              </label>
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

          {/* Separator */}
          <div className="divider my-0 opacity-30" />

          {/* Initial Balance + Deploy */}
          <div className="space-y-3">
            <label className="text-xs font-medium opacity-60 block">
              Initial Balance (TON)
            </label>
            <div className="flex items-center gap-2">
              <button
                className="btn btn-ghost btn-sm btn-square"
                type="button"
                onClick={() => {
                  const cur = parseFloat(persisted.deployAmountTon || '1');
                  if (cur > 1) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(1, cur - 1)) }));
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
                  const cur = parseFloat(persisted.deployAmountTon || '1');
                  setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center justify-center gap-3 text-[11px] opacity-40">
              <span>Includes deploy fee</span>
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
              {busyLabel ?? `Deploy with ${persisted.deployAmountTon || '1'} TON`}
            </button>

            {canRetryRegisterOnly && (
              <button
                className={`btn btn-ghost btn-sm w-full opacity-60 ${busy ? 'btn-disabled' : ''}`}
                onClick={() => void registerOnly(persisted.contractAddress!)}
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
