import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address, beginCell } from '@ton/core';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket, Wallet, ChevronDown, ChevronUp, ExternalLink, Minus, Plus,
  FileText, Zap, Check, ArrowRight, Info, X,
} from 'lucide-react';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import {
  getRaceAiModels, getRaceTokens, getPromptVariables,
  registerRaceContract, generateStrategy, hexBocToBase64,
  type AiModelOption, type AiModelsByProvider, type PromptVariable,
  type PublicApiConfig, type RaceToken,
} from '@/lib/api';
import { cn } from '../utils/cn';

/* ---------- Jetton transfer ---------- */

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

async function resolveJettonWallet(ownerAddress: string, jettonMaster: string): Promise<string> {
  const res = await fetch(
    `https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(ownerAddress)}&jetton_address=${encodeURIComponent(jettonMaster)}&limit=1`,
  );
  const data = (await res.json()) as { jetton_wallets?: { address: string }[] };
  const addr = data.jetton_wallets?.[0]?.address;
  if (!addr) throw new Error('Jetton wallet not found \u2014 do you hold this token?');
  return addr;
}

/* ---------- Helpers ---------- */

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

function shortModelName(name: string): string {
  const sep = name.indexOf(' \u2014 ');
  return sep > 0 ? name.slice(0, sep).trim() : name;
}

/* ---------- Strategy templates ---------- */

type StrategyTemplate = { name: string; prompt: string };

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

const STRATEGY_TEMPLATES: StrategyTemplate[] = [
  { name: 'Aggressive Dip Buyer', prompt: AGGRESSIVE_DIP_BUYER },
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
];

/* ---------- Exported types ---------- */

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

/* ---------- Component ---------- */

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

  // Auto-fill first template
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

  const ownerAddressRaw = useMemo(
    () => ownerAddressParsed?.toRawString() ?? null,
    [ownerAddressParsed],
  );

  // Load AI models
  useEffect(() => {
    let cancelled = false;
    const loadModels = async () => {
      setModelsLoading(true);
      try {
        const grouped = await getRaceAiModels(raceCfg);
        if (!cancelled && grouped.length > 0) setAiModelGroups(grouped);
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
      const exact = aiModels.find((m) =>
        m.id === currentModel &&
        (m.provider ?? '').trim().toLowerCase() === (currentProvider ?? ''),
      );
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

  /* ---- registerOnly ---- */
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
  }, [isConnected, tonAddress, ownerAddressRaw, persisted.prompt, persisted.agentName, persisted.baseToken, persisted.quoteToken, raceCfg, selectedModelOption, selectedProvider, setPersisted, onContractRegistered]);

  /* ---- topUpExistingContract ---- */
  const topUpExistingContract = useCallback(async () => {
    setErr(null);
    if (!persisted.contractAddress) { setErr('Contract address is missing.'); return; }
    if (!isConnected) { setErr('Connect a TON wallet first.'); return; }
    if (parseFloat(persisted.topupAmountTon || '0') <= 0) { setErr('Top-up amount must be greater than 0 TON.'); return; }
    try {
      setBusy('topup');
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        messages: [{
          address: persisted.contractAddress,
          amount: nanoFromTon(String(parseFloat(persisted.topupAmountTon || '0') || 0)),
        }],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [persisted.contractAddress, persisted.topupAmountTon, isConnected, tonConnectUI]);

  /* ---- deployAndRegister ---- */
  const deployAndRegister = useCallback(async () => {
    setErr(null);
    if (!ownerAddressRaw) { setErr('Connect a TON wallet first.'); return; }
    if (!persisted.prompt.trim()) { setErr('Prompt cannot be empty.'); return; }
    if (!isConnected || !tonAddress) { setErr('Connect a TON wallet first.'); return; }
    const deployAmount = parseFloat(persisted.deployAmountTon || '0');
    if (deployAmount < 0) { setErr('Fund amount cannot be negative.'); return; }

    try {
      setBusy('deploy');
      let deployData: PendingDeploy;
      let contractId: string;

      if (persisted.raceContractId && persisted.pendingDeploy) {
        deployData = persisted.pendingDeploy;
        contractId = persisted.raceContractId;
      } else {
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

      const deployTonStr = String(Math.max(0, parseFloat(persisted.deployAmountTon || '0') || 0));
      const userFundsNano = BigInt(nanoFromTon(deployTonStr));
      const deployFeeNano = BigInt(Math.max(0, Math.floor(Number(deployData.value_nanoton) || 0)));
      const gasNano = BigInt(nanoFromTon('0.1'));
      const totalNano = deployFeeNano + gasNano + userFundsNano;

      const deployAddress = Address.parse(deployData.mint_keeper_address).toString({ bounceable: false });
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
            forwardTonAmount: 1n,
          });
          messages.push({
            address: Address.parse(jettonWallet).toString({ bounceable: true }),
            amount: nanoFromTon('0.065'),
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

      setPersisted((p) => ({ ...p, pendingDeploy: null }));
      onContractRegistered?.(contractId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [ownerAddressRaw, persisted, setPersisted, tonConnectUI, isConnected, tonAddress, raceCfg, selectedModelOption, selectedProvider, onContractRegistered]);

  const busyLabel = busy === 'deploy' ? 'Deploying contract...' : busy === 'register' ? 'Registering agent...' : busy === 'topup' ? 'Sending TON...' : null;
  const canRetryRegisterOnly = !!persisted.contractAddress && !persisted.raceContractId;
  const totalDeployTon = (0.6 + parseFloat(persisted.deployAmountTon || '0')).toFixed(1);
  const hasName = !!(persisted.agentName?.trim());
  const hasPair = !!(persisted.quoteToken);
  const hasStrategy = !!(persisted.prompt?.trim());

  return (
    <div className="mt-4 mx-auto max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="rounded-2xl border border-white/10 bg-gray-900/50 backdrop-blur-sm overflow-hidden"
      >
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00C389]/10">
              <Zap className="h-5 w-5 text-[#00C389]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">Deploy New Agent</h2>
              <p className="text-xs text-gray-400 mt-0.5">Configure, deploy on-chain, and enter the Trading Race</p>
            </div>
          </div>
        </div>

        <div className="px-6 pt-6 pb-6 space-y-6">
          {/* Section 1: Choose AI Model */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/10 text-[11px] font-bold text-[#00C389]">1</div>
              <span className="text-base font-bold text-white">Choose AI Model</span>
              {modelsLoading && <span className="ml-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#00C389] border-t-transparent" />}
            </div>

            {/* Collapsed: show selected model */}
            {!modelListOpen && selectedModelOption && (
              <button
                type="button"
                className={cn(
                  'flex items-center w-full text-left cursor-pointer rounded-lg border-2 border-[#00C389] p-2.5',
                  'bg-[#00C389]/5',
                )}
                onClick={() => setModelListOpen(true)}
              >
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-[10px] font-medium leading-tight text-gray-500 capitalize truncate">
                    {selectedModelOption.provider?.trim() || 'Unknown'}
                  </span>
                  <span className="text-xs font-bold leading-tight truncate text-white">
                    {shortModelName(selectedModelOption.name)}
                  </span>
                </div>
                <span
                  className={cn(
                    'ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full',
                    selectedModelOption.isThinking
                      ? 'bg-[#00C389]/10 text-[#00C389]'
                      : selectedModelOption.isThinking === false
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-[#00C389]/10 text-[#00C389]',
                  )}
                >
                  {selectedModelOption.isThinking ? 'Thinking' : selectedModelOption.isThinking === false ? 'Fast' : 'Balanced'}
                </span>
                {selectedModelOption.pricing?.[0] && (
                  <span className="flex-shrink-0 text-[11px] text-gray-500 ml-2 font-mono">
                    {selectedModelOption.pricing[0].price} {selectedModelOption.pricing[0].currency}/{selectedModelOption.pricing[0].cntDecisions} dec
                  </span>
                )}
                <ChevronDown className="flex-shrink-0 ml-2 h-3.5 w-3.5 text-gray-500" />
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
                      <motion.button
                        key={`${modelProvider || 'p'}:${m.id}`}
                        type="button"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        className={cn(
                          'flex items-center text-left cursor-pointer rounded-lg p-2.5 border transition-colors',
                          isSelected
                            ? 'border-[#00C389] bg-[#00C389]/5'
                            : 'border-white/10 hover:border-[#00C389]/50',
                        )}
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
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[10px] font-medium leading-tight text-gray-500 capitalize truncate">
                            {modelProvider || 'Unknown'}
                          </span>
                          <span className="text-xs font-bold leading-tight truncate text-white">
                            {shortModelName(m.name)}
                          </span>
                        </div>
                        {m.isThinking != null && (
                          <span
                            className={cn(
                              'ml-2 text-[10px] font-medium px-2 py-0.5 rounded-full',
                              m.isThinking
                                ? 'bg-[#00C389]/10 text-[#00C389]'
                                : 'bg-amber-500/10 text-amber-400',
                            )}
                          >
                            {m.isThinking ? 'Thinking' : 'Fast'}
                          </span>
                        )}
                        {lowestTier && (
                          <span className="flex-shrink-0 text-[10px] text-gray-500 ml-2 font-mono">
                            {lowestTier.price} {lowestTier.currency}/{lowestTier.cntDecisions}
                          </span>
                        )}
                        {isSelected && (
                          <div className="flex-shrink-0 ml-2 h-4 w-4 rounded-full bg-[#00C389] flex items-center justify-center">
                            <Check className="h-2.5 w-2.5 text-black" />
                          </div>
                        )}
                      </motion.button>
                    );
                  }),
                )}
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="h-px bg-white/5" />

          {/* Section 2: Trading Pair */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/10 text-[11px] font-bold text-[#00C389]">2</div>
              <span className="text-base font-bold text-white">Trading Pair</span>
              <span className="text-[10px] text-gray-500 ml-1">(1 pair per agent)</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Base token dropdown */}
              <div className="relative">
                <button
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-bold transition-all cursor-pointer border',
                    pickingSide === 'base'
                      ? 'ring-2 ring-[#00C389] border-[#00C389]'
                      : 'border-white/10 hover:ring-2 hover:ring-[#00C389]/50',
                    'bg-gray-900 text-white',
                  )}
                  onClick={() => setPickingSide(pickingSide === 'base' ? null : 'base')}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.baseToken ?? 'AGNT'] }} />
                  {persisted.baseToken ?? 'AGNT'}
                  <ChevronDown className="h-3 w-3 text-gray-500" />
                </button>
                {pickingSide === 'base' && (
                  <div className="absolute top-full left-0 mt-1 z-20 rounded-lg bg-gray-950 border border-white/10 shadow-lg py-1 min-w-[120px]">
                    {BASE_TOKENS.map((token) => {
                      const isSel = token === (persisted.baseToken ?? 'AGNT');
                      return (
                        <button
                          key={token}
                          type="button"
                          className={cn(
                            'flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors',
                            isSel && 'font-bold text-white',
                          )}
                          onClick={() => {
                            const curQuote = persisted.quoteToken;
                            const newQuotes = quotesForBase(token);
                            const keepQuote = curQuote && newQuotes.includes(curQuote) ? curQuote : newQuotes[0];
                            setPersisted((p) => ({ ...p, baseToken: token, quoteToken: keepQuote }));
                            setPickingSide(null);
                          }}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[token] ?? '#888' }} />
                          {token}
                          {isSel && <Check className="h-3.5 w-3.5 ml-auto text-[#00C389]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <span className="text-gray-500 text-sm font-bold">/</span>

              {/* Quote token dropdown */}
              <div className="relative">
                {persisted.quoteToken ? (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-bold transition-all cursor-pointer border',
                      pickingSide === 'quote'
                        ? 'ring-2 ring-[#00C389] border-[#00C389]'
                        : 'border-white/10 hover:ring-2 hover:ring-[#00C389]/50',
                      'bg-gray-900 text-white',
                    )}
                    onClick={() => setPickingSide(pickingSide === 'quote' ? null : 'quote')}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.quoteToken] ?? '#888' }} />
                    {persisted.quoteToken}
                    <ChevronDown className="h-3 w-3 text-gray-500" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold bg-[#00C389] text-black hover:bg-[#00C389]/90 transition-colors"
                    onClick={() => setPickingSide('quote')}
                  >
                    pick <ArrowRight className="h-3 w-3" />
                  </button>
                )}
                {pickingSide === 'quote' && (
                  <div className="absolute top-full left-0 mt-1 z-20 rounded-lg bg-gray-950 border border-white/10 shadow-lg py-1 min-w-[120px]">
                    {quotesForBase(persisted.baseToken ?? 'AGNT').map((token) => {
                      const isSel = token === persisted.quoteToken;
                      return (
                        <button
                          key={token}
                          type="button"
                          className={cn(
                            'flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-300 hover:bg-white/5 transition-colors',
                            isSel && 'font-bold text-white',
                          )}
                          onClick={() => {
                            setPersisted((p) => ({ ...p, quoteToken: token }));
                            setPickingSide(null);
                          }}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[token] ?? '#888' }} />
                          {token}
                          {isSel && <Check className="h-3.5 w-3.5 ml-auto text-[#00C389]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Separator */}
          <div className="h-px bg-white/5" />

          {/* Section 3: Trading Strategy */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/10 text-[11px] font-bold text-[#00C389]">3</div>
              <span className="text-base font-bold text-white">Trading Strategy</span>
            </div>
            <div className="flex items-center justify-end gap-1.5 mb-1.5">
              {isConnected && (
                <button
                  type="button"
                  disabled={generating}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white transition-colors rounded-md hover:bg-white/5 disabled:opacity-50"
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
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <Rocket className="h-3 w-3" />
                  )}
                  {generating ? 'Analyzing wallet...' : 'Auto-generate from wallet'}
                </button>
              )}
              {/* Template picker */}
              <div className="relative group">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-white transition-colors rounded-md hover:bg-white/5"
                >
                  <FileText className="h-3 w-3" />
                  Use template
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="hidden group-focus-within:block absolute top-full right-0 mt-1 z-20 rounded-lg bg-gray-950 border border-white/10 shadow-lg py-1 min-w-[220px]">
                  {STRATEGY_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-xs text-gray-300 hover:bg-white/5 transition-colors"
                      onClick={() => {
                        setPersisted((p) => ({ ...p, prompt: t.prompt }));
                        (document.activeElement as HTMLElement)?.blur();
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <textarea
              ref={promptRef}
              id="prompt"
              className={cn(
                'w-full text-sm leading-relaxed rounded-lg bg-gray-900 border border-white/10 text-white placeholder-gray-500 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#00C389]/50 focus:border-[#00C389] resize-y',
                persisted.prompt.length > 5000 && 'border-red-500',
              )}
              value={persisted.prompt}
              onChange={(e) => setPersisted((p) => ({ ...p, prompt: e.target.value }))}
              placeholder="Describe your trading strategy..."
              rows={6}
              maxLength={5000}
            />
            <div className="flex justify-end mt-1">
              <span className={cn(
                'font-mono text-[10px]',
                persisted.prompt.length > 5000 ? 'text-red-500' : persisted.prompt.length > 4800 ? 'text-amber-500' : 'text-gray-500',
              )}>
                {persisted.prompt.length} / 5000
              </span>
            </div>

            {/* Prompt Variables */}
            {promptVars.length > 0 && (
              <div className="mt-2 rounded-lg bg-gray-950/50 border border-white/5 px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">
                    Available variables <span className="normal-case opacity-70">(click to insert)</span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 h-6 px-2 text-gray-500 hover:text-white transition-colors rounded hover:bg-white/5"
                    onClick={() => setVarsHelpOpen(true)}
                  >
                    <Info className="h-3 w-3" />
                    <span className="text-[10px]">Help</span>
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {promptVars.map((v) => {
                    const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                    return (
                      <div key={v.key} className="group/var relative">
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-mono transition-colors',
                            inPrompt
                              ? 'border-[#00C389] bg-[#00C389]/10 text-[#00C389]'
                              : 'border-white/10 hover:border-[#00C389] hover:bg-[#00C389]/5 text-[#00C389]/70',
                          )}
                          onClick={() => insertPromptVar(v)}
                        >
                          <span>{`{${v.key}}`}</span>
                          {inPrompt && <Check className="h-3 w-3" />}
                        </button>
                        {v.description && (
                          <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 hidden group-hover/var:block z-20 whitespace-nowrap rounded-md bg-gray-950 text-white px-2 py-1 text-[10px] shadow-md border border-white/10">
                            {v.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 text-[10px] text-gray-500 flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00C389] animate-pulse shrink-0" />
                  Variables are replaced with live data before each AI decision
                </div>
              </div>
            )}
          </div>

          {/* Separator */}
          <div className="h-px bg-white/5" />

          {/* Section 4: Name & Fund */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/10 text-[11px] font-bold text-[#00C389]">4</div>
              <span className="text-base font-bold text-white">Name & Fund</span>
            </div>

            <input
              id="agentName"
              type="text"
              className="w-full rounded-lg bg-gray-900 border border-white/10 text-white placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C389]/50 focus:border-[#00C389]"
              value={persisted.agentName ?? ''}
              onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
              placeholder="Agent name, e.g. Moon Hunter"
              maxLength={40}
            />

            {/* Fund rows */}
            <div className="rounded-lg border border-white/10 overflow-hidden">
              {/* Extra TON */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS.TON }} />
                  <span className="text-sm font-semibold text-white">Extra TON</span>
                  <span className="text-[10px] text-gray-500">gas & fees</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={() => {
                      const cur = parseFloat(persisted.deployAmountTon || '0');
                      if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                    }}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    className="h-7 w-16 text-center font-mono font-semibold text-xs rounded-md bg-gray-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-[#00C389]/50"
                    value={persisted.deployAmountTon}
                    onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))}
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={() => {
                      const cur = parseFloat(persisted.deployAmountTon || '0');
                      setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* AGNT topup */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS.AGNT }} />
                  <span className="text-sm font-semibold text-white">AGNT topup</span>
                  <span className="text-[10px] text-gray-500">base capital</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={() => {
                      const cur = parseFloat(persisted.agntTopup || '0');
                      if (cur > 0) setPersisted((p) => ({ ...p, agntTopup: String(Math.max(0, cur - 1)) }));
                    }}
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <input
                    className="h-7 w-16 text-center font-mono font-semibold text-xs rounded-md bg-gray-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-[#00C389]/50"
                    value={persisted.agntTopup ?? '0'}
                    onChange={(e) => setPersisted((p) => ({ ...p, agntTopup: e.target.value }))}
                    inputMode="decimal"
                  />
                  <button
                    type="button"
                    className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                    onClick={() => {
                      const cur = parseFloat(persisted.agntTopup || '0');
                      setPersisted((p) => ({ ...p, agntTopup: String(cur + 1) }));
                    }}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Quote token topup */}
              {persisted.quoteToken && persisted.quoteToken !== 'AGNT' && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.quoteToken] ?? '#888' }} />
                    <span className="text-sm font-semibold text-white">{persisted.quoteToken} topup</span>
                    <span className="text-[10px] text-gray-500">quote capital</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => {
                        const cur = parseFloat(persisted.quoteTopup || '0');
                        if (cur > 0) setPersisted((p) => ({ ...p, quoteTopup: String(Math.max(0, cur - 1)) }));
                      }}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      className="h-7 w-16 text-center font-mono font-semibold text-xs rounded-md bg-gray-900 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-[#00C389]/50"
                      value={persisted.quoteTopup ?? '0'}
                      onChange={(e) => setPersisted((p) => ({ ...p, quoteTopup: e.target.value }))}
                      inputMode="decimal"
                    />
                    <button
                      type="button"
                      className="h-7 w-7 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                      onClick={() => {
                        const cur = parseFloat(persisted.quoteTopup || '0');
                        setPersisted((p) => ({ ...p, quoteTopup: String(cur + 1) }));
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* WHERE YOUR TON GOES */}
              <div className="border-t border-white/5 px-4 py-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Where your TON goes</div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00C389]" />
                    <span className="text-gray-400">AI service provider</span>
                    {selectedModelOption && (
                      <span className="text-gray-500">({shortModelName(selectedModelOption.name)})</span>
                    )}
                  </div>
                  <span className="font-mono text-gray-400">
                    {selectedModelOption?.pricing?.[0]
                      ? `${selectedModelOption.pricing[0].price} ${selectedModelOption.pricing[0].currency}/${selectedModelOption.pricing[0].cntDecisions} dec`
                      : '\u2014'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    <span className="text-gray-400">Service fee for deploying agent</span>
                  </div>
                  <span className="font-mono text-gray-400">~0.6 TON</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span className="text-gray-400">Gas</span>
                    <span className="text-gray-500">(stays on agent wallet for orders)</span>
                  </div>
                  <span className="font-mono text-gray-400">{persisted.deployAmountTon || '0'} TON</span>
                </div>
              </div>

              {/* Total */}
              <div className="border-t border-white/5 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-gray-500">Deploy ~0.6 TON + {persisted.deployAmountTon || '0'} TON gas</span>
                <span className="text-sm font-bold font-mono text-white">Total: {totalDeployTon} TON</span>
              </div>
            </div>

            {/* Footer note */}
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
              <Info className="h-3 w-3 shrink-0" />
              Tokens transferred to agent&apos;s on-chain wallet for <strong className="text-gray-300">{persisted.baseToken ?? 'AGNT'}/{persisted.quoteToken ?? '...'}</strong>. Signed via TonConnect.
            </div>

            {/* Validation checklist */}
            <div className="flex items-center gap-3 text-xs">
              <span className={hasName ? 'text-gray-300' : 'text-gray-600'}>&middot; Name</span>
              <span className={hasPair ? 'text-gray-300' : 'text-gray-600'}>&middot; Pair</span>
              <span className={hasStrategy ? 'text-gray-300' : 'text-gray-600'}>&middot; Strategy</span>
            </div>

            {/* Deploy button */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'w-full flex items-center justify-center gap-2 text-base font-semibold rounded-lg py-3 px-4 transition-colors shadow-md',
                busy
                  ? 'bg-[#00C389]/50 text-black/50 cursor-not-allowed'
                  : 'bg-[#00C389] text-black hover:bg-[#00C389]/90 cursor-pointer',
              )}
              disabled={!!busy}
              onClick={() => void deployAndRegister()}
            >
              {busy ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Rocket className="h-4.5 w-4.5" />
              )}
              {busyLabel ?? `Deploy \u00B7 ${totalDeployTon} TON`}
            </motion.button>

            {canRetryRegisterOnly && (
              <button
                type="button"
                className="w-full text-center text-sm py-2 text-gray-500 hover:text-white transition-colors rounded-md hover:bg-white/5 disabled:opacity-50"
                disabled={!!busy}
                onClick={() => void registerOnly()}
              >
                {busy === 'register' && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1" />}
                Retry registration only
              </button>
            )}

            <p className="text-center text-xs text-gray-500">Agent starts trading immediately</p>
          </div>

          {/* Contract Address (shown after deploy) */}
          {persisted.contractAddress && (
            <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-950/50 border border-white/5 px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Contract</span>
              <a
                className="font-mono text-xs text-[#00C389] hover:underline inline-flex items-center gap-1"
                href={explorerLink(persisted.contractAddress)}
                target="_blank"
                rel="noreferrer"
              >
                {fmtAddr(persisted.contractAddress)}
                <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            </div>
          )}

          {/* Top-up (collapsible, only after deploy) */}
          {persisted.contractAddress && (
            <>
              <div className="h-px bg-white/5" />
              <div>
                <button
                  type="button"
                  className="w-full flex items-center justify-between text-sm py-2 px-1 text-gray-500 hover:text-white transition-colors rounded-md"
                  onClick={() => setShowAdvanced(!showAdvanced)}
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
                      className="flex-1 h-8 rounded-lg bg-gray-900 border border-white/10 text-white placeholder-gray-500 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#00C389]/50 focus:border-[#00C389]"
                      value={persisted.topupAmountTon}
                      onChange={(e) => setPersisted((p) => ({ ...p, topupAmountTon: e.target.value }))}
                      inputMode="decimal"
                      placeholder="Amount in TON"
                    />
                    <button
                      type="button"
                      className="px-3 h-8 text-sm font-medium rounded-lg border border-white/10 text-gray-300 hover:bg-white/5 transition-colors disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() => void topUpExistingContract()}
                    >
                      {busy === 'topup' ? (
                        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
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

        {/* Error bar */}
        {err && (
          <div className="border-t border-red-500/20 bg-red-500/5 px-6 py-3">
            <p className="font-mono text-xs text-red-400">{err}</p>
          </div>
        )}

        {/* Wallet warning */}
        {!isConnected && (
          <div className="border-t border-amber-500/20 bg-amber-500/5 px-6 py-3">
            <p className="text-xs text-amber-400 font-medium">Connect a TON wallet to deploy your agent.</p>
          </div>
        )}
      </motion.div>

      {/* Variables Help Modal */}
      <AnimatePresence>
        {varsHelpOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={() => setVarsHelpOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="bg-gray-950 rounded-xl border border-white/10 shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 pb-0 mb-4">
                <h3 className="text-lg font-bold text-white">Variable Reference</h3>
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                  onClick={() => setVarsHelpOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="px-6 pb-6">
                <p className="text-xs text-gray-500 mb-4">
                  Variables are placeholders replaced with live data before each AI decision. Click a variable name to insert it into your strategy.
                </p>
                <div className="space-y-3">
                  {promptVars.map((v) => {
                    const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                    return (
                      <div key={v.key} className="rounded-lg border border-white/10 p-3">
                        <div className="flex items-center justify-between mb-1">
                          <button
                            type="button"
                            className={cn(
                              'font-mono text-sm font-bold',
                              inPrompt ? 'text-[#00C389]' : 'text-[#00C389]/70 hover:text-[#00C389]',
                            )}
                            onClick={() => { insertPromptVar(v); setVarsHelpOpen(false); }}
                          >
                            {`{${v.key}}`}
                            {inPrompt && <Check className="inline h-3.5 w-3.5 ml-1 text-[#00C389]" />}
                          </button>
                          {v.prompt_section && (
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 text-gray-400">{v.prompt_section}</span>
                          )}
                        </div>
                        {v.name && v.name !== v.key && (
                          <div className="text-xs font-semibold text-gray-300 mb-0.5">{v.name}</div>
                        )}
                        <div className="text-xs text-gray-500 leading-relaxed">{v.description}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
