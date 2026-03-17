import { getWalletAddress, getTonBalance, getJettonBalances, fetchRaceTokens, formatTon } from "./helpers.js";

async function main() {
  const address = await getWalletAddress();
  const friendly = address.toString({ bounceable: false });

  console.log(`=== Wallet Balance ===`);
  console.log(`Address: ${friendly}\n`);

  const tonBalance = await getTonBalance(friendly);
  console.log(`TON: ${formatTon(tonBalance)}`);

  const jettons = await getJettonBalances(friendly);
  if (jettons.length === 0) {
    console.log("\nNo jetton balances found.");
    return;
  }

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
