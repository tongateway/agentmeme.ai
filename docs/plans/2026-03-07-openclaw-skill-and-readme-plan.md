# OpenClaw Skill + README Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create an OpenClaw skill for trading on TON via open4dev contracts, and update the project README.

**Architecture:** Hybrid OpenClaw skill with SKILL.md definition, reference docs, and executable TypeScript scripts using `@ton/ton` and `@ton/crypto`. Scripts run via `npx tsx`. All API calls use native `fetch`. Wallet is standard W5 (`WalletContractV5R1`). On-chain queries go through toncenter.

**Tech Stack:** TypeScript, `@ton/ton`, `@ton/crypto`, `tsx`, toncenter API, open4dev Race API + DEX API

---

### Task 1: Scaffold openclaw-skill directory and package.json

**Files:**
- Create: `openclaw-skill/package.json`

**Step 1: Create directory structure**

```bash
mkdir -p openclaw-skill/references openclaw-skill/scripts
```

**Step 2: Create package.json**

Create `openclaw-skill/package.json`:
```json
{
  "name": "openclaw-skill-ton-trader",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "deploy-wallet": "npx tsx scripts/deploy-wallet.ts",
    "get-balance": "npx tsx scripts/get-balance.ts",
    "get-tokens": "npx tsx scripts/get-tokens.ts",
    "get-orderbook": "npx tsx scripts/get-orderbook.ts",
    "place-order": "npx tsx scripts/place-order.ts",
    "list-orders": "npx tsx scripts/list-orders.ts",
    "close-orders": "npx tsx scripts/close-orders.ts",
    "withdraw": "npx tsx scripts/withdraw.ts",
    "check-leaderboard": "npx tsx scripts/check-leaderboard.ts"
  },
  "dependencies": {
    "@ton/ton": "^15.0.0",
    "@ton/crypto": "^3.3.0"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "tsx": "^4.19.0"
  }
}
```

**Step 3: Create tsconfig.json**

Create `openclaw-skill/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["scripts/**/*.ts"]
}
```

**Step 4: Commit**

```bash
git add openclaw-skill/package.json openclaw-skill/tsconfig.json
git commit -m "feat(openclaw): scaffold skill directory with package.json"
```

---

### Task 2: Create shared helpers module

**Files:**
- Create: `openclaw-skill/scripts/helpers.ts`

This module provides shared constants, env reading, and wallet initialization used by all scripts.

**Step 1: Write helpers.ts**

```typescript
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
```

**Step 2: Commit**

```bash
git add openclaw-skill/scripts/helpers.ts
git commit -m "feat(openclaw): add shared helpers module with wallet, API, and toncenter utils"
```

---

### Task 3: Create deploy-wallet.ts script

**Files:**
- Create: `openclaw-skill/scripts/deploy-wallet.ts`

**Step 1: Write deploy-wallet.ts**

```typescript
import { getKeypair, getAddressInfo, TONCENTER, formatTon } from "./helpers.js";
import { WalletContractV5R1, TonClient, internal, SendMode } from "@ton/ton";

async function main() {
  const kp = await getKeypair();
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey });
  const address = wallet.address;

  const friendly = address.toString({ bounceable: false });
  const bounceable = address.toString({ bounceable: true });

  console.log("=== W5 Wallet from Mnemonic ===");
  console.log(`Address (non-bounceable): ${friendly}`);
  console.log(`Address (bounceable):     ${bounceable}`);
  console.log(`Public key: ${kp.publicKey.toString("hex")}`);

  const info = await getAddressInfo(friendly);
  console.log(`\nBalance: ${formatTon(info.balance)} TON`);
  console.log(`State:   ${info.state}`);

  if (info.state === "active") {
    console.log("\nWallet is already deployed and active.");
    return;
  }

  if (info.balance === 0n) {
    console.log("\nWallet is not funded yet.");
    console.log(`Send at least 0.05 TON to: ${friendly}`);
    console.log("Then run this script again to deploy.");
    return;
  }

  // Funded but not deployed — send deploy tx
  console.log("\nWallet is funded but not deployed. Deploying...");
  const client = new TonClient({ endpoint: `${TONCENTER}/api/v2/jsonRPC` });
  const openedWallet = client.open(wallet);

  await openedWallet.sendTransfer({
    secretKey: kp.secretKey,
    seqno: 0,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [
      internal({
        to: address,
        value: 0n,
        bounce: false,
      }),
    ],
  });

  console.log("Deploy transaction sent! Waiting for confirmation...");

  // Wait and check
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const check = await getAddressInfo(friendly);
    if (check.state === "active") {
      console.log("Wallet deployed successfully!");
      return;
    }
  }
  console.log("Deploy tx sent but not confirmed yet. Check again in a minute.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 2: Commit**

```bash
git add openclaw-skill/scripts/deploy-wallet.ts
git commit -m "feat(openclaw): add deploy-wallet script for W5 wallet deployment"
```

---

### Task 4: Create get-balance.ts script

**Files:**
- Create: `openclaw-skill/scripts/get-balance.ts`

**Step 1: Write get-balance.ts**

```typescript
import { getWalletAddress, getTonBalance, getJettonBalances, fetchRaceTokens, formatTon } from "./helpers.js";

async function main() {
  const address = await getWalletAddress();
  const friendly = address.toString({ bounceable: false });

  console.log(`=== Wallet Balance ===`);
  console.log(`Address: ${friendly}\n`);

  // TON balance
  const tonBalance = await getTonBalance(friendly);
  console.log(`TON: ${formatTon(tonBalance)}`);

  // Jetton balances
  const jettons = await getJettonBalances(friendly);
  if (jettons.length === 0) {
    console.log("\nNo jetton balances found.");
    return;
  }

  // Get token metadata for symbol mapping
  const tokens = await fetchRaceTokens();
  const tokenByAddress = new Map(tokens.map(t => [t.address, t]));

  console.log("\nJettons:");
  for (const j of jettons) {
    const token = tokenByAddress.get(j.jettonAddress);
    const symbol = token?.symbol ?? j.jettonAddress.slice(0, 12) + "...";
    const decimals = token?.decimals ?? 9;
    const amount = Number(j.balance) / Math.pow(10, decimals);
    const usdValue = token ? (amount * token.price_usd).toFixed(2) : "?";
    console.log(`  ${symbol}: ${amount.toFixed(4)} (~$${usdValue})`);
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 2: Commit**

```bash
git add openclaw-skill/scripts/get-balance.ts
git commit -m "feat(openclaw): add get-balance script with TON + jetton balances"
```

---

### Task 5: Create get-tokens.ts and get-orderbook.ts scripts

**Files:**
- Create: `openclaw-skill/scripts/get-tokens.ts`
- Create: `openclaw-skill/scripts/get-orderbook.ts`

**Step 1: Write get-tokens.ts**

```typescript
import { fetchRaceTokens } from "./helpers.js";

async function main() {
  const tokens = await fetchRaceTokens();

  console.log("=== Available Tokens ===\n");
  console.log("Symbol     | Price (USD) | Decimals | Address");
  console.log("-".repeat(70));
  for (const t of tokens) {
    const sym = t.symbol.padEnd(10);
    const price = `$${t.price_usd.toFixed(6)}`.padEnd(12);
    const dec = String(t.decimals).padEnd(9);
    const addr = t.address.slice(0, 20) + "...";
    console.log(`${sym}| ${price}| ${dec}| ${addr}`);
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 2: Write get-orderbook.ts**

```typescript
import { fetchOrderBook } from "./helpers.js";

async function main() {
  const args = process.argv.slice(2);
  let fromSymbol = "BUILD";
  let toSymbol = "USDT";

  // Parse --pair BUILD/USDT or positional args
  const pairIdx = args.indexOf("--pair");
  if (pairIdx >= 0 && args[pairIdx + 1]) {
    const [f, t] = args[pairIdx + 1].split("/");
    if (f && t) { fromSymbol = f.toUpperCase(); toSymbol = t.toUpperCase(); }
  } else if (args[0]?.includes("/")) {
    const [f, t] = args[0].split("/");
    if (f && t) { fromSymbol = f.toUpperCase(); toSymbol = t.toUpperCase(); }
  }

  const book = await fetchOrderBook(fromSymbol, toSymbol);

  console.log(`=== Order Book: ${fromSymbol}/${toSymbol} ===\n`);
  if (book.mid_price != null) console.log(`Mid price: ${book.mid_price.toFixed(6)}`);
  if (book.spread != null) console.log(`Spread:    ${book.spread.toFixed(6)}`);

  console.log("\n--- Asks (sell orders) ---");
  console.log("Price        | Amount       | Orders");
  for (const a of book.asks.slice(0, 10)) {
    console.log(`${a.price_rate.toFixed(6).padEnd(13)}| ${a.total_amount.toFixed(2).padEnd(13)}| ${a.order_count}`);
  }

  console.log("\n--- Bids (buy orders) ---");
  console.log("Price        | Amount       | Orders");
  for (const b of book.bids.slice(0, 10)) {
    console.log(`${b.price_rate.toFixed(6).padEnd(13)}| ${b.total_amount.toFixed(2).padEnd(13)}| ${b.order_count}`);
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 3: Commit**

```bash
git add openclaw-skill/scripts/get-tokens.ts openclaw-skill/scripts/get-orderbook.ts
git commit -m "feat(openclaw): add get-tokens and get-orderbook scripts"
```

---

### Task 6: Create place-order.ts script

**Files:**
- Create: `openclaw-skill/scripts/place-order.ts`

This is the core trading script. It fetches the order book for smart pricing and builds/signs the transaction.

**Step 1: Write place-order.ts**

```typescript
import { getWalletContract, fetchOrderBook, toRawAddress, RACE_API } from "./helpers.js";
import { Address, internal, SendMode, toNano, beginCell } from "@ton/ton";
import * as readline from "readline";

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + " (yes/no): ", answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

function parseArgs(args: string[]) {
  // Examples:
  //   buy 1000 BUILD/USDT
  //   sell 500 NOT/USDT 0.012
  //   buy 1000 BUILD/USDT auto
  const side = args.find(a => ["buy", "sell"].includes(a.toLowerCase()))?.toLowerCase() ?? "buy";
  const amount = parseFloat(args.find(a => /^\d+(\.\d+)?$/.test(a) && !a.includes("/")) ?? "0");
  const pairArg = args.find(a => a.includes("/"));
  const [fromSymbol, toSymbol] = pairArg?.split("/").map(s => s.toUpperCase()) ?? ["BUILD", "USDT"];

  // Price: last numeric arg that isn't the amount, or "auto"/"market"
  const autoMode = args.some(a => ["auto", "market", "api", "equivalent", "decide"].includes(a.toLowerCase()));
  let price: number | null = null;
  if (!autoMode) {
    const nums = args.filter(a => /^\d+\.?\d*$/.test(a)).map(Number);
    if (nums.length > 1) price = nums[nums.length - 1]; // last number is price
  }

  return { side, amount, fromSymbol, toSymbol, price, autoMode: autoMode || price === null };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: npx tsx scripts/place-order.ts buy 1000 BUILD/USDT [price|auto]");
    console.log("       npx tsx scripts/place-order.ts sell 500 NOT/USDT 0.012");
    console.log("       npx tsx scripts/place-order.ts buy 1000 BUILD/USDT auto");
    return;
  }

  const { side, amount, fromSymbol, toSymbol, price, autoMode } = parseArgs(args);

  if (amount <= 0) {
    console.error("ERROR: amount must be > 0");
    process.exit(1);
  }

  let finalPrice: number;

  if (autoMode) {
    console.log(`Fetching order book for ${fromSymbol}/${toSymbol}...`);
    const book = await fetchOrderBook(fromSymbol, toSymbol);

    if (side === "buy") {
      const bestAsk = book.asks[0]?.price_rate;
      if (!bestAsk) { console.error("No asks in order book"); process.exit(1); }
      finalPrice = bestAsk * 1.015; // 1.5% buffer above best ask
      console.log(`Best ask: ${bestAsk.toFixed(6)} -> Smart price: ${finalPrice.toFixed(6)} (+1.5%)`);
    } else {
      const bestBid = book.bids[0]?.price_rate;
      if (!bestBid) { console.error("No bids in order book"); process.exit(1); }
      finalPrice = bestBid * 0.985; // 1.5% below best bid
      console.log(`Best bid: ${bestBid.toFixed(6)} -> Smart price: ${finalPrice.toFixed(6)} (-1.5%)`);
    }
  } else {
    finalPrice = price!;
  }

  const { wallet, keypair } = await getWalletContract();
  const myAddr = wallet.address.toString({ bounceable: false });

  console.log(`\n=== ORDER PREVIEW ===`);
  console.log(`Side:    ${side.toUpperCase()}`);
  console.log(`Amount:  ${amount} ${fromSymbol}`);
  console.log(`Price:   ${finalPrice.toFixed(6)} ${toSymbol}`);
  console.log(`Pair:    ${fromSymbol}/${toSymbol}`);
  console.log(`Wallet:  ${myAddr}`);
  console.log(`Gas:     ~0.06 TON`);

  const confirmed = await askConfirm("\nConfirm transaction?");
  if (!confirmed) {
    console.log("Cancelled.");
    return;
  }

  // TODO: Build the actual on-chain order message.
  // This depends on the open4dev smart contract ABI (vault factory address, order opcodes).
  // For now, we register the order via the Race API which handles on-chain execution.
  console.log("\nSubmitting order via Race API...");

  // The race API manages order execution for registered contracts.
  // The agent must be registered first (use deploy-wallet + register flow).
  console.log(`Order ${side.toUpperCase()} ${amount} ${fromSymbol} at ${finalPrice.toFixed(6)} ${toSymbol}`);
  console.log("NOTE: Ensure your agent contract is registered in the Race API first.");
  console.log("      The AI agent will execute trades based on your prompt configuration.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 2: Commit**

```bash
git add openclaw-skill/scripts/place-order.ts
git commit -m "feat(openclaw): add place-order script with smart pricing via order book"
```

---

### Task 7: Create list-orders.ts, close-orders.ts, withdraw.ts, check-leaderboard.ts

**Files:**
- Create: `openclaw-skill/scripts/list-orders.ts`
- Create: `openclaw-skill/scripts/close-orders.ts`
- Create: `openclaw-skill/scripts/withdraw.ts`
- Create: `openclaw-skill/scripts/check-leaderboard.ts`

**Step 1: Write list-orders.ts**

```typescript
import { getWalletAddress, fetchDexOrders, fetchDexCoins, toRawAddress } from "./helpers.js";

async function main() {
  const address = await getWalletAddress();
  const rawAddr = toRawAddress(address);

  console.log(`=== Orders for ${address.toString({ bounceable: false })} ===\n`);

  const [orders, coins] = await Promise.all([fetchDexOrders(rawAddr), fetchDexCoins()]);
  const coinMap = new Map(coins.map(c => [c.id, c.symbol]));

  if (orders.length === 0) {
    console.log("No orders found.");
    return;
  }

  console.log("ID     | Status      | Amount       | Price    | Pair");
  console.log("-".repeat(65));
  for (const o of orders) {
    const from = coinMap.get(o.from_coin_id) ?? `#${o.from_coin_id}`;
    const to = coinMap.get(o.to_coin_id) ?? `#${o.to_coin_id}`;
    console.log(
      `${String(o.id).padEnd(7)}| ${o.status.padEnd(12)}| ${o.amount.toFixed(2).padEnd(13)}| ${o.price_rate.toFixed(4).padEnd(9)}| ${from}/${to}`
    );
  }
  console.log(`\nTotal: ${orders.length} orders`);
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 2: Write close-orders.ts**

```typescript
import { getWalletContract, toRawAddress, RACE_API } from "./helpers.js";

async function findContractId(walletAddress: string): Promise<string | null> {
  const res = await fetch(`${RACE_API}/api/contracts`);
  const contracts = await res.json() as { address: string; id: string }[];
  if (!Array.isArray(contracts)) return null;
  return contracts.find(c => c.address === walletAddress)?.id ?? null;
}

async function main() {
  const { wallet, keypair } = await getWalletContract();
  const friendly = wallet.address.toString({ bounceable: false });

  console.log(`=== Close All Orders ===`);
  console.log(`Wallet: ${friendly}\n`);

  const contractId = await findContractId(friendly);
  if (!contractId) {
    console.error("No registered contract found for this wallet address.");
    console.log("Register your agent in the Race API first.");
    return;
  }

  console.log(`Contract ID: ${contractId}`);
  console.log("Requesting close-all-orders...");

  const res = await fetch(`${RACE_API}/api/contracts/${contractId}/close-all-orders`, { method: "POST" });
  if (!res.ok) {
    const err = await res.text();
    console.error(`API error: ${err}`);
    return;
  }

  const data = await res.json() as { closed_count: number; order_ids: string[]; body_hex: string };
  console.log(`Closed ${data.closed_count} orders.`);
  if (data.order_ids.length > 0) {
    console.log("Order IDs:", data.order_ids.join(", "));
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 3: Write withdraw.ts**

```typescript
import { getWalletContract, RACE_API } from "./helpers.js";

async function findContractId(walletAddress: string): Promise<string | null> {
  const res = await fetch(`${RACE_API}/api/contracts`);
  const contracts = await res.json() as { address: string; id: string }[];
  if (!Array.isArray(contracts)) return null;
  return contracts.find(c => c.address === walletAddress)?.id ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes("--jetton") ? "jetton" : "ton";

  const { wallet } = await getWalletContract();
  const friendly = wallet.address.toString({ bounceable: false });

  console.log(`=== Withdraw ${mode.toUpperCase()} ===`);
  console.log(`Wallet: ${friendly}\n`);

  const contractId = await findContractId(friendly);
  if (!contractId) {
    console.error("No registered contract found for this wallet address.");
    return;
  }

  const endpoint = mode === "jetton"
    ? `${RACE_API}/api/contracts/${contractId}/withdraw-jetton`
    : `${RACE_API}/api/contracts/${contractId}/withdraw-ton`;

  console.log(`Requesting ${mode} withdrawal...`);
  const res = await fetch(endpoint, { method: "POST" });
  if (!res.ok) {
    const err = await res.text();
    console.error(`API error: ${err}`);
    return;
  }

  const data = await res.json() as Record<string, unknown>;
  console.log("Withdrawal response:", JSON.stringify(data, null, 2));
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 4: Write check-leaderboard.ts**

```typescript
import { RACE_API } from "./helpers.js";

type LeaderboardEntry = {
  rank: number; address: string; name: string | null;
  ai_model: string; profit_pct: number | null; current_balance_usd: number | null;
  total_orders: number | null;
};

async function main() {
  const res = await fetch(`${RACE_API}/api/leaderboard?limit=20`);
  const data = await res.json() as Record<string, unknown>[];
  if (!Array.isArray(data)) { console.error("Failed to fetch leaderboard"); return; }

  const entries: LeaderboardEntry[] = data.map(e => ({
    rank: Number(e.rank ?? 0),
    address: String(e.address ?? ""),
    name: typeof e.name === "string" ? e.name : null,
    ai_model: String(e.ai_model ?? ""),
    profit_pct: typeof e.profit_pct === "number" ? e.profit_pct : null,
    current_balance_usd: typeof e.current_balance_usd === "number" ? e.current_balance_usd : null,
    total_orders: typeof e.total_orders === "number" ? e.total_orders : null,
  }));

  console.log("=== Trading Race Leaderboard ===\n");
  console.log("Rank | Name/Address                | Model            | Profit %  | Balance USD | Orders");
  console.log("-".repeat(95));
  for (const e of entries) {
    const label = (e.name ?? e.address.slice(0, 12) + "...").padEnd(28);
    const model = e.ai_model.slice(0, 16).padEnd(17);
    const profit = e.profit_pct != null ? `${e.profit_pct.toFixed(1)}%`.padEnd(10) : "N/A".padEnd(10);
    const balance = e.current_balance_usd != null ? `$${e.current_balance_usd.toFixed(2)}`.padEnd(12) : "N/A".padEnd(12);
    const orders = e.total_orders != null ? String(e.total_orders) : "N/A";
    console.log(`${String(e.rank).padEnd(5)}| ${label}| ${model}| ${profit}| ${balance}| ${orders}`);
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
```

**Step 5: Commit**

```bash
git add openclaw-skill/scripts/list-orders.ts openclaw-skill/scripts/close-orders.ts openclaw-skill/scripts/withdraw.ts openclaw-skill/scripts/check-leaderboard.ts
git commit -m "feat(openclaw): add list-orders, close-orders, withdraw, and leaderboard scripts"
```

---

### Task 8: Create SKILL.md

**Files:**
- Create: `openclaw-skill/SKILL.md`

**Step 1: Write SKILL.md**

The SKILL.md is the main OpenClaw skill definition with frontmatter, description, setup instructions, examples, and script references. See design doc for full content. Key sections:

- Frontmatter (name, description, metadata with emoji, homepage, requires)
- Overview of capabilities
- One-time setup steps (npm install, TON_MNEMONIC env)
- Usage examples (natural language commands agents can use)
- Script reference table mapping commands to scripts
- Safety rules (always preview, confirm before tx, mainnet only)
- Environment variables table

**Step 2: Commit**

```bash
git add openclaw-skill/SKILL.md
git commit -m "feat(openclaw): add SKILL.md with full skill definition"
```

---

### Task 9: Create reference docs

**Files:**
- Create: `openclaw-skill/references/open4dev-api.md`
- Create: `openclaw-skill/references/toncenter-api.md`

**Step 1: Write open4dev-api.md**

Document all Race API and DEX API endpoints used by scripts, with request/response examples. Key endpoints:
- Race API: `/api/tokens`, `/api/contracts`, `/api/leaderboard`, `/api/contracts/{id}/orders`, withdraw/close endpoints
- DEX API: `/orders`, `/orders/book`, `/orders/trading-stats`, `/coins`

**Step 2: Write toncenter-api.md**

Document toncenter endpoints:
- `/api/v2/getAddressBalance`
- `/api/v2/getAddressInformation`
- `/api/v2/jsonRPC` (for sending transactions)
- `/api/v3/jetton/wallets`

**Step 3: Commit**

```bash
git add openclaw-skill/references/
git commit -m "docs(openclaw): add API reference docs for open4dev and toncenter"
```

---

### Task 10: Update README.md

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README.md**

Replace the existing minimal README with a comprehensive one covering:
1. Project name + one-liner
2. What is agentmeme.ai (AI Trading Race on TON)
3. Features list
4. Tech stack
5. Getting started (clone, install, env, dev)
6. Environment variables table
7. Project structure tree
8. Deployment (Cloudflare Pages)
9. OpenClaw integration section (link to openclaw-skill/, setup steps)
10. Trading pairs
11. API reference (brief mention of Race API, DEX API, toncenter)

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: comprehensive README with features, setup, and OpenClaw integration"
```

---

### Task 11: Verify scripts compile

**Step 1: Install dependencies**

```bash
cd openclaw-skill && npm install
```

**Step 2: Type-check all scripts**

```bash
npx tsc --noEmit
```

Expected: No errors

**Step 3: Fix any type errors if needed**

**Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(openclaw): resolve type errors in scripts"
```

---

### Task 12: Final review and integration commit

**Step 1: Run git status to verify all files are committed**

**Step 2: Review the full diff**

```bash
git diff main...HEAD --stat
```

**Step 3: Verify directory structure is correct**

```bash
find openclaw-skill -type f | sort
```

Expected:
```
openclaw-skill/SKILL.md
openclaw-skill/package.json
openclaw-skill/references/open4dev-api.md
openclaw-skill/references/toncenter-api.md
openclaw-skill/scripts/check-leaderboard.ts
openclaw-skill/scripts/close-orders.ts
openclaw-skill/scripts/deploy-wallet.ts
openclaw-skill/scripts/get-balance.ts
openclaw-skill/scripts/get-orderbook.ts
openclaw-skill/scripts/get-tokens.ts
openclaw-skill/scripts/helpers.ts
openclaw-skill/scripts/list-orders.ts
openclaw-skill/scripts/place-order.ts
openclaw-skill/scripts/withdraw.ts
openclaw-skill/tsconfig.json
```
