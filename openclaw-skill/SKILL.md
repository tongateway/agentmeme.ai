---
name: openclaw
description: >
  Trade tokens on TON blockchain via open4dev contracts. Deploy a W5 wallet from
  mnemonic, topup with TON, buy/sell tokens (TON/USDT, NOT/USDT, BUILD/USDT, etc.),
  manage orders, check balances, and view leaderboard standings. Agents can auto-decide
  price based on live order book data.
user-invocable: true
metadata:
  openclaw:
    emoji: "🐾"
    homepage: "https://ai-api.open4dev.xyz"
    requires:
      bins:
        - npx
      env:
        - TON_MNEMONIC
---

# OpenClaw TON Trader Skill

Trade tokens on the TON blockchain through open4dev order-book contracts. Supports the full trading lifecycle: deploy wallet, check balances, place orders with smart pricing, manage positions, and track leaderboard rankings.

## One-Time Setup

1. **Generate a burner TON wallet** (use Tonkeeper or any TON wallet app) and save the 24-word mnemonic.

2. **Fund the wallet** with a small amount of TON (0.5-1 TON recommended for gas fees).

3. **Install the skill:**

```bash
mkdir -p ~/.openclaw/skills/openclaw
cd ~/.openclaw/skills/openclaw
# Copy SKILL.md, references/, scripts/ here
npm install
```

4. **Add mnemonic to environment:**

Add to `~/.openclaw/.env`:
```
TON_MNEMONIC="word1 word2 word3 ... word24"
```

## Capabilities

### Wallet Management

| Command | Script | Description |
|---------|--------|-------------|
| Deploy wallet | `npx tsx scripts/deploy-wallet.ts` | Deploy W5 wallet from mnemonic, show address |
| Check balance | `npx tsx scripts/get-balance.ts` | TON + jetton balances with USD values |

### Market Data

| Command | Script | Description |
|---------|--------|-------------|
| List tokens | `npx tsx scripts/get-tokens.ts` | Available tokens with prices |
| Order book | `npx tsx scripts/get-orderbook.ts BUILD/USDT` | Bids, asks, spread, mid price |

### Trading

| Command | Script | Description |
|---------|--------|-------------|
| Place order | `npx tsx scripts/place-order.ts buy 1000 BUILD/USDT auto` | Smart-priced order via API |
| List orders | `npx tsx scripts/list-orders.ts` | All orders with status |
| Close orders | `npx tsx scripts/close-orders.ts` | Close all active orders |
| Withdraw | `npx tsx scripts/withdraw.ts [--ton\|--jetton]` | Withdraw funds |

### Analytics

| Command | Script | Description |
|---------|--------|-------------|
| Leaderboard | `npx tsx scripts/check-leaderboard.ts` | Trading race rankings |

## Examples Agents Can Use

- "deploy my TON wallet"
- "show my balance"
- "what tokens can I trade?"
- "show order book for BUILD/USDT"
- "buy 1000 BUILD at market price"
- "place buy limit order for 1200 BUILD token at 0.85 USDT equivalent"
- "sell 500 NOT at 0.012 USDT"
- "show my orders"
- "close all my orders"
- "withdraw all TON"
- "show leaderboard"

## Smart Price Mode

When placing orders with `auto`, `market`, `equivalent`, or `decide` keywords, the agent:

1. Fetches the live order book from open4dev API
2. For **buy**: sets price at best ask + 1.5% buffer (to get filled faster)
3. For **sell**: sets price at best bid - 1.5% buffer
4. Shows a preview and asks for confirmation

This means agents can say things like:
> "place buy 1200 BUILD at 0.85 USDT equivalent"

And the skill will ignore the 0.85 hint, fetch real market data, and decide the optimal price.

## Safety Rules

- **ALWAYS** show a preview before any transaction
- **ALWAYS** ask for user confirmation (yes/no) before signing
- Mainnet only
- Uses open4dev API for price/market data
- Uses toncenter for on-chain balance queries
- Signs transactions with the shared mnemonic wallet

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TON_MNEMONIC` | Yes | -- | 24-word TON wallet mnemonic |
| `OPEN4DEV_RACE_API` | No | `https://ai-api.open4dev.xyz` | Race API base URL |
| `OPEN4DEV_DEX_API` | No | `https://api.open4dev.xyz/api/v1` | DEX API base URL |
| `TONCENTER_API` | No | `https://toncenter.com` | toncenter RPC base URL |

## Supported Trading Pairs

- TON/USDT, TON/NOT, TON/BUILD
- NOT/USDT, NOT/BUILD
- BUILD/USDT

## API Architecture

The skill uses three API layers:

1. **Race API** (`ai-api.open4dev.xyz`) -- Agent registration, tokens, leaderboard, withdraw/close operations
2. **DEX API** (`api.open4dev.xyz/api/v1`) -- Order book, orders, coins, trading stats
3. **toncenter** (`toncenter.com`) -- On-chain balance queries, transaction submission via JSON-RPC
