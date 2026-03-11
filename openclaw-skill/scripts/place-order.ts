import { Address, SendMode, beginCell, internal } from "@ton/ton";
import {
  fetchDexCoins,
  fetchDexOrders,
  fetchDexVaults,
  fetchOrderBook,
  fetchRaceTokens,
  getJettonBalances,
  getTonBalance,
  getWalletContract,
  toRawAddress,
} from "./helpers.js";
import * as readline from "readline";

const CREATE_ORDER_TON_OP_CODE = 0xcbcd047e;
const JETTON_TRANSFER_OP_CODE = 0x0f8a7ea5;
const FORWARD_TON_AMOUNT_TON = 110_000_000n; // 0.11 TON
const FORWARD_TON_AMOUNT_JETTON = 110_000_000n; // 0.11 TON
const TON_AMOUNT_TRANSFER_JETTON_WITH_FORWARD = 170_000_000n; // 0.17 TON
const SLIPPAGE_NANO = 50_000_000; // 5%
const PROVIDER_FEE_ADDRESS = "UQDBdOCf6vdHdWj6OIDMYAt878gPQlUIE7dApRbVj3VxILnA";
const PROVIDER_FEE_NUM = 1;
const PROVIDER_FEE_DENOM = 100;
const MATCHER_FEE_NUM = 2;
const MATCHER_FEE_DENOM = 100;

type Side = "buy" | "sell";

type ParsedArgs = {
  side: Side;
  amount: number;
  fromSymbol: string;
  toSymbol: string;
  price: number | null;
  autoMode: boolean;
};

function askConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question + " (yes/no): ", answer => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "yes");
    });
  });
}

function parseArgs(args: string[]): ParsedArgs {
  const side = (args.find(a => ["buy", "sell"].includes(a.toLowerCase()))?.toLowerCase() ?? "buy") as Side;
  const amount = parseFloat(args.find(a => /^\d+(\.\d+)?$/.test(a) && !a.includes("/")) ?? "0");
  const pairArg = args.find(a => a.includes("/"));
  const [fromSymbol, toSymbol] = pairArg?.split("/").map(s => s.toUpperCase()) ?? ["BUILD", "USDT"];

  const autoMode = args.some(a => ["auto", "market", "api", "equivalent", "decide"].includes(a.toLowerCase()));
  let price: number | null = null;
  if (!autoMode) {
    const nums = args.filter(a => /^\d+\.?\d*$/.test(a)).map(Number);
    if (nums.length > 1) price = nums[nums.length - 1];
  }

  return { side, amount, fromSymbol, toSymbol, price, autoMode: autoMode || price === null };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function numberToDecimalString(value: number, maxFractionDigits = 18): string {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value: ${value}`);
  const fixed = value.toFixed(maxFractionDigits);
  return fixed.replace(/\.?0+$/, "");
}

function decimalToUnits(decimal: string, decimals: number): bigint {
  const trimmed = decimal.trim();
  if (!trimmed) return 0n;
  const sign = trimmed.startsWith("-") ? -1n : 1n;
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [wholePartRaw, fracPartRaw = ""] = unsigned.split(".");
  const wholePart = wholePartRaw.replace(/\D/g, "") || "0";
  const fracPart = fracPartRaw.replace(/\D/g, "");

  const paddedFrac = (fracPart + "0".repeat(decimals)).slice(0, decimals);
  const unitsStr = `${wholePart}${paddedFrac}`.replace(/^0+/, "") || "0";
  const units = BigInt(unitsStr);
  return sign < 0n ? -units : units;
}

function unitsToDisplay(units: bigint, decimals: number, digits = 6): string {
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
  const formatted = fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  return neg ? `-${formatted}` : formatted;
}

function priceRateToProtocolUnits(humanPriceToPerFrom: number, fromDecimals: number, toDecimals: number): bigint {
  const shift = 9 + fromDecimals - toDecimals;
  if (shift < 0) throw new Error(`Unsupported decimals shift: ${shift}`);
  return decimalToUnits(numberToDecimalString(humanPriceToPerFrom, 18), shift);
}

function buildFeeInfoCell() {
  return beginCell()
    .storeAddress(Address.parse(PROVIDER_FEE_ADDRESS))
    .storeUint(PROVIDER_FEE_NUM, 14)
    .storeUint(PROVIDER_FEE_DENOM, 14)
    .storeUint(MATCHER_FEE_NUM, 14)
    .storeUint(MATCHER_FEE_DENOM, 14)
    .endCell();
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
      finalPrice = bestAsk * 1.015;
      console.log(`Best ask: ${bestAsk.toFixed(6)} -> Smart price: ${finalPrice.toFixed(6)} (+1.5%)`);
    } else {
      const bestBid = book.bids[0]?.price_rate;
      if (!bestBid) { console.error("No bids in order book"); process.exit(1); }
      finalPrice = bestBid * 0.985;
      console.log(`Best bid: ${bestBid.toFixed(6)} -> Smart price: ${finalPrice.toFixed(6)} (-1.5%)`);
    }
  } else {
    finalPrice = price!;
  }

  if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
    console.error("ERROR: final price must be a positive number");
    process.exit(1);
  }

  const [{ wallet, keypair }, tokens, dexCoins] = await Promise.all([
    getWalletContract(),
    fetchRaceTokens(),
    fetchDexCoins(),
  ]);
  const myAddr = wallet.address.toString({ bounceable: false });
  const myRawAddr = toRawAddress(wallet.address).toLowerCase();

  const tokenBySymbol = new Map(tokens.map(t => [t.symbol.toUpperCase(), t]));
  const coinBySymbol = new Map(dexCoins.map(c => [c.symbol.toUpperCase(), c]));

  const baseToken = tokenBySymbol.get(fromSymbol);
  const quoteToken = tokenBySymbol.get(toSymbol);
  if (!baseToken || !quoteToken) {
    console.error(`ERROR: Unsupported pair ${fromSymbol}/${toSymbol}. Run get-tokens first.`);
    process.exit(1);
  }

  const fromToken = side === "buy" ? quoteToken : baseToken;
  const toToken = side === "buy" ? baseToken : quoteToken;
  const baseAmount = amount;
  const fromAmountHuman = side === "buy" ? baseAmount * finalPrice : baseAmount;
  const protocolPriceHuman = side === "buy" ? 1 / finalPrice : finalPrice;

  if (!Number.isFinite(fromAmountHuman) || fromAmountHuman <= 0) {
    console.error("ERROR: Computed order amount is invalid.");
    process.exit(1);
  }
  if (!Number.isFinite(protocolPriceHuman) || protocolPriceHuman <= 0) {
    console.error("ERROR: Computed protocol price is invalid.");
    process.exit(1);
  }

  const fromAmountNano = decimalToUnits(numberToDecimalString(fromAmountHuman, Math.max(fromToken.decimals, 12)), fromToken.decimals);
  const protocolPriceRate = priceRateToProtocolUnits(protocolPriceHuman, fromToken.decimals, toToken.decimals);
  if (fromAmountNano <= 0n || protocolPriceRate <= 0n) {
    console.error("ERROR: Computed on-chain amount/price is invalid.");
    process.exit(1);
  }

  const tonVaultsPromise = fetchDexVaults({ type: "ton", limit: 5 });
  const fromVaultsPromise = fromToken.symbol === "TON"
    ? tonVaultsPromise
    : fetchDexVaults({ jettonMinterAddress: fromToken.raw_address, limit: 5 });
  const toVaultsPromise = toToken.symbol === "TON"
    ? tonVaultsPromise
    : fetchDexVaults({ jettonMinterAddress: toToken.raw_address, limit: 5 });

  const [fromVaults, toVaults] = await Promise.all([fromVaultsPromise, toVaultsPromise]);
  const fromVault = fromVaults[0];
  const toVault = toVaults[0];
  if (!fromVault || !toVault) {
    console.error(`ERROR: Missing vault(s) for ${fromToken.symbol}->${toToken.symbol}`);
    process.exit(1);
  }

  const feeInfo = buildFeeInfoCell();
  const createdAt = Math.floor(Date.now() / 1000);

  let destinationRawAddress = fromVault.raw_address;
  let txValue = fromAmountNano + FORWARD_TON_AMOUNT_TON;
  let body = beginCell().endCell();

  if (fromToken.symbol === "TON") {
    if (toToken.symbol === "TON") {
      console.error("ERROR: TON/TON orders are not supported.");
      process.exit(1);
    }

    const toJettonInfo = beginCell()
      .storeAddress(Address.parse(toToken.address))
      .endCell();

    body = beginCell()
      .storeUint(CREATE_ORDER_TON_OP_CODE, 32)
      .storeCoins(fromAmountNano)
      .storeRef(toJettonInfo)
      .storeCoins(protocolPriceRate)
      .storeUint(SLIPPAGE_NANO, 30)
      .storeRef(feeInfo)
      .storeUint(createdAt, 32)
      .storeAddress(Address.parse(toVault.raw_address))
      .endCell();
  } else {
    const jettonWallets = await getJettonBalances(myAddr, { includeZero: true });
    const sourceJettonWallet = jettonWallets.find(w => w.jettonRawAddress === fromToken.raw_address);
    if (!sourceJettonWallet) {
      console.error(`ERROR: No jetton wallet found for ${fromToken.symbol} on ${myAddr}`);
      process.exit(1);
    }

    const available = BigInt(sourceJettonWallet.balance);
    if (available < fromAmountNano) {
      console.error(
        `ERROR: Insufficient ${fromToken.symbol}. Need ${unitsToDisplay(fromAmountNano, fromToken.decimals)} but have ${unitsToDisplay(available, fromToken.decimals)}`
      );
      process.exit(1);
    }

    destinationRawAddress = sourceJettonWallet.walletRawAddress;
    txValue = TON_AMOUNT_TRANSFER_JETTON_WITH_FORWARD;

    const toJettonInfo = toToken.symbol === "TON"
      ? null
      : beginCell().storeAddress(Address.parse(toToken.address)).endCell();

    const forwardPayload = beginCell()
      .storeCoins(protocolPriceRate)
      .storeMaybeRef(toJettonInfo)
      .storeUint(SLIPPAGE_NANO, 30)
      .storeRef(feeInfo)
      .storeUint(createdAt, 32)
      .storeAddress(Address.parse(toVault.raw_address))
      .endCell();

    body = beginCell()
      .storeUint(JETTON_TRANSFER_OP_CODE, 32)
      .storeUint(0, 64)
      .storeCoins(fromAmountNano)
      .storeAddress(Address.parse(fromVault.raw_address))
      .storeAddress(wallet.address)
      .storeMaybeRef(null)
      .storeCoins(FORWARD_TON_AMOUNT_JETTON)
      .storeBit(true)
      .storeRef(forwardPayload)
      .endCell();
  }

  const tonBalance = await getTonBalance(myAddr);
  const minRequiredTon = txValue + 50_000_000n; // small extra headroom for wallet gas
  if (tonBalance < minRequiredTon) {
    console.error(
      `ERROR: Insufficient TON for tx value+gas. Need at least ${unitsToDisplay(minRequiredTon, 9)} TON, have ${unitsToDisplay(tonBalance, 9)} TON`
    );
    process.exit(1);
  }

  console.log(`\n=== ORDER PREVIEW ===`);
  console.log(`Side:    ${side.toUpperCase()}`);
  console.log(`Pair:    ${fromSymbol}/${toSymbol}`);
  console.log(`Wallet:  ${myAddr}`);
  if (side === "buy") {
    console.log(`Intent:  Buy ${baseAmount} ${fromSymbol} using ~${fromAmountHuman.toFixed(6)} ${toSymbol}`);
  } else {
    console.log(`Intent:  Sell ${baseAmount} ${fromSymbol} for ~${(baseAmount * finalPrice).toFixed(6)} ${toSymbol}`);
  }
  console.log(`Price:   ${finalPrice.toFixed(6)} ${toSymbol} per ${fromSymbol}`);
  console.log(`From/To: ${fromToken.symbol} -> ${toToken.symbol}`);
  console.log(`Amount:  ${unitsToDisplay(fromAmountNano, fromToken.decimals)} ${fromToken.symbol} (on-chain units)`);
  console.log(`Rate:    ${protocolPriceRate.toString()} (protocol price rate)`);
  console.log(`Slippage:${(SLIPPAGE_NANO / 1e7).toFixed(2)}%`);
  console.log(`To:      ${destinationRawAddress}`);
  console.log(`Value:   ${unitsToDisplay(txValue, 9)} TON`);
  console.log(`Gas:     extra wallet gas applies`);

  const confirmed = await askConfirm("\nConfirm transaction?");
  if (!confirmed) {
    console.log("Cancelled.");
    return;
  }

  const beforeBroadcast = Date.now();
  const seqno = await wallet.getSeqno();
  await wallet.sendTransfer({
    secretKey: keypair.secretKey,
    seqno,
    sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
    messages: [
      internal({
        to: Address.parse(destinationRawAddress),
        value: txValue,
        bounce: true,
        body,
      }),
    ],
  });

  console.log("\nTransaction broadcasted.");
  console.log(`Wallet seqno used: ${seqno}`);
  console.log("Waiting for order to appear in DEX indexer...");

  const fromCoinId = coinBySymbol.get(fromToken.symbol)?.id ?? null;
  const toCoinId = coinBySymbol.get(toToken.symbol)?.id ?? null;

  if (fromCoinId == null || toCoinId == null) {
    console.log("Could not map symbols to DEX coin IDs; skipping order verification.");
    return;
  }

  for (let i = 0; i < 20; i++) {
    await sleep(2_000);
    const orders = await fetchDexOrders(myRawAddr, { limit: 100 });
    const match = orders
      .filter(o => o.from_coin_id === fromCoinId && o.to_coin_id === toCoinId)
      .filter(o => {
        const createdAtMs = Date.parse(o.created_at);
        return Number.isFinite(createdAtMs) && createdAtMs >= beforeBroadcast - 60_000;
      })
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];

    if (match) {
      console.log(`Order detected: ID=${match.id} status=${match.status} amount=${match.amount} price=${match.price_rate}`);
      return;
    }
  }

  console.log("Transaction sent, but order is not indexed yet. Run list-orders in ~1 minute.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
