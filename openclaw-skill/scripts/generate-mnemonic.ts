import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";

async function main() {
  const mnemonic = await mnemonicNew(24);
  const kp = await mnemonicToPrivateKey(mnemonic);
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: kp.publicKey });

  console.log("=== New TON Wallet Generated ===\n");
  console.log(`Mnemonic (24 words):\n${mnemonic.join(" ")}\n`);
  console.log(`Address (non-bounceable): ${wallet.address.toString({ bounceable: false })}`);
  console.log(`Address (bounceable):     ${wallet.address.toString({ bounceable: true })}`);
  console.log(`Public key: ${kp.publicKey.toString("hex")}`);
  console.log("\n--- Setup ---");
  console.log(`Add to ~/.openclaw/.env:`);
  console.log(`TON_MNEMONIC="${mnemonic.join(" ")}"`);
  console.log("\nFund the address above with TON, then run: npx tsx scripts/deploy-wallet.ts");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
