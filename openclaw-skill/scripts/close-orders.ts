import { getWalletContract, RACE_API } from "./helpers.js";

async function findContractId(walletAddress: string): Promise<string | null> {
  const res = await fetch(`${RACE_API}/api/contracts`);
  const contracts = await res.json() as { address: string; id: string }[];
  if (!Array.isArray(contracts)) return null;
  return contracts.find(c => c.address === walletAddress)?.id ?? null;
}

async function main() {
  const { wallet } = await getWalletContract();
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
