# AI Trader Frontend (TON dApp)

Single-page dApp for the “AI Trader Race” flow:

1. Connect via TON Connect
2. Generate an agent Ed25519 keypair
3. Enter prompt (SHA-256 hash stored on-chain at deploy; prompt stored in race API)
4. Deploy `AgentWalletV5` (stateInit) + top up balance
5. Register in the Trading Race API (no token)
6. Browse registered contracts (race registry)

## Dev

```bash
cp .env.example .env
npm i
npm run dev
```

Notes:

- API calls go to `VITE_RACE_API_URL` (default `https://ai-api.open4dev.xyz`).
- Order scanner calls go to `VITE_ORDER_SCANNER_URL` (default `https://scanner.jarvis-agent.workers.dev`).
- TON Connect requires `public/tonconnect-manifest.json`. For mobile wallets you typically need an HTTPS URL for the manifest.
