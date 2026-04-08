# v2 shadcn/ui Frontend Rewrite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an isolated `/v2` multi-page entry point with all core pages rewritten using shadcn/ui, React Router, and a dark-only theme.

**Architecture:** Vite multi-page setup with `v2/index.html` as second entry. All v2 source in `src/v2/`. Shared libs (`src/lib/`) imported directly. React Router v7 with `createBrowserRouter` and `basename: "/v2"`.

**Tech Stack:** React 19, Vite 7, React Router 7, shadcn/ui (new-york style), Tailwind CSS 4, lucide-react, lightweight-charts, recharts, framer-motion, TonConnect.

---

## File Structure

```
v2/index.html                          # NEW — v2 HTML entry point
src/v2/main.tsx                        # NEW — v2 React entry
src/v2/App.tsx                         # NEW — Router + TonConnect provider
src/v2/index.css                       # NEW — Tailwind + shadcn CSS vars (dark only)
src/v2/lib/utils.ts                    # NEW — cn() utility
src/v2/components/ui/button.tsx        # NEW — shadcn Button
src/v2/components/ui/card.tsx          # NEW — shadcn Card
src/v2/components/ui/table.tsx         # NEW — shadcn Table
src/v2/components/ui/input.tsx         # NEW — shadcn Input
src/v2/components/ui/label.tsx         # NEW — shadcn Label
src/v2/components/ui/textarea.tsx      # NEW — shadcn Textarea
src/v2/components/ui/select.tsx        # NEW — shadcn Select
src/v2/components/ui/tabs.tsx          # NEW — shadcn Tabs
src/v2/components/ui/badge.tsx         # NEW — shadcn Badge
src/v2/components/ui/dialog.tsx        # NEW — shadcn Dialog
src/v2/components/ui/dropdown-menu.tsx # NEW — shadcn DropdownMenu
src/v2/components/ui/separator.tsx     # NEW — shadcn Separator
src/v2/components/ui/skeleton.tsx      # NEW — shadcn Skeleton
src/v2/components/ui/tooltip.tsx       # NEW — shadcn Tooltip
src/v2/components/ui/sheet.tsx         # NEW — shadcn Sheet
src/v2/components/ui/scroll-area.tsx   # NEW — shadcn ScrollArea
src/v2/components/ui/switch.tsx        # NEW — shadcn Switch
src/v2/components/ui/sonner.tsx        # NEW — shadcn Sonner (toasts)
src/v2/components/layout/RootLayout.tsx # NEW — Shell: navbar + <Outlet />
src/v2/components/layout/Navbar.tsx    # NEW — Top nav with links + wallet
src/v2/components/pages/HomePage.tsx           # NEW — Rewritten landing
src/v2/components/pages/DeployPage.tsx         # NEW — Rewritten deploy form
src/v2/components/pages/ContractDetailPage.tsx # NEW — Rewritten agent dashboard
src/v2/components/pages/StatsPage.tsx          # NEW — Rewritten DEX stats
src/v2/components/pages/LeaderboardPage.tsx    # NEW — Rewritten rankings
src/v2/components/pages/AgentHubPage.tsx       # NEW — Rewritten token hub
vite.config.ts                         # MODIFY — add multi-page input
components.json                        # MODIFY — update paths for v2
```

---

### Task 1: Vite Multi-Page Setup + v2 Entry Point

**Files:**
- Modify: `vite.config.ts`
- Create: `v2/index.html`
- Create: `src/v2/main.tsx`
- Create: `src/v2/App.tsx`
- Create: `src/v2/index.css`

- [ ] **Step 1: Create `v2/index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Trader Race v2</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600&family=IBM+Plex+Mono:wght@400;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body class="dark bg-background text-foreground">
    <div id="root"></div>
    <script type="module" src="/src/v2/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create `src/v2/index.css`**

This file sets up Tailwind CSS 4 for v2 WITHOUT DaisyUI. It imports Tailwind and defines shadcn/ui CSS variables for the dark theme only.

```css
@import "tailwindcss";

@layer base {
  :root {
    --radius: 0.625rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-family: "Space Grotesk", sans-serif;
  }
}

@utility mono {
  font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco,
    Consolas, "Liberation Mono", "Courier New", monospace;
}

@utility scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
  &::-webkit-scrollbar {
    display: none;
  }
}

@utility animate-fade-in-up {
  animation: fadeInUp 0.5s ease-out forwards;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes livePulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.5);
  }
}

@utility live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: hsl(142 71% 45%);
  animation: livePulse 2s ease-in-out infinite;
}
```

- [ ] **Step 3: Create `src/v2/lib/utils.ts`**

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 4: Create `src/v2/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { Buffer } from 'buffer';
import './index.css';
import { App } from './App';

(globalThis as any).Buffer = Buffer;

const manifestUrl =
  import.meta.env.VITE_TONCONNECT_MANIFEST_URL ||
  `${window.location.origin}/tc-manifest.json`;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Create `src/v2/App.tsx` (minimal placeholder)**

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <div className="flex items-center justify-center min-h-screen text-2xl">v2 works!</div>,
    },
  ],
  { basename: '/v2' },
);

export function App() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 6: Update `vite.config.ts` for multi-page**

Replace the current config with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      protocolImports: true,
    }),
  ],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        v2: path.resolve(__dirname, 'v2/index.html'),
      },
    },
  },
});
```

- [ ] **Step 7: Install react-router-dom**

```bash
npm install react-router-dom
```

- [ ] **Step 8: Verify v2 loads**

```bash
npm run dev
```

Open `http://localhost:5173/v2/` in browser — should show "v2 works!" on a dark background. Open `http://localhost:5173/` — v1 should still work normally.

- [ ] **Step 9: Commit**

```bash
git add v2/index.html src/v2/ vite.config.ts package.json package-lock.json
git commit -m "feat(v2): add multi-page Vite entry point with dark-only Tailwind setup"
```

---

### Task 2: Install shadcn/ui Components

**Files:**
- Modify: `components.json`
- Create: All files in `src/v2/components/ui/`

- [ ] **Step 1: Update `components.json` for v2 paths**

Replace the current `components.json` with:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/v2/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@/v2/components",
    "utils": "@/v2/lib/utils",
    "ui": "@/v2/components/ui",
    "lib": "@/v2/lib",
    "hooks": "@/v2/hooks"
  },
  "registries": {}
}
```

- [ ] **Step 2: Install shadcn/ui components via CLI**

Run each command. The CLI will create files in `src/v2/components/ui/` based on the aliases above.

```bash
npx shadcn@latest add button card table input label textarea select tabs badge dialog dropdown-menu separator skeleton tooltip sheet scroll-area switch sonner
```

If the CLI prompts for confirmation, accept defaults. This installs all 18 components and any required Radix primitives.

- [ ] **Step 3: Install sonner dependency**

```bash
npm install sonner
```

- [ ] **Step 4: Verify all component files exist**

```bash
ls src/v2/components/ui/
```

Expected: `button.tsx`, `card.tsx`, `table.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `select.tsx`, `tabs.tsx`, `badge.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `separator.tsx`, `skeleton.tsx`, `tooltip.tsx`, `sheet.tsx`, `scroll-area.tsx`, `switch.tsx`, `sonner.tsx`

- [ ] **Step 5: Commit**

```bash
git add components.json src/v2/components/ui/ package.json package-lock.json
git commit -m "feat(v2): install all shadcn/ui components"
```

---

### Task 3: RootLayout + Navbar

**Files:**
- Create: `src/v2/components/layout/RootLayout.tsx`
- Create: `src/v2/components/layout/Navbar.tsx`
- Modify: `src/v2/App.tsx`

- [ ] **Step 1: Create `src/v2/components/layout/Navbar.tsx`**

```tsx
import { Link, useLocation } from 'react-router-dom';
import { TonConnectButton } from '@tonconnect/ui-react';
import { Bot, BarChart3, Trophy, Layers, Rocket, Menu } from 'lucide-react';
import { Button } from '@/v2/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/v2/components/ui/sheet';
import { Separator } from '@/v2/components/ui/separator';
import { cn } from '@/v2/lib/utils';

const NAV_LINKS = [
  { to: '/', label: 'Home', icon: Bot },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
  { to: '/agent-hub', label: 'Agent Hub', icon: Layers },
  { to: '/trader/deploy', label: 'Deploy', icon: Rocket },
];

export function Navbar() {
  const location = useLocation();

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/';
    return location.pathname.startsWith(to);
  };

  const linkElements = NAV_LINKS.map((link) => (
    <Link
      key={link.to}
      to={link.to}
      className={cn(
        'flex items-center gap-2 text-sm font-medium transition-colors hover:text-foreground',
        isActive(link.to) ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <link.icon className="h-4 w-4" />
      {link.label}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center px-4">
        {/* Logo */}
        <Link to="/" className="mr-6 flex items-center gap-2">
          <Bot className="h-6 w-6" />
          <span className="font-bold">AI Trader Race</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6 flex-1">
          {linkElements}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 ml-auto">
          <TonConnectButton />

          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <nav className="flex flex-col gap-4 mt-8">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={cn(
                      'flex items-center gap-3 text-sm font-medium transition-colors hover:text-foreground py-2',
                      isActive(link.to) ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    <link.icon className="h-4 w-4" />
                    {link.label}
                  </Link>
                ))}
                <Separator />
                <div className="pt-2">
                  <TonConnectButton />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create `src/v2/components/layout/RootLayout.tsx`**

```tsx
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Toaster } from '@/v2/components/ui/sonner';

export function RootLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container max-w-screen-2xl px-4 py-6">
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 3: Update `src/v2/App.tsx` with full router**

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { RootLayout } from './components/layout/RootLayout';

function PlaceholderPage({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-xl text-muted-foreground">
      {name} — coming soon
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      children: [
        { index: true, element: <PlaceholderPage name="Home" /> },
        { path: 'leaderboard', element: <PlaceholderPage name="Leaderboard" /> },
        { path: 'stats', element: <PlaceholderPage name="Stats" /> },
        { path: 'stats/:pair', element: <PlaceholderPage name="Stats" /> },
        { path: 'agent-hub', element: <PlaceholderPage name="Agent Hub" /> },
        { path: 'agent-hub/:token', element: <PlaceholderPage name="Agent Hub" /> },
        { path: 'trader/deploy', element: <PlaceholderPage name="Deploy" /> },
        { path: 'trader/:id', element: <PlaceholderPage name="Contract Detail" /> },
      ],
    },
  ],
  { basename: '/v2' },
);

export function App() {
  return <RouterProvider router={router} />;
}
```

- [ ] **Step 4: Verify layout renders**

```bash
npm run dev
```

Open `http://localhost:5173/v2/` — should show dark navbar with navigation links, wallet connect button, and "Home — coming soon" placeholder. Click through navigation links to verify routing works. Test mobile hamburger menu at narrow viewport.

- [ ] **Step 5: Commit**

```bash
git add src/v2/components/layout/ src/v2/App.tsx
git commit -m "feat(v2): add RootLayout with navbar, mobile sheet, and router skeleton"
```

---

### Task 4: HomePage

**Files:**
- Create: `src/v2/components/pages/HomePage.tsx`
- Modify: `src/v2/App.tsx`

This rewrites `src/components/HomePage.tsx` (499 lines) using shadcn/ui components. The page fetches token opinions, leaderboard data, and AI responses from the shared API layer, then renders:
1. Hero section
2. Stats bar (4 cards)
3. Top performers (cards)
4. Agent activity feed (cards)
5. Token table
6. Trust section (cards)

- [ ] **Step 1: Create `src/v2/components/pages/HomePage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Rocket, TrendingUp, TrendingDown, Target, Trophy,
  ChevronRight, Clock, ShieldCheck, Code, FileCheck,
} from 'lucide-react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  getRaceAiResponses,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type AiResponse,
  type PublicApiConfig,
} from '@/lib/api';
import { Button } from '@/v2/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/v2/components/ui/table';
import { Skeleton } from '@/v2/components/ui/skeleton';

/* ---------- helpers ---------- */

function computeSignalStrength(token: TokenOpinionSummary, maxAgents: number, maxTrades: number): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (consensusWeight * 0.4 + token.avg_confidence * 0.3 + agentWeight * 0.15 + volumeWeight * 0.15) * 10;
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function actionLabel(action: string): string {
  if (action === 'create_order') return 'Trade';
  if (action === 'close_order') return 'Close';
  if (action === 'hold') return 'Hold';
  if (action === 'wait') return 'Wait';
  return action;
}

function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action === 'create_order') return 'default';
  if (action === 'close_order') return 'secondary';
  return 'outline';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ---------- component ---------- */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

export function HomePage() {
  const navigate = useNavigate();
  const raceCfg: PublicApiConfig = { baseUrl: API_BASE };

  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [aiResponses, setAiResponses] = useState<AiResponse[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [tokenData, lb, responses] = await Promise.all([
        getTokenOpinions(raceCfg).catch(() => [] as TokenOpinionSummary[]),
        getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' }).catch(() => [] as LeaderboardEntry[]),
        getRaceAiResponses(raceCfg, { limit: 20 }).then((p) => p.results).catch(() => [] as AiResponse[]),
      ]);
      setTokens((Array.isArray(tokenData) ? tokenData : []).sort((a, b) => b.total_trades_24h - a.total_trades_24h));
      setLeaderboard(lb);
      setAiResponses(responses);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));
  const totalActiveAgents = tokens.reduce((sum, t) => sum + (t.active_agents || 0), 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

  const bullishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BULLISH').length;
  const bearishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BEARISH').length;
  const dominantSentiment = bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct = tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;
  const avgSignal = tokens.length > 0
    ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) / tokens.length
    : 0;

  const top3 = [...leaderboard].sort((a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity)).slice(0, 3);

  const agentMap = new Map<string, { name: string; model: string }>();
  for (const e of leaderboard) {
    agentMap.set(e.smart_contract_id, { name: e.name || fmtAddr(e.address), model: e.ai_model || '' });
  }

  const feedItems = aiResponses
    .filter((r) => r.parsed_params && typeof r.parsed_params.reasoning === 'string' && (r.parsed_params.reasoning as string).length > 0)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6 pb-20">

      {/* 1. Hero */}
      <section className="flex flex-col items-center text-center pt-10 sm:pt-16 gap-4">
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">AI Agents Arena</h2>
        <p className="max-w-2xl text-muted-foreground">
          Autonomous AI trading agents competing on the TON blockchain. Pick your model, set your strategy, and let AI trade for you.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
          <Button size="lg" onClick={() => navigate('/trader/deploy')}>
            <Rocket className="h-4 w-4 mr-2" />
            Deploy New Agent
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate('/trader/deploy')}>
            <Bot className="h-4 w-4 mr-2" />
            My Agents
          </Button>
        </div>
      </section>

      {/* 2. Stats Bar */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Active Agents</p>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold mt-1">{totalActiveAgents}</p>
              <p className="text-xs text-muted-foreground">trading now</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Trades 24h</p>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold mt-1">{totalTrades24h.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">on-chain executions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Sentiment</p>
                {dominantSentiment === 'Bearish'
                  ? <TrendingDown className="h-4 w-4 text-red-500" />
                  : <TrendingUp className="h-4 w-4 text-green-500" />}
              </div>
              <p className={`text-2xl font-bold mt-1 ${dominantSentiment === 'Bullish' ? 'text-green-500' : dominantSentiment === 'Bearish' ? 'text-red-500' : ''}`}>
                {dominantSentiment}
              </p>
              <p className="text-xs text-muted-foreground">{sentimentPct}% of agents</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Avg Signal</p>
                <Target className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-2xl font-bold mt-1">{avgSignal.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">out of 10</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-20 w-full" /></CardContent></Card>
          ))}
        </div>
      )}

      {/* 3. Top Performers */}
      {!loading && top3.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Top Performing Agents
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leaderboard')}>
              View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {top3.map((entry, idx) => {
                const profitPct = entry.profit_pct ?? 0;
                const shortModel = entry.ai_model.includes('/')
                  ? entry.ai_model.split('/').pop() ?? entry.ai_model
                  : entry.ai_model;
                return (
                  <Card key={entry.address} className="cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(`/trader/${entry.smart_contract_id}`)}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="mono text-sm font-bold truncate">{entry.name || fmtAddr(entry.address)}</p>
                          <p className="text-xs text-muted-foreground truncate">{shortModel}</p>
                        </div>
                      </div>
                      <p className={`mono text-lg font-bold tabular-nums ${profitPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.completed_orders ?? 0} trades</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. Activity Feed */}
      {!loading && feedItems.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Agent Activity Feed</span>
              <Badge variant="outline" className="gap-1">
                <span className="live-dot" /> Live
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/leaderboard')}>
              View all <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {feedItems.map((r) => {
              const pp = r.parsed_params as Record<string, unknown>;
              const reasoning = pp.reasoning as string;
              const from = pp.from_token as string | undefined;
              const to = pp.to_token as string | undefined;
              const tokenPair = from && to ? `${from}/${to}` : undefined;
              const agent = agentMap.get(r.smart_contract_id);
              const agentName = agent?.name || fmtAddr(r.smart_contract_id);
              const model = agent?.model ? agent.model.split('/').pop() ?? agent.model : '';

              return (
                <Card key={r.id} className="border-l-4 border-l-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <Bot className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{agentName}</span>
                            {model && <Badge variant="secondary" className="text-xs">{model}</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                        <Badge variant={actionVariant(r.action)}>{actionLabel(r.action)}</Badge>
                        {tokenPair && <Badge variant="outline">{tokenPair}</Badge>}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {timeAgo(r.created_at)}
                        </span>
                      </div>
                    </div>
                    {reasoning && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{reasoning}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Token Table */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Agents Hub</h2>
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6"><Skeleton className="h-40 w-full" /></div>
            ) : tokens.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No agent opinions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">24h</TableHead>
                    <TableHead className="text-center">AI Consensus</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">Signal</TableHead>
                    <TableHead className="text-right">Trades 24h</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((t, i) => {
                    const signal = computeSignalStrength(t, maxAgents, maxTrades);
                    const change24h = t.price_change_24h ?? 0;
                    const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;
                    const consensusUpper = (t.consensus ?? '').toUpperCase();
                    const bullish = t.bullish_pct ?? 0;
                    const bearish = t.bearish_pct ?? 0;
                    const pct = consensusUpper === 'BULLISH' ? bullish : consensusUpper === 'BEARISH' ? bearish : Math.max(bullish, bearish);

                    return (
                      <TableRow key={t.token_symbol} className="cursor-pointer" onClick={() => navigate(`/agent-hub/${t.token_symbol}`)}>
                        <TableCell className="mono text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-baseline gap-2">
                            <span className="mono text-xs font-bold">{t.token_symbol}</span>
                            <span className="text-xs text-muted-foreground truncate max-w-[8rem]">{t.token_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right mono text-xs tabular-nums">{fmtPrice(priceUsd)}</TableCell>
                        <TableCell className={`text-right mono text-xs tabular-nums font-bold ${change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={consensusUpper === 'BULLISH' ? 'default' : consensusUpper === 'BEARISH' ? 'destructive' : 'secondary'} className="gap-1">
                            {consensusUpper === 'BULLISH' && <TrendingUp className="h-3 w-3" />}
                            {consensusUpper === 'BEARISH' && <TrendingDown className="h-3 w-3" />}
                            {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right hidden sm:table-cell">
                          <span className={`mono text-xs tabular-nums font-bold ${signal >= 7 ? 'text-green-500' : signal >= 4 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                            {signal.toFixed(1)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right mono text-xs tabular-nums">{t.total_trades_24h}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>

      {/* 6. Trust Section */}
      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Why Trust Us</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Code, title: 'Open Source', desc: 'All code is fully open-source and available on GitHub for anyone to review, audit, and verify.' },
            { icon: FileCheck, title: 'Audited Contracts', desc: 'Smart contracts are audited and verifiable on-chain. Every transaction is transparent and traceable.' },
            { icon: ShieldCheck, title: 'Transparent Decisions', desc: 'Every AI trade decision is recorded with full reasoning, so you can review agent logic at any time.' },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title}>
              <CardContent className="flex flex-col items-center text-center p-6 gap-2">
                <Icon className="h-8 w-8 text-muted-foreground" />
                <h3 className="font-bold">{title}</h3>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

    </div>
  );
}
```

- [ ] **Step 2: Wire HomePage into router**

In `src/v2/App.tsx`, add the import and replace the home route:

```tsx
import { HomePage } from './components/pages/HomePage';
// ...
{ index: true, element: <HomePage /> },
```

- [ ] **Step 3: Verify HomePage renders**

```bash
npm run dev
```

Open `http://localhost:5173/v2/` — should show the full dark-themed home page with stats, top agents, activity feed, and token table. Data loads from the API.

- [ ] **Step 4: Commit**

```bash
git add src/v2/components/pages/HomePage.tsx src/v2/App.tsx
git commit -m "feat(v2): add HomePage with shadcn/ui cards, table, badges"
```

---

### Task 5: LeaderboardPage

**Files:**
- Create: `src/v2/components/pages/LeaderboardPage.tsx`
- Modify: `src/v2/App.tsx`

Rewrites `src/components/LeaderboardPage.tsx` (348 lines). Features: overall + per-token tabs, sortable table, rank badges.

- [ ] **Step 1: Create `src/v2/components/pages/LeaderboardPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getRaceLeaderboard,
  getTokenLeaderboard,
  fromNanoToken,
  type LeaderboardEntry,
  type TokenLeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/v2/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/v2/components/ui/tabs';
import { Button } from '@/v2/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/v2/components/ui/table';
import { Skeleton } from '@/v2/components/ui/skeleton';
import { Trophy } from 'lucide-react';

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function shortModel(m: string): string {
  const parts = m.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : m;
}

function fmtAmount(n: number): string {
  if (n === 0) return '0';
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const colors = [
      'bg-yellow-500/20 text-yellow-500',
      'bg-muted text-muted-foreground',
      'bg-yellow-500/10 text-yellow-600',
    ];
    return (
      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold tabular-nums ${colors[rank - 1]}`}>
        {rank}
      </span>
    );
  }
  return <span className="mono text-xs font-semibold tabular-nums text-muted-foreground">{rank}</span>;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

type TabKey = 'overall' | 'agnt' | 'ton' | 'not' | 'build';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overall', label: 'Overall' },
  { key: 'agnt', label: 'AGNT' },
  { key: 'ton', label: 'TON' },
  { key: 'not', label: 'NOT' },
  { key: 'build', label: 'BUILD' },
];

export function LeaderboardPage() {
  const navigate = useNavigate();
  const raceCfg: PublicApiConfig = { baseUrl: API_BASE };
  const [tab, setTab] = useState<TabKey>('overall');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [tokenEntries, setTokenEntries] = useState<TokenLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'overall') {
        setEntries(await getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' }));
      } else {
        setTokenEntries(await getTokenLeaderboard(raceCfg, tab));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const isToken = tab !== 'overall';

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          Leaderboard
        </CardTitle>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading ? (
          <Skeleton className="h-60 w-full" />
        ) : !isToken ? (
          entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="hidden sm:table-cell">AI Model</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => {
                  const profitPct = e.profit_pct ?? 0;
                  const isPositive = profitPct >= 0;
                  const totalOrd = e.total_orders ?? 0;
                  const compOrd = e.completed_orders ?? 0;
                  const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;

                  return (
                    <TableRow key={e.smart_contract_id}>
                      <TableCell><RankBadge rank={e.rank} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {e.is_active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/70 shrink-0" />}
                          <a className="mono text-xs hover:underline" href={`https://tonviewer.com/${e.address}`} target="_blank" rel="noreferrer">
                            {e.name || fmtAddr(e.address)}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="mono text-xs text-muted-foreground truncate max-w-[9rem] block">
                          {e.ai_model ? shortModel(e.ai_model) : '\u2014'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className="mono text-xs tabular-nums font-medium">{e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '\u2014'}</span>
                          <span className="mono text-[10px] tabular-nums text-muted-foreground">{e.start_balance_usd != null ? fmtUsd(e.start_balance_usd) : ''}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`mono text-sm tabular-nums font-bold ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
                            {e.profit_pct != null ? `${isPositive ? '+' : ''}${profitPct.toFixed(1)}%` : '\u2014'}
                          </span>
                          <span className={`mono text-[10px] tabular-nums ${isPositive ? 'text-green-500/60' : 'text-red-500/60'}`}>
                            {e.profit_usd != null ? `${isPositive ? '+' : ''}${fmtUsd(e.profit_usd)}` : ''}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="mono text-xs tabular-nums">
                            <span className="text-green-500/80">{compOrd}</span>
                            <span className="text-muted-foreground/40">/{totalOrd}</span>
                          </span>
                          {totalOrd > 0 && (
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-green-500/50" style={{ width: `${ordPct}%` }} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate(`/trader/${e.smart_contract_id}`)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        ) : (
          tokenEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {tab.toUpperCase()} trading data yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Buy Vol</TableHead>
                  <TableHead className="text-right">Sell Vol</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Decisions</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokenEntries.map((e) => {
                  const buyHuman = fromNanoToken(e.buy_volume, tab.toUpperCase());
                  const sellHuman = fromNanoToken(e.sell_volume, tab.toUpperCase());
                  const totalOrd = e.total_orders ?? 0;
                  const compOrd = e.completed_orders ?? 0;
                  const ordPct = totalOrd > 0 ? (compOrd / totalOrd) * 100 : 0;
                  return (
                    <TableRow key={e.smart_contract_id}>
                      <TableCell><RankBadge rank={e.rank} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {e.status === 'active' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500/70 shrink-0" />}
                          <span className="mono text-xs">{e.name || fmtAddr(e.address)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right mono text-xs tabular-nums text-green-500/80">{fmtAmount(buyHuman)}</TableCell>
                      <TableCell className="text-right mono text-xs tabular-nums text-red-500/80">{fmtAmount(sellHuman)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="mono text-xs tabular-nums">
                            <span className="text-green-500/80">{compOrd}</span>
                            <span className="text-muted-foreground/40">/{totalOrd}</span>
                          </span>
                          {totalOrd > 0 && (
                            <div className="w-12 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full bg-green-500/50" style={{ width: `${ordPct}%` }} />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell mono text-xs tabular-nums text-muted-foreground">
                        {e.used_decisions}{e.max_decisions > 0 ? `/${e.max_decisions}` : ''}
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => navigate(`/trader/${e.smart_contract_id}`)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into router**

In `src/v2/App.tsx`, add:

```tsx
import { LeaderboardPage } from './components/pages/LeaderboardPage';
// ...
{ path: 'leaderboard', element: <LeaderboardPage /> },
```

- [ ] **Step 3: Verify and commit**

```bash
npm run dev
```

Open `http://localhost:5173/v2/leaderboard` — verify tabs switch between Overall and token leaderboards, table renders with rank badges.

```bash
git add src/v2/components/pages/LeaderboardPage.tsx src/v2/App.tsx
git commit -m "feat(v2): add LeaderboardPage with tabs and ranked table"
```

---

### Task 6: AgentHubPage

**Files:**
- Create: `src/v2/components/pages/AgentHubPage.tsx`
- Modify: `src/v2/App.tsx`

Rewrites `src/components/AgentHubPage.tsx` (359 lines) + `src/components/TokenOpinionPage.tsx` (343 lines). Uses URL param `:token` to switch between hub overview and per-token detail.

- [ ] **Step 1: Create `src/v2/components/pages/AgentHubPage.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bot, TrendingUp, TrendingDown, Target, Rocket } from 'lucide-react';
import {
  getTokenOpinions,
  getTokenOpinionDetail,
  type TokenOpinionSummary,
  type TokenOpinionDetail,
  type PublicApiConfig,
} from '@/lib/api';
import { Button } from '@/v2/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/v2/components/ui/table';
import { Skeleton } from '@/v2/components/ui/skeleton';

function computeSignalStrength(token: TokenOpinionSummary, maxAgents: number, maxTrades: number): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (consensusWeight * 0.4 + token.avg_confidence * 0.3 + agentWeight * 0.15 + volumeWeight * 0.15) * 10;
}

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

export function AgentHubPage() {
  const navigate = useNavigate();
  const { token: tokenParam } = useParams<{ token?: string }>();
  const raceCfg: PublicApiConfig = { baseUrl: API_BASE };

  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [detail, setDetail] = useState<TokenOpinionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTokenOpinions(raceCfg);
      setTokens((Array.isArray(data) ? data : []).sort((a, b) => b.total_trades_24h - a.total_trades_24h));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (symbol: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTokenOpinionDetail(raceCfg, symbol);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tokenParam) {
      void loadDetail(tokenParam);
    } else {
      void loadList();
    }
  }, [tokenParam, loadList, loadDetail]);

  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));
  const totalActiveAgents = tokens.reduce((sum, t) => sum + t.active_agents, 0);
  const totalTrades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);

  const bullishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BULLISH').length;
  const bearishCount = tokens.filter((t) => (t.consensus ?? '').toUpperCase() === 'BEARISH').length;
  const dominantSentiment = bullishCount > bearishCount ? 'Bullish' : bearishCount > bullishCount ? 'Bearish' : 'Neutral';
  const dominantCount = Math.max(bullishCount, bearishCount);
  const sentimentPct = tokens.length > 0 ? Math.round((dominantCount / tokens.length) * 100) : 0;
  const avgSignal = tokens.length > 0
    ? tokens.reduce((sum, t) => sum + computeSignalStrength(t, maxAgents, maxTrades), 0) / tokens.length
    : 0;

  /* Token detail view */
  if (tokenParam) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/agent-hub')}>Back</Button>
          <h2 className="text-2xl font-bold">{tokenParam.toUpperCase()} Opinions</h2>
        </div>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : loading || !detail ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Consensus</p>
                <p className={`text-xl font-bold ${(detail.consensus ?? '').toUpperCase() === 'BULLISH' ? 'text-green-500' : (detail.consensus ?? '').toUpperCase() === 'BEARISH' ? 'text-red-500' : ''}`}>
                  {detail.consensus || 'Neutral'}
                </p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Confidence</p>
                <p className="text-xl font-bold">{((detail.avg_confidence ?? 0) * 100).toFixed(0)}%</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Bullish / Bearish</p>
                <p className="text-xl font-bold">
                  <span className="text-green-500">{detail.bullish_count ?? 0}</span>
                  {' / '}
                  <span className="text-red-500">{detail.bearish_count ?? 0}</span>
                </p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Active Agents</p>
                <p className="text-xl font-bold">{detail.active_agents ?? 0}</p>
              </CardContent></Card>
            </div>

            {/* Opinions table */}
            {detail.opinions && detail.opinions.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead className="text-right">Confidence</TableHead>
                        <TableHead className="hidden sm:table-cell">Reasoning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.opinions.map((op, i) => (
                        <TableRow key={i}>
                          <TableCell className="mono text-xs">{op.agent_name || op.smart_contract_id?.slice(0, 10) || `Agent ${i + 1}`}</TableCell>
                          <TableCell>
                            <Badge variant={(op.direction ?? '').toUpperCase() === 'BULLISH' ? 'default' : 'destructive'}>
                              {op.direction}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right mono text-xs">{((op.confidence ?? 0) * 100).toFixed(0)}%</TableCell>
                          <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[20rem] truncate">{op.reasoning}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    );
  }

  /* Hub overview */
  return (
    <div className="flex flex-col gap-4">
      {/* Stats bar */}
      {!loading && tokens.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Active Agents</p><Bot className="h-4 w-4 text-muted-foreground" /></div>
            <p className="text-2xl font-bold mt-1">{totalActiveAgents}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Trades 24h</p><TrendingUp className="h-4 w-4 text-muted-foreground" /></div>
            <p className="text-2xl font-bold mt-1">{totalTrades24h.toLocaleString()}</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Sentiment</p>
              {dominantSentiment === 'Bearish' ? <TrendingDown className="h-4 w-4 text-red-500" /> : <TrendingUp className="h-4 w-4 text-green-500" />}
            </div>
            <p className={`text-2xl font-bold mt-1 ${dominantSentiment === 'Bullish' ? 'text-green-500' : dominantSentiment === 'Bearish' ? 'text-red-500' : ''}`}>{dominantSentiment}</p>
            <p className="text-xs text-muted-foreground">{sentimentPct}%</p>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Avg Signal</p><Target className="h-4 w-4 text-muted-foreground" /></div>
            <p className="text-2xl font-bold mt-1">{avgSignal.toFixed(1)}</p>
          </CardContent></Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Agents Hub</h2>
        <Button onClick={() => navigate('/trader/deploy')}>
          <Rocket className="h-4 w-4 mr-2" /> Deploy Agent
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {error ? (
            <p className="p-6 text-sm text-red-500">{error}</p>
          ) : loading ? (
            <div className="p-6"><Skeleton className="h-40 w-full" /></div>
          ) : tokens.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No agent opinions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">24h</TableHead>
                  <TableHead className="text-center">AI Consensus</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">Signal</TableHead>
                  <TableHead className="text-right">Trades 24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t, i) => {
                  const signal = computeSignalStrength(t, maxAgents, maxTrades);
                  const change24h = t.price_change_24h ?? 0;
                  const priceUsd = t.price_usd != null && t.price_usd < 1_000_000 ? t.price_usd : 0;
                  const consensusUpper = (t.consensus ?? '').toUpperCase();
                  const bullish = t.bullish_pct ?? 0;
                  const bearish = t.bearish_pct ?? 0;
                  const pct = consensusUpper === 'BULLISH' ? bullish : consensusUpper === 'BEARISH' ? bearish : Math.max(bullish, bearish);

                  return (
                    <TableRow key={t.token_symbol} className="cursor-pointer" onClick={() => navigate(`/agent-hub/${t.token_symbol}`)}>
                      <TableCell className="mono text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-baseline gap-2">
                          <span className="mono text-xs font-bold">{t.token_symbol}</span>
                          <span className="text-xs text-muted-foreground truncate max-w-[8rem]">{t.token_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right mono text-xs tabular-nums">{fmtPrice(priceUsd)}</TableCell>
                      <TableCell className={`text-right mono text-xs tabular-nums font-bold ${change24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {change24h >= 0 ? '+' : ''}{change24h.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={consensusUpper === 'BULLISH' ? 'default' : consensusUpper === 'BEARISH' ? 'destructive' : 'secondary'} className="gap-1">
                          {consensusUpper === 'BULLISH' && <TrendingUp className="h-3 w-3" />}
                          {consensusUpper === 'BEARISH' && <TrendingDown className="h-3 w-3" />}
                          {consensusUpper || 'NEUTRAL'} {pct.toFixed(0)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className={`mono text-xs tabular-nums font-bold ${signal >= 7 ? 'text-green-500' : signal >= 4 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                          {signal.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right mono text-xs tabular-nums">{t.total_trades_24h}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Wire into router**

In `src/v2/App.tsx`:

```tsx
import { AgentHubPage } from './components/pages/AgentHubPage';
// ...
{ path: 'agent-hub', element: <AgentHubPage /> },
{ path: 'agent-hub/:token', element: <AgentHubPage /> },
```

- [ ] **Step 3: Verify and commit**

Test hub overview and per-token drill-down at `/v2/agent-hub` and `/v2/agent-hub/AGNT`.

```bash
git add src/v2/components/pages/AgentHubPage.tsx src/v2/App.tsx
git commit -m "feat(v2): add AgentHubPage with token opinions table and detail view"
```

---

### Task 7: StatsPage

**Files:**
- Create: `src/v2/components/pages/StatsPage.tsx`
- Modify: `src/v2/App.tsx`

Rewrites `src/components/StatsPage.tsx` (892 lines). Shows DEX order book, pair selector, trading stats, and candlestick chart. The candlestick chart uses `lightweight-charts` directly (not a shadcn component).

This is a large page. The implementation agent should read the full v1 `src/components/StatsPage.tsx` to understand all the data fetching, normalization logic (order book), and chart setup. The v2 version replaces DaisyUI markup with shadcn/ui but preserves all business logic.

- [ ] **Step 1: Create `src/v2/components/pages/StatsPage.tsx`**

Read the full v1 `src/components/StatsPage.tsx` first. Then rewrite it with these substitutions:
- DaisyUI `table` / `table-sm` → shadcn `Table` / `TableRow` / `TableCell`
- DaisyUI `card` / `card-body` → shadcn `Card` / `CardContent`
- DaisyUI `select` → shadcn `Select` / `SelectTrigger` / `SelectContent` / `SelectItem`
- DaisyUI `badge` → shadcn `Badge`
- DaisyUI `loading loading-spinner` → shadcn `Skeleton`
- DaisyUI `stats` → grid of shadcn `Card` components
- Keep `lightweight-charts` chart setup exactly as-is (it's not a UI component)
- Keep all order book normalization logic (`normalizeOrderBook`, `NormalizedLevel`, etc.) exactly as-is
- Keep all API calls and auto-refresh logic exactly as-is
- Replace DaisyUI theme colors (`text-success`, `text-error`, `text-primary`) with Tailwind (`text-green-500`, `text-red-500`, `text-foreground`)

The component should accept the pair from the URL via `useParams` and use `useNavigate` to switch pairs.

The full component will be ~700-800 lines. Preserve all v1 functionality including:
- Pair selector tabs
- Order book with bid/ask sides and depth bars
- Scanner stats (volume, order count, VWAP) per time window
- Trading stats summary cards
- Auto-refresh every 10 seconds

- [ ] **Step 2: Wire into router**

In `src/v2/App.tsx`:

```tsx
import { StatsPage } from './components/pages/StatsPage';
// ...
{ path: 'stats', element: <StatsPage /> },
{ path: 'stats/:pair', element: <StatsPage /> },
```

- [ ] **Step 3: Verify and commit**

Test at `/v2/stats` and `/v2/stats/AGNT-USDT`. Verify pair switching, order book rendering, auto-refresh.

```bash
git add src/v2/components/pages/StatsPage.tsx src/v2/App.tsx
git commit -m "feat(v2): add StatsPage with order book, pair selector, and trading stats"
```

---

### Task 8: DeployPage

**Files:**
- Create: `src/v2/components/pages/DeployPage.tsx`
- Modify: `src/v2/App.tsx`

Rewrites `src/components/DeployPanel.tsx` (1465 lines). This is the largest component with significant business logic: keypair generation, model selection, prompt editing, token selection, wallet funding via TonConnect.

The implementation agent should read the full v1 `src/components/DeployPanel.tsx` first. Then rewrite it with these substitutions:
- DaisyUI `input` → shadcn `Input` + `Label`
- DaisyUI `textarea` → shadcn `Textarea` + `Label`
- DaisyUI `select` → shadcn `Select`
- DaisyUI `btn` → shadcn `Button`
- DaisyUI `card` → shadcn `Card`
- DaisyUI `badge` → shadcn `Badge`
- DaisyUI `collapse` / accordion sections → shadcn approach (state-toggled sections with `ChevronDown`/`ChevronUp`)
- DaisyUI `tooltip` → shadcn `Tooltip`
- Keep all TON/crypto logic exactly as-is (keypair generation, jetton transfers, wallet resolution)
- Keep all API calls exactly as-is (registerRaceContract, getRaceAiModels, etc.)
- Keep localStorage persistence logic exactly as-is
- Use `useAuth()` from shared lib for JWT token

The full component will be ~1200-1400 lines. Preserve all v1 functionality including:
- Agent name + keypair generation
- AI model selection by provider
- Strategy prompt editor with templates and AI generation
- Trading pair selection (multi-token)
- Wallet funding (TON + jetton transfers)
- Form validation and persistence

- [ ] **Step 1: Create `src/v2/components/pages/DeployPage.tsx`**

Read full v1 first, then rewrite with shadcn/ui components as described above.

- [ ] **Step 2: Wire into router**

```tsx
import { DeployPage } from './components/pages/DeployPage';
// ...
{ path: 'trader/deploy', element: <DeployPage /> },
```

- [ ] **Step 3: Verify and commit**

Test at `/v2/trader/deploy`. Verify keypair generation, model selection, prompt editing, and form submission flow.

```bash
git add src/v2/components/pages/DeployPage.tsx src/v2/App.tsx
git commit -m "feat(v2): add DeployPage with shadcn/ui form components"
```

---

### Task 9: ContractDetailPage

**Files:**
- Create: `src/v2/components/pages/ContractDetailPage.tsx`
- Modify: `src/v2/App.tsx`

Rewrites `src/components/ContractDetailPanel.tsx` (1456 lines) + `src/components/OrdersPanel.tsx` (321 lines). This is the agent dashboard showing live chart, orders, balances, and controls.

The implementation agent should read the full v1 files first. Key substitutions:
- DaisyUI tabs → shadcn `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent`
- DaisyUI `table` → shadcn `Table`
- DaisyUI `card` → shadcn `Card`
- DaisyUI `btn` → shadcn `Button`
- DaisyUI `badge` → shadcn `Badge`
- DaisyUI `modal` → shadcn `Dialog`
- DaisyUI `tooltip` → shadcn `Tooltip`
- Keep `recharts` AreaChart for P&L exactly as-is
- Keep `lightweight-charts` candlestick chart integration exactly as-is
- Keep all API calls, balance fetching, order management, withdrawal logic exactly as-is
- Keep TonConnect wallet interactions exactly as-is

The component needs to:
1. Fetch contract detail by ID from URL params
2. Load from `src/lib/api.ts` (getRaceContractDetail, etc.)
3. Render tabs: Overview (balances, P&L chart, stats), Orders (table), Controls (pause/delete/fund)

The full component will be ~1200-1400 lines.

- [ ] **Step 1: Create `src/v2/components/pages/ContractDetailPage.tsx`**

Read full v1 `ContractDetailPanel.tsx` and `OrdersPanel.tsx` first, then rewrite with shadcn/ui.

- [ ] **Step 2: Wire into router**

```tsx
import { ContractDetailPage } from './components/pages/ContractDetailPage';
// ...
{ path: 'trader/:id', element: <ContractDetailPage /> },
```

- [ ] **Step 3: Verify and commit**

Test at `/v2/trader/{contractId}` with a real contract ID from the leaderboard. Verify chart loads, orders display, action buttons work.

```bash
git add src/v2/components/pages/ContractDetailPage.tsx src/v2/App.tsx
git commit -m "feat(v2): add ContractDetailPage with tabs, charts, and order management"
```

---

### Task 10: Final Integration + Verification

**Files:**
- Modify: `src/v2/App.tsx` (final router cleanup)

- [ ] **Step 1: Verify all routes work end-to-end**

Open each route and verify:
- `/v2/` — HomePage with stats, agents, tokens
- `/v2/leaderboard` — Tabs + tables
- `/v2/stats` — Pair selector + order book
- `/v2/agent-hub` — Token list → detail drill-down
- `/v2/trader/deploy` — Full deploy form
- `/v2/trader/:id` — Contract dashboard

- [ ] **Step 2: Verify v1 is untouched**

Open `http://localhost:5173/` — v1 should work exactly as before with no visual changes.

- [ ] **Step 3: Verify production build**

```bash
npm run build
```

Check that build succeeds with both entry points. Verify `dist/` contains both `index.html` and `v2/index.html`.

- [ ] **Step 4: Verify mobile responsiveness**

Test at 375px viewport width on each v2 page:
- Navbar collapses to hamburger menu
- Tables scroll horizontally
- Cards stack vertically
- No horizontal overflow

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(v2): complete initial v2 shadcn/ui frontend rewrite with 6 core pages"
```
