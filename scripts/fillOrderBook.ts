import { Address, beginCell, Cell, toNano, internal, SendMode } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { TonClient, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

/**
 * Fill the open4dev DEX order book with bid orders for TON/AGNT and/or TON/BUILD.
 *
 * Creates many small bid (buy) orders at various price levels around the current
 * market price to provide order-book depth.
 *
 * Usage:
 *   WALLET_MNEMONIC="word1 word2 ... word24" \
 *   npx ts-node scripts/fillOrderBook.ts
 *
 * Env vars:
 *   WALLET_MNEMONIC    - (required) 24 mnemonic words
 *   WALLET_VERSION     - "v5r1" (default) or "v4r2"
 *   NETWORK            - "mainnet" (default) or "testnet"
 *   WALLET_ID          - wallet id for v4r2 (default: 698983191)
 *   SUBWALLET_NUMBER   - subwallet number for v5r1 (default: 0)
 *   PAIR               - "TON-AGNT" or "TON-BUILD" or "both" (default: "both")
 *   ORDER_COUNT        - number of orders per pair (default: 100, max 500)
 *   MIN_PRICE          - minimum bid price in human-readable TON (optional)
 *   MAX_PRICE          - maximum bid price in human-readable TON (optional)
 *   ORDER_AMOUNT       - TON per order (default: 0.025)
 *   GAS_AMOUNT         - gas per order in TON (default: 0.022)
 *   BATCH_SIZE         - override batch size (default: 200 for v5r1, 4 for v4r2)
 *   DRY_RUN            - "true" to print orders without sending
 *   API_BASE_URL       - (default: https://api.open4dev.xyz/api/v1)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const OP_CREATE_ORDER = 0x0a;
const DEFAULT_ORDER_AMOUNT = '0.025';  // TON per order
const DEFAULT_GAS_AMOUNT = '0.022';    // gas per order
const DEFAULT_ORDER_COUNT = 100;
const MAX_ORDER_COUNT = 500;
const DEFAULT_SLIPPAGE = 100;  // 1%
const PRICE_RATE_DECIMALS = 18n;
const MAX_BATCH: Record<string, number> = { v5r1: 200, v4r2: 4 };

const ENDPOINTS: Record<string, string> = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

// Vault addresses from StatsPage.tsx DEFAULT_PAIRS
const PAIR_CONFIG: Record<string, { slug: string; fromSymbol: string; toSymbol: string; baseVault: string; quoteVault: string; defaultMinPrice: number; defaultMaxPrice: number }> = {
    'TON-AGNT': {
        slug: 'TON-AGNT',
        fromSymbol: 'TON',
        toSymbol: 'AGNT',
        baseVault: 'EQCfzBzukuhvyXvKwFXq9nffu_YRngAJugAuR5ibQ7Arcl1w',
        quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
        defaultMinPrice: 0.005,
        defaultMaxPrice: 0.015,
    },
    'TON-BUILD': {
        slug: 'TON-BUILD',
        fromSymbol: 'TON',
        toSymbol: 'BUILD',
        baseVault: 'EQCxWoj_Yxgeh-sRS1MjR7YuqzVLHrOpVFz9neN-Hn1eSYUC',
        quoteVault: 'EQA0_4nl1-biEvpzengd5M3GNTt1PRYGIIEHlfanEl3tZkRr',
        defaultMinPrice: 0.0001,
        defaultMaxPrice: 0.001,
    },
};

// ─── Types ──────────────────────────────────────────────────────────────────

interface OrderPlan {
    priceRate: bigint;       // 18-decimal price rate
    priceHuman: number;      // human-readable price
    amount: bigint;          // nanoTON to send (order value)
    gas: bigint;             // nanoTON for gas
    totalValue: bigint;      // amount + gas
    quoteVault: string;      // destination vault address
    pair: string;
}

interface BookLevel {
    price_rate: number;
    total_amount: number;
    order_count: number;
}

interface OrderBookResponse {
    mid_price: number | null;
    bids: BookLevel[];
    asks: BookLevel[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function createOrderBody(priceRate: bigint): Cell {
    return beginCell()
        .storeUint(OP_CREATE_ORDER, 32)   // op: create_order
        .storeUint(0, 64)                  // query_id
        .storeUint(priceRate, 128)         // price_rate (18 decimals)
        .storeUint(DEFAULT_SLIPPAGE, 32)   // slippage (100 = 1%)
        .endCell();
}

function humanPriceToBigint(price: number): bigint {
    // price * 10^18 as bigint, using string math to avoid floating point issues
    const str = price.toFixed(18);
    const [intPart, fracPart] = str.split('.');
    const frac = (fracPart ?? '').padEnd(18, '0').slice(0, 18);
    return BigInt(intPart) * 10n ** PRICE_RATE_DECIMALS + BigInt(frac);
}

async function waitSeqno(wallet: any, prev: number, timeout = 60_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        try {
            const cur = await wallet.getSeqno();
            if (cur > prev) return cur;
        } catch { /* retry */ }
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

// ─── API ────────────────────────────────────────────────────────────────────

async function fetchOrderBook(
    fromSymbol: string,
    toSymbol: string,
    apiBaseUrl: string,
): Promise<OrderBookResponse> {
    const params = new URLSearchParams();
    params.set('from_symbol', fromSymbol);
    params.set('to_symbol', toSymbol);
    params.set('limit', '50');

    const res = await fetch(`${apiBaseUrl}/orders/book?${params}`);
    if (!res.ok) throw new Error(`Order book API error: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as Record<string, unknown>;

    const toDec = Number(data.to_decimals ?? 9);
    const priceFactor = 1e18;
    const baseFactor = 10 ** toDec;

    const parseLevel = (l: Record<string, unknown>): BookLevel => ({
        price_rate: Number(l.price_rate ?? 0) / priceFactor,
        total_amount: Number(l.total_amount ?? 0) / baseFactor,
        order_count: Number(l.order_count ?? 0),
    });

    return {
        mid_price: data.mid_price != null ? Number(data.mid_price) / priceFactor : null,
        bids: Array.isArray(data.bids) ? data.bids.map((b: Record<string, unknown>) => parseLevel(b)) : [],
        asks: Array.isArray(data.asks) ? data.asks.map((a: Record<string, unknown>) => parseLevel(a)) : [],
    };
}

async function fetchDeployedOrderCount(owner: string, apiBaseUrl: string): Promise<number> {
    const url = `${apiBaseUrl}/orders?owner_raw_address=${encodeURIComponent(owner)}&status=deployed&limit=1&offset=0`;
    const res = await fetch(url);
    if (!res.ok) return 0;
    const data = (await res.json()) as Record<string, unknown>;
    const orders = data.orders;
    // If there's a total field, use it; otherwise just return whether there are any
    if (typeof data.total === 'number') return data.total;
    return Array.isArray(orders) ? orders.length : 0;
}

// ─── Order Distribution ─────────────────────────────────────────────────────

/**
 * Generate a set of price levels with more concentration near the mid price.
 * Uses a skewed distribution: more orders near the center, fewer at extremes.
 */
function generatePriceLevels(
    minPrice: number,
    maxPrice: number,
    count: number,
    midPrice: number | null,
): number[] {
    const prices: number[] = [];
    const center = midPrice ?? (minPrice + maxPrice) / 2;

    for (let i = 0; i < count; i++) {
        // Generate a value between -1 and 1, biased toward 0
        // Use a cubic distribution for concentration near center
        const t = (2 * i / (count - 1)) - 1;  // linear: -1 to 1
        const biased = Math.sign(t) * Math.pow(Math.abs(t), 0.6);  // compress toward center

        // Map to price range
        const halfRange = (maxPrice - minPrice) / 2;
        const price = center + biased * halfRange;

        // Clamp to range
        const clamped = Math.max(minPrice, Math.min(maxPrice, price));
        prices.push(clamped);
    }

    // Add some randomness to avoid exact duplicate prices
    const jitteredPrices = prices.map((p) => {
        const jitter = (Math.random() - 0.5) * (maxPrice - minPrice) * 0.002;
        return Math.max(minPrice, Math.min(maxPrice, p + jitter));
    });

    // Sort ascending
    jitteredPrices.sort((a, b) => a - b);

    return jitteredPrices;
}

function buildOrderPlans(
    pair: string,
    prices: number[],
    orderAmountNano: bigint,
    gasNano: bigint,
): OrderPlan[] {
    const config = PAIR_CONFIG[pair];
    if (!config) throw new Error(`Unknown pair: ${pair}`);

    return prices.map((priceHuman) => {
        const priceRate = humanPriceToBigint(priceHuman);
        return {
            priceRate,
            priceHuman,
            amount: orderAmountNano,
            gas: gasNano,
            totalValue: orderAmountNano + gasNano,
            quoteVault: config.quoteVault,
            pair,
        };
    });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    // ── validate env ────────────────────────────────────────────────────
    const mnemonic = process.env.WALLET_MNEMONIC?.trim();
    if (!mnemonic) {
        console.error('WALLET_MNEMONIC is not set');
        process.exit(1);
    }

    const version = (process.env.WALLET_VERSION ?? 'v5r1').toLowerCase();
    if (!(version in MAX_BATCH)) {
        console.error('WALLET_VERSION must be "v5r1" or "v4r2"');
        process.exit(1);
    }

    const network = (process.env.NETWORK ?? 'mainnet').toLowerCase();
    const maxBatch = MAX_BATCH[version];
    const batchSize = Math.min(Number(process.env.BATCH_SIZE ?? maxBatch), maxBatch);
    const apiBaseUrl = process.env.API_BASE_URL ?? 'https://api.open4dev.xyz/api/v1';
    const dryRun = process.env.DRY_RUN === 'true';
    const pairArg = (process.env.PAIR ?? 'both').toUpperCase();
    const orderCount = Math.min(
        Math.max(1, Number(process.env.ORDER_COUNT ?? DEFAULT_ORDER_COUNT)),
        MAX_ORDER_COUNT,
    );
    const orderAmountNano = toNano(process.env.ORDER_AMOUNT ?? DEFAULT_ORDER_AMOUNT);
    const gasNano = toNano(process.env.GAS_AMOUNT ?? DEFAULT_GAS_AMOUNT);

    const envMinPrice = process.env.MIN_PRICE ? parseFloat(process.env.MIN_PRICE) : null;
    const envMaxPrice = process.env.MAX_PRICE ? parseFloat(process.env.MAX_PRICE) : null;

    // ── determine which pairs to fill ───────────────────────────────────
    let pairKeys: string[];
    if (pairArg === 'BOTH') {
        pairKeys = ['TON-AGNT', 'TON-BUILD'];
    } else if (pairArg in PAIR_CONFIG) {
        pairKeys = [pairArg];
    } else {
        console.error(`Unknown PAIR value: "${pairArg}". Use "TON-AGNT", "TON-BUILD", or "both".`);
        process.exit(1);
    }

    // ── derive keys & open wallet ───────────────────────────────────────
    const { secretKey, publicKey } = await mnemonicToPrivateKey(mnemonic.split(' '));
    const client = new TonClient({
        endpoint: ENDPOINTS[network] ?? ENDPOINTS.mainnet,
    });

    const wallet = openWallet(client, version, publicKey, network);
    const ownerRawAddress = wallet.address.toRawString();

    console.log(`\n========================================`);
    console.log(`  Fill Order Book - open4dev DEX`);
    console.log(`========================================`);
    console.log(`Wallet:       ${wallet.address.toString({ bounceable: false })}`);
    console.log(`Raw:          ${ownerRawAddress}`);
    console.log(`Version:      ${version}`);
    console.log(`Network:      ${network}`);
    console.log(`Pairs:        ${pairKeys.join(', ')}`);
    console.log(`Orders/pair:  ${orderCount}`);
    console.log(`Order amount: ${process.env.ORDER_AMOUNT ?? DEFAULT_ORDER_AMOUNT} TON`);
    console.log(`Gas/order:    ${process.env.GAS_AMOUNT ?? DEFAULT_GAS_AMOUNT} TON`);
    console.log(`Batch size:   ${batchSize}`);
    console.log(`Dry run:      ${dryRun}`);
    console.log('');

    // ── check wallet balance ────────────────────────────────────────────
    const balance = await client.getBalance(wallet.address);
    const balanceTon = Number(balance) / 1e9;
    console.log(`Wallet balance: ${balanceTon.toFixed(4)} TON`);

    const totalOrders = orderCount * pairKeys.length;
    const totalCostPerOrder = Number(orderAmountNano + gasNano) / 1e9;
    const totalCost = totalCostPerOrder * totalOrders;
    console.log(`Total orders:   ${totalOrders}`);
    console.log(`Cost per order: ${totalCostPerOrder.toFixed(4)} TON`);
    console.log(`Total cost:     ${totalCost.toFixed(4)} TON`);

    if (balanceTon < totalCost + 0.5) {
        console.error(
            `\nInsufficient balance! Need ~${(totalCost + 0.5).toFixed(2)} TON ` +
            `(${totalCost.toFixed(2)} for orders + 0.5 buffer), have ${balanceTon.toFixed(2)} TON.`,
        );
        if (!dryRun) process.exit(1);
    }

    // ── build order plans for each pair ─────────────────────────────────
    const allOrders: OrderPlan[] = [];

    for (const pairKey of pairKeys) {
        const config = PAIR_CONFIG[pairKey];
        console.log(`\n--- ${pairKey} ---`);

        // Fetch current order book to find mid price
        console.log(`Fetching order book for ${config.fromSymbol}/${config.toSymbol}...`);
        let midPrice: number | null = null;
        try {
            const book = await fetchOrderBook(config.fromSymbol, config.toSymbol, apiBaseUrl);
            midPrice = book.mid_price;
            console.log(`  Mid price:  ${midPrice != null ? midPrice.toFixed(8) : 'N/A'}`);
            if (book.bids.length > 0) {
                console.log(`  Best bid:   ${book.bids[0].price_rate.toFixed(8)}`);
            }
            if (book.asks.length > 0) {
                console.log(`  Best ask:   ${book.asks[0].price_rate.toFixed(8)}`);
            }
            console.log(`  Bid levels: ${book.bids.length}, Ask levels: ${book.asks.length}`);
        } catch (err) {
            console.warn(`  Warning: could not fetch order book: ${err}`);
        }

        const minPrice = envMinPrice ?? config.defaultMinPrice;
        const maxPrice = envMaxPrice ?? config.defaultMaxPrice;
        console.log(`  Price range: ${minPrice.toFixed(8)} - ${maxPrice.toFixed(8)}`);

        // Generate price levels
        const prices = generatePriceLevels(minPrice, maxPrice, orderCount, midPrice);
        const plans = buildOrderPlans(pairKey, prices, orderAmountNano, gasNano);
        allOrders.push(...plans);

        // Print summary of price distribution
        const minGenerated = Math.min(...prices);
        const maxGenerated = Math.max(...prices);
        const avgGenerated = prices.reduce((a, b) => a + b, 0) / prices.length;
        console.log(`  Generated ${prices.length} orders:`);
        console.log(`    Min price: ${minGenerated.toFixed(8)}`);
        console.log(`    Max price: ${maxGenerated.toFixed(8)}`);
        console.log(`    Avg price: ${avgGenerated.toFixed(8)}`);
    }

    console.log(`\nTotal orders to create: ${allOrders.length}`);

    // ── dry run: just print the plan ────────────────────────────────────
    if (dryRun) {
        console.log('\n=== DRY RUN - Order Plan ===\n');
        for (let i = 0; i < allOrders.length; i++) {
            const o = allOrders[i];
            console.log(
                `  #${String(i + 1).padStart(4)}  ${o.pair.padEnd(10)} ` +
                `price=${o.priceHuman.toFixed(8)}  ` +
                `amount=${(Number(o.amount) / 1e9).toFixed(4)} TON  ` +
                `gas=${(Number(o.gas) / 1e9).toFixed(4)} TON  ` +
                `vault=${o.quoteVault}`,
            );
        }
        console.log(`\nDry run complete. Set DRY_RUN= (unset) to actually send transactions.`);
        return;
    }

    // ── confirmation prompt ─────────────────────────────────────────────
    console.log(`\nAbout to create ${allOrders.length} bid orders costing ~${totalCost.toFixed(2)} TON.`);
    console.log('Press Ctrl+C within 5 seconds to cancel...\n');
    await sleep(5000);
    console.log('Proceeding with order creation...\n');

    // ── batch & send ────────────────────────────────────────────────────
    const batches: OrderPlan[][] = [];
    for (let i = 0; i < allOrders.length; i += batchSize) {
        batches.push(allOrders.slice(i, i + batchSize));
    }

    let sent = 0;
    let failedBatches = 0;

    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];

        let seqno: number;
        try {
            seqno = await wallet.getSeqno();
        } catch (err) {
            console.error(`Failed to get seqno for batch ${b + 1}: ${err}`);
            failedBatches++;
            continue;
        }

        const messages = batch.map((order) =>
            internal({
                to: Address.parse(order.quoteVault),
                value: order.totalValue,
                bounce: true,
                body: createOrderBody(order.priceRate),
            }),
        );

        const batchMinPrice = Math.min(...batch.map((o) => o.priceHuman));
        const batchMaxPrice = Math.max(...batch.map((o) => o.priceHuman));
        const batchPairs = [...new Set(batch.map((o) => o.pair))].join(',');

        console.log(
            `[batch ${b + 1}/${batches.length}] seqno=${seqno}  ` +
            `${batch.length} orders  ` +
            `pair=${batchPairs}  ` +
            `prices=${batchMinPrice.toFixed(8)}-${batchMaxPrice.toFixed(8)}  ` +
            `sending...`,
        );

        try {
            await wallet.sendTransfer({
                seqno,
                secretKey,
                sendMode: SendMode.PAY_GAS_SEPARATELY,
                messages,
            });

            sent += batch.length;
            console.log(`  -> sent  (${sent}/${allOrders.length})`);

            if (b < batches.length - 1) {
                const next = await waitSeqno(wallet, seqno);
                console.log(`  -> confirmed, seqno=${next}\n`);
            }
        } catch (err) {
            console.error(`  -> FAILED batch ${b + 1}: ${err}`);
            failedBatches++;

            // Wait a bit before retrying next batch
            if (b < batches.length - 1) {
                console.log('  Waiting 5s before next batch...');
                await sleep(5000);
            }
        }
    }

    // ── summary ─────────────────────────────────────────────────────────
    console.log(`\n========================================`);
    console.log(`  Summary`);
    console.log(`========================================`);
    console.log(`Orders sent:    ${sent}/${allOrders.length}`);
    console.log(`Failed batches: ${failedBatches}`);
    console.log(`Total batches:  ${batches.length}`);

    // ── verify by checking API ──────────────────────────────────────────
    if (sent > 0) {
        console.log(`\nWaiting 10s for orders to be indexed...`);
        await sleep(10_000);

        console.log(`Verifying orders via API...`);
        try {
            const deployedCount = await fetchDeployedOrderCount(ownerRawAddress, apiBaseUrl);
            console.log(`Deployed orders for this wallet: ${deployedCount}`);
        } catch (err) {
            console.warn(`Could not verify orders: ${err}`);
        }

        // Check order book state after
        for (const pairKey of pairKeys) {
            const config = PAIR_CONFIG[pairKey];
            try {
                const book = await fetchOrderBook(config.fromSymbol, config.toSymbol, apiBaseUrl);
                console.log(
                    `${pairKey} order book: ` +
                    `${book.bids.length} bid levels, ${book.asks.length} ask levels, ` +
                    `mid=${book.mid_price?.toFixed(8) ?? 'N/A'}`,
                );
            } catch (err) {
                console.warn(`Could not fetch ${pairKey} order book: ${err}`);
            }
        }
    }

    console.log(`\nDone!`);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
