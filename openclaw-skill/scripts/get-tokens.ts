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
