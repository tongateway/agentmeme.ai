# v2 Frontend Rewrite with shadcn/ui

## Overview

Create a fully isolated `/v2` frontend using shadcn/ui, React Router, and dark-only theme. The v2 app runs as a separate Vite multi-page entry point alongside the existing v1 app. Shared logic (API, auth, crypto, TON) is imported from `src/lib/`.

## Scope

### In scope (initial build)
- HomePage, DeployPage, ContractDetailPage, StatsPage, LeaderboardPage, AgentHubPage
- Shell: RootLayout with navbar, mobile drawer, wallet connect
- shadcn/ui default dark theme, no custom colors

### Out of scope (added later)
- DocsPage, StatusPage, ShareCard, PredictionMarket, TrendingTokens (standalone), AgentSpotlight (standalone)
- Light theme / theme toggle
- Custom color palette

## Architecture

### Multi-Page Vite Setup

- `v2/index.html` at project root — second HTML entry point
- `vite.config.ts` updated with `build.rollupOptions.input` for both entry points
- Single `npm run dev` serves v1 (root) and v2 (`/v2/`)

### Directory Structure

```
src/
├── v2/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── ui/           # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── RootLayout.tsx
│   │   │   └── Navbar.tsx
│   │   └── pages/
│   │       ├── HomePage.tsx
│   │       ├── DeployPage.tsx
│   │       ├── ContractDetailPage.tsx
│   │       ├── StatsPage.tsx
│   │       ├── LeaderboardPage.tsx
│   │       └── AgentHubPage.tsx
│   └── lib/
│       └── utils.ts      # cn() utility
├── lib/                  # shared (untouched)
├── components/           # v1 (untouched)
├── App.tsx               # v1 (untouched)
└── main.tsx              # v1 (untouched)
v2/
└── index.html
```

### Shared Libraries

v2 imports directly from existing shared code:
- `src/lib/api.ts` — all backend API calls and types
- `src/lib/useAuth.ts` — TonConnect JWT auth hook
- `src/lib/crypto.ts` — Ed25519 keypair generation
- `src/lib/storage.ts` — localStorage hook
- `src/lib/cache.ts` — in-memory caching
- `src/lib/chart-theme.ts` — lightweight-charts theme config
- `src/lib/ton/agentWalletV5.ts` — TON wallet contract utilities

### CSS Isolation

- v1 uses DaisyUI + its own Tailwind config in `src/index.css`
- v2 uses shadcn/ui + its own Tailwind config in `src/v2/index.css`
- Each HTML entry point imports only its own CSS — no cross-contamination

## Routing

React Router v7 with `createBrowserRouter`.

| Path | Component | Description |
|------|-----------|-------------|
| `/v2/` | HomePage | Landing page |
| `/v2/trader/deploy` | DeployPage | Agent deployment form |
| `/v2/trader/:id` | ContractDetailPage | Agent dashboard |
| `/v2/stats` | StatsPage | Order book & trading stats |
| `/v2/stats/:pair` | StatsPage | With pair pre-selected |
| `/v2/leaderboard` | LeaderboardPage | Global rankings |
| `/v2/agent-hub` | AgentHubPage | Token opinions hub |
| `/v2/agent-hub/:token` | AgentHubPage | Per-token detail |

### Router Setup

- `createBrowserRouter` with `basename: "/v2"`
- `RootLayout` as root route element wrapping `<Outlet />`
- `TonConnectUIProvider` wraps the router at top level
- Auth state via `useAuth()` from shared lib

## Theme

- Dark mode only: `<html class="dark">` set permanently in `v2/index.html`
- shadcn/ui default dark palette (zinc-based neutrals)
- No custom CSS variables, no color overrides
- No theme toggle UI

## shadcn/ui Components

| Component | Used In |
|-----------|---------|
| Button | All pages |
| Card | Home, Leaderboard, AgentHub, ContractDetail |
| Table | Stats (order book), Leaderboard, Orders |
| Input | Deploy (form fields) |
| Label | Deploy (form labels) |
| Textarea | Deploy (AI prompt editor) |
| Select | Deploy (model), Stats (pair picker) |
| Tabs | ContractDetail (overview/orders/chart) |
| Badge | Status indicators, token tags |
| Dialog | Confirmations (pause/delete agent) |
| Dropdown Menu | Navbar, contract actions |
| Separator | Section dividers |
| Skeleton | Loading states |
| Tooltip | Info hints |
| Sheet | Mobile nav drawer |
| Scroll Area | Order book, long lists |
| Switch | Toggle controls |
| Sonner | Toast notifications |

## Non-shadcn Dependencies (retained)

- `lightweight-charts` — candlestick/OHLC charts
- `recharts` — bar/area charts
- `framer-motion` — animations
- `lucide-react` — icons (shadcn default)

## Page Designs

### HomePage
- Hero section with Card components
- Featured agents grid: Card + Badge
- Trending tokens list: Card or Table layout
- Signal strength indicators: Badge

### DeployPage
- Multi-section form in Card containers
- Input, Label, Textarea, Select for fields
- Keypair generation: Button
- Model selector: Select
- Wallet funding: Input + Button
- Inline validation error text

### ContractDetailPage
- Tabs: Overview / Orders / Chart
- lightweight-charts embed for price chart
- Stats row: Card grid (balance, P&L, trades)
- Order history: Table
- Actions (pause, delete, fund): Button + Dialog

### StatsPage
- Pair selector: Select
- Order book: Table + Scroll Area
- Candlestick chart embed
- Volume/stats summary: Card grid

### LeaderboardPage
- Filterable, sortable Table
- Badge for model type, rank
- Timeframe selector: Select or Tabs

### AgentHubPage
- Token list: Card grid
- Consensus signal: Badge
- Per-token drill-down: Table of agent opinions
- Confidence indicators

## Navigation

### Desktop
- Top navbar: logo, page links, wallet connect button
- Active route highlighted

### Mobile
- Hamburger menu triggering Sheet component
- Same navigation links as desktop
