# OpenClaw Skill + README Update Design

## Overview

Two deliverables:
1. **OpenClaw skill** (`openclaw-skill/`) for trading tokens on TON via open4dev contracts
2. **README.md** update for the agentmeme.ai project

---

## 1. OpenClaw Skill Design

### Structure

```
openclaw-skill/
├── SKILL.md                    # OpenClaw skill definition (frontmatter + docs)
├── references/
│   ├── open4dev-api.md         # Race + DEX API endpoint reference
│   └── toncenter-api.md       # toncenter balance endpoints
└── scripts/
    ├── deploy-wallet.ts        # Deploy W5 wallet from TON_MNEMONIC env
    ├── get-balance.ts          # TON + jetton balances via toncenter
    ├── get-tokens.ts           # List available tokens + prices from race API
    ├── get-orderbook.ts        # Fetch order book for a trading pair
    ├── place-order.ts          # Buy/sell tokens (smart price via API)
    ├── list-orders.ts          # View orders for wallet
    ├── close-orders.ts         # Close all active orders for a contract
    ├── withdraw.ts             # Withdraw TON or jettons from contract
    └── check-leaderboard.ts   # View trading race standings
```

### SKILL.md Frontmatter

```yaml
name: openclaw
description: >
  Trade tokens on TON blockchain via open4dev contracts. Deploy a W5 wallet from
  mnemonic, topup with TON, buy/sell tokens (TON/USDT, NOT/USDT, BUILD/USDT, etc.),
  manage orders, check balances, and view leaderboard standings. Agents can auto-decide
  price based on live order book data.
metadata:
  openclaw:
    emoji: "🐾"
    homepage: "https://ai-api.open4dev.xyz"
    requires:
      bins:
        - npx
      env:
        - TON_MNEMONIC
```

### API Endpoints Used

**Race API** (`https://ai-api.open4dev.xyz`):
- `GET /api/tokens` — token list with prices
- `GET /api/contracts` — list agents
- `POST /api/contracts` — register agent (address, public_key, secret_key, wallet_id, prompt, owner_address, ai_model)
- `GET /api/contracts/{id}` — agent details
- `POST /api/contracts/{id}/withdraw-jetton` — withdraw jettons (returns body_hex for signing)
- `POST /api/contracts/{id}/withdraw-ton` — withdraw TON (returns body_hex)
- `POST /api/contracts/{id}/close-all-orders` — close active orders (returns body_hex)
- `GET /api/contracts/{id}/orders` — agent orders
- `GET /api/leaderboard` — rankings

**DEX API** (`https://api.open4dev.xyz/api/v1`):
- `GET /orders?owner_raw_address=...` — orders by wallet
- `GET /orders/book?from_symbol=X&to_symbol=Y` — aggregated order book
- `GET /orders/trading-stats?from_symbol=X&to_symbol=Y` — volume stats
- `GET /orders/stats?wallet_address=...` — order stats per wallet
- `GET /coins` — list all coins
- `GET /coins/{id}` — single coin info

**toncenter** (`https://toncenter.com`):
- `GET /api/v2/getAddressBalance?address=...` — TON balance
- `GET /api/v2/getAddressInformation?address=...` — account state (deployed/not)
- `GET /api/v3/jetton/wallets?owner_address=...&limit=50` — jetton balances

### Script Details

**Dependencies** (installed in skill dir):
- `@ton/ton` — WalletContractV5R1, TonClient, transaction building
- `@ton/crypto` — mnemonicToPrivateKey
- `typescript`, `tsx` — runtime

**No axios** — all scripts use native `fetch`.

#### `deploy-wallet.ts`
1. Read `TON_MNEMONIC` from env
2. `mnemonicToPrivateKey(mnemonic.split(' '))` → keypair
3. `WalletContractV5R1.create({ workchain: 0, publicKey: keypair.publicKey })`
4. Print wallet address (bounceable + non-bounceable)
5. Check if already deployed via toncenter `getAddressInformation`
6. If funded but not deployed, send deploy transaction via toncenter RPC
7. Output: address, deployment status

#### `get-balance.ts`
1. Derive wallet address from mnemonic
2. Fetch TON balance via `toncenter /api/v2/getAddressBalance`
3. Fetch jetton balances via `toncenter /api/v3/jetton/wallets`
4. Cross-reference with race API `/api/tokens` for symbols/prices
5. Output: formatted balance table

#### `get-tokens.ts`
1. Fetch `/api/tokens` from race API
2. Output: token list with symbol, price_usd, address, decimals

#### `get-orderbook.ts`
1. Accept `--pair BUILD/USDT` argument
2. Fetch order book via DEX API `/orders/book?from_symbol=X&to_symbol=Y`
3. Output: asks, bids, spread, mid price

#### `place-order.ts`
1. Accept: side (buy/sell), amount, pair, optional price
2. If no price or "auto"/"market" → fetch order book, decide smart price:
   - Buy: best ask + 1.5% buffer
   - Sell: best bid - 1.5% buffer
3. Preview order details
4. Prompt for confirmation (stdin yes/no)
5. Build and sign transaction via W5 wallet
6. Send via toncenter RPC
7. Output: tx hash, order details

#### `list-orders.ts`
1. Derive wallet raw address from mnemonic
2. Fetch orders via DEX API `/orders?owner_raw_address=...`
3. Resolve coin symbols
4. Output: order table with status, amount, price, pair

#### `close-orders.ts`
1. Find contract ID from race API (by wallet address)
2. Call `POST /api/contracts/{id}/close-all-orders`
3. Sign returned body_hex with W5 wallet
4. Send via toncenter
5. Output: count of closed orders

#### `withdraw.ts`
1. Accept: `--ton` or `--jetton` flag
2. Find contract ID from race API
3. Call appropriate withdraw endpoint
4. Sign returned body_hex
5. Send via toncenter
6. Output: withdrawal confirmation

#### `check-leaderboard.ts`
1. Fetch `/api/leaderboard` from race API
2. Output: ranked table with profit, balance, orders

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TON_MNEMONIC` | Yes | — | 24-word TON wallet mnemonic |
| `OPEN4DEV_RACE_API` | No | `https://ai-api.open4dev.xyz` | Race API base URL |
| `OPEN4DEV_DEX_API` | No | `https://api.open4dev.xyz/api/v1` | DEX API base URL |
| `TONCENTER_API` | No | `https://toncenter.com` | toncenter base URL |

### One-time Setup

```bash
mkdir -p ~/.openclaw/skills/openclaw
cd ~/.openclaw/skills/openclaw
# Copy SKILL.md, references/, scripts/ here
npm init -y
npm install @ton/ton @ton/crypto typescript tsx
```

Add to `~/.openclaw/.env`:
```
TON_MNEMONIC="word1 word2 ... word24"
```

### Usage Examples (for SKILL.md)

```
"deploy my TON wallet"
"show my balance"
"what tokens can I trade?"
"show order book for BUILD/USDT"
"buy 1000 BUILD at market price"
"place sell limit order for 500 NOT at 0.012 USDT"
"show my orders"
"close all my orders"
"withdraw all TON"
"show leaderboard"
```

---

## 2. README.md Design

### Sections

1. **Header** — project name, one-liner, badges (optional)
2. **What is agentmeme.ai** — AI Trading Race on TON. Deploy AI agents that trade autonomously. Connect wallet, set prompt, deploy, compete.
3. **Features** — bullet list: wallet connection, agent deployment, AI-powered trading, real-time leaderboard, order book, multiple AI models, share cards
4. **Tech Stack** — React 19, Vite, TailwindCSS, DaisyUI, TON Connect, lightweight-charts, TypeScript
5. **Getting Started** — clone, `npm install`, copy `.env.example` → `.env`, `npm run dev`
6. **Environment Variables** — table from .env.example
7. **Project Structure** — `src/` tree with brief descriptions
8. **Deployment** — Cloudflare Pages via `npm run deploy`
9. **OpenClaw Integration** — link to `openclaw-skill/` with quick setup steps
10. **Trading Pairs** — supported pairs list
11. **API Reference** — brief mention of Race API + DEX API + toncenter

---

## Implementation Order

1. Create `openclaw-skill/SKILL.md`
2. Create `openclaw-skill/references/open4dev-api.md`
3. Create `openclaw-skill/references/toncenter-api.md`
4. Create all scripts in `openclaw-skill/scripts/`
5. Create `openclaw-skill/package.json`
6. Write `README.md`
7. Verify scripts compile with `npx tsx --check`
