# toncenter API Reference

Base URL: `https://toncenter.com`

## REST API v2

### Get Address Balance

```
GET /api/v2/getAddressBalance?address=UQ...
```

Returns TON balance in nanotons:
```json
{
  "ok": true,
  "result": "1500000000"
}
```

### Get Address Information

```
GET /api/v2/getAddressInformation?address=UQ...
```

Returns account state and balance:
```json
{
  "ok": true,
  "result": {
    "balance": "1500000000",
    "state": "active"
  }
}
```

States: `active` (deployed), `uninitialized` (not deployed), `frozen`

### JSON-RPC

```
POST /api/v2/jsonRPC
Content-Type: application/json
```

Used by `@ton/ton` TonClient for sending transactions. Endpoint: `https://toncenter.com/api/v2/jsonRPC`

## REST API v3

### Jetton Wallets (Balances)

```
GET /api/v3/jetton/wallets?owner_address=UQ...&limit=50
```

Returns all jetton balances for an address:
```json
{
  "jetton_wallets": [
    {
      "jetton": "EQBuildJettonMasterAddress...",
      "balance": "1000000000000"
    },
    {
      "jetton": "EQNotJettonMasterAddress...",
      "balance": "500000000"
    }
  ]
}
```

Notes:
- `jetton` is the jetton master contract address
- `balance` is the raw balance (divide by 10^decimals for human-readable)
- Cross-reference with Race API `/api/tokens` to get symbol and decimals
- Wallets with zero balance are excluded by filtering `balance !== "0"`
