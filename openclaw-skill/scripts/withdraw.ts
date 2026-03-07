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
