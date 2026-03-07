import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV5R1, Address } from "@ton/ton";

// --- Environment & Config ---

export const RACE_API = process.env.OPEN4DEV_RACE_API ?? "https://ai-api.open4dev.xyz";
export const DEX_API = process.env.OPEN4DEV_DEX_API ?? "https://api.open4dev.xyz/api/v1";
export const TONCENTER = process.env.TONCENTER_API ?? "https://toncenter.com";

export function getMnemonic(): string[] {
  const raw = process.env.TON_MNEMONIC;
  if (!raw || raw.trim().split(/\s+/).length < 24) {
    console.error("ERROR: TON_MNEMONIC env var must contain 24 words");
    process.exit(1);
  }
  return raw.trim().split(/\s+/);
}

// --- Wallet ---

export async function getKeypair() {
  return mnemonicToPrivateKey(getMnemonic());
}

export async function getWalletAddress(): Promise<Address> {
  const kp = await getKeypair();
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey });
  return wallet.address;
}

export async function getWalletContract() {
  const kp = await getKeypair();
  const client = new TonClient({ endpoint: `${TONCENTER}/api/v2/jsonRPC` });
  const wallet = client.open(WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey }));
  return { wallet, client, keypair: kp };
}

// --- toncenter helpers ---

export async function getTonBalance(address: string): Promise<bigint> {
  const res = await fetch(`${TONCENTER}/api/v2/getAddressBalance?address=${encodeURIComponent(address)}`);
  const data = await res.json() as { ok: boolean; result: string };
  if (!data.ok) return 0n;
  return BigInt(data.result);
}

export async function getAddressInfo(address: string): Promise<{ balance: bigint; state: string }> {
  const res = await fetch(`${TONCENTER}/api/v2/getAddressInformation?address=${encodeURIComponent(address)}`);
  const data = await res.json() as { ok: boolean; result: { balance: string; state: string } };
  if (!data.ok) return { balance: 0n, state: "unknown" };
  return { balance: BigInt(data.result.balance), state: data.result.state };
}

export type JettonWallet = {
  jettonAddress: string;
  balance: string;
};

export async function getJettonBalances(ownerAddress: string): Promise<JettonWallet[]> {
  const res = await fetch(
    `${TONCENTER}/api/v3/jetton/wallets?owner_address=${encodeURIComponent(ownerAddress)}&limit=50`
  );
  const data = await res.json() as { jetton_wallets?: { jetton: string; balance: string }[] };
  return (data.jetton_wallets ?? [])
    .filter(w => w.balance && w.balance !== "0")
    .map(w => ({ jettonAddress: w.jetton, balance: w.balance }));
}

// --- Race API helpers ---

export type RaceToken = {
  id: string; address: string; name: string; symbol: string; decimals: number; price_usd: number;
};

export async function fetchRaceTokens(): Promise<RaceToken[]> {
  const res = await fetch(`${RACE_API}/api/tokens`);
  const data = await res.json() as Record<string, unknown>[];
  return (Array.isArray(data) ? data : []).map(t => ({
    id: String(t.id ?? ""),
    address: String(t.address ?? ""),
    name: String(t.name ?? ""),
    symbol: String(t.symbol ?? ""),
    decimals: Number(t.decimals ?? 9),
    price_usd: Number(t.price_usd ?? 0),
  }));
}

// --- DEX API helpers ---

export type OrderBookLevel = {
  price_rate: number; total_amount: number; order_count: number;
};

export type OrderBook = {
  from_symbol: string; to_symbol: string;
  spread: number | null; mid_price: number | null;
  asks: OrderBookLevel[]; bids: OrderBookLevel[];
};

export async function fetchOrderBook(fromSymbol: string, toSymbol: string, limit = 15): Promise<OrderBook> {
  const params = new URLSearchParams({ from_symbol: fromSymbol, to_symbol: toSymbol, limit: String(limit) });
  const res = await fetch(`${DEX_API}/orders/book?${params}`);
  if (!res.ok) throw new Error(`Order book error: ${res.status}`);
  const data = await res.json() as Record<string, unknown>;
  const parseLevel = (l: Record<string, unknown>): OrderBookLevel => ({
    price_rate: Number(l.price_rate ?? 0),
    total_amount: Number(l.total_amount ?? 0),
    order_count: Number(l.order_count ?? 0),
  });
  return {
    from_symbol: String(data.from_symbol ?? fromSymbol),
    to_symbol: String(data.to_symbol ?? toSymbol),
    spread: data.spread != null ? Number(data.spread) : null,
    mid_price: data.mid_price != null ? Number(data.mid_price) : null,
    asks: Array.isArray(data.asks) ? data.asks.map((a: Record<string, unknown>) => parseLevel(a)) : [],
    bids: Array.isArray(data.bids) ? data.bids.map((b: Record<string, unknown>) => parseLevel(b)) : [],
  };
}

export type DexOrder = {
  id: number; raw_address: string; created_at: string; status: string;
  amount: number; initial_amount: number; price_rate: number; slippage: number;
  from_coin_id: number; to_coin_id: number;
};

export async function fetchDexOrders(ownerRawAddress: string, opts?: { status?: string; limit?: number }): Promise<DexOrder[]> {
  const params = new URLSearchParams({ owner_raw_address: ownerRawAddress, limit: String(opts?.limit ?? 50) });
  if (opts?.status) params.set("status", opts.status);
  const res = await fetch(`${DEX_API}/orders?${params}`);
  const data = await res.json() as Record<string, unknown>;
  const orders = (data as Record<string, unknown>).orders;
  if (!Array.isArray(orders)) return [];
  return orders.map((o: Record<string, unknown>) => ({
    id: Number(o.id ?? 0), raw_address: String(o.raw_address ?? ""),
    created_at: String(o.created_at ?? ""), status: String(o.status ?? ""),
    amount: Number(o.amount ?? 0), initial_amount: Number(o.initial_amount ?? 0),
    price_rate: Number(o.price_rate ?? 0), slippage: Number(o.slippage ?? 0),
    from_coin_id: Number(o.from_coin_id ?? 0), to_coin_id: Number(o.to_coin_id ?? 0),
  }));
}

export type DexCoin = { id: number; name: string; symbol: string };

export async function fetchDexCoins(): Promise<DexCoin[]> {
  const res = await fetch(`${DEX_API}/coins?limit=200`);
  const data = await res.json() as Record<string, unknown>;
  const coins = (data as Record<string, unknown>).coins;
  if (!Array.isArray(coins)) return [];
  return coins.map((c: Record<string, unknown>) => ({
    id: Number(c.id ?? 0), name: String(c.name ?? ""), symbol: String(c.symbol ?? ""),
  }));
}

// --- Formatting ---

export function formatTon(nanotons: bigint): string {
  const tons = Number(nanotons) / 1e9;
  return tons.toFixed(4);
}

export function toRawAddress(address: Address): string {
  return `${address.workChain}:${address.hash.toString("hex")}`;
}
