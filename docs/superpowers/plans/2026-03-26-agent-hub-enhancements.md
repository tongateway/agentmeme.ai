# Agent Hub Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Signal Strength, Trending Tokens, Agent of the Day/Week, and Prediction Market features to the Agent Hub page.

**Architecture:** Frontend-computed features using existing API data. Three new components (TrendingTokens, AgentSpotlight, PredictionMarket) added to the existing AgentHubPage and TokenOpinionPage. One new API client function for the prediction accuracy endpoint. Signal strength computed inline in AgentHubPage.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, DaisyUI v5, lucide-react icons, Vite

**Spec:** `docs/superpowers/specs/2026-03-26-agent-hub-enhancements-design.md`

**Note:** This project has no test infrastructure (no vitest/jest). Verification is done via `npm run build` (TypeScript type-check + Vite build) and manual browser testing.

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/components/TrendingTokens.tsx` | Horizontal pill row showing tokens with above-median activity |
| Create | `src/components/AgentSpotlight.tsx` | Agent of the Day/Week spotlight card with toggle |
| Create | `src/components/PredictionMarket.tsx` | Implied probability + historical accuracy display |
| Modify | `src/lib/api.ts` | Add `TokenPredictionAccuracy` type + `getTokenPredictionAccuracy()` function |
| Modify | `src/components/AgentHubPage.tsx` | Add dashboard strip (spotlight + trending), signal strength column, fetch leaderboard |
| Modify | `src/components/TokenOpinionPage.tsx` | Add PredictionMarket section to sidebar |

---

### Task 1: Add API type and client function for prediction accuracy

**Files:**
- Modify: `src/lib/api.ts` (append after line ~1506)

- [ ] **Step 1: Add the `TokenPredictionAccuracy` type and `getTokenPredictionAccuracy` function**

Add after the existing `getTokenOpinionDetail` function (around line 1506):

```typescript
export type TokenPredictionAccuracy = {
  token_symbol: string;
  total_predictions: number;
  correct_predictions: number;
  accuracy_pct: number;
  streak: number;
  last_evaluated: string;
};

export async function getTokenPredictionAccuracy(
  cfg: PublicApiConfig,
  symbol: string,
): Promise<TokenPredictionAccuracy> {
  const res = await fetch(
    raceUrl(cfg, `/api/token-opinions/${encodeURIComponent(symbol)}/accuracy`),
    { method: 'GET', headers: publicGetHeaders(cfg) },
  );
  return jsonOrThrow(res);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add TokenPredictionAccuracy type and API client function"
```

---

### Task 2: Create TrendingTokens component

**Files:**
- Create: `src/components/TrendingTokens.tsx`

- [ ] **Step 1: Create the TrendingTokens component**

Create `src/components/TrendingTokens.tsx`:

```tsx
import { type TokenOpinionSummary } from '@/lib/api';
import { TrendingUp } from 'lucide-react';

type TrendingTokensProps = {
  tokens: TokenOpinionSummary[];
  onSelectToken: (symbol: string) => void;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function TrendingTokens({ tokens, onSelectToken }: TrendingTokensProps) {
  const trades = tokens.map((t) => t.total_trades_24h);
  const med = median(trades);
  const threshold = Math.max(med * 2, 10);

  const trending = tokens
    .filter((t) => t.total_trades_24h > threshold)
    .map((t) => ({ ...t, ratio: med > 0 ? t.total_trades_24h / med : 0 }))
    .sort((a, b) => b.ratio - a.ratio);

  if (trending.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
      <TrendingUp className="h-3.5 w-3.5 opacity-40 shrink-0" />
      <span className="text-[10px] uppercase tracking-wider opacity-40 shrink-0">Trending</span>
      {trending.map((t) => {
        const color = t.ratio > 3 ? 'badge-success' : 'badge-warning';
        return (
          <button
            key={t.token_symbol}
            type="button"
            className={`badge badge-sm ${color} cursor-pointer shrink-0`}
            onClick={() => onSelectToken(t.token_symbol)}
          >
            {t.token_symbol} {t.ratio.toFixed(1)}x
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrendingTokens.tsx
git commit -m "feat: add TrendingTokens component"
```

---

### Task 3: Create AgentSpotlight component

**Files:**
- Create: `src/components/AgentSpotlight.tsx`

- [ ] **Step 1: Create the AgentSpotlight component**

Create `src/components/AgentSpotlight.tsx`:

```tsx
import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { type LeaderboardEntry } from '@/lib/api';

type AgentSpotlightProps = {
  leaderboard: LeaderboardEntry[];
};

function fmtAddr(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export function AgentSpotlight({ leaderboard }: AgentSpotlightProps) {
  const [mode, setMode] = useState<'day' | 'week'>('day');

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const eligible = mode === 'week'
    ? leaderboard.filter((e) => new Date(e.created_at).getTime() < sevenDaysAgo)
    : leaderboard;

  const sorted = [...eligible].sort(
    (a, b) => (b.profit_pct ?? -Infinity) - (a.profit_pct ?? -Infinity),
  );
  const top = sorted[0];

  if (!top) return null;

  const profitPct = top.profit_pct ?? 0;
  const profitColor = profitPct >= 0 ? 'text-success' : 'text-error';

  return (
    <div className="card bg-base-200 shadow-sm border border-warning/30 shrink-0">
      <div className="card-body p-3 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-warning" />
            <span className="text-[10px] uppercase tracking-wider text-warning font-bold">
              Agent of the {mode === 'day' ? 'Day' : 'Week'}
            </span>
          </div>
          <div className="flex gap-0.5">
            <button
              type="button"
              className={`btn btn-xs ${mode === 'day' ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setMode('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={`btn btn-xs ${mode === 'week' ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setMode('week')}
            >
              Week
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="mono text-sm font-bold truncate max-w-[12rem]">
            {top.name || fmtAddr(top.address)}
          </span>
          <div className="flex items-center gap-2">
            <span className="badge badge-xs badge-ghost">{top.ai_model}</span>
            <span className={`mono text-xs font-bold tabular-nums ${profitColor}`}>
              {profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/AgentSpotlight.tsx
git commit -m "feat: add AgentSpotlight component for Agent of the Day/Week"
```

---

### Task 4: Create PredictionMarket component

**Files:**
- Create: `src/components/PredictionMarket.tsx`

- [ ] **Step 1: Create the PredictionMarket component**

Create `src/components/PredictionMarket.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  getTokenPredictionAccuracy,
  type TokenOpinionSummary,
  type TokenPredictionAccuracy,
  type PublicApiConfig,
} from '@/lib/api';
import { BarChart3 } from 'lucide-react';

type PredictionMarketProps = {
  raceCfg: PublicApiConfig;
  stats: TokenOpinionSummary;
};

export function PredictionMarket({ raceCfg, stats }: PredictionMarketProps) {
  const [accuracy, setAccuracy] = useState<TokenPredictionAccuracy | null>(null);

  const loadAccuracy = useCallback(async () => {
    try {
      const data = await getTokenPredictionAccuracy(raceCfg, stats.token_symbol);
      setAccuracy(data);
    } catch {
      // Endpoint not available yet — hide accuracy section
    }
  }, [raceCfg, stats.token_symbol]);

  useEffect(() => {
    void loadAccuracy();
  }, [loadAccuracy]);

  const consensusUpper = (stats.consensus ?? '').toUpperCase();
  const probability = Math.max(stats.bullish_pct, stats.bearish_pct);
  const direction = consensusUpper === 'BULLISH' ? 'UP' : consensusUpper === 'BEARISH' ? 'DOWN' : null;
  const conviction = (probability / 100) * stats.avg_confidence * 100;

  let accuracyColor = 'opacity-60';
  if (accuracy) {
    if (accuracy.accuracy_pct > 60) accuracyColor = 'text-success';
    else if (accuracy.accuracy_pct >= 40) accuracyColor = 'text-warning';
    else accuracyColor = 'text-error';
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 opacity-40" />
        <span className="text-[10px] uppercase tracking-wider opacity-40">Prediction Market</span>
      </div>

      {/* Implied Probability */}
      {direction ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs leading-relaxed">
            Agents imply{' '}
            <span className="font-bold">{probability.toFixed(0)}% probability</span>{' '}
            {stats.token_symbol} goes{' '}
            <span className={`font-bold ${direction === 'UP' ? 'text-success' : 'text-error'}`}>
              {direction}
            </span>{' '}
            in 24h
          </p>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-base-300">
            <div
              className={direction === 'UP' ? 'bg-success' : 'bg-error'}
              style={{ width: `${probability}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] opacity-40">
            <span>Conviction: {conviction.toFixed(0)}%</span>
            <span>{probability.toFixed(0)}%</span>
          </div>
        </div>
      ) : (
        <p className="text-xs opacity-50">No clear directional consensus</p>
      )}

      {/* Historical Accuracy */}
      {accuracy && accuracy.total_predictions > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] uppercase tracking-wider opacity-40">Accuracy</span>
            <span className={`mono text-sm font-bold tabular-nums ${accuracyColor}`}>
              {accuracy.accuracy_pct.toFixed(0)}%
            </span>
          </div>
          <span className="text-[10px] opacity-40">
            {accuracy.correct_predictions} of {accuracy.total_predictions} calls correct
          </span>
          {accuracy.streak > 1 && (
            <span className="text-[10px] opacity-40">
              On a {accuracy.streak}-call streak
            </span>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/PredictionMarket.tsx
git commit -m "feat: add PredictionMarket component with implied probability and accuracy"
```

---

### Task 5: Add Signal Strength column and dashboard strip to AgentHubPage

**Files:**
- Modify: `src/components/AgentHubPage.tsx`

This is the largest task — it wires everything together on the main hub page.

- [ ] **Step 1: Update imports**

Replace the existing imports at the top of `AgentHubPage.tsx`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { getTokenOpinions, type TokenOpinionSummary, type PublicApiConfig } from '@/lib/api';
```

with:

```typescript
import { useCallback, useEffect, useState } from 'react';
import {
  getTokenOpinions,
  getRaceLeaderboard,
  type TokenOpinionSummary,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';
import { TrendingTokens } from '@/components/TrendingTokens';
import { AgentSpotlight } from '@/components/AgentSpotlight';
```

- [ ] **Step 2: Add leaderboard state and fetch**

In the `AgentHubPage` component, after the existing state declarations (`tokens`, `loading`, `error`), add:

```typescript
const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
```

Update the `load` callback to also fetch leaderboard data. Replace the existing `load` callback:

```typescript
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTokenOpinions(raceCfg);
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => b.total_trades_24h - a.total_trades_24h,
      );
      setTokens(sorted);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);
```

with:

```typescript
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, lb] = await Promise.all([
        getTokenOpinions(raceCfg),
        getRaceLeaderboard(raceCfg).catch(() => [] as LeaderboardEntry[]),
      ]);
      const sorted = (Array.isArray(data) ? data : []).sort(
        (a, b) => b.total_trades_24h - a.total_trades_24h,
      );
      setTokens(sorted);
      setLeaderboard(lb);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [raceCfg]);
```

- [ ] **Step 3: Add signal strength computation**

Add this helper function inside `AgentHubPage.tsx`, before the component (after the `fmtPrice` function):

```typescript
function computeSignalStrength(
  token: TokenOpinionSummary,
  maxAgents: number,
  maxTrades: number,
): number {
  const consensusWeight = Math.max(token.bullish_pct, token.bearish_pct) / 100;
  const agentWeight = maxAgents > 0 ? token.active_agents / maxAgents : 0;
  const volumeWeight = maxTrades > 0 ? token.total_trades_24h / maxTrades : 0;
  return (
    consensusWeight * 0.4 +
    token.avg_confidence * 0.3 +
    agentWeight * 0.15 +
    volumeWeight * 0.15
  ) * 10;
}

function signalColor(signal: number): string {
  if (signal >= 7) return 'text-success';
  if (signal >= 4) return 'text-warning';
  return 'opacity-40';
}
```

- [ ] **Step 4: Add dashboard strip and signal column to the JSX**

In the return JSX, replace the content inside the card-body (the section after `<h2 className="card-title text-base">Agent Hub</h2>`).

Find this block:

```tsx
          <h2 className="card-title text-base">Agent Hub</h2>

          {error ? (
```

Replace with:

```tsx
          <h2 className="card-title text-base">Agent Hub</h2>

          {/* Dashboard strip */}
          {!loading && tokens.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3">
              <AgentSpotlight leaderboard={leaderboard} />
              <div className="flex-1 min-w-0 flex items-center">
                <TrendingTokens tokens={tokens} onSelectToken={onSelectToken} />
              </div>
            </div>
          )}

          {error ? (
```

Now add the Signal column header. Find this line in the `<thead>`:

```tsx
                    <th className="text-right">Trades 24h</th>
```

Add a new column before it:

```tsx
                    <th className="text-right hidden sm:table-cell">Signal</th>
                    <th className="text-right">Trades 24h</th>
```

- [ ] **Step 5: Add signal strength cell to table rows**

Compute `maxAgents` and `maxTrades` once outside the loop. Add these two lines right before the `<tbody>` opening tag inside the JSX (or in the component body before the return). The simplest approach is to add them inside the component body, after the `load` effect. Add:

```typescript
  const maxAgents = Math.max(0, ...tokens.map((x) => x.active_agents));
  const maxTrades = Math.max(0, ...tokens.map((x) => x.total_trades_24h));
```

Then inside the `tokens.map` callback, add the signal computation. Find:

```tsx
                  {tokens.map((t, i) => {
                    const change24h = t.price_change_24h ?? 0;
```

Replace with:

```tsx
                  {tokens.map((t, i) => {
                    const signal = computeSignalStrength(t, maxAgents, maxTrades);
                    const change24h = t.price_change_24h ?? 0;
```

Then find the agents cell and trades cell:

```tsx
                        <td className="text-right align-middle hidden sm:table-cell">
                          <span className="mono text-xs tabular-nums opacity-60">{t.active_agents}</span>
                        </td>
                        <td className="text-right align-middle">
                          <span className="mono text-xs tabular-nums">{t.total_trades_24h}</span>
                        </td>
```

Add the signal cell between them:

```tsx
                        <td className="text-right align-middle hidden sm:table-cell">
                          <span className="mono text-xs tabular-nums opacity-60">{t.active_agents}</span>
                        </td>
                        <td className="text-right align-middle hidden sm:table-cell">
                          <span className={`mono text-xs tabular-nums font-bold ${signalColor(signal)}`}>
                            {signal.toFixed(1)}
                          </span>
                        </td>
                        <td className="text-right align-middle">
                          <span className="mono text-xs tabular-nums">{t.total_trades_24h}</span>
                        </td>
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/AgentHubPage.tsx
git commit -m "feat: add dashboard strip and signal strength column to Agent Hub"
```

---

### Task 6: Add PredictionMarket to TokenOpinionPage sidebar

**Files:**
- Modify: `src/components/TokenOpinionPage.tsx`

- [ ] **Step 1: Update imports**

In `TokenOpinionPage.tsx`, update the imports. Find:

```typescript
import {
  getTokenOpinionDetail,
  type AgentOpinion,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';
```

Replace with:

```typescript
import {
  getTokenOpinionDetail,
  type AgentOpinion,
  type TokenOpinionSummary,
  type PublicApiConfig,
} from '@/lib/api';
import { PredictionMarket } from '@/components/PredictionMarket';
```

- [ ] **Step 2: Add PredictionMarket to the sidebar**

In the sidebar JSX, add the PredictionMarket section. Find the Back to Hub button section:

```tsx
            <button className="btn btn-sm btn-ghost gap-1 mt-2 self-start" type="button" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back to Hub
            </button>
```

Add the PredictionMarket component before the button:

```tsx
            {stats && (
              <div className="border-t border-base-content/10 pt-3 mt-1">
                <PredictionMarket raceCfg={raceCfg} stats={stats} />
              </div>
            )}

            <button className="btn btn-sm btn-ghost gap-1 mt-2 self-start" type="button" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" /> Back to Hub
            </button>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TokenOpinionPage.tsx
git commit -m "feat: add prediction market section to token detail sidebar"
```

---

### Task 7: Final build verification and manual testing

- [ ] **Step 1: Full build check**

Run: `npm run build`
Expected: Build succeeds with zero errors and zero warnings.

- [ ] **Step 2: Run dev server and verify visually**

Run: `npm run dev`

Check the following in the browser:

1. **Agent Hub page** — verify dashboard strip shows above the token table:
   - Agent of the Day spotlight card with Day/Week toggle
   - Trending tokens pills (if any tokens meet the 2x median threshold)
   - Signal strength column in the table with colored numbers
2. **Token detail page** (click any token) — verify sidebar shows:
   - Prediction Market section below the bullish/bearish bar
   - Implied probability text and bar
   - Historical accuracy (hidden gracefully if endpoint not deployed yet)

- [ ] **Step 3: Final commit if any fixes needed**

If visual testing reveals issues, fix and commit:
```bash
git add -A
git commit -m "fix: polish Agent Hub enhancement components"
```
