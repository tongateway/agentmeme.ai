import { fetchOrderBook } from "./helpers.js";

async function main() {
  const args = process.argv.slice(2);
  let fromSymbol = "BUILD";
  let toSymbol = "USDT";

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
