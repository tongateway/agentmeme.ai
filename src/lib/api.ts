export type BackendConfig = {
  baseUrl: string;
  bearerToken?: string;
};

function headers(cfg: BackendConfig): HeadersInit {
  const h: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (cfg.bearerToken) {
    h.authorization = `Bearer ${cfg.bearerToken}`;
  }
  return h;
}

export type PublicApiConfig = {
  baseUrl: string;
  jwtToken?: string | null;
};

function raceUrl(cfg: PublicApiConfig, path: string): string | URL {
  const base = (cfg.baseUrl || '').trim();
  if (!base) return path;
  return new URL(path, base);
}

function publicGetHeaders(cfg?: PublicApiConfig): HeadersInit {
  const h: Record<string, string> = {};
  if (cfg?.jwtToken) h.authorization = `Bearer ${cfg.jwtToken}`;
  return h;
}

function publicPostHeaders(cfg?: PublicApiConfig): HeadersInit {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg?.jwtToken) h.authorization = `Bearer ${cfg.jwtToken}`;
  return h;
}

async function jsonOrThrow(res: Response) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = data?.error || data?.message || data?.status || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data;
}

// --- Types ---

export type ContractListItem = {
  id: string;
  address: string;
  name?: string | null;
  owner_address: string;
  is_active: boolean;
  status?: string;
  ai_model?: string | null;
  ai_provider?: string | null;
  created_at: string;
  updated_at: string;
  total_decisions?: number | null;
  max_decisions?: number | null;
  used_decisions?: number | null;
};

export type ContractDetail = {
  id: string;
  address: string;
  name?: string | null;
  public_key: string;
  wallet_id: number;
  prompt: string;
  is_active: boolean;
  status?: string;
  ai_model: string;
  ai_provider?: string | null;
  owner_address: string;
  created_at: string;
  updated_at: string;
};

export type RegisterContractRequest = {
  address: string;
  public_key?: string;
  secret_key?: string;
  wallet_id: number;
  prompt: string;
  is_active?: boolean;
  owner_address: string;
  ai_model?: string;
  ai_provider?: string;
};

export type RegisterRaceContractRequest = {
  prompt: string;
  owner_address: string;
  is_active?: boolean;
  ai_model?: string;
  ai_provider?: string;
  name?: string;
};

export type RaceContractCreateResponse = ContractListItem & {
  mint_keeper_address: string;
  state_init_boc_hex: string;
  body_boc_hex: string;
  value_nanoton: number;
  mint_amount: number;
};

export type UpdateContractRequest = {
  name?: string;
  prompt?: string;
  is_active?: boolean;
  status?: 'active' | 'paused';
  ai_model?: string;
  ai_provider?: string;
};

export type AiHistoryItem = {
  id: string;
  smart_contract_id: string;
  request_prompt: string;
  response_raw: string;
  action: string;
  parsed_params: Record<string, unknown> | null;
  order_id: string | null;
  created_at: string;
};

export type OrderAction = {
  id: string;
  order_id: string;
  action: string;
  status: string;
  tx_hash: string | null;
  error_message: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  smart_contract_id: string;
  address: string | null;
  amount: string;
  initial_amount: string | null;
  price_rate: number | null;
  slippage: number | null;
  status: string;
  ai_short_reason: string | null;
  created_at: string;
  updated_at: string;
  actions: OrderAction[];
};

export type LeaderboardEntry = {
  rank: number;
  smart_contract_id: string;
  address: string;
  name?: string | null;
  owner_address: string;
  ai_model: string;
  ai_provider?: string | null;
  is_active: boolean;
  status?: string;
  start_balance_usd: number | null;
  current_balance_usd: number | null;
  profit_usd: number | null;
  profit_pct: number | null;
  total_orders: number | null;
  completed_orders: number | null;
  total_decisions: number | null;
  created_at: string;
};

export type AiResponse = {
  id: string;
  smart_contract_id: string;
  action: string;
  parsed_params: Record<string, unknown> | null;
  order_id: string | null;
  balance_usd: number | null;
  bullish_count: number;
  bearish_count: number;
  created_at: string;
};

export type ReactionResponse = {
  ai_response_id: string;
  reaction: 'bullish' | 'bearish';
  bullish_count: number;
  bearish_count: number;
};

export type PricingTier = {
  cntDecisions: number;
  price: number;
  currency: string;
};

export type AiModelOption = {
  id: string;
  name: string;
  provider?: string;
  description?: string | null;
  isThinking?: boolean;
  price?: number;
  priceCurrency?: string;
  pricing?: PricingTier[];
};

export type AiModelsByProvider = {
  provider: string;
  models: AiModelOption[];
};

function toIsActive(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'active';
  return false;
}

function normalizeContract(item: Record<string, unknown>): ContractListItem {
  const providerRaw = item.provider ?? item.ai_provider;
  const aiProvider = typeof providerRaw === 'string' && providerRaw.trim() ? providerRaw.trim() : null;
  return {
    id: String(item.id ?? ''),
    address: String(item.address ?? ''),
    name: typeof item.name === 'string' ? item.name : null,
    owner_address: String(item.owner_address ?? ''),
    is_active: toIsActive(item.is_active ?? item.status),
    status: typeof item.status === 'string' ? item.status : undefined,
    ai_model: typeof item.ai_model === 'string' ? item.ai_model : null,
    ai_provider: aiProvider,
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
    total_decisions: typeof item.total_decisions === 'number' ? item.total_decisions : null,
    max_decisions: typeof item.max_decisions === 'number' ? item.max_decisions : null,
    used_decisions: typeof item.used_decisions === 'number' ? item.used_decisions : null,
  };
}

function normalizeContractDetail(item: Record<string, unknown>): ContractDetail {
  const providerRaw = item.provider ?? item.ai_provider;
  const aiProvider = typeof providerRaw === 'string' && providerRaw.trim() ? providerRaw.trim() : null;
  return {
    id: String(item.id ?? ''),
    address: String(item.address ?? ''),
    name: typeof item.name === 'string' ? item.name : null,
    public_key: String(item.public_key ?? ''),
    wallet_id: Number(item.wallet_id ?? 0),
    prompt: String(item.prompt ?? ''),
    is_active: toIsActive(item.is_active ?? item.status),
    status: typeof item.status === 'string' ? item.status : undefined,
    ai_model: String(item.ai_model ?? ''),
    ai_provider: aiProvider,
    owner_address: String(item.owner_address ?? ''),
    created_at: String(item.created_at ?? ''),
    updated_at: String(item.updated_at ?? ''),
  };
}

function normalizeLeaderboardEntry(item: Record<string, unknown>): LeaderboardEntry {
  const providerRaw = item.provider ?? item.ai_provider;
  const aiProvider = typeof providerRaw === 'string' && providerRaw.trim() ? providerRaw.trim() : null;
  return {
    rank: Number(item.rank ?? 0),
    smart_contract_id: String(item.smart_contract_id ?? ''),
    address: String(item.address ?? ''),
    name: typeof item.name === 'string' ? item.name : null,
    owner_address: String(item.owner_address ?? ''),
    ai_model: String(item.ai_model ?? ''),
    ai_provider: aiProvider,
    is_active: toIsActive(item.is_active ?? item.status),
    status: typeof item.status === 'string' ? item.status : undefined,
    start_balance_usd: typeof item.start_balance_usd === 'number' ? item.start_balance_usd : null,
    current_balance_usd: typeof item.current_balance_usd === 'number' ? item.current_balance_usd : null,
    profit_usd: typeof item.profit_usd === 'number' ? item.profit_usd : null,
    profit_pct: typeof item.profit_pct === 'number' ? item.profit_pct : null,
    total_orders: typeof item.total_orders === 'number' ? item.total_orders : null,
    completed_orders: typeof item.completed_orders === 'number' ? item.completed_orders : null,
    total_decisions: typeof item.total_decisions === 'number' ? item.total_decisions : null,
    created_at: String(item.created_at ?? ''),
  };
}

/** Token decimals for converting nano (smallest-unit) amounts to human-readable values. */
const TOKEN_DECIMALS: Record<string, number> = {
  TON: 9,
  USDT: 6,
  USDC: 6,
  NOT: 9,
  DOGS: 9,
  JETTON: 9,
  XAUT0: 6,
  CBBTC: 8,
};
const DEFAULT_TOKEN_DECIMALS = 9;

/** Convert a nano (smallest-unit) amount to a human-readable number. */
export function fromNanoToken(nano: number, currency?: string): number {
  const decimals = TOKEN_DECIMALS[(currency ?? '').toUpperCase()] ?? DEFAULT_TOKEN_DECIMALS;
  return nano / 10 ** decimals;
}

function normalizeAiModelOption(item: Record<string, unknown>, providerHint?: string): AiModelOption | null {
  const isActiveRaw = item.is_active;
  if (typeof isActiveRaw === 'boolean' && !isActiveRaw) return null;

  // Backend returns UUID in "id" and model slug in "name".
  // We must send slug in register payload as ai_model.
  const idRaw = item.name ?? item.model ?? item.slug ?? item.key ?? item.id;
  const id = typeof idRaw === 'string' ? idRaw.trim() : '';
  if (!id) return null;

  const nameRaw = item.description ?? item.display_name ?? item.label ?? item.name ?? item.model;
  const name = typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : id;
  const descriptionRaw = item.description ?? item.desc ?? item.details;
  const description = typeof descriptionRaw === 'string' && descriptionRaw.trim() ? descriptionRaw.trim() : null;
  const providerRaw = item.provider ?? item.ai_provider ?? providerHint;
  const provider = typeof providerRaw === 'string' && providerRaw.trim() ? providerRaw.trim() : undefined;
  const isThinkingRaw = item.is_thinking;
  const isThinking = typeof isThinkingRaw === 'boolean' ? isThinkingRaw : undefined;
  // Extract pricing tiers from the pricing array
  const pricingRaw = Array.isArray(item.pricing) ? item.pricing : [];
  const pricing: PricingTier[] = pricingRaw
    .filter((t): t is Record<string, unknown> => t != null && typeof t === 'object')
    .map((t) => ({
      cntDecisions: Number(t.cnt_decisions ?? 0),
      price: Number(t.price ?? 0),
      currency: typeof t.currency === 'string' ? t.currency : 'TON',
    }))
    .filter((t) => t.cntDecisions > 0)
    .sort((a, b) => a.cntDecisions - b.cntDecisions);

  // Fallback to flat price field
  const priceRaw = item.price;
  const priceCurrencyRaw = item.price_currency;
  const priceCurrency = typeof priceCurrencyRaw === 'string' && priceCurrencyRaw.trim() ? priceCurrencyRaw.trim() : undefined;
  const price = typeof priceRaw === 'number' ? fromNanoToken(priceRaw, priceCurrency) : undefined;

  return { id, name, provider, description, isThinking, price, priceCurrency, pricing: pricing.length > 0 ? pricing : undefined };
}

function normalizeAiModelsGroup(item: Record<string, unknown>): AiModelsByProvider | null {
  const providerRaw = item.provider;
  const provider = typeof providerRaw === 'string' && providerRaw.trim() ? providerRaw.trim() : 'Other';
  const modelsRaw = Array.isArray(item.models) ? item.models : [];
  const models = modelsRaw
    .map((m) => (
      m && typeof m === 'object'
        ? normalizeAiModelOption(m as Record<string, unknown>, provider)
        : null
    ))
    .filter((m): m is AiModelOption => !!m);
  if (models.length === 0) return null;
  return { provider, models };
}

// --- Backend (auth) API ---

export async function listContracts(cfg: BackendConfig): Promise<ContractListItem[]> {
  const res = await fetch(`${cfg.baseUrl}/api/contracts`, {
    method: 'GET',
    headers: headers(cfg),
  });
  return jsonOrThrow(res);
}

export async function registerContract(cfg: BackendConfig, body: RegisterContractRequest): Promise<ContractListItem> {
  const res = await fetch(`${cfg.baseUrl}/api/contracts`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

export async function getAiHistory(cfg: BackendConfig, contractId: string, limit = 25): Promise<AiHistoryItem[]> {
  const res = await fetch(`${cfg.baseUrl}/api/contracts/${contractId}/ai-history?limit=${limit}`, {
    method: 'GET',
    headers: headers(cfg),
  });
  return jsonOrThrow(res);
}

export async function getOrders(cfg: BackendConfig, contractId: string, limit = 25): Promise<OrderItem[]> {
  const res = await fetch(`${cfg.baseUrl}/api/contracts/${contractId}/orders?limit=${limit}`, {
    method: 'GET',
    headers: headers(cfg),
  });
  return jsonOrThrow(res);
}

// --- Public (no auth) API ---

export async function listRaceContracts(cfg: PublicApiConfig, status?: string): Promise<ContractListItem[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  const res = await fetch(raceUrl(cfg, `/api/contracts${qs}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  const data = await jsonOrThrow(res);
  return Array.isArray(data) ? data.map((i) => normalizeContract(i as Record<string, unknown>)) : [];
}

export async function registerRaceContract(cfg: PublicApiConfig, body: RegisterRaceContractRequest): Promise<RaceContractCreateResponse> {
  const res = await fetch(raceUrl(cfg, '/api/contracts'), {
    method: 'POST',
    headers: publicPostHeaders(cfg),
    body: JSON.stringify({ ...body, wallet_id: 0 }),
  });
  const data = await jsonOrThrow(res) as Record<string, unknown>;
  return {
    ...normalizeContract(data),
    mint_keeper_address: String(data.mint_keeper_address ?? ''),
    state_init_boc_hex: String(data.state_init_boc_hex ?? ''),
    body_boc_hex: String(data.body_boc_hex ?? ''),
    value_nanoton: Number(data.value_nanoton ?? 0),
    mint_amount: Number(data.mint_amount ?? 0),
  };
}

export async function getRaceContractDetail(cfg: PublicApiConfig, contractId: string): Promise<ContractDetail> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  const data = await jsonOrThrow(res);
  return normalizeContractDetail(data as Record<string, unknown>);
}

/** Fetch the agent prompt (requires JWT auth). Returns null if unauthenticated or not found. */
export async function getRaceContractPrompt(cfg: PublicApiConfig, contractId: string): Promise<string | null> {
  try {
    const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/prompt`), {
      method: 'GET',
      headers: publicGetHeaders(cfg),
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return typeof data.prompt === 'string' && data.prompt ? data.prompt : null;
  } catch {
    return null;
  }
}

/** Update the agent prompt (requires JWT auth, owner-only). */
export async function updateRaceContractPrompt(cfg: PublicApiConfig, contractId: string, prompt: string): Promise<string> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/prompt`), {
    method: 'PUT',
    headers: publicPostHeaders(cfg),
    body: JSON.stringify({ prompt }),
  });
  const data = await jsonOrThrow(res) as Record<string, unknown>;
  return typeof data.prompt === 'string' ? data.prompt : prompt;
}

export async function updateRaceContract(cfg: PublicApiConfig, contractId: string, body: UpdateContractRequest): Promise<ContractDetail> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}`), {
    method: 'PATCH',
    headers: publicPostHeaders(cfg),
    body: JSON.stringify(body),
  });
  const data = await jsonOrThrow(res);
  return normalizeContractDetail(data as Record<string, unknown>);
}

export async function deleteRaceContract(cfg: PublicApiConfig, contractId: string): Promise<void> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}`), {
    method: 'DELETE',
    headers: publicGetHeaders(cfg),
  });
  if (!res.ok) {
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    const msg = data?.error || data?.message || `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
}

export type WithdrawJettonResult = {
  body_hex: string;
  jetton_count: number;
  jettons: { balance: number; decimals: number; symbol: string; wallet_address: string }[];
};

export type WithdrawTonResult = {
  body_hex: string;
};

export type CloseAllOrdersResult = {
  closed_count: number;
  order_ids: string[];
  body_hex: string;
};

export async function withdrawJetton(cfg: PublicApiConfig, contractId: string, jettonMasterAddress: string): Promise<WithdrawJettonResult> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/withdraw-jetton`), {
    method: 'POST',
    headers: publicPostHeaders(cfg),
    body: JSON.stringify({ jetton_master_address: jettonMasterAddress }),
  });
  return jsonOrThrow(res);
}

export async function withdrawTon(cfg: PublicApiConfig, contractId: string): Promise<WithdrawTonResult> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/withdraw-ton`), {
    method: 'POST',
    headers: publicPostHeaders(cfg),
  });
  return jsonOrThrow(res);
}

export async function closeAllOrders(cfg: PublicApiConfig, contractId: string): Promise<CloseAllOrdersResult> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/close-all-orders`), {
    method: 'POST',
    headers: publicPostHeaders(cfg),
  });
  return jsonOrThrow(res);
}

/** Convert a hex-encoded BOC to base64 for TonConnect payload. */
export function hexBocToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function getRaceAiHistory(cfg: PublicApiConfig, contractId: string, limit = 25): Promise<AiHistoryItem[]> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/ai-history?limit=${limit}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  return jsonOrThrow(res);
}

export async function getRaceOrders(cfg: PublicApiConfig, contractId: string, limit = 25): Promise<OrderItem[]> {
  const res = await fetch(raceUrl(cfg, `/api/contracts/${contractId}/orders?limit=${limit}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  return jsonOrThrow(res);
}

export async function getRaceLeaderboard(
  cfg: PublicApiConfig,
  opts?: { limit?: number; offset?: number; sortBy?: string },
): Promise<LeaderboardEntry[]> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  if (opts?.sortBy) params.set('sort_by', opts.sortBy);
  const qs = params.toString();
  const res = await fetch(raceUrl(cfg, `/api/leaderboard${qs ? `?${qs}` : ''}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  const data = await jsonOrThrow(res);
  return Array.isArray(data) ? data.map((i) => normalizeLeaderboardEntry(i as Record<string, unknown>)) : [];
}

/* Token-specific leaderboard (e.g. /api/leaderboard/agnt) */

export type TokenLeaderboardEntry = {
  rank: number;
  smart_contract_id: string;
  address: string;
  name?: string | null;
  owner_address: string;
  ai_model: string;
  status?: string;
  max_decisions: number;
  used_decisions: number;
  buy_volume: number;
  sell_volume: number;
  completed_orders: number;
  deployed_orders: number;
  total_orders: number;
  completed_volume: number;
};

function normalizeTokenLeaderboardEntry(item: Record<string, unknown>, tokenKey: string): TokenLeaderboardEntry {
  const prefix = tokenKey.toLowerCase() + '_';
  return {
    rank: Number(item.rank ?? 0),
    smart_contract_id: String(item.smart_contract_id ?? ''),
    address: String(item.address ?? ''),
    name: typeof item.name === 'string' ? item.name : null,
    owner_address: String(item.owner_address ?? ''),
    ai_model: String(item.ai_model ?? ''),
    status: typeof item.status === 'string' ? item.status : undefined,
    max_decisions: Number(item.max_decisions ?? 0),
    used_decisions: Number(item.used_decisions ?? 0),
    buy_volume: Number(item[`${prefix}buy_volume`] ?? 0),
    sell_volume: Number(item[`${prefix}sell_volume`] ?? 0),
    completed_orders: Number(item[`${prefix}completed_orders`] ?? 0),
    deployed_orders: Number(item[`${prefix}deployed_orders`] ?? 0),
    total_orders: Number(item[`${prefix}total_orders`] ?? 0),
    completed_volume: Number(item[`${prefix}completed_volume`] ?? 0),
  };
}

export async function getTokenLeaderboard(cfg: PublicApiConfig, token: string): Promise<TokenLeaderboardEntry[]> {
  const res = await fetch(raceUrl(cfg, `/api/leaderboard/${token.toLowerCase()}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  const data = await jsonOrThrow(res);
  return Array.isArray(data) ? data.map((i) => normalizeTokenLeaderboardEntry(i as Record<string, unknown>, token)) : [];
}

/**
 * Fetch all contracts by converting leaderboard entries to ContractListItem.
 * Used as a fallback because /api/contracts returns empty.
 */
export async function listContractsFromLeaderboard(cfg: PublicApiConfig): Promise<ContractListItem[]> {
  const entries = await getRaceLeaderboard(cfg, { limit: 200 });
  return entries.map((e) => ({
    id: e.smart_contract_id,
    address: e.address,
    name: e.name ?? null,
    owner_address: e.owner_address,
    is_active: e.is_active,
    status: e.status,
    ai_model: e.ai_model,
    ai_provider: e.ai_provider ?? null,
    created_at: e.created_at,
    updated_at: e.created_at, // leaderboard doesn't have updated_at
    total_decisions: e.total_decisions ?? null,
  }));
}

export async function getRaceAiResponses(
  cfg: PublicApiConfig,
  opts?: { smartContractId?: string; limit?: number; offset?: number },
): Promise<AiResponse[]> {
  const params = new URLSearchParams();
  if (opts?.smartContractId) params.set('smart_contract_id', opts.smartContractId);
  if (opts?.limit != null) params.set('limit', String(opts.limit));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const res = await fetch(raceUrl(cfg, `/api/ai-responses${qs ? `?${qs}` : ''}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  return jsonOrThrow(res);
}

/** Fetch a single AI response by ID (includes live bullish/bearish counts). */
export async function getAiResponse(
  cfg: PublicApiConfig,
  responseId: string,
): Promise<AiResponse> {
  const res = await fetch(raceUrl(cfg, `/api/ai-responses/${responseId}`), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  return jsonOrThrow(res);
}

export async function postReaction(
  cfg: PublicApiConfig,
  responseId: string,
  reaction: 'bullish' | 'bearish',
): Promise<ReactionResponse> {
  const res = await fetch(raceUrl(cfg, `/api/ai-responses/${responseId}/reaction`), {
    method: 'POST',
    headers: publicPostHeaders(cfg),
    body: JSON.stringify({ reaction }),
  });
  return jsonOrThrow(res);
}

export async function getRaceAiModels(cfg: PublicApiConfig): Promise<AiModelsByProvider[]> {
  const paths = ['/api/ai-models', '/ai-models'];

  for (const path of paths) {
    try {
      const res = await fetch(raceUrl(cfg, path), {
        method: 'GET',
        headers: publicGetHeaders(cfg),
      });
      const data = await jsonOrThrow(res);
      if (!Array.isArray(data)) return [];
      return data
        .map((g) => (g && typeof g === 'object' ? normalizeAiModelsGroup(g as Record<string, unknown>) : null))
        .filter((g): g is AiModelsByProvider => !!g);
    } catch {
      // try next path
    }
  }

  return [];
}

/* ==========================================================================
 * Race API — prompt variables
 * ========================================================================== */

export type PromptVariable = {
  key: string;
  name: string;
  description: string;
  example: string;
  prompt_section: string;
};

let _promptVarsCache: PromptVariable[] | null = null;
let _promptVarsFetchedAt = 0;
const PROMPT_VARS_TTL = 300_000; // 5 min

/** Fetch available prompt variables (cached 5 min). */
export async function getPromptVariables(cfg: PublicApiConfig): Promise<PromptVariable[]> {
  if (_promptVarsCache && Date.now() - _promptVarsFetchedAt < PROMPT_VARS_TTL) {
    return _promptVarsCache;
  }
  try {
    const res = await fetch(raceUrl(cfg, '/api/prompt-variables'), {
      method: 'GET',
      headers: publicGetHeaders(cfg),
    });
    const data = await jsonOrThrow(res);
    const vars = Array.isArray(data)
      ? data.map((v: Record<string, unknown>) => ({
          key: String(v.key ?? ''),
          name: String(v.name ?? ''),
          description: String(v.description ?? ''),
          example: String(v.example ?? ''),
          prompt_section: String(v.prompt_section ?? ''),
        }))
      : [];
    _promptVarsCache = vars;
    _promptVarsFetchedAt = Date.now();
    return vars;
  } catch {
    return _promptVarsCache ?? [];
  }
}

/* ==========================================================================
 * open4dev DEX API — coin price (for tokens without price_usd)
 * ========================================================================== */

export type DexCoinPrice = {
  symbol: string;
  decimals: number;
  priceUsd: number | null;
};

const COIN_PRICE_LS_PREFIX = 'atr_cache:dex_price:';
const COIN_PRICE_TTL = 120_000; // 2 min — controls when to refetch, not when to discard

function readCoinPriceLS(key: string): { data: DexCoinPrice; fetchedAt: number } | null {
  try {
    const raw = localStorage.getItem(COIN_PRICE_LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCoinPriceLS(key: string, data: DexCoinPrice, fetchedAt: number): void {
  try { localStorage.setItem(COIN_PRICE_LS_PREFIX + key, JSON.stringify({ data, fetchedAt })); } catch { /* ignore */ }
}

// In-memory layer (avoids repeated JSON.parse per render)
const _coinPriceMem = new Map<string, { data: DexCoinPrice; fetchedAt: number }>();

/** Fetch coin price from DEX orderbook via /coins/price endpoint.
 *  Returns cached (localStorage) value instantly; refreshes in background after TTL. */
// Map display symbols back to DEX symbols for API lookups
const DEX_SYMBOL_REMAP: Record<string, string> = { AGNT: 'AGT' };

export async function getDexCoinPrice(symbol: string): Promise<DexCoinPrice | null> {
  const key = DEX_SYMBOL_REMAP[symbol.toUpperCase()] ?? symbol.toUpperCase();

  // 1. Try in-memory cache
  let cached = _coinPriceMem.get(key) ?? null;
  // 2. Fall back to localStorage
  if (!cached) {
    cached = readCoinPriceLS(key);
    if (cached) _coinPriceMem.set(key, cached);
  }

  const fresh = !cached || Date.now() - cached.fetchedAt >= COIN_PRICE_TTL;
  if (!fresh) return cached!.data;

  // Return stale data immediately, fetch in background if we have a cached value
  if (cached) {
    fetchDexCoinPriceRemote(key).catch(() => {});
    return cached.data;
  }

  // No cache at all — must await
  return fetchDexCoinPriceRemote(key);
}

type DexPairRaw = {
  counter_coin_symbol: string;
  counter_coin_decimals: number;
  best_ask: string | null;
  best_bid: string | null;
  mid_price: string | null;
  bid_order_count?: number;
  ask_order_count?: number;
};

/**
 * Build a map of known token USD prices from race API + TON price.
 * Used to convert DEX pair prices to USD.
 */
let _knownPricesCache: Map<string, number> | null = null;
let _knownPricesFetchedAt = 0;
const KNOWN_PRICES_TTL = 120_000;

async function getKnownUsdPrices(cfg?: PublicApiConfig): Promise<Map<string, number>> {
  if (_knownPricesCache && Date.now() - _knownPricesFetchedAt < KNOWN_PRICES_TTL) {
    return _knownPricesCache;
  }
  const map = new Map<string, number>();
  try {
    const [tonPrice, tokens] = await Promise.all([
      getTonPriceUsd(),
      cfg ? getRaceTokens(cfg) : Promise.resolve([]),
    ]);
    if (tonPrice) map.set('TON', tonPrice);
    map.set('USDT', 1);
    map.set('USDC', 1);
    for (const t of tokens) {
      if (t.price_usd > 0) map.set(t.symbol.toUpperCase(), t.price_usd);
    }
  } catch { /* use whatever we got */ }
  _knownPricesCache = map;
  _knownPricesFetchedAt = Date.now();
  return map;
}

/** Expose setter so views that already have a raceCfg can prime the cache. */
export function primeKnownPrices(cfg: PublicApiConfig): void {
  getKnownUsdPrices(cfg).catch(() => {});
}

/**
 * Calculate USD price from a DEX pair using known counter-coin prices.
 * Uses mid_price for valuation. Returns null if the pair data is unreliable.
 */
function pairToUsd(pair: DexPairRaw, knownPrices: Map<string, number>): number | null {
  const cs = pair.counter_coin_symbol.toUpperCase();
  const counterUsd = knownPrices.get(cs);
  if (counterUsd == null) return null;

  // Require both sides
  const bidCount = pair.bid_order_count ?? 0;
  const askCount = pair.ask_order_count ?? 0;
  if (bidCount === 0 || askCount === 0) return null;

  const PRICE_FACTOR = 1e18;
  const mid = pair.mid_price ? Number(pair.mid_price) / PRICE_FACTOR : null;
  if (mid == null || mid <= 0) return null;

  const usd = mid * counterUsd;
  // Sanity cap
  if (usd > 1000) return null;
  return usd;
}

async function fetchDexCoinPriceRemote(key: string): Promise<DexCoinPrice | null> {
  try {
    const res = await fetch(`${OPEN4DEV_BASE}/coins/price?symbol=${encodeURIComponent(key)}`);
    if (!res.ok) return _coinPriceMem.get(key)?.data ?? null;
    const data = (await res.json()) as {
      coin: { symbol: string; decimals: number };
      pairs?: DexPairRaw[];
    };

    const knownPrices = await getKnownUsdPrices();
    const estimates: { usd: number; weight: number }[] = [];

    for (const pair of data.pairs ?? []) {
      const usd = pairToUsd(pair, knownPrices);
      if (usd != null) {
        const cs = pair.counter_coin_symbol.toUpperCase();
        // Stablecoin pairs get 10x weight — most direct USD proxy
        const stableBoost = (cs === 'USDT' || cs === 'USDC') ? 10 : 1;
        const weight = ((pair.bid_order_count ?? 0) + (pair.ask_order_count ?? 0)) * stableBoost;
        estimates.push({ usd, weight });
      }
    }

    // Weighted average across all valid pairs
    let priceUsd: number | null = null;
    if (estimates.length > 0) {
      const totalWeight = estimates.reduce((s, e) => s + e.weight, 0);
      priceUsd = totalWeight > 0
        ? estimates.reduce((s, e) => s + e.usd * e.weight, 0) / totalWeight
        : estimates.reduce((s, e) => s + e.usd, 0) / estimates.length;
    }

    const result: DexCoinPrice = { symbol: key, decimals: data.coin.decimals, priceUsd };
    const now = Date.now();
    _coinPriceMem.set(key, { data: result, fetchedAt: now });
    writeCoinPriceLS(key, result, now);
    return result;
  } catch {
    return _coinPriceMem.get(key)?.data ?? null;
  }
}

/* ==========================================================================
 * Race API — token list (for prices & metadata)
 * ========================================================================== */

export type RaceToken = {
  id: string;
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  price_usd: number;
};

let _raceTokensCache: RaceToken[] | null = null;
let _raceTokensFetchedAt = 0;
const RACE_TOKENS_TTL = 120_000; // 2 min

/** Fetch all tokens from race API (cached 2 min). */
export async function getRaceTokens(cfg: PublicApiConfig): Promise<RaceToken[]> {
  if (_raceTokensCache && Date.now() - _raceTokensFetchedAt < RACE_TOKENS_TTL) {
    return _raceTokensCache;
  }
  const res = await fetch(raceUrl(cfg, '/api/tokens'), {
    method: 'GET',
    headers: publicGetHeaders(cfg),
  });
  const data = await jsonOrThrow(res);
  const SYMBOL_REMAP: Record<string, string> = { AGT: 'AGNT' };
  const tokens = (Array.isArray(data) ? data : []).map((t: Record<string, unknown>) => {
    const rawSymbol = String(t.symbol ?? '');
    return {
      id: String(t.id ?? ''),
      address: String(t.address ?? ''),
      name: String(t.name ?? ''),
      symbol: SYMBOL_REMAP[rawSymbol] ?? rawSymbol,
      decimals: Number(t.decimals ?? 9),
      price_usd: Number(t.price_usd ?? 0),
    };
  });
  _raceTokensCache = tokens;
  _raceTokensFetchedAt = Date.now();
  return tokens;
}

/* ==========================================================================
 * toncenter — jetton wallet balances
 * ========================================================================== */

export type JettonBalance = {
  jettonAddress: string; // master contract raw address
  balance: string;       // raw balance string (before decimals)
};

/** Fetch jetton wallet balances for an address from toncenter v3. */
export async function getJettonBalances(ownerAddress: string): Promise<JettonBalance[]> {
  const res = await fetch(
    `https://toncenter.com/api/v3/jetton/wallets?owner_address=${encodeURIComponent(ownerAddress)}&limit=50`,
  );
  const data = (await res.json()) as { jetton_wallets?: { jetton: string; balance: string }[] };
  return (data.jetton_wallets ?? [])
    .filter((w) => w.balance && w.balance !== '0')
    .map((w) => ({
      jettonAddress: w.jetton,
      balance: w.balance,
    }));
}

/* ==========================================================================
 * open4dev DEX API — orders & coins
 * Base: https://api.open4dev.xyz/api/v1
 * Rate limit: 1 RPS
 * ========================================================================== */

const OPEN4DEV_BASE = 'https://api.open4dev.xyz/api/v1';

export type DexOrder = {
  id: number;
  raw_address: string;
  created_at: string;
  status: string; // created | deployed | cancelled | completed | failed | pending_match | closed
  amount: number;
  initial_amount: number;
  price_rate: number;
  slippage: number;
  from_coin_id: number;
  to_coin_id: number;
};

export type DexOrderStats = {
  wallet_address: string;
  total: number;
  open: number;
  closed: number;
  by_status: Record<string, number>;
};

/** Fetch orders from open4dev for a given contract raw address (0:hex format). */
export async function getDexOrders(
  ownerRawAddress: string,
  opts?: { status?: string; limit?: number; offset?: number },
): Promise<DexOrder[]> {
  const params = new URLSearchParams();
  params.set('owner_raw_address', ownerRawAddress);
  if (opts?.status) params.set('status', opts.status);
  params.set('limit', String(opts?.limit ?? 50));
  if (opts?.offset != null) params.set('offset', String(opts.offset));
  const res = await fetch(`${OPEN4DEV_BASE}/orders?${params}`);
  const data = await res.json();
  const orders = (data as Record<string, unknown>).orders;
  if (!Array.isArray(orders)) return [];
  return orders.map((o: Record<string, unknown>) => ({
    id: Number(o.id ?? 0),
    raw_address: String(o.raw_address ?? ''),
    created_at: String(o.created_at ?? ''),
    status: String(o.status ?? ''),
    amount: Number(o.amount ?? 0),
    initial_amount: Number(o.initial_amount ?? 0),
    price_rate: Number(o.price_rate ?? 0),
    slippage: Number(o.slippage ?? 0),
    from_coin_id: Number(o.from_coin_id ?? 0),
    to_coin_id: Number(o.to_coin_id ?? 0),
  }));
}

export type DexCoin = {
  id: number;
  name: string;
  symbol: string;
};

/** Fetch a single coin by ID from open4dev. */
export async function getDexCoin(coinId: number): Promise<DexCoin | null> {
  try {
    const res = await fetch(`${OPEN4DEV_BASE}/coins/${coinId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      id: Number(data.id ?? coinId),
      name: String(data.name ?? ''),
      symbol: String(data.symbol ?? ''),
    };
  } catch {
    return null;
  }
}

// In-memory cache for coin symbols — survives re-renders but not page reloads.
const _coinCache = new Map<number, string>();
_coinCache.set(0, 'TON'); // TON is always coin ID 0

/** Resolve coin IDs to symbols. Fetches missing ones from the API (1 RPS). */
export async function resolveCoinSymbols(coinIds: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(coinIds)].filter((id) => !_coinCache.has(id));
  for (const id of unique) {
    const coin = await getDexCoin(id);
    const sym = coin?.symbol?.toUpperCase() || `#${id}`;
    _coinCache.set(id, sym === 'AGT' ? 'AGNT' : sym);
    // Respect 1 RPS rate limit between fetches
    if (unique.indexOf(id) < unique.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }
  return new Map(_coinCache);
}

/* ==========================================================================
 * TON price via CoinGecko (free, no auth)
 * ========================================================================== */

const TON_PRICE_LS_KEY = 'atr_cache:ton_price';
const TON_PRICE_TTL = 60_000; // 1 min

// Bootstrap from localStorage
let _tonPriceUsd: number | null = (() => {
  try { const r = localStorage.getItem(TON_PRICE_LS_KEY); return r ? (JSON.parse(r) as { price: number; ts: number }).price : null; } catch { return null; }
})();
let _tonPriceFetchedAt: number = (() => {
  try { const r = localStorage.getItem(TON_PRICE_LS_KEY); return r ? (JSON.parse(r) as { price: number; ts: number }).ts : 0; } catch { return 0; }
})();

/** Fetch current TON/USD price. Returns cached value instantly, refreshes after TTL. */
export async function getTonPriceUsd(): Promise<number | null> {
  const stale = Date.now() - _tonPriceFetchedAt >= TON_PRICE_TTL;

  if (!stale) return _tonPriceUsd;

  // Have a cached value — return it and refresh in background
  if (_tonPriceUsd !== null) {
    fetchTonPriceRemote().catch(() => {});
    return _tonPriceUsd;
  }

  // No cached value — must await
  return fetchTonPriceRemote();
}

async function fetchTonPriceRemote(): Promise<number | null> {
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
    const data = (await res.json()) as Record<string, Record<string, number>>;
    const price = data?.['the-open-network']?.usd ?? null;
    if (price != null) {
      _tonPriceUsd = price;
      _tonPriceFetchedAt = Date.now();
      try { localStorage.setItem(TON_PRICE_LS_KEY, JSON.stringify({ price, ts: _tonPriceFetchedAt })); } catch { /* ignore */ }
    }
    return price;
  } catch {
    return _tonPriceUsd;
  }
}

/* ==========================================================================
 * open4dev DEX API — Order Book
 * ========================================================================== */

/* ---------- Order Scanner (custom domain) ---------- */

const ORDER_SCANNER_BASE = (
  (import.meta.env.VITE_ORDER_SCANNER_URL as string | undefined) ??
  'https://scanner.jarvis-agent.workers.dev'
).trim().replace(/\/$/, '');

export type ScannerLevel = {
  price: number;       // base per quote (raw float)
  size: number;        // quote amount
  total: number;       // base amount
  orderCount: number;
};

export type ScannerBookResponse = {
  asks: ScannerLevel[];
  bids: ScannerLevel[];
  bestAsk: number | null;
  bestBid: number | null;
  spread: number | null;
  mid: number | null;
};

export type DexOrderBookLevel = {
  price_rate: number;
  total_amount: number;
  order_count: number;
  total_value: number;
  cumulative_amount: number;
  cumulative_value: number;
};

export type DexOrderBookResponse = {
  from_symbol: string;
  to_symbol: string;
  from_decimals: number;
  to_decimals: number;
  spread: number | null;
  mid_price: number | null;
  asks: DexOrderBookLevel[];
  bids: DexOrderBookLevel[];
};

/** Fetch order book from the order-scanner worker using vault addresses. */
export async function getOrderScannerBook(opts: {
  baseVault: string;
  quoteVault: string;
  levels?: number;
}): Promise<ScannerBookResponse> {
  const params = new URLSearchParams();
  params.set('baseVault', opts.baseVault);
  params.set('quoteVault', opts.quoteVault);
  if (opts.levels) params.set('levels', String(opts.levels));
  const res = await fetch(`${ORDER_SCANNER_BASE}/orderbook?${params}`);
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.ok) throw new Error('Order scanner returned error');
  const book = json.book as Record<string, unknown>;
  const parseLevel = (l: Record<string, unknown>): ScannerLevel => ({
    price: Number(l.price ?? 0),
    size: Number(l.size ?? 0),
    total: Number(l.total ?? 0),
    orderCount: Number(l.order_count ?? 0),
  });
  const asks = Array.isArray(book.asks) ? book.asks.map((a: Record<string, unknown>) => parseLevel(a)) : [];
  const bids = Array.isArray(book.bids) ? book.bids.map((b: Record<string, unknown>) => parseLevel(b)) : [];
  return {
    asks,
    bids,
    bestAsk: book.best_ask != null ? Number(book.best_ask) : null,
    bestBid: book.best_bid != null ? Number(book.best_bid) : null,
    spread: book.spread != null ? Number(book.spread) : null,
    mid: book.mid != null ? Number(book.mid) : null,
  };
}

/** Fetch aggregated order book from open4dev by symbols (or jetton minters in swagger). */
export async function getDexOrderBook(opts: {
  fromSymbol: string;
  toSymbol: string;
  limit?: number;
}): Promise<DexOrderBookResponse> {
  const params = new URLSearchParams();
  params.set('from_symbol', opts.fromSymbol);
  params.set('to_symbol', opts.toSymbol);
  if (opts.limit != null) params.set('limit', String(opts.limit));
  const res = await fetch(`${OPEN4DEV_BASE}/orders/book?${params}`);
  if (!res.ok) throw new Error(`Open4Dev order book error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as Record<string, unknown>;

  const toDec = Number(data.to_decimals ?? 9);
  const fromDec = Number(data.from_decimals ?? 9);
  const priceFactor = 1e18;           // price_rate is always 18-decimal (vault format)
  const baseFactor = 10 ** toDec;     // to_symbol (base) nano → human
  const quoteFactor = 10 ** fromDec;  // from_symbol (quote) nano → human

  const parseLevel = (l: Record<string, unknown>): DexOrderBookLevel => ({
    price_rate: Number(l.price_rate ?? 0) / priceFactor,
    total_amount: Number(l.total_amount ?? 0) / baseFactor,
    order_count: Number(l.order_count ?? 0),
    total_value: Number(l.total_value ?? 0) / quoteFactor,
    cumulative_amount: Number(l.cumulative_amount ?? 0) / baseFactor,
    cumulative_value: Number(l.cumulative_value ?? 0) / quoteFactor,
  });

  const asks = Array.isArray(data.asks) ? data.asks.map((a: Record<string, unknown>) => parseLevel(a)) : [];
  const bids = Array.isArray(data.bids) ? data.bids.map((b: Record<string, unknown>) => parseLevel(b)) : [];

  return {
    from_symbol: String(data.from_symbol ?? opts.fromSymbol),
    to_symbol: String(data.to_symbol ?? opts.toSymbol),
    from_decimals: fromDec,
    to_decimals: toDec,
    spread: data.spread != null ? Number(data.spread) / priceFactor : null,
    mid_price: data.mid_price != null ? Number(data.mid_price) / priceFactor : null,
    asks,
    bids,
  };
}

/* ---------- Order Scanner — stats ---------- */

export type ScannerStatsWindow = {
  open_orders: number;
  completed_orders: number;
  volume_usd: string;
};

export type ScannerStatsResponse = {
  scope: {
    base_vault_friendly: string;
    quote_vault_friendly: string;
  };
  generated_at: number;
  windows: {
    '1h': ScannerStatsWindow;
    '24h': ScannerStatsWindow;
    all_time: ScannerStatsWindow;
  };
};

/** Fetch order stats from order-scanner worker for a vault pair. */
export async function getOrderScannerStats(opts: {
  baseVault: string;
  quoteVault: string;
}): Promise<ScannerStatsResponse> {
  const params = new URLSearchParams();
  params.set('baseVault', opts.baseVault);
  params.set('quoteVault', opts.quoteVault);
  const res = await fetch(`${ORDER_SCANNER_BASE}/stats/orders?${params}`);
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.ok) throw new Error('Order scanner stats returned error');
  const stats = json.stats as Record<string, unknown>;
  const parseWindow = (w: Record<string, unknown>): ScannerStatsWindow => ({
    open_orders: Number(w.open_orders ?? 0),
    completed_orders: Number(w.completed_orders ?? 0),
    volume_usd: String(w.volume_usd ?? '0'),
  });
  const windows = stats.windows as Record<string, Record<string, unknown>>;
  const scope = stats.scope as Record<string, string>;
  return {
    scope: {
      base_vault_friendly: String(scope.base_vault_friendly ?? ''),
      quote_vault_friendly: String(scope.quote_vault_friendly ?? ''),
    },
    generated_at: Number(stats.generated_at ?? 0),
    windows: {
      '1h': parseWindow(windows['1h'] ?? {}),
      '24h': parseWindow(windows['24h'] ?? {}),
      all_time: parseWindow(windows.all_time ?? {}),
    },
  };
}

export type DexCoinFull = {
  id: number;
  name: string;
  symbol: string;
};

/** Fetch all coins from open4dev (paginated, returns all). */
export async function getDexCoins(): Promise<DexCoinFull[]> {
  const res = await fetch(`${OPEN4DEV_BASE}/coins?limit=200`);
  const data = (await res.json()) as Record<string, unknown>;
  const coins = (data as Record<string, unknown>).coins;
  if (!Array.isArray(coins)) return [];
  return coins.map((c: Record<string, unknown>) => ({
    id: Number(c.id ?? 0),
    name: String(c.name ?? ''),
    symbol: String(c.symbol ?? ''),
  }));
}

/** Fetch deployed orders for a specific coin pair from open4dev (for building order books). */
export async function getDexOrdersByPair(
  fromCoinId: number,
  toCoinId: number,
  opts?: { limit?: number },
): Promise<DexOrder[]> {
  const params = new URLSearchParams();
  params.set('from_coin_id', String(fromCoinId));
  params.set('to_coin_id', String(toCoinId));
  params.set('status', 'deployed');
  params.set('limit', String(opts?.limit ?? 200));
  const res = await fetch(`${OPEN4DEV_BASE}/orders?${params}`);
  const data = await res.json();
  const orders = (data as Record<string, unknown>).orders;
  if (!Array.isArray(orders)) return [];
  return orders.map((o: Record<string, unknown>) => ({
    id: Number(o.id ?? 0),
    raw_address: String(o.raw_address ?? ''),
    created_at: String(o.created_at ?? ''),
    status: String(o.status ?? ''),
    amount: Number(o.amount ?? 0),
    initial_amount: Number(o.initial_amount ?? 0),
    price_rate: Number(o.price_rate ?? 0),
    slippage: Number(o.slippage ?? 0),
    from_coin_id: Number(o.from_coin_id ?? 0),
    to_coin_id: Number(o.to_coin_id ?? 0),
  }));
}

export type DexTradingStatusStat = {
  count: number;
  volume: number;
};

export type DexTradingStatsPeriod = {
  period: string;
  total_orders: number;
  total_volume: number;
  by_status: Record<string, DexTradingStatusStat>;
};

export type DexTradingStats = {
  from_symbol: string;
  to_symbol: string;
  from_decimals: number;
  to_decimals: number;
  periods: DexTradingStatsPeriod[];
};

/** Fetch market trading stats for a symbol pair from open4dev. */
export async function getDexTradingStats(fromSymbol: string, toSymbol: string): Promise<DexTradingStats> {
  const params = new URLSearchParams();
  params.set('from_symbol', fromSymbol);
  params.set('to_symbol', toSymbol);
  const res = await fetch(`${OPEN4DEV_BASE}/orders/trading-stats?${params}`);
  const data = (await res.json()) as Record<string, unknown>;

  const volFactor = 10 ** Number(data.from_decimals ?? 9); // volumes are in from_symbol nano
  const periodsRaw = Array.isArray(data.periods) ? data.periods as Record<string, unknown>[] : [];
  const periods = periodsRaw.map((p) => {
    const byStatusRaw = p.by_status;
    const byStatus: Record<string, DexTradingStatusStat> = {};
    if (byStatusRaw && typeof byStatusRaw === 'object') {
      for (const [status, val] of Object.entries(byStatusRaw as Record<string, unknown>)) {
        if (!val || typeof val !== 'object') continue;
        byStatus[status] = {
          count: Number((val as Record<string, unknown>).count ?? 0),
          volume: Number((val as Record<string, unknown>).volume ?? 0) / volFactor,
        };
      }
    }
    return {
      period: String(p.period ?? ''),
      total_orders: Number(p.total_orders ?? 0),
      total_volume: Number(p.total_volume ?? 0) / volFactor,
      by_status: byStatus,
    };
  });

  return {
    from_symbol: String(data.from_symbol ?? fromSymbol),
    to_symbol: String(data.to_symbol ?? toSymbol),
    from_decimals: Number(data.from_decimals ?? 9),
    to_decimals: Number(data.to_decimals ?? 9),
    periods,
  };
}

/** Fetch order stats from open4dev. */
export async function getDexOrderStats(walletRawAddress: string): Promise<DexOrderStats> {
  const res = await fetch(`${OPEN4DEV_BASE}/orders/stats?wallet_address=${encodeURIComponent(walletRawAddress)}`);
  const data = (await res.json()) as Record<string, unknown>;
  return {
    wallet_address: String(data.wallet_address ?? ''),
    total: Number(data.total ?? 0),
    open: Number(data.open ?? 0),
    closed: Number(data.closed ?? 0),
    by_status: (data.by_status as Record<string, number>) ?? {},
  };
}

/* ==========================================================================
 * TonConnect Auth — JWT
 * ========================================================================== */

export type AuthPayloadResponse = {
  payload: string;
};

export type CheckProofRequest = {
  address: string;
  proof: {
    timestamp: number;
    domain: { lengthBytes: number; value: string };
    payload: string;
    signature: string;
  };
  state_init: string;
};

export type CheckProofResponse = {
  token: string;
};

/** Get a random payload for TonConnect proof. */
export async function getAuthPayload(cfg: PublicApiConfig): Promise<string> {
  const res = await fetch(raceUrl(cfg, '/api/auth/payload'), {
    method: 'GET',
    headers: publicGetHeaders(),
  });
  const data = (await jsonOrThrow(res)) as AuthPayloadResponse;
  return data.payload;
}

/** Verify TonConnect proof and get a JWT token. */
export async function checkProof(cfg: PublicApiConfig, body: CheckProofRequest): Promise<string> {
  const res = await fetch(raceUrl(cfg, '/api/auth/check-proof'), {
    method: 'POST',
    headers: publicPostHeaders(),
    body: JSON.stringify(body),
  });
  const data = (await jsonOrThrow(res)) as CheckProofResponse;
  return data.token;
}
