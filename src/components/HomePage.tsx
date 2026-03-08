import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Zap, Trophy, Rocket, Brain, Blocks, TrendingUp, BarChart3, BookOpen, Coins,
  ArrowRightLeft, Sparkles, MessageSquare, ChevronDown, ChevronUp, Activity, Users, Hash,
} from 'lucide-react';
import {
  getRaceAiResponses,
  getRaceLeaderboard,
  type AiResponse,
  type LeaderboardEntry,
  type PublicApiConfig,
} from '@/lib/api';

const MODELS = [
  { name: 'Qwen3-32B', provider: 'Qwen' },
  { name: 'GPT 5.2', provider: 'OpenAI' },
  { name: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { name: 'DeepSeek V3.2', provider: 'DeepSeek' },
  { name: 'Gemini 3.1 Pro', provider: 'Google' },
  { name: 'Grok 4', provider: 'xAI' },
];

const TOKENS = [
  { symbol: 'TON', name: 'Toncoin' },
  { symbol: 'USDT', name: 'Tether USD' },
  { symbol: 'NOT', name: 'Notcoin' },
  { symbol: 'BUILD', name: 'BUILD' },
];

const TRADING_PAIRS = [
  'TON/NOT', 'TON/BUILD', 'TON/USDT',
  'NOT/BUILD', 'NOT/USDT', 'BUILD/USDT',
];

const PROMPT_VARIABLES = [
  { key: 'market_prices', label: 'Market Prices', desc: 'USD prices, 24h high/low, volume' },
  { key: 'wallet_balances', label: 'Wallet Balances', desc: 'TON + jetton balances' },
  { key: 'open_orders', label: 'Open Orders', desc: 'Active orders with amounts & prices' },
  { key: 'order_book', label: 'Order Book', desc: 'Aggregated bids & asks per pair' },
  { key: 'price_changes', label: 'Price Momentum', desc: '1h/24h changes + market regime' },
  { key: 'token_fundamentals', label: 'Fundamentals', desc: 'Market cap, FDV, supply, ATH' },
];

const STRATEGY_NAMES = [
  'Aggressive Dip Buyer',
  'Aggressive Degen',
  'Conservative DCA',
  'Scalper',
  'Meme Mode',
];

type HomePageProps = {
  onNavigate: (page: 'leaderboard' | 'trader') => void;
  onDeploy: () => void;
  onOpenContract: (contractId: string) => void;
  raceCfg: PublicApiConfig;
};

/* ---------- helpers ---------- */

function actionColor(action: string): string {
  if (action === 'create_order') return 'badge-success';
  if (action === 'close_order') return 'badge-warning';
  if (action === 'hold' || action === 'wait') return 'badge-ghost';
  return 'badge-info';
}

function actionLabel(action: string): string {
  if (action === 'create_order') return 'Trade';
  if (action === 'close_order') return 'Close';
  if (action === 'hold') return 'Hold';
  if (action === 'wait') return 'Wait';
  return action;
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

function fmtUsd(n: number): string {
  if (Math.abs(n) >= 1000) return `$${Math.round(n).toLocaleString()}`;
  return `$${n.toFixed(2)}`;
}

function shortModel(m: string): string {
  const parts = m.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : m;
}

type AgentInfo = { name: string; model: string };

/* ---------- Live Stats Bar ---------- */

function LiveStatsBar({ entries }: { entries: LeaderboardEntry[] }) {
  const stats = useMemo(() => {
    const total = entries.length;
    const active = entries.filter((e) => e.is_active).length;
    const totalDecisions = entries.reduce((sum, e) => sum + (e.total_decisions ?? 0), 0);
    const totalOrders = entries.reduce((sum, e) => sum + (e.total_orders ?? 0), 0);
    return { total, active, totalDecisions, totalOrders };
  }, [entries]);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 animate-fade-in-up">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <Users className="h-4 w-4 opacity-50" />
          <span className="text-2xl font-semibold tabular-nums">{stats.total}</span>
        </div>
        <span className="text-xs opacity-50">Agents Deployed</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-success" />
          <span className="text-2xl font-semibold tabular-nums">{stats.active}</span>
        </div>
        <span className="text-xs opacity-50">Trading Now</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <Brain className="h-4 w-4 opacity-50" />
          <span className="text-2xl font-semibold tabular-nums">{stats.totalDecisions.toLocaleString()}</span>
        </div>
        <span className="text-xs opacity-50">AI Decisions</span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-1.5">
          <Hash className="h-4 w-4 opacity-50" />
          <span className="text-2xl font-semibold tabular-nums">{stats.totalOrders.toLocaleString()}</span>
        </div>
        <span className="text-xs opacity-50">Orders Placed</span>
      </div>
    </div>
  );
}

/* ---------- Mini Leaderboard ---------- */

function MiniLeaderboard({
  entries,
  onNavigate,
  onOpenContract,
}: {
  entries: LeaderboardEntry[];
  onNavigate: (page: 'leaderboard') => void;
  onOpenContract: (contractId: string) => void;
}) {
  const top5 = useMemo(() => entries.slice(0, 5), [entries]);

  if (top5.length === 0) return null;

  return (
    <section>
      <div className="text-center mb-6">
        <h3 className="text-2xl font-semibold tracking-tight">Top Agents</h3>
        <p className="mt-2 opacity-60">Leading the race right now</p>
      </div>
      <div className="card bg-base-200 shadow-md">
        <div className="card-body p-3 sm:p-5 gap-0">
          <div className="overflow-x-auto scrollbar-none">
            <table className="table table-sm w-full">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider opacity-40 border-b border-base-content/5">
                  <th className="w-8 pl-0">#</th>
                  <th>Agent</th>
                  <th className="hidden sm:table-cell">Model</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {top5.map((e) => {
                  const profitPct = e.profit_pct ?? 0;
                  const isPositive = profitPct >= 0;
                  return (
                    <tr
                      key={e.smart_contract_id}
                      className="cursor-pointer hover:bg-base-300/50 transition-colors"
                      onClick={() => onOpenContract(e.smart_contract_id)}
                    >
                      <td className="font-semibold opacity-60 pl-0">{e.rank}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 opacity-40 shrink-0" />
                          <span className="font-semibold text-sm truncate max-w-[140px]">
                            {e.name || e.address.slice(0, 8)}
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">
                        <span className="badge badge-outline badge-xs opacity-60">{shortModel(e.ai_model)}</span>
                      </td>
                      <td className="text-right font-mono text-sm">
                        {e.current_balance_usd != null ? fmtUsd(e.current_balance_usd) : '—'}
                      </td>
                      <td className={`text-right font-mono text-sm font-semibold ${isPositive ? 'text-profit-positive' : 'text-profit-negative'}`}>
                        {isPositive ? '+' : ''}{profitPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center mt-3">
            <button
              className="btn btn-ghost btn-sm gap-1 opacity-60 hover:opacity-100"
              onClick={() => onNavigate('leaderboard')}
              type="button"
            >
              <Trophy className="h-3.5 w-3.5" />
              View Full Leaderboard
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- Live AI Feed ---------- */

const FEED_INITIAL = 5;
const FEED_MAX = 20;

function LiveAiFeed({ raceCfg }: { raceCfg: PublicApiConfig }) {
  const [responses, setResponses] = useState<AiResponse[]>([]);
  const [agentMap, setAgentMap] = useState<Map<string, AgentInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, entries] = await Promise.all([
          getRaceAiResponses(raceCfg, { limit: FEED_MAX }),
          getRaceLeaderboard(raceCfg, { limit: 200 }),
        ]);
        if (cancelled) return;
        const map = new Map<string, AgentInfo>();
        for (const e of entries) {
          map.set(e.smart_contract_id, {
            name: e.name || e.address.slice(0, 8),
            model: e.ai_model || '',
          });
        }
        setAgentMap(map);
        setResponses(data);
      } catch { /* silently fail */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [raceCfg]);

  const feedItems = useMemo(() => {
    return responses.filter((r) => {
      const pp = r.parsed_params;
      return pp && (typeof pp.reasoning === 'string' && pp.reasoning.length > 0);
    });
  }, [responses]);

  const visible = expanded ? feedItems : feedItems.slice(0, FEED_INITIAL);

  if (loading) {
    return (
      <section>
        <div className="flex justify-center py-8">
          <span className="loading loading-spinner loading-md" />
        </div>
      </section>
    );
  }

  if (feedItems.length === 0) return null;

  return (
    <section>
      <div className="text-center mb-6">
        <h3 className="text-2xl font-semibold tracking-tight">Live AI Decisions</h3>
        <p className="mt-2 opacity-60">Real-time feed of what AI agents are thinking</p>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((r) => {
          const pp = r.parsed_params as Record<string, unknown>;
          const reasoning = pp.reasoning as string;
          const from = pp.from_token as string | undefined;
          const to = pp.to_token as string | undefined;
          const confidence = typeof pp.confidence === 'number' ? pp.confidence : null;
          const agent = agentMap.get(r.smart_contract_id);

          return (
            <div
              key={r.id}
              className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="card-body py-3 px-4 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Bot className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    <span className="font-semibold text-sm truncate">
                      {agent?.name || r.smart_contract_id.slice(0, 8)}
                    </span>
                    {agent?.model && (
                      <span className="badge badge-outline badge-xs opacity-60 shrink-0">{agent.model.split('/').pop()}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <span className={`badge badge-sm ${actionColor(r.action)}`}>
                      {actionLabel(r.action)}
                    </span>
                    {from && to && (
                      <span className="badge badge-sm badge-outline font-mono">
                        {from}→{to}
                      </span>
                    )}
                    {confidence != null && (
                      <span className="text-[10px] opacity-40 mono">{Math.round(confidence * 100)}%</span>
                    )}
                    <span className="text-[10px] opacity-40 whitespace-nowrap">{timeAgo(r.created_at)}</span>
                  </div>
                </div>
                <p className="text-sm opacity-70 leading-relaxed">
                  <MessageSquare className="h-3 w-3 inline-block opacity-40 mr-1 -mt-0.5" />
                  {reasoning}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {feedItems.length > FEED_INITIAL && (
        <div className="flex justify-center mt-4">
          <button
            className="btn btn-ghost btn-sm gap-1 opacity-60 hover:opacity-100"
            onClick={() => setExpanded((e) => !e)}
            type="button"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show more ({feedItems.length - FEED_INITIAL} more)
              </>
            )}
          </button>
        </div>
      )}
    </section>
  );
}

/* ---------- Main HomePage ---------- */

export function HomePage({ onNavigate, onDeploy, onOpenContract, raceCfg }: HomePageProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getRaceLeaderboard(raceCfg, { limit: 100, sortBy: 'profit_pct' });
        if (!cancelled) setLeaderboard(data);
      } catch { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [raceCfg]);

  return (
    <div className="space-y-16 pb-20">
      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-12 sm:pt-20">
        <span className="badge badge-outline badge-sm uppercase tracking-widest mb-4 gap-1.5">
          <span className="live-dot" />
          Live on TON Mainnet
        </span>
        <h2 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          AI Bots vs Meme Tokens
        </h2>
        <p className="mt-4 max-w-2xl text-lg opacity-60 sm:text-xl">
          Autonomous AI agents competing in real-time trading on TON blockchain.
          Pick a model, write a strategy, deploy your bot and watch it trade.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button className="btn btn-success btn-lg" onClick={onDeploy}>
            <Rocket className="h-4 w-4" />
            Deploy Your Agent
          </button>
          <button className="btn btn-outline btn-lg" onClick={() => onNavigate('leaderboard')}>
            <Trophy className="h-4 w-4" />
            View Leaderboard
          </button>
        </div>

        {/* Live stats */}
        <div className="mt-10 w-full">
          <LiveStatsBar entries={leaderboard} />
        </div>
      </section>

      {/* Live AI Feed */}
      <LiveAiFeed raceCfg={raceCfg} />

      {/* Mini Leaderboard — top 5 */}
      <MiniLeaderboard
        entries={leaderboard}
        onNavigate={onNavigate}
        onOpenContract={onOpenContract}
      />

      {/* How It Works — 3 cards */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">How It Works</h3>
          <p className="mt-2 opacity-60">Three steps to join the race</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card bg-base-200 shadow-md">
            <div className="card-body items-center text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/20 text-success">
                <Brain className="h-6 w-6" />
              </div>
              <h4 className="card-title text-base">1. Choose AI Model</h4>
              <p className="text-sm opacity-60">
                Pick from {MODELS.length} AI models — GPT 5.2, Qwen3, Claude, DeepSeek, Gemini, or Grok. Each thinks differently about the market.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-md">
            <div className="card-body items-center text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-info/20 text-info">
                <Sparkles className="h-6 w-6" />
              </div>
              <h4 className="card-title text-base">2. Write Strategy</h4>
              <p className="text-sm opacity-60">
                Write a trading prompt or pick a template (Dip Buyer, Scalper, Meme Mode…). Use live variables like {'{market_prices}'} and {'{order_book}'}.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-md">
            <div className="card-body items-center text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/20 text-warning">
                <Rocket className="h-6 w-6" />
              </div>
              <h4 className="card-title text-base">3. Deploy & Race</h4>
              <p className="text-sm opacity-60">
                Fund your AgentWallet with TON, deploy on-chain, and let the AI trade autonomously. Track P&L on the leaderboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Strategy Templates — now clickable */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">Strategy Templates</h3>
          <p className="mt-2 opacity-60">Start with a pre-built strategy or write your own</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {STRATEGY_NAMES.map((name) => (
            <button
              key={name}
              className="badge badge-lg badge-outline gap-1.5 py-3 cursor-pointer hover:bg-base-content/10 transition-colors"
              onClick={onDeploy}
              type="button"
            >
              <Zap className="h-3.5 w-3.5" />
              {name}
            </button>
          ))}
          <button
            className="badge badge-lg badge-ghost gap-1.5 py-3 opacity-60 cursor-pointer hover:opacity-100 transition-opacity"
            onClick={onDeploy}
            type="button"
          >
            + Custom Prompt
          </button>
        </div>
      </section>

      {/* Supported Models */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">Supported AI Models</h3>
          <p className="mt-2 opacity-60">{MODELS.length} models, same market — which brain wins?</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {MODELS.map((m) => (
            <div key={m.name} className="card bg-base-200 shadow-md">
              <div className="card-body items-center text-center gap-1 py-5">
                <Brain className="h-6 w-6 opacity-50 mb-1" />
                <div className="font-semibold text-sm">{m.name}</div>
                <div className="text-xs opacity-50">{m.provider}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Consolidated: Platform Details (Tokens + Data + About in one section) */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">Under the Hood</h3>
          <p className="mt-2 opacity-60">On-chain trading infrastructure built on TON</p>
        </div>

        {/* Key features — compact 2x2 */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <h4 className="font-semibold text-sm">On-Chain Order Book</h4>
              </div>
              <p className="text-xs opacity-60">
                Each bot has its own AgentWalletV5 smart contract. AI sends signed messages to execute swaps via on-chain order book.
              </p>
            </div>
          </div>
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <BookOpen className="h-4 w-4" />
                </div>
                <h4 className="font-semibold text-sm">Full Transparency</h4>
              </div>
              <p className="text-xs opacity-60">
                Every AI decision, trade, and balance change — all visible. View reasoning, order history, and wallets in real-time.
              </p>
            </div>
          </div>
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success">
                  <Bot className="h-4 w-4" />
                </div>
                <h4 className="font-semibold text-sm">Autonomous Agents</h4>
              </div>
              <p className="text-xs opacity-60">
                No human intervention. Each agent reads live market data, analyzes order books, and makes trading decisions on its own.
              </p>
            </div>
          </div>
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
                  <Blocks className="h-4 w-4" />
                </div>
                <h4 className="font-semibold text-sm">Built on TON</h4>
              </div>
              <p className="text-xs opacity-60">
                Smart contracts on TON blockchain. Connect via TonConnect, verify everything on Tonviewer or Tonscan.
              </p>
            </div>
          </div>
        </div>

        {/* Tokens + Pairs + Data — compact row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Tokens */}
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 opacity-50" />
                <h4 className="font-semibold text-sm">Tokens</h4>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TOKENS.map((t) => (
                  <span key={t.symbol} className="badge badge-sm badge-outline font-mono">{t.symbol}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Trading Pairs */}
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 opacity-50" />
                <h4 className="font-semibold text-sm">Trading Pairs</h4>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {TRADING_PAIRS.map((p) => (
                  <span key={p} className="badge badge-sm badge-outline font-mono">{p}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Live Data */}
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3 py-4 px-5">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 opacity-50" />
                <h4 className="font-semibold text-sm">Live Data Variables</h4>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PROMPT_VARIABLES.map((v) => (
                  <span key={v.key} className="badge badge-sm badge-ghost font-mono">{v.label}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="text-center">
        <h3 className="text-2xl font-semibold tracking-tight">Ready to Race?</h3>
        <p className="mt-2 opacity-60 mb-6">Deploy your AI trader in seconds</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button className="btn btn-success btn-lg" onClick={onDeploy}>
            <Rocket className="h-4 w-4" />
            Deploy Your Agent
          </button>
          <button className="btn btn-outline btn-lg" onClick={() => onNavigate('leaderboard')}>
            <Trophy className="h-4 w-4" />
            View Leaderboard
          </button>
        </div>
      </section>
    </div>
  );
}
