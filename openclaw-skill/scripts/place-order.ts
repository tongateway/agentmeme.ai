import { getWalletContract, fetchOrderBook, RACE_API } from "./helpers.js";
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
  const side = args.find(a => ["buy", "sell"].includes(a.toLowerCase()))?.toLowerCase() ?? "buy";
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

  const { wallet } = await getWalletContract();
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

  console.log("\nSubmitting order via Race API...");
  console.log(`Order ${side.toUpperCase()} ${amount} ${fromSymbol} at ${finalPrice.toFixed(6)} ${toSymbol}`);
  console.log("NOTE: Ensure your agent contract is registered in the Race API first.");
  console.log("      The AI agent will execute trades based on your prompt configuration.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
