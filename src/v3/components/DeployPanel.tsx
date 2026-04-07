import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { Address, beginCell } from '@ton/core';
import {
  Rocket, Wallet, ChevronDown, ChevronUp, ExternalLink,
  Minus, Plus, FileText, Zap, Check, ArrowRight, Info,
} from 'lucide-react';
import { nanoFromTon } from '@/lib/ton/agentWalletV5';
import {
  getRaceAiModels, getRaceTokens, getPromptVariables,
  registerRaceContract, generateStrategy, hexBocToBase64,
  type AiModelOption, type AiModelsByProvider, type PromptVariable,
  type PublicApiConfig, type RaceToken,
} from '@/lib/api';

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
  const sep = name.indexOf(' — ');
  return sep > 0 ? name.slice(0, sep).trim() : name;
}

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
];

/* ---------- exported types ---------- */

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

/* ---------- component ---------- */

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

  // Auto-fill first template when prompt is empty
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

  /* ---------- register only ---------- */
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

  /* ---------- top up existing ---------- */
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

  /* ---------- deploy and register ---------- */
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
    <div className="mx-auto mt-6 max-w-2xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-xl border border-white/5 bg-gray-900/80 backdrop-blur-sm"
      >
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#00C389]/20">
              <Zap className="h-5 w-5 text-[#00C389]" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Deploy New Agent</h2>
              <p className="mt-0.5 text-xs text-gray-500">Configure, deploy on-chain, and enter the Trading Race</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* Section 1: Choose AI Model */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/20 text-[11px] font-bold text-[#00C389]">1</div>
              <span className="text-base font-bold text-white">Choose AI Model</span>
              {modelsLoading && (
                <div className="ml-1 h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-[#00C389]" />
              )}
            </div>

            {/* Collapsed */}
            {!modelListOpen && selectedModelOption && (
              <button
                type="button"
                className="flex w-full cursor-pointer items-center rounded-lg border-2 border-[#00C389]/50 bg-[#00C389]/5 px-3 py-2.5 text-left transition-colors hover:bg-[#00C389]/10"
                onClick={() => setModelListOpen(true)}
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[10px] font-medium capitalize text-gray-500">
                    {selectedModelOption.provider?.trim() || 'Unknown'}
                  </span>
                  <span className="truncate text-xs font-bold text-white">
                    {shortModelName(selectedModelOption.name)}
                  </span>
                </div>
                <span
                  className="ml-2 flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                  style={
                    selectedModelOption.isThinking
                      ? { background: 'rgba(24,95,165,0.15)', color: '#5BA7E8' }
                      : selectedModelOption.isThinking === false
                        ? { background: 'rgba(133,79,11,0.15)', color: '#D4A04E' }
                        : { background: 'rgba(0,195,137,0.15)', color: '#00C389' }
                  }
                >
                  {selectedModelOption.isThinking ? 'Thinking' : selectedModelOption.isThinking === false ? 'Fast' : 'Balanced'}
                </span>
                {selectedModelOption.pricing?.[0] && (
                  <span className="ml-2 flex-shrink-0 font-mono text-[11px] text-gray-500">
                    {selectedModelOption.pricing[0].price} {selectedModelOption.pricing[0].currency}/{selectedModelOption.pricing[0].cntDecisions} dec
                  </span>
                )}
                <ChevronDown className="ml-2 h-3.5 w-3.5 flex-shrink-0 text-gray-500" />
              </button>
            )}

            {/* Expanded grid */}
            <AnimatePresence>
              {modelListOpen && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
                >
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
                          className={`flex items-center rounded-lg border px-3 py-2.5 text-left transition-all ${
                            isSelected
                              ? 'border-[#00C389]/50 bg-[#00C389]/5'
                              : 'border-white/5 bg-transparent hover:border-white/10 hover:bg-white/[0.02]'
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
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate text-[10px] font-medium capitalize text-gray-500">
                              {modelProvider || 'Unknown'}
                            </span>
                            <span className="truncate text-xs font-bold text-white">
                              {shortModelName(m.name)}
                            </span>
                          </div>
                          {m.isThinking != null && (
                            <span
                              className="ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={
                                m.isThinking
                                  ? { background: 'rgba(24,95,165,0.15)', color: '#5BA7E8' }
                                  : { background: 'rgba(133,79,11,0.15)', color: '#D4A04E' }
                              }
                            >
                              {m.isThinking ? 'Thinking' : 'Fast'}
                            </span>
                          )}
                          {lowestTier && (
                            <span className="ml-2 flex-shrink-0 font-mono text-[10px] text-gray-600">
                              {lowestTier.price} {lowestTier.currency}/{lowestTier.cntDecisions}
                            </span>
                          )}
                          {isSelected && (
                            <div className="ml-2 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[#00C389]">
                              <Check className="h-2.5 w-2.5 text-black" />
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Section 2: Trading Pair */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/20 text-[11px] font-bold text-[#00C389]">2</div>
              <span className="text-base font-bold text-white">Trading Pair</span>
              <span className="ml-1 text-[10px] text-gray-600">(1 pair per agent)</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Base token dropdown */}
              <div className="relative">
                <button
                  type="button"
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-2.5 text-sm font-bold text-white transition-all ${
                    pickingSide === 'base' ? 'border-[#00C389]/50 bg-[#00C389]/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                  onClick={() => setPickingSide(pickingSide === 'base' ? null : 'base')}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.baseToken ?? 'AGNT'] }} />
                  {persisted.baseToken ?? 'AGNT'}
                  <ChevronDown className="h-3 w-3 text-gray-500" />
                </button>
                {pickingSide === 'base' && (
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-white/10 bg-gray-900 py-1 shadow-xl">
                    {BASE_TOKENS.map((token) => {
                      const isSelected = token === (persisted.baseToken ?? 'AGNT');
                      return (
                        <button
                          key={token}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isSelected ? 'font-bold text-white' : 'text-gray-300'}`}
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
                          {isSelected && <Check className="ml-auto h-3.5 w-3.5 text-[#00C389]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <span className="text-sm font-bold text-gray-600">/</span>

              {/* Quote token dropdown */}
              <div className="relative">
                {persisted.quoteToken ? (
                  <button
                    type="button"
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-3 pr-2.5 text-sm font-bold text-white transition-all ${
                      pickingSide === 'quote' ? 'border-[#00C389]/50 bg-[#00C389]/10' : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                    onClick={() => setPickingSide(pickingSide === 'quote' ? null : 'quote')}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.quoteToken] ?? '#888' }} />
                    {persisted.quoteToken}
                    <ChevronDown className="h-3 w-3 text-gray-500" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-[#00C389] px-3 py-1.5 text-sm font-bold text-black"
                    onClick={() => setPickingSide('quote')}
                  >
                    pick <ArrowRight className="h-3 w-3" />
                  </button>
                )}
                {pickingSide === 'quote' && (
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[120px] rounded-lg border border-white/10 bg-gray-900 py-1 shadow-xl">
                    {quotesForBase(persisted.baseToken ?? 'AGNT').map((token) => {
                      const isSelected = token === persisted.quoteToken;
                      return (
                        <button
                          key={token}
                          type="button"
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-white/5 ${isSelected ? 'font-bold text-white' : 'text-gray-300'}`}
                          onClick={() => {
                            setPersisted((p) => ({ ...p, quoteToken: token }));
                            setPickingSide(null);
                          }}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[token] ?? '#888' }} />
                          {token}
                          {isSelected && <Check className="ml-auto h-3.5 w-3.5 text-[#00C389]" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Trading Strategy */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/20 text-[11px] font-bold text-[#00C389]">3</div>
              <span className="text-base font-bold text-white">Trading Strategy</span>
            </div>
            <div className="mb-1.5 flex items-center justify-end gap-1.5">
              {isConnected && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
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
                    <div className="h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-[#00C389]" />
                  ) : (
                    <Rocket className="h-3 w-3" />
                  )}
                  {generating ? 'Analyzing wallet...' : 'Auto-generate from wallet'}
                </button>
              )}
              <div className="group relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <FileText className="h-3 w-3" />
                  Use template
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute right-0 top-full z-10 mt-1 min-w-[200px] rounded-lg border border-white/10 bg-gray-900 py-1 shadow-xl group-hover:visible">
                  {STRATEGY_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      type="button"
                      className="flex w-full px-3 py-2 text-left text-xs text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                      onClick={() => {
                        setPersisted((p) => ({ ...p, prompt: t.prompt }));
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
              className={`w-full rounded-lg border bg-gray-950 px-4 py-3 text-sm leading-relaxed text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-[#00C389]/50 ${
                persisted.prompt.length > 5000 ? 'border-red-500/50' : 'border-white/10'
              }`}
              value={persisted.prompt}
              onChange={(e) => setPersisted((p) => ({ ...p, prompt: e.target.value }))}
              placeholder="Describe your trading strategy..."
              rows={6}
              maxLength={5000}
            />
            <div className="mt-1 flex justify-end">
              <span className={`font-mono text-[10px] ${
                persisted.prompt.length > 4800
                  ? persisted.prompt.length > 5000
                    ? 'text-red-400'
                    : 'text-yellow-400'
                  : 'text-gray-600'
              }`}>
                {persisted.prompt.length} / 5000
              </span>
            </div>

            {/* Prompt Variables */}
            {promptVars.length > 0 && (
              <div className="mt-2 rounded-lg border border-white/5 bg-gray-950/50 px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-wider text-gray-600">
                    Available variables <span className="normal-case text-gray-500">(click to insert)</span>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
                    onClick={() => setVarsHelpOpen(true)}
                  >
                    <Info className="h-3 w-3" />
                    Help
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {promptVars.map((v) => {
                    const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                    return (
                      <div key={v.key} className="group relative">
                        <button
                          type="button"
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                            inPrompt
                              ? 'border-[#00C389]/40 bg-[#00C389]/10 text-[#00C389]'
                              : 'border-white/10 text-gray-400 hover:border-[#00C389]/30 hover:bg-[#00C389]/5 hover:text-[#00C389]'
                          }`}
                          onClick={() => insertPromptVar(v)}
                        >
                          <span>{`{${v.key}}`}</span>
                          {inPrompt && <Check className="h-3 w-3" />}
                        </button>
                        {v.description && (
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded border border-white/10 bg-gray-900 px-2 py-1 text-[10px] text-gray-300 opacity-0 shadow-lg transition-opacity group-hover:block group-hover:opacity-100">
                            {v.description}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-600">
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#00C389]" />
                  Variables are replaced with live data before each AI decision
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Name & Fund */}
          <div className="space-y-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00C389]/20 text-[11px] font-bold text-[#00C389]">4</div>
              <span className="text-base font-bold text-white">Name & Fund</span>
            </div>

            {/* Agent Name */}
            <input
              id="agentName"
              type="text"
              className="w-full rounded-lg border border-white/10 bg-gray-950 px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#00C389]/50"
              value={persisted.agentName ?? ''}
              onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
              placeholder="Agent name, e.g. Moon Hunter"
              maxLength={40}
            />

            {/* Fund rows */}
            <div className="overflow-hidden rounded-lg border border-white/10">
              {/* Extra TON */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS.TON }} />
                  <span className="text-sm font-semibold text-white">Extra TON</span>
                  <span className="text-[10px] text-gray-600">gas & fees</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" type="button" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                  }}><Minus className="h-3 w-3" /></button>
                  <input type="text" className="w-16 rounded border border-white/10 bg-gray-950 py-1 text-center font-mono text-sm font-semibold text-white outline-none focus:border-[#00C389]/50" value={persisted.deployAmountTon} onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))} inputMode="decimal" />
                  <button className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" type="button" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                  }}><Plus className="h-3 w-3" /></button>
                </div>
              </div>

              {/* AGNT topup */}
              <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS.AGNT }} />
                  <span className="text-sm font-semibold text-white">AGNT topup</span>
                  <span className="text-[10px] text-gray-600">base capital</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" type="button" onClick={() => {
                    const cur = parseFloat(persisted.agntTopup || '0');
                    if (cur > 0) setPersisted((p) => ({ ...p, agntTopup: String(Math.max(0, cur - 1)) }));
                  }}><Minus className="h-3 w-3" /></button>
                  <input type="text" className="w-16 rounded border border-white/10 bg-gray-950 py-1 text-center font-mono text-sm font-semibold text-white outline-none focus:border-[#00C389]/50" value={persisted.agntTopup ?? '0'} onChange={(e) => setPersisted((p) => ({ ...p, agntTopup: e.target.value }))} inputMode="decimal" />
                  <button className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" type="button" onClick={() => {
                    const cur = parseFloat(persisted.agntTopup || '0');
                    setPersisted((p) => ({ ...p, agntTopup: String(cur + 1) }));
                  }}><Plus className="h-3 w-3" /></button>
                </div>
              </div>

              {/* Quote token topup */}
              {persisted.quoteToken && persisted.quoteToken !== 'AGNT' && (
                <div className="flex items-center justify-between border-t border-white/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: TOKEN_COLORS[persisted.quoteToken] ?? '#888' }} />
                    <span className="text-sm font-semibold text-white">{persisted.quoteToken} topup</span>
                    <span className="text-[10px] text-gray-600">quote capital</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" type="button" onClick={() => {
                      const cur = parseFloat(persisted.quoteTopup || '0');
                      if (cur > 0) setPersisted((p) => ({ ...p, quoteTopup: String(Math.max(0, cur - 1)) }));
                    }}><Minus className="h-3 w-3" /></button>
                    <input type="text" className="w-16 rounded border border-white/10 bg-gray-950 py-1 text-center font-mono text-sm font-semibold text-white outline-none focus:border-[#00C389]/50" value={persisted.quoteTopup ?? '0'} onChange={(e) => setPersisted((p) => ({ ...p, quoteTopup: e.target.value }))} inputMode="decimal" />
                    <button className="rounded p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" type="button" onClick={() => {
                      const cur = parseFloat(persisted.quoteTopup || '0');
                      setPersisted((p) => ({ ...p, quoteTopup: String(cur + 1) }));
                    }}><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
              )}

              {/* Where your TON goes */}
              <div className="space-y-1.5 border-t border-white/10 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-600">Where your TON goes</div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    <span className="text-gray-400">AI service provider</span>
                    {selectedModelOption && (
                      <span className="text-gray-600">({shortModelName(selectedModelOption.name)})</span>
                    )}
                  </div>
                  <span className="font-mono text-gray-500">
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
                  <span className="font-mono text-gray-500">~0.6 TON</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span className="text-gray-400">Gas</span>
                    <span className="text-gray-600">(stays on agent wallet for orders)</span>
                  </div>
                  <span className="font-mono text-gray-500">{persisted.deployAmountTon || '0'} TON</span>
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5">
                <span className="text-xs text-gray-500">Deploy ~0.6 TON + {persisted.deployAmountTon || '0'} TON gas</span>
                <span className="font-mono text-sm font-bold text-white">Total: {totalDeployTon} TON</span>
              </div>
            </div>

            {/* Footer note */}
            <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
              <Info className="h-3 w-3 shrink-0" />
              Tokens transferred to agent&apos;s on-chain wallet for <strong className="text-gray-400">{persisted.baseToken ?? 'AGNT'}/{persisted.quoteToken ?? '...'}</strong>. Signed via TonConnect.
            </div>

            {/* Validation checklist */}
            <div className="flex items-center gap-3 text-xs">
              <span className={hasName ? 'text-gray-300' : 'text-gray-700'}>&middot; Name</span>
              <span className={hasPair ? 'text-gray-300' : 'text-gray-700'}>&middot; Pair</span>
              <span className={hasStrategy ? 'text-gray-300' : 'text-gray-700'}>&middot; Strategy</span>
            </div>

            {/* Deploy button */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`flex w-full items-center justify-center gap-2 rounded-lg py-3 text-base font-semibold shadow-lg transition-colors ${
                busy
                  ? 'cursor-not-allowed bg-[#00C389]/50 text-black/50'
                  : 'bg-[#00C389] text-black hover:bg-[#00C389]/90'
              }`}
              onClick={() => void deployAndRegister()}
              type="button"
              disabled={!!busy}
            >
              {busy ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
              ) : (
                <Rocket className="h-4.5 w-4.5" />
              )}
              {busyLabel ?? `Deploy \u00B7 ${totalDeployTon} TON`}
            </motion.button>

            {canRetryRegisterOnly && (
              <button
                className={`w-full rounded-lg py-2 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white ${busy ? 'pointer-events-none opacity-40' : ''}`}
                onClick={() => void registerOnly()}
                type="button"
              >
                {busy === 'register' && (
                  <span className="mr-1.5 inline-block h-3 w-3 animate-spin rounded-full border border-gray-600 border-t-[#00C389]" />
                )}
                Retry registration only
              </button>
            )}

            <p className="text-center text-xs text-gray-600">Agent starts trading immediately</p>
          </div>

          {/* Contract Address (shown after deploy) */}
          {persisted.contractAddress && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-gray-950/50 px-3.5 py-2.5">
              <span className="text-xs text-gray-500">Contract</span>
              <a
                className="inline-flex items-center gap-1 font-mono text-xs text-[#00C389] transition-colors hover:text-[#00C389]/80"
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
              <div className="border-t border-white/5" />
              <div>
                <button
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm text-gray-400 transition-colors hover:bg-white/5"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  type="button"
                >
                  <span className="inline-flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5" />
                    Add more funds
                  </span>
                  {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                <AnimatePresence>
                  {showAdvanced && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 flex gap-2"
                    >
                      <input
                        id="topupAmount"
                        type="text"
                        className="flex-1 rounded-lg border border-white/10 bg-gray-950 px-3 py-1.5 text-sm text-white outline-none focus:border-[#00C389]/50"
                        value={persisted.topupAmountTon}
                        onChange={(e) => setPersisted((p) => ({ ...p, topupAmountTon: e.target.value }))}
                        inputMode="decimal"
                        placeholder="Amount in TON"
                      />
                      <button
                        className={`rounded-lg border border-white/10 px-4 py-1.5 text-sm text-white transition-colors hover:bg-white/5 ${busy ? 'pointer-events-none opacity-40' : ''}`}
                        onClick={() => void topUpExistingContract()}
                        type="button"
                      >
                        {busy === 'topup' ? 'Sending...' : 'Send TON'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        {/* Error bar */}
        {err && (
          <div className="border-t border-red-500/20 bg-red-500/10 px-6 py-3">
            <p className="font-mono text-xs text-red-400">{err}</p>
          </div>
        )}

        {/* Wallet warning */}
        {!isConnected && (
          <div className="border-t border-yellow-500/20 bg-yellow-500/10 px-6 py-3">
            <p className="text-xs font-medium text-yellow-400">Connect a TON wallet to deploy your agent.</p>
          </div>
        )}
      </motion.div>

      {/* Variables Help Modal */}
      {varsHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setVarsHelpOpen(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mx-4 max-h-[80vh] max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-gray-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Variable Reference</h3>
              <button type="button" className="rounded p-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white" onClick={() => setVarsHelpOpen(false)}>
                &times;
              </button>
            </div>
            <p className="mb-4 text-xs text-gray-500">
              Variables are placeholders replaced with live data before each AI decision. Click a variable name to insert it into your strategy.
            </p>
            <div className="space-y-3">
              {promptVars.map((v) => {
                const inPrompt = persisted.prompt.includes(`{${v.key}}`);
                return (
                  <div key={v.key} className="rounded-lg border border-white/5 bg-gray-950/50 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <button
                        type="button"
                        className={`font-mono text-sm font-bold ${inPrompt ? 'text-[#00C389]' : 'text-[#00C389]/70 hover:text-[#00C389]'}`}
                        onClick={() => { insertPromptVar(v); setVarsHelpOpen(false); }}
                      >
                        {`{${v.key}}`}
                        {inPrompt && <Check className="ml-1 inline h-3.5 w-3.5 text-[#00C389]" />}
                      </button>
                      {v.prompt_section && (
                        <span className="rounded border border-white/5 px-1.5 py-0.5 text-[10px] text-gray-600">{v.prompt_section}</span>
                      )}
                    </div>
                    {v.name && v.name !== v.key && (
                      <div className="mb-0.5 text-xs font-semibold text-gray-400">{v.name}</div>
                    )}
                    <div className="text-xs leading-relaxed text-gray-500">{v.description}</div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
