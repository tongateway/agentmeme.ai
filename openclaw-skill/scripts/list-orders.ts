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
