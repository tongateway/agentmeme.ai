import { Address, beginCell, toNano, internal, SendMode } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

/**
 * Close ALL deployed orders for a given wallet.
 * Fetches active orders from api.open4dev.xyz, sends close batches
 * via wallet V5R1 (up to 200 msgs) or V4R2 (up to 4 msgs) per external.
 *
 * Usage:
 *   WALLET_MNEMONIC="word1 word2 ... word24" \
 *   npx ts-node scripts/closeAllOrders.ts
 *
 * Env vars:
 *   WALLET_MNEMONIC   - (required) 24 mnemonic words
 *   WALLET_VERSION    - "v5r1" (default) or "v4r2"
 *   NETWORK           - "mainnet" (default) or "testnet"
 *   WALLET_ID         - wallet id for v4r2 (default: 698983191)
 *   SUBWALLET_NUMBER  - subwallet number for v5r1 (default: 0)
 *   BATCH_SIZE        - override (default: 200 for v5r1, 4 for v4r2)
 *   API_BASE_URL      - (default: https://api.open4dev.xyz/api/v1)
 */

const OP_CLOSE_ORDER = 0x52e80bac;
const GAS_ORDER_CLOSE = toNano('0.05');
const API_PAGE_LIMIT = 200;

const MAX_BATCH: Record<string, number> = { v5r1: 200, v4r2: 4 };

const ENDPOINTS: Record<string, string> = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

// ─── API ────────────────────────────────────────────────────────────────────

interface ApiOrder {
    id: number;
    raw_address: string;
    status: string;
    amount: number;
}

async function fetchDeployedOrders(owner: string, baseUrl: string): Promise<ApiOrder[]> {
    const all: ApiOrder[] = [];
    let offset = 0;
    while (true) {
        const url =
            `${baseUrl}/orders?owner_raw_address=${owner}&status=deployed` +
            `&limit=${API_PAGE_LIMIT}&offset=${offset}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as { orders: ApiOrder[] };
        if (!data.orders?.length) break;
        all.push(...data.orders);
        if (data.orders.length < API_PAGE_LIMIT) break;
        offset += API_PAGE_LIMIT;
    }
    return all;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function closeBody() {
    return beginCell().storeUint(OP_CLOSE_ORDER, 32).endCell();
}

async function waitSeqno(wallet: any, prev: number, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const cur = await wallet.getSeqno();
            if (cur > prev) return cur;
        } catch {}
        await sleep(1500);
    }
    throw new Error(`Seqno stuck at ${prev} for ${timeout / 1000}s`);
}

function openWallet(client: TonClient, version: string, publicKey: Buffer, network: string) {
    if (version === 'v4r2') {
        const walletId = Number(process.env.WALLET_ID ?? 698983191);
        return client.open(WalletContractV4.create({ workchain: 0, publicKey, walletId }));
    }
    const subwalletNumber = Number(process.env.SUBWALLET_NUMBER ?? 0);
    return client.open(
        WalletContractV5R1.create({
            publicKey,
            walletId: {
                networkGlobalId: network === 'testnet' ? -3 : -239,
                context: { workchain: 0, subwalletNumber, walletVersion: 'v5r1' },
            },
        }),
    );
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
    // ── validate env ────────────────────────────────────────────────────
    const mnemonic = process.env.WALLET_MNEMONIC?.trim();
    if (!mnemonic) {
        console.error('❌  WALLET_MNEMONIC is not set');
        process.exit(1);
    }

    const version = (process.env.WALLET_VERSION ?? 'v5r1').toLowerCase();
    if (!(version in MAX_BATCH)) {
        console.error('❌  WALLET_VERSION must be "v5r1" or "v4r2"');
        process.exit(1);
    }

    const network = (process.env.NETWORK ?? 'mainnet').toLowerCase();
    const maxBatch = MAX_BATCH[version];
    const batchSize = Math.min(Number(process.env.BATCH_SIZE ?? maxBatch), maxBatch);
    const apiBaseUrl = process.env.API_BASE_URL ?? 'https://api.open4dev.xyz/api/v1';

    // ── derive keys & open wallet ───────────────────────────────────────
    const { secretKey, publicKey } = await mnemonicToPrivateKey(mnemonic.split(' '));

    const client = new TonClient({
        endpoint: ENDPOINTS[network] ?? ENDPOINTS.mainnet,
    });

    const wallet = openWallet(client, version, publicKey, network);
    const ownerRawAddress = wallet.address.toRawString();

    console.log(`\nWallet:     ${wallet.address.toString({ bounceable: false })}`);
    console.log(`Raw:        ${ownerRawAddress}`);
    console.log(`Version:    ${version}`);
    console.log(`Network:    ${network}`);

    // ── fetch orders ────────────────────────────────────────────────────
    console.log(`\nFetching deployed orders ...`);
    const orders = await fetchDeployedOrders(ownerRawAddress, apiBaseUrl);
    if (!orders.length) {
        console.log('No deployed orders found. Nothing to close.');
        return;
    }
    console.log(`Found ${orders.length} deployed order(s).`);
    console.log(`Batch size: ${batchSize}\n`);

    // ── batch & send ────────────────────────────────────────────────────
    const addrs = orders.map((o) => o.raw_address);
    const batches: string[][] = [];
    for (let i = 0; i < addrs.length; i += batchSize) {
        batches.push(addrs.slice(i, i + batchSize));
    }

    let sent = 0;
    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const seqno = await wallet.getSeqno();

        const messages = batch.map((addr) =>
            internal({
                to: Address.parse(addr),
                value: GAS_ORDER_CLOSE,
                bounce: true,
                body: closeBody(),
            }),
        );

        console.log(
            `[batch ${b + 1}/${batches.length}] seqno=${seqno}  sending ${batch.length} close msg(s) ...`,
        );

        await wallet.sendTransfer({
            seqno,
            secretKey,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            messages,
        });

        sent += batch.length;
        console.log(`  ✓ sent  (${sent}/${addrs.length})`);

        if (b < batches.length - 1) {
            const next = await waitSeqno(wallet, seqno);
            console.log(`  ⏳ confirmed, seqno=${next}\n`);
        }
    }

    console.log(`\n✅ Done! Closed ${addrs.length} order(s) in ${batches.length} batch(es).`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
