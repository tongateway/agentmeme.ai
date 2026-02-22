import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Home, Rocket, Copy, Check, Trophy, Skull, Zap, Loader2 } from 'lucide-react';
import { getAiResponse, getRaceContractDetail, postReaction, type PublicApiConfig } from '@/lib/api';

/* ---------- data ---------- */

export type ShareData = {
  action: string;
  reason: string;
  balanceUsd: number | null;
  model: string;
  agentName: string;
  date: string;
  profitPct: number | null;
  bullishCount?: number;
  bearishCount?: number;
  /** AI response ID — used for voting on share page */
  responseId?: string;
  /** Order details — only present for create_order actions */
  fromToken?: string;
  toToken?: string;
  amountTon?: number; // amount in TON (human-readable)
  amountUsd?: number; // amount in USD
};

const TITLES_PROFIT = [
  'Money Printer Goes BRRR',
  'Absolute Chad Move',
  'Galaxy Brain Trade',
  'To The Moon',
  'Lambo Incoming',
  'Big Brain Energy',
  'We Feast Tonight',
];

const TITLES_LOSS = [
  'Pain. Suffering. Loss.',
  'RIP My Portfolio',
  'This Is Fine',
  'Rekt Beyond Repair',
  'GG No Re',
  'Why Do I Even Try',
  'Down Bad Fr Fr',
];

const TITLES_HOLD = [
  'Diamond Hands Activated',
  'Patience Is A Virtue',
  'HODL Gang',
  'Waiting For Tendies',
  'Zen Mode: Engaged',
];

const TITLES_TRADE = [
  'AI Made A Move',
  'The Bot Has Spoken',
  'Trade Executed',
  'Ape Mode: ON',
  'Sending It',
];

function pickTitle(action: string, profitPct: number | null): string {
  if (action === 'hold') {
    return TITLES_HOLD[Math.floor(Math.random() * TITLES_HOLD.length)];
  }
  if (profitPct !== null && profitPct >= 0) {
    return TITLES_PROFIT[Math.floor(Math.random() * TITLES_PROFIT.length)];
  }
  if (profitPct !== null && profitPct < 0) {
    return TITLES_LOSS[Math.floor(Math.random() * TITLES_LOSS.length)];
  }
  return TITLES_TRADE[Math.floor(Math.random() * TITLES_TRADE.length)];
}

/* ---------- encode / decode ---------- */

export function encodeShareData(d: ShareData): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(d))));
}

export function decodeShareData(encoded: string): ShareData | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

/** Build a short share URL using just the response ID. */
export function buildShareUrl(responseId: string): string {
  return `https://agentmeme.ai/#share/r/${responseId}`;
}

/* ---------- component ---------- */

type ShareCardPageProps = {
  data: ShareData;
  raceCfg: PublicApiConfig;
};

export function ShareCardPage({ data, raceCfg }: ShareCardPageProps) {
  const isProfit = data.profitPct !== null && data.profitPct >= 0;
  const isLoss = data.profitPct !== null && data.profitPct < 0;
  const title = useMemo(() => pickTitle(data.action, data.profitPct), [data.action, data.profitPct]);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [bullish, setBullish] = useState(data.bullishCount ?? 0);
  const [bearish, setBearish] = useState(data.bearishCount ?? 0);
  const [voted, setVoted] = useState<'bullish' | 'bearish' | null>(null);

  // Fetch live bullish/bearish counts on mount
  useEffect(() => {
    if (!data.responseId) return;
    getAiResponse(raceCfg, data.responseId)
      .then((r) => {
        setBullish(r.bullish_count);
        setBearish(r.bearish_count);
      })
      .catch(() => {/* keep encoded counts as fallback */});
  }, [data.responseId, raceCfg]);

  const shareLink = window.location.href;

  const copyLink = useCallback(() => {
    void navigator.clipboard.writeText(shareLink);
    setCopied(true);
    inputRef.current?.select();
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-gradient-to-br from-base-300 via-base-100 to-base-300">
      {/* Toast notification */}
      {copied && (
        <div className="toast toast-top toast-center z-50">
          <div className="alert alert-success shadow-lg">
            <Check className="h-4 w-4" />
            <span className="text-sm font-medium">Link copied to clipboard!</span>
          </div>
        </div>
      )}
      {/* Card */}
      <div className="card w-full max-w-md bg-base-200 shadow-2xl border border-base-300 overflow-hidden">
        {/* Banner */}
        <div
          className={`px-6 py-8 text-center ${
            isProfit
              ? 'bg-gradient-to-r from-success/20 via-success/10 to-success/20'
              : isLoss
                ? 'bg-gradient-to-r from-error/20 via-error/10 to-error/20'
                : 'bg-gradient-to-r from-info/20 via-info/10 to-info/20'
          }`}
        >
          <div className="text-4xl mb-2">
            {isProfit ? (
              <Trophy className="inline h-10 w-10 text-success" />
            ) : isLoss ? (
              <Skull className="inline h-10 w-10 text-error" />
            ) : (
              <Zap className="inline h-10 w-10 text-info" />
            )}
          </div>
          <h1 className="text-2xl font-black tracking-tight leading-tight">{title}</h1>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span
              className={`badge badge-lg font-bold ${
                data.action === 'hold'
                  ? 'badge-info'
                  : data.action === 'create_order'
                    ? 'badge-warning'
                    : 'badge-ghost'
              }`}
            >
              {data.action.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>

        <div className="card-body gap-4">
          {/* Order direction — only for create_order */}
          {data.action === 'create_order' && data.fromToken && data.toToken && (
            <div className="flex flex-col items-center gap-2 py-2">
              <div className="flex items-center gap-3">
                <span className="text-lg font-black">{data.fromToken}</span>
                <span className="text-2xl">➜</span>
                <span className="text-lg font-black">{data.toToken}</span>
              </div>
              {data.amountTon != null && (
                <span className="badge badge-lg badge-warning font-bold mono">
                  {data.amountTon} {data.fromToken}
                  {data.amountUsd != null ? ` ($${data.amountUsd.toFixed(2)})` : ''}
                </span>
              )}
            </div>
          )}

          {/* Agent info */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex flex-col">
              <span className="opacity-50 text-xs">Agent</span>
              <span className="font-semibold">{data.agentName || 'Unnamed'}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="opacity-50 text-xs">Model</span>
              <span className="font-mono text-xs">{data.model || '\u2014'}</span>
            </div>
          </div>

          {/* P&L */}
          {data.profitPct !== null && (
            <div className="flex items-center justify-center gap-4 py-3">
              <div className="text-center">
                <div className="text-xs opacity-50 uppercase tracking-wider">P&L</div>
                <div className={`text-3xl font-black mono ${isProfit ? 'text-success' : 'text-error'}`}>
                  {isProfit ? '+' : ''}
                  {data.profitPct.toFixed(2)}%
                </div>
              </div>
              {data.balanceUsd !== null && (
                <div className="text-center">
                  <div className="text-xs opacity-50 uppercase tracking-wider">Balance</div>
                  <div className="text-2xl font-bold mono">${data.balanceUsd.toFixed(2)}</div>
                </div>
              )}
            </div>
          )}

          {/* Balance only (when no P&L) */}
          {data.profitPct === null && data.balanceUsd !== null && (
            <div className="flex items-center justify-center py-3">
              <div className="text-center">
                <div className="text-xs opacity-50 uppercase tracking-wider">Balance</div>
                <div className="text-2xl font-bold mono">${data.balanceUsd.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Reason */}
          <div className="bg-base-300 rounded-xl p-4">
            <div className="text-xs opacity-50 uppercase tracking-wider mb-1">AI Said</div>
            <p className="text-sm leading-relaxed italic">&ldquo;{data.reason}&rdquo;</p>
          </div>

          {/* Bullish / Bearish voting */}
          <div className="flex items-center justify-center gap-4 py-2">
            <button
              className={`btn btn-sm gap-2 ${voted === 'bullish' ? 'btn-success' : 'btn-outline'}`}
              disabled={voted !== null}
              onClick={async () => {
                if (!data.responseId) return;
                try {
                  const result = await postReaction(raceCfg, data.responseId, 'bullish');
                  setBullish(result.bullish_count);
                  setBearish(result.bearish_count);
                  setVoted('bullish');
                } catch { setVoted('bullish'); setBullish((c) => c + 1); }
              }}
            >
              <span className="text-xl">🐂</span>
              <span className="font-bold">{bullish}</span>
            </button>
            <button
              className={`btn btn-sm gap-2 ${voted === 'bearish' ? 'btn-error' : 'btn-outline'}`}
              disabled={voted !== null}
              onClick={async () => {
                if (!data.responseId) return;
                try {
                  const result = await postReaction(raceCfg, data.responseId, 'bearish');
                  setBullish(result.bullish_count);
                  setBearish(result.bearish_count);
                  setVoted('bearish');
                } catch { setVoted('bearish'); setBearish((c) => c + 1); }
              }}
            >
              <span className="text-xl">🐻</span>
              <span className="font-bold">{bearish}</span>
            </button>
          </div>

          {/* Date */}
          <div className="text-center text-xs opacity-40">
            {new Date(data.date).toLocaleString()} &middot; agentmeme.ai
          </div>

          {/* Buttons */}
          <div className="flex gap-2 mt-1">
            <a href="https://agentmeme.ai/" className="btn btn-ghost btn-sm flex-1 gap-1.5">
              <Home className="h-3.5 w-3.5" />
              Home
            </a>
            <a href="https://agentmeme.ai/#trader/deploy" className="btn btn-success btn-sm flex-1 gap-1.5">
              <Rocket className="h-3.5 w-3.5" />
              Deploy Your Agent
            </a>
          </div>

          {/* Share link input */}
          <div className="flex gap-1 mt-1">
            <input
              ref={inputRef}
              className="input input-sm input-bordered flex-1 font-mono text-xs"
              value={shareLink}
              readOnly
              onClick={() => {
                inputRef.current?.select();
                copyLink();
              }}
            />
            <button className="btn btn-sm btn-square btn-outline" onClick={copyLink} title="Copy link">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-base-300 text-center py-2 px-4">
          <span className="text-xs opacity-40">agentmeme.ai &middot; AI Trader Race on TON</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- loader for short links (#share/r/{responseId}) ---------- */

type ShareCardLoaderProps = {
  responseId: string;
  raceCfg: PublicApiConfig;
};

/**
 * Fetches share card data from the API using just the response ID,
 * then renders ShareCardPage once loaded.
 */
export function ShareCardLoader({ responseId, raceCfg }: ShareCardLoaderProps) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const aiResp = await getAiResponse(raceCfg, responseId);
        const pp = aiResp.parsed_params as Record<string, unknown> | null;
        const reason = (pp?.reasoning as string) || (pp?.short_reason as string) || aiResp.action;
        const fromToken = pp?.from_token as string | undefined;
        const toToken = pp?.to_token as string | undefined;
        const amountRaw = pp?.amount as string | number | undefined;
        const amountTon = amountRaw != null ? Number(amountRaw) / 1e9 : undefined;

        // Fetch contract details for model & agent name
        let model = '';
        let agentName = '';
        try {
          const contract = await getRaceContractDetail(raceCfg, aiResp.smart_contract_id);
          model = contract.ai_model || '';
          agentName = contract.name || '';
        } catch {
          // contract fetch is best-effort
        }

        if (cancelled) return;
        setData({
          action: aiResp.action,
          reason,
          balanceUsd: aiResp.balance_usd,
          model,
          agentName,
          date: aiResp.created_at,
          profitPct: null,
          bullishCount: aiResp.bullish_count,
          bearishCount: aiResp.bearish_count,
          responseId,
          ...(aiResp.action === 'create_order' && fromToken && toToken
            ? { fromToken, toToken, amountTon }
            : {}),
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [responseId, raceCfg]);

  if (error) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-gradient-to-br from-base-300 via-base-100 to-base-300">
        <div className="card w-full max-w-md bg-base-200 shadow-2xl border border-base-300 p-8 text-center">
          <p className="text-error font-medium mb-4">Failed to load share card</p>
          <p className="text-sm opacity-60 mb-4">{error}</p>
          <a href="https://agentmeme.ai/" className="btn btn-ghost btn-sm">
            <Home className="h-3.5 w-3.5 mr-1" /> Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-gradient-to-br from-base-300 via-base-100 to-base-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin opacity-50" />
          <span className="text-sm opacity-50">Loading share card…</span>
        </div>
      </div>
    );
  }

  return <ShareCardPage data={data} raceCfg={raceCfg} />;
}
