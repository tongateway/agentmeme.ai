# Chakra UI V2 Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a parallel `/v2` version of the entire UI rewritten with Chakra UI, sharing the same data/API layer but with completely new components.

**Architecture:** V2 lives under `src/v2/` with its own `App.tsx` entry point and component tree. The existing Vite entry (`index.html`) checks the URL path and mounts either the v1 or v2 app. All `src/lib/` code (API, cache, auth, crypto, TON utils) is shared unchanged. V2 components use Chakra UI instead of DaisyUI/Tailwind.

**Tech Stack:** React 19, Chakra UI v3, Vite 7, lightweight-charts, recharts, TonConnect UI React, lucide-react (icons kept as-is)

---

## File Structure

### New files to create:
```
src/v2/
  App.tsx                    — V2 root: Chakra provider, routing, navbar, theme toggle
  theme.ts                   — Chakra theme config (colors, fonts, component overrides)
  components/
    Layout.tsx               — Shell: navbar, footer, page container
    HomePage.tsx             — Landing: hero, stats, token table, trust section
    AgentHubPage.tsx         — Agent hub: trending, spotlight, leaderboard, token table
    TokenOpinionPage.tsx     — Token detail: sidebar stats, chart, trading feed
    DeployPanel.tsx          — Deploy agent: model picker, pair selector, strategy, fund
    ContractDetailPanel.tsx  — Agent detail: header, stats, balance chart, wallet, actions
    ContractTabBar.tsx       — Agent tab bar with status dots and pair labels
    StatsPage.tsx            — Order book: pair tabs, stats cards, bid/ask tables
    OrdersPanel.tsx          — DEX orders: active/history tabs, order table
    LeaderboardPage.tsx      — Leaderboard table with ranking
    DocsPage.tsx             — Documentation page
    CandlestickChart.tsx     — lightweight-charts wrapper (minimal UI changes)
    PredictionMarket.tsx     — Prediction market card
    OverviewPanel.tsx        — Overview sparkline panel
```

### Files to modify:
```
src/main.tsx                 — Route /v2 to V2 app, / to V1 app
package.json                 — Add @chakra-ui/react dependency
vite.config.ts               — (if needed for Chakra)
```

### Files shared (NO changes):
```
src/lib/api.ts               — All API functions and types
src/lib/cache.ts             — LocalStorage cache
src/lib/storage.ts           — useLocalStorageState hook
src/lib/useAuth.ts           — JWT auth hook
src/lib/crypto.ts            — Keypair generation
src/lib/ton/                 — TON wallet utilities
```

---

## Task 1: Install Chakra UI and Create V2 Entry Point

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`
- Create: `src/v2/theme.ts`
- Create: `src/v2/App.tsx`
- Create: `src/v2/components/Layout.tsx`

- [ ] **Step 1: Install Chakra UI v3**

```bash
npm install @chakra-ui/react @emotion/react
```

- [ ] **Step 2: Create Chakra theme**

Create `src/v2/theme.ts`:

```typescript
import { createSystem, defaultConfig, defineConfig } from '@chakra-ui/react';

const config = defineConfig({
  theme: {
    tokens: {
      colors: {
        brand: {
          50: { value: '#e6f7ef' },
          100: { value: '#b3e8d0' },
          200: { value: '#80d9b1' },
          300: { value: '#4dca92' },
          400: { value: '#26be7b' },
          500: { value: '#00b264' },
          600: { value: '#00a05a' },
          700: { value: '#008b4d' },
          800: { value: '#007641' },
          900: { value: '#00542d' },
        },
      },
    },
  },
});

export const system = createSystem(defaultConfig, config);
```

- [ ] **Step 3: Create V2 Layout shell**

Create `src/v2/components/Layout.tsx` with Chakra Box, Flex, Container, Button for navbar and page shell. Include:
- ASCII logo (same as v1)
- Nav links: Home, Agent Hub, Order Book, My Agents
- Theme toggle (light/dark)
- TonConnect button
- Footer

- [ ] **Step 4: Create V2 App.tsx**

Create `src/v2/App.tsx` — same routing logic as v1 App.tsx but using Chakra's `ChakraProvider` and the Layout component. Import all page components (initially as stubs returning placeholder text).

- [ ] **Step 5: Update main.tsx for /v2 routing**

Modify `src/main.tsx` to check `window.location.pathname`:
- If starts with `/v2` → render V2 App
- Otherwise → render V1 App (existing behavior)

Both wrapped in `TonConnectUIProvider`.

- [ ] **Step 6: Verify build and test**

```bash
npx tsc -b && npx vite build
```

Navigate to `/v2` — should see the Chakra layout shell with placeholder pages.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: scaffold V2 app with Chakra UI, theme, and routing"
```

---

## Task 2: HomePage

**Files:**
- Create: `src/v2/components/HomePage.tsx`

Rewrite `src/components/HomePage.tsx` (515 lines) using Chakra components:
- Hero section with heading, subtext, deploy CTA
- Stats row (Active Agents, Trades 24h, Market Sentiment) using `SimpleGrid` + `Stat`
- AI Activity Feed using `Card`, `HStack`, `Badge`, `Text`
- Agent Coin Hub title + token table using `Table`
- Why Trust Us section using `SimpleGrid` + `Card`

- [ ] **Step 1: Create HomePage with hero and stats**

Port the hero section and computed stats. Use Chakra `Heading`, `Text`, `Button`, `SimpleGrid`, `Box`, `Flex`, `Badge`.

- [ ] **Step 2: Add AI Activity Feed**

Port the feed section. Use `Card`, `VStack`, `HStack`, `Avatar`, `Badge`, `Text`.

- [ ] **Step 3: Add token table**

Port the token table. Use Chakra `Table`, `Thead`, `Tbody`, `Tr`, `Th`, `Td`.

- [ ] **Step 4: Add Why Trust Us section**

Port the trust cards. Use `SimpleGrid`, `Card`, `Icon`, `Heading`, `Text`.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc -b && npx vite build
git commit -m "feat(v2): rewrite HomePage with Chakra UI"
```

---

## Task 3: AgentHubPage

**Files:**
- Create: `src/v2/components/AgentHubPage.tsx`

Rewrite `src/components/AgentHubPage.tsx` (346 lines):
- Trending tokens carousel
- Agent spotlight (top 3 leaderboard)
- Agent Coin Hub title
- Token table with signal strength, consensus badges

- [ ] **Step 1: Create AgentHubPage with stats and spotlight**

- [ ] **Step 2: Add token table with sorting**

- [ ] **Step 3: Verify and commit**

```bash
git commit -m "feat(v2): rewrite AgentHubPage with Chakra UI"
```

---

## Task 4: TokenOpinionPage

**Files:**
- Create: `src/v2/components/TokenOpinionPage.tsx`
- Create: `src/v2/components/CandlestickChart.tsx`
- Create: `src/v2/components/PredictionMarket.tsx`

Rewrite `src/components/TokenOpinionPage.tsx` (343 lines):
- Left sidebar: token header, price, sentiment bar, active agents, prediction market
- Right column: candlestick chart, trading feed (BUY/SELL cards)

CandlestickChart is mostly a canvas wrapper (lightweight-charts) — minimal UI to port.
PredictionMarket is a small card component.

- [ ] **Step 1: Create CandlestickChart wrapper**

Port `src/components/CandlestickChart.tsx`. The lightweight-charts logic stays identical — only wrap in Chakra `Box` instead of div.

- [ ] **Step 2: Create PredictionMarket card**

Port `src/components/PredictionMarket.tsx` using Chakra `Card`, `Progress`, `Badge`.

- [ ] **Step 3: Create TokenOpinionPage layout**

Two-column layout with `Flex`/`Grid`. Left sidebar with token stats, right with chart + feed.

- [ ] **Step 4: Verify and commit**

```bash
git commit -m "feat(v2): rewrite TokenOpinionPage, CandlestickChart, PredictionMarket"
```

---

## Task 5: StatsPage (Order Book)

**Files:**
- Create: `src/v2/components/StatsPage.tsx`

Rewrite `src/components/StatsPage.tsx` (840 lines) — the most complex data display:
- Pair selector tabs
- Order stats cards (1H, 24H, MAX)
- Bid/Ask spread bar
- Order book tables with price, amount, total, USD, qty columns
- Flip pair button
- 10s auto-refresh polling

- [ ] **Step 1: Create pair selector and stats cards**

Use Chakra `Tabs` or `ButtonGroup` for pair selection. `SimpleGrid` + `Card` for stats.

- [ ] **Step 2: Create order book table component**

Use Chakra `Table` with colored rows (green bids, red asks). Include all columns: Price, Amount, Total, USD, Qty. Keep the same normalization logic (inverted/non-inverted, decimal adjustments).

- [ ] **Step 3: Add spread bar and flip**

- [ ] **Step 4: Wire up 10s polling**

- [ ] **Step 5: Verify and commit**

```bash
git commit -m "feat(v2): rewrite StatsPage (Order Book) with Chakra UI"
```

---

## Task 6: DeployPanel

**Files:**
- Create: `src/v2/components/DeployPanel.tsx`

Rewrite `src/components/DeployPanel.tsx` (1400 lines) — the largest component:
- Section 1: AI Model picker (grid of model cards, collapsed/expanded)
- Section 2: Trading Pair dropdown selectors
- Section 3: Strategy textarea with template dropdown, auto-gen, variable chips with help modal
- Section 4: Name & Fund with topup rows, cost breakdown, deploy button

- [ ] **Step 1: Create model picker section**

Use Chakra `SimpleGrid`, `Card`, `Badge` for model selection. Collapsed state shows selected model.

- [ ] **Step 2: Create trading pair dropdowns**

Use Chakra `Menu`/`MenuButton`/`MenuItem` for the base/quote pair picker.

- [ ] **Step 3: Create strategy section**

Textarea with character count, template `Menu`, auto-gen button, variable chips with `Tag`/`Badge`, help `Modal`.

- [ ] **Step 4: Create fund section**

Topup rows with `NumberInput` or `Input` + increment buttons. Cost breakdown table. Deploy `Button`.

- [ ] **Step 5: Wire up deploy/register logic**

Keep all the `deployAndRegister`, `registerOnly`, jetton transfer logic unchanged — just update the UI elements.

- [ ] **Step 6: Verify and commit**

```bash
git commit -m "feat(v2): rewrite DeployPanel with Chakra UI"
```

---

## Task 7: ContractDetailPanel + ContractTabBar

**Files:**
- Create: `src/v2/components/ContractDetailPanel.tsx`
- Create: `src/v2/components/ContractTabBar.tsx`
- Create: `src/v2/components/OrdersPanel.tsx`
- Create: `src/v2/components/OverviewPanel.tsx`

Rewrite the agent detail view (1321 + 146 + 321 + 252 = 2040 lines total):
- Tab bar with agent list, status dots, pair labels
- Header with name, status badge, address, pause/delete buttons
- Stop reason banner
- Stat cards (Model, Balance, Decisions, Open Orders, Created)
- Balance chart (recharts AreaChart — mostly stays the same)
- Contract details, wallet balances, prompt viewer/editor
- DEX Orders tab (active/history)
- AI Responses tab

- [ ] **Step 1: Create ContractTabBar**

Use Chakra `HStack`, `Button`, `Circle` (for status dot), `Text`.

- [ ] **Step 2: Create ContractDetailPanel header and stat cards**

Header with `Heading`, `Badge`, `HStack`. Stat cards with `SimpleGrid` + `Card` + `Stat`.

- [ ] **Step 3: Create balance chart section**

Port recharts AreaChart — wrap in Chakra `Card`. Time range buttons with `ButtonGroup`.

- [ ] **Step 4: Create overview tab (contract details, wallet, prompt, actions)**

Use Chakra `Card`, `Table`, `Textarea`, `Button` for all the detail sections.

- [ ] **Step 5: Create OrdersPanel**

Use Chakra `Tabs`, `Table`, `Badge` for active/history order tabs.

- [ ] **Step 6: Create OverviewPanel (sparkline panel)**

Port the small overview panel used elsewhere.

- [ ] **Step 7: Verify and commit**

```bash
git commit -m "feat(v2): rewrite ContractDetailPanel, ContractTabBar, OrdersPanel"
```

---

## Task 8: LeaderboardPage + DocsPage

**Files:**
- Create: `src/v2/components/LeaderboardPage.tsx`
- Create: `src/v2/components/DocsPage.tsx`

Simpler pages:
- LeaderboardPage (348 lines): ranking table with medals, P&L colors
- DocsPage (246 lines): prose documentation with cards

- [ ] **Step 1: Create LeaderboardPage**

Use Chakra `Table`, `Badge`, `Text` for the ranking table.

- [ ] **Step 2: Create DocsPage**

Use Chakra `Card`, `Heading`, `Text`, `Table`, `Link`, `Code` for documentation sections. Include the AGNT distribution formula section.

- [ ] **Step 3: Verify and commit**

```bash
git commit -m "feat(v2): rewrite LeaderboardPage and DocsPage"
```

---

## Task 9: Wire Up V2 App Routing

**Files:**
- Modify: `src/v2/App.tsx`

- [ ] **Step 1: Replace stub components with real imports**

Update V2 App.tsx to import all completed components and wire up the full routing logic (hash-based routing same as v1).

- [ ] **Step 2: Full integration test**

Navigate through all pages on `/v2`:
- Home → Agent Hub → Token detail → Back
- Order Book → switch pairs → flip
- My Agents → agent detail → orders tab → AI tab
- Deploy → select model → pick pair → write strategy → fund
- Leaderboard
- Docs

- [ ] **Step 3: Verify build**

```bash
npx tsc -b && npx vite build
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(v2): wire up all pages and full routing"
```

---

## Task 10: Cleanup and Polish

- [ ] **Step 1: Dark/light theme toggle**

Ensure Chakra color mode toggle works correctly. Test both modes across all pages.

- [ ] **Step 2: Mobile responsive check**

Test all pages at mobile breakpoints. Fix any layout issues with Chakra responsive props.

- [ ] **Step 3: Remove any remaining DaisyUI/Tailwind classes from v2 components**

Grep for `className` with Tailwind utilities in `src/v2/` and replace with Chakra props.

- [ ] **Step 4: Final build and commit**

```bash
npx tsc -b && npx vite build
git commit -m "feat(v2): polish, dark mode, responsive, cleanup"
```
