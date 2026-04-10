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
  Zap,
  Check,
  ArrowRight,
  Info,
  Loader2,
  Pencil,
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

const SUPPORTED_PAIRS: [string, string][] = [['AGNT', 'USDT'], ['USDT', 'AGNT'], ['USDT', 'NOT'], ['USDT', 'BUILD']];
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
  AGNT: '/agnt-token.png?v=2',
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

const STRATEGY_TEMPLATE = `Autonomous market-making agent for {pair}.

DATA (refreshed each cycle):
{market_prices}, {wallet_balances}, {open_orders}, {recent_fills}, {order_book}, {price_changes}, {token_fundamentals}, {candles_5m}, {candles_1h}, {sma}, {ema}

RULES:
1. Alternate BUY and SELL orders near the mid price to provide liquidity.
2. Order size: 3-15 {from_token} per order. Randomize slightly to avoid pattern detection.
3. Keep spread within 0.5% of mid price. Match or improve the best bid/ask.
4. Cancel stale orders older than 5 minutes before placing new ones.
5. Never hold more than 60% of total balance in one token.
6. Keep at least 0.5 TON gas reserve at all times.

SIGNALS:
- Use {sma} and {ema} crossovers to bias direction (buy-heavy or sell-heavy).
- If {price_changes} shows >2% drop in 1h, pause new orders and wait for stabilization.
- If {order_book} spread is >1%, reduce order sizes to minimize risk.
- Check {recent_fills} to confirm previous orders are executing.

RISK:
- Max 3 open orders at once.
- Hard stop: if portfolio value drops >5% from start, switch to HOLD.
- Each round-trip costs ~0.03 TON gas. Only trade when expected profit > gas cost.

OBJECTIVE:
Generate trading volume while keeping total balance flat. Capture bid-ask spread with minimal directional exposure.`;

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
  prompt: STRATEGY_TEMPLATE,
  deployAmountTon: '1',
  topupAmountTon: '1',
  walletId: 0,
  agentPublicKeyHex: '',
  agentSecretKeyHex: '',
  contractAddress: null,
  raceContractId: null,
  baseToken: 'AGNT',
  quoteToken: 'USDT',
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

  const [rawPersisted, setPersisted] = useLocalStorageState<Persisted>('deploy-panel:v2', DEFAULT_PERSISTED);
  // Merge defaults for fields added after initial storage (e.g. baseToken/quoteToken).
  // Filter out undefined/null values from stored data so defaults take effect.
  const persisted = useMemo(() => {
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rawPersisted)) {
      if (v !== undefined && v !== null && v !== '') cleaned[k] = v;
    }
    return { ...DEFAULT_PERSISTED, ...cleaned } as Persisted;
  }, [rawPersisted]);

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiModelGroups, setAiModelGroups] = useState<AiModelsByProvider[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelListOpen, setModelListOpen] = useState(false);
  const [pickingSide, setPickingSide] = useState<'base' | 'quote' | null>(persisted.quoteToken ? null : 'quote');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [promptVars, setPromptVars] = useState<PromptVariable[]>([]);
  const [generating, setGenerating] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [varsHelpOpen, setVarsHelpOpen] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);

  const isConnected = !!wallet && !!tonAddress;

  // Auto-fill first template when prompt is empty (new agent)
  useEffect(() => {
    if (!persisted.prompt) {
      setPersisted((p) => ({ ...p, prompt: STRATEGY_TEMPLATE }));
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

  const modelPriceTon = selectedModelOption?.pricing?.[0]?.currency?.toUpperCase() === 'TON'
    ? Number(selectedModelOption.pricing[0].price) || 0
    : 0;
  const totalDeployTon = (modelPriceTon + 0.6 + parseFloat(persisted.deployAmountTon || '0')).toFixed(1);
  const hasName = !!(persisted.agentName?.trim());
  const hasPair = !!(persisted.quoteToken);
  const hasStrategy = !!(persisted.prompt?.trim());

  // Suppress unused-var lint — these are used implicitly or kept for future use
  void rawAddr;
  void hasName;
  void hasPair;
  void hasStrategy;

  return (
    <div className="flex flex-col gap-4">
      <ContractTabBar />
      <Card className="overflow-hidden mx-auto w-full max-w-2xl">
        {/* Header */}
        <div className="border-b border-border/50 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
              <Zap className="h-4 w-4 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Deploy New Agent</h2>
              <p className="text-[11px] text-muted-foreground">Configure, deploy on-chain, and enter the Trading Race</p>
            </div>
          </div>
        </div>

        <CardContent className="py-4 space-y-4">
          {/* =============================================================== */}
          {/* Name Input (at top)                                             */}
          {/* =============================================================== */}
          <Input
            id="agentName"
            type="text"
            value={persisted.agentName ?? ''}
            onChange={(e) => setPersisted((p) => ({ ...p, agentName: e.target.value }))}
            placeholder="Agent name, e.g. Moon Hunter"
            maxLength={40}
          />

          {/* Model picker list — rendered inline in WHERE YOUR TON GOES when toggled */}

          {/* =============================================================== */}
          {/* Strategy (collapsed by default)                                 */}
          {/* =============================================================== */}
          <div>
            {!strategyOpen ? (
              /* Collapsed: preview line + edit button */
              <button
                type="button"
                className="flex items-center gap-2 w-full text-left cursor-pointer rounded-lg border border-border/50 hover:border-border bg-muted/30 px-3 py-2"
                onClick={() => setStrategyOpen(true)}
              >
                <span className="text-xs font-semibold text-muted-foreground shrink-0">Strategy</span>
                <span className="text-xs text-muted-foreground/70 truncate flex-1">
                  {persisted.prompt.trim() ? persisted.prompt.trim().split('\n')[0].slice(0, 80) : 'No strategy set'}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] text-primary shrink-0">
                  <Pencil className="h-3 w-3" />
                  Edit
                </span>
              </button>
            ) : (
              /* Expanded: full textarea + variables */
              <div className="rounded-lg border border-border/50 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Strategy</span>
                  <div className="flex items-center gap-1.5">
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
                    <Button
                      variant="ghost"
                      size="xs"
                      className="gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => setPersisted((p) => ({ ...p, prompt: STRATEGY_TEMPLATE }))}
                    >
                      Reset to default
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setStrategyOpen(false)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
                <div className="flex justify-end">
                  <span className={`font-mono text-[10px] ${persisted.prompt.length > 4800 ? (persisted.prompt.length > 5000 ? 'text-red-500' : 'text-yellow-500') : 'text-muted-foreground/50'}`}>
                    {persisted.prompt.length} / 5000
                  </span>
                </div>

                {/* Prompt Variables */}
                {promptVars.length > 0 && (
                  <div className="rounded-lg bg-muted/50 border border-border/50 px-3 py-2.5">
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
            )}
          </div>

          {/* =============================================================== */}
          {/* Fund Section                                                    */}
          {/* =============================================================== */}
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Block title */}
            <div className="px-4 py-2.5 border-b border-border">
              <span className="text-sm font-semibold">Agent configuration</span>
            </div>

            {/* Configuration rows */}
            <div className="px-4 py-3 space-y-2">
              {/* Trading Pair — first */}
              <div className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="text-muted-foreground shrink-0">Trading pair</span>
                <div className="relative">
                  <button type="button"
                    className={`inline-flex items-center gap-1 rounded-full pl-1.5 pr-1.5 py-0.5 text-xs font-bold cursor-pointer bg-muted/60 hover:bg-muted ${pickingSide === 'base' ? 'ring-1 ring-primary/50' : ''}`}
                    onClick={() => setPickingSide(pickingSide === 'base' ? null : 'base')}
                  >
                    <TokenIcon symbol={persisted.baseToken ?? 'AGNT'} size="h-3.5 w-3.5" />
                    {persisted.baseToken ?? 'AGNT'}
                    <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                  {pickingSide === 'base' && (
                    <div className="absolute top-full left-0 mt-1 z-20 rounded-lg bg-popover border border-border shadow-lg py-1 min-w-[110px]">
                      {BASE_TOKENS.map((token) => {
                        const isSel = token === (persisted.baseToken ?? 'AGNT');
                        return (
                          <button key={token} type="button"
                            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted ${isSel ? 'font-bold' : ''}`}
                            onClick={() => {
                              const cq = persisted.quoteToken;
                              const nq = quotesForBase(token);
                              setPersisted((p) => ({ ...p, baseToken: token, quoteToken: cq && nq.includes(cq) ? cq : nq[0] }));
                              setPickingSide(null);
                            }}
                          >
                            <TokenIcon symbol={token} size="h-4 w-4" /> {token}
                            {isSel && <Check className="h-3 w-3 ml-auto text-green-500" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <span className="text-muted-foreground font-bold">/</span>
                <div className="relative">
                  <button type="button"
                    className={`inline-flex items-center gap-1 rounded-full pl-1.5 pr-1.5 py-0.5 text-xs font-bold cursor-pointer bg-muted/60 hover:bg-muted ${pickingSide === 'quote' ? 'ring-1 ring-primary/50' : ''}`}
                    onClick={() => setPickingSide(pickingSide === 'quote' ? null : 'quote')}
                  >
                    <TokenIcon symbol={persisted.quoteToken ?? 'USDT'} size="h-3.5 w-3.5" />
                    {persisted.quoteToken ?? 'USDT'}
                    <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                  </button>
                  {pickingSide === 'quote' && (
                    <div className="absolute top-full left-0 mt-1 z-20 rounded-lg bg-popover border border-border shadow-lg py-1 min-w-[110px]">
                      {quotesForBase(persisted.baseToken ?? 'AGNT').map((token) => {
                        const isSel = token === persisted.quoteToken;
                        return (
                          <button key={token} type="button"
                            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-muted ${isSel ? 'font-bold' : ''}`}
                            onClick={() => { setPersisted((p) => ({ ...p, quoteToken: token })); setPickingSide(null); }}
                          >
                            <TokenIcon symbol={token} size="h-4 w-4" /> {token}
                            {isSel && <Check className="h-3 w-3 ml-auto text-green-500" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* AI service provider */}
              <div className="flex items-center gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shrink-0" />
                <span className="text-muted-foreground shrink-0">AI model</span>
                {selectedModelOption && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full pl-1.5 pr-1.5 py-0.5 text-xs font-bold cursor-pointer bg-muted/60 hover:bg-muted"
                    onClick={() => setModelListOpen((v) => !v)}
                  >
                    <ProviderIcon provider={selectedModelOption.provider?.trim() || ''} />
                    {shortModelName(selectedModelOption.name)}
                    <ChevronDown className={`h-2.5 w-2.5 text-muted-foreground transition-transform ${modelListOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <span className="ml-auto font-mono text-muted-foreground shrink-0">
                  {selectedModelOption?.pricing?.[0]
                    ? `${selectedModelOption.pricing[0].price} ${selectedModelOption.pricing[0].currency}/${selectedModelOption.pricing[0].cntDecisions} dec`
                    : '\u2014'}
                </span>
              </div>
              {modelListOpen && (
                <div className="ml-3 mt-1 mb-1 border-l-2 border-purple-400/30 pl-3 space-y-0.5">
                  {modelsLoading && <Skeleton className="h-4 w-32" />}
                  {displayGroups.flatMap((group) =>
                    group.models.map((m) => {
                      const mp = m.provider?.trim() ?? '';
                      const isSelected = selectedModel === m.id && (selectedProvider ?? '') === mp;
                      const tier = m.pricing?.[0];
                      return (
                        <button key={`${mp || 'p'}:${m.id}`} type="button"
                          className={`flex items-center gap-2 w-full text-left text-xs py-1.5 px-2 rounded transition-colors cursor-pointer ${
                            isSelected ? 'bg-green-600 text-white font-bold' : 'hover:bg-muted/60'
                          }`}
                          onClick={() => { setPersisted((p) => ({ ...p, aiModel: m.id, aiProvider: mp || undefined })); setModelListOpen(false); }}
                        >
                          <ProviderIcon provider={mp} />
                          <span className="font-semibold capitalize min-w-0 truncate">{mp}</span>
                          <span className="font-bold truncate">{shortModelName(m.name)}</span>
                          {m.isThinking != null && (
                            <Badge variant="secondary" className="h-4 px-1 text-[9px] shrink-0">
                              {m.isThinking ? 'Thinking' : 'Fast'}
                            </Badge>
                          )}
                          {tier && <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">{tier.price} {tier.currency}/{tier.cntDecisions}</span>}
                          {isSelected && <Check className="h-3 w-3 text-green-500 shrink-0" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {/* Service fee */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                  <span className="text-muted-foreground">Service fee for deploying agent</span>
                </div>
                <span className="font-mono text-muted-foreground">~0.6 TON</span>
              </div>

              {/* Gas — with inline +/- input */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span className="text-muted-foreground">Gas</span>
                  <span className="text-muted-foreground/50">(stays on agent wallet)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon-xs" type="button" className="h-5 w-5" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    if (cur > 0) setPersisted((p) => ({ ...p, deployAmountTon: String(Math.max(0, cur - 1)) }));
                  }}>
                    <Minus className="h-2.5 w-2.5" />
                  </Button>
                  <Input
                    type="text"
                    className="w-10 text-center font-mono text-xs font-semibold h-6 px-1"
                    value={persisted.deployAmountTon}
                    onChange={(e) => setPersisted((p) => ({ ...p, deployAmountTon: e.target.value }))}
                    inputMode="decimal"
                  />
                  <Button variant="ghost" size="icon-xs" type="button" className="h-5 w-5" onClick={() => {
                    const cur = parseFloat(persisted.deployAmountTon || '0');
                    setPersisted((p) => ({ ...p, deployAmountTon: String(cur + 1) }));
                  }}>
                    <Plus className="h-2.5 w-2.5" />
                  </Button>
                  <span className="font-mono text-muted-foreground ml-0.5">TON</span>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="border-t border-border px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {modelPriceTon > 0 && `${modelPriceTon} TON model + `}~0.6 TON deploy + {persisted.deployAmountTon || '0'} TON gas
              </span>
              <span className="text-sm font-bold font-mono">Total: {totalDeployTon} TON</span>
            </div>
          </div>

          {/* =============================================================== */}
          {/* Deploy Button                                                   */}
          {/* =============================================================== */}
          <div className="space-y-2">
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
