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
