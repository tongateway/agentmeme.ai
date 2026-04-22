# Connect Telegram Bot — Design

**Date:** 2026-04-22
**Status:** Approved (brainstorming phase complete)
**Scope:** Frontend only (backend endpoint assumed to exist)

## Goal

Let a deployed agent's owner connect a dedicated Telegram bot so the backend can send them trading notifications. Entry point is a new button in the Quick Actions card on the agent detail page (`/trader/:id`).

## User flow

1. User clicks "Connect Telegram" in the Quick Actions card.
2. Frontend calls `POST /api/contracts/:id/telegram-bot`.
3. Backend returns `{ deeplink, bot_username, status, connected }`.
4. Frontend opens `deeplink` in a new tab and shows a dialog with instructions.
5. User creates the bot in Telegram (via BotFather deeplink), then sends `/start` to the new bot.
6. Backend receives the webhook, stores `chat_id`, and marks the contract's telegram state as connected.
7. When the dialog closes (or the tab regains focus), frontend re-fetches the contract detail to pick up the connected state.
8. Button label switches to `@bot_username` (clickable — opens `https://t.me/<bot_username>`).

## Architecture

Three layers, all in the existing V2 frontend:

### 1. API client (`src/lib/api.ts`)

Add three optional fields to `ContractDetail` and extend `normalizeContractDetail` to read them:

```ts
telegram_bot_username?: string | null;
telegram_bot_status?: string | null;
telegram_bot_connected?: boolean;
```

Add one function:

```ts
export type TelegramBotResponse = {
  deeplink: string;
  bot_username: string;
  status: string;
  connected: boolean;
};

export async function createOrGetTelegramBot(
  cfg: PublicApiConfig,
  contractId: string,
): Promise<TelegramBotResponse>;
```

Implementation follows the existing pattern: `fetch(raceUrl(cfg, '/api/contracts/:id/telegram-bot'), { method: 'POST', headers: publicPostHeaders(cfg) })` → `jsonOrThrow`.

### 2. Quick Actions button (inside `ContractDetailPage.tsx`)

Added to the existing Quick Actions card, alongside Close orders / Withdraw all / Revoke access.

Visual states derived from `detail.telegram_bot_connected` and local pending state:

- **Not connected** — outline button, label "Connect Telegram", `Send` icon.
- **Pending (POST succeeded, not yet confirmed this session)** — button shows `Loader2` spinning icon + "Waiting for /start…". Click reopens the dialog.
- **Connected** — green styling (`text-green-500 border-green-500/30`), label `@<bot_username>`, `ExternalLink` icon. Click opens `https://t.me/<bot_username>` in a new tab.

### 3. Dialog (inline in `ContractDetailPage.tsx`, using existing `Dialog` primitive)

- Title: "Connect Telegram Notifications"
- Three numbered steps explaining Open link → Create bot → Send `/start`
- Primary button: "Open Telegram" → `window.open(deeplink, '_blank', 'noopener,noreferrer')`
- Shows `@<bot_username>` when available (post-POST)
- Footer "Close" button

Dialog is rendered only when an in-progress flow exists. On close, fire a detail re-fetch.

## Data flow

```
[Button click — not connected]
        |
        v
[POST /api/contracts/:id/telegram-bot]
        |
        +---- error ----> inline red text in dialog, user retries
        |
        v
[store { deeplink, bot_username } in local state]
        |
        v
[window.open(deeplink, '_blank')]
        |
        v
[open Dialog]
        |
        v
[User completes flow in Telegram (async, off-page)]
        |
        v
[Dialog close OR window focus]
        |
        v
[getRaceContractDetail(authedCfg, id)]
        |
        v
[setDetail(updated) — if telegram_bot_connected is true, button flips to green connected state]
```

## State on the page

Added to the existing `ContractDetailPage` component:

```ts
const [tgDialogOpen, setTgDialogOpen] = useState(false);
const [tgBusy, setTgBusy] = useState(false);
const [tgError, setTgError] = useState<string | null>(null);
const [tgResponse, setTgResponse] = useState<TelegramBotResponse | null>(null);
```

Re-fetch trigger: a `useEffect` that listens for `window.focus` while the dialog is open, plus an explicit re-fetch in the dialog's `onOpenChange(false)` handler. The re-fetch calls `getRaceContractDetail(authedCfg, id)` and updates `detail`. Existing page state already drives the Quick Actions button via `detail`, so the button transitions automatically.

## Error handling

- POST failure: show `tgError` as inline red text inside the dialog; keep button in not-connected state. User can retry via the same button.
- GET detail failure on refresh: silently swallow (the existing page-load error path handles hard failures).
- Missing backend fields: treat `telegram_bot_connected` as falsy when absent — button stays in "Connect Telegram" state. Safe default.

## Security

- Deeplink comes from the backend and opens via `window.open(url, '_blank', 'noopener,noreferrer')` to prevent the new tab from accessing `window.opener`.
- The same `noopener,noreferrer` applies to the connected-state click that opens `https://t.me/<bot_username>`.
- Endpoint is owner-gated server-side via JWT (matches pattern of other contract-scoped endpoints like `/prompt`, `/close-all-orders`).

## Testing

Manual only — this is UI glue around a single API call and an external flow. Verify:

1. Not-connected state renders when `telegram_bot_connected` is absent/false.
2. Clicking the button calls POST, opens a new tab with the deeplink, and opens the dialog.
3. POST failure shows inline error in dialog.
4. Dialog close triggers detail re-fetch.
5. Window focus (simulate tab switch back) triggers detail re-fetch while dialog is open.
6. When backend reports `telegram_bot_connected: true`, button switches to `@botname` green state.
7. Clicking the connected-state button opens `https://t.me/<botname>` in a new tab.

No automated tests — matches the existing approach for `ContractDetailPage` actions (Withdraw, Close orders, Revoke).

## Out of scope

- Disconnect endpoint (not yet defined on backend).
- Notifications settings UI (e.g., toggles for which events trigger messages).
- Per-user bot-management outside of a single contract.
- Backend changes (the endpoint and `ContractDetail` fields are assumed to exist).

## Files touched

- `src/lib/api.ts` — add type fields, normalizer update, `createOrGetTelegramBot` function.
- `src/v2/components/pages/ContractDetailPage.tsx` — new button in Quick Actions, dialog, focus/close re-fetch wiring.
