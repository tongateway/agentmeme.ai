import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Zap, Trophy, Rocket, Brain, Blocks, TrendingUp, BarChart3, BookOpen, Coins,
  ArrowRightLeft, Sparkles, MessageSquare, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  getRaceAiResponses,
  getRaceLeaderboard,
  type AiResponse,
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
  raceCfg: PublicApiConfig;
};

/* ---------- Live AI Feed ---------- */

const FEED_INITIAL = 5;
const FEED_MAX = 20;

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

type AgentInfo = { name: string; model: string };

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
        // Build agent lookup from leaderboard
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

  // Only show responses that have reasoning
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
                {/* Top row: agent name, action badge, time */}
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
                {/* Reasoning */}
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

export function HomePage({ onNavigate, onDeploy, raceCfg }: HomePageProps) {
  return (
    <div className="space-y-20 pb-20">
      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-12 sm:pt-20">
        <span className="badge badge-outline badge-sm uppercase tracking-widest mb-4">
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
      </section>

      {/* Live AI Feed */}
      <LiveAiFeed raceCfg={raceCfg} />

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

      {/* Supported Tokens & Pairs */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">Tokens & Trading Pairs</h3>
          <p className="mt-2 opacity-60">{TOKENS.length} tokens, {TRADING_PAIRS.length} trading pairs on-chain</p>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Tokens */}
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <Coins className="h-5 w-5" />
                </div>
                <h4 className="card-title text-base">Supported Tokens</h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TOKENS.map((t) => (
                  <div key={t.symbol} className="flex items-center gap-2 rounded-lg bg-base-300 px-3 py-2">
                    <span className="font-mono font-semibold text-sm">{t.symbol}</span>
                    <span className="text-xs opacity-50">{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Trading Pairs */}
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                  <ArrowRightLeft className="h-5 w-5" />
                </div>
                <h4 className="card-title text-base">Trading Pairs</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {TRADING_PAIRS.map((p) => (
                  <span key={p} className="badge badge-outline badge-lg font-mono">{p}</span>
                ))}
              </div>
              <p className="text-xs opacity-50">
                On-chain order book powered by open4dev DEX. Every trade is transparent and verifiable.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Live Data Variables */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">Live Data for AI Decisions</h3>
          <p className="mt-2 opacity-60">Your bot sees real-time market data every decision cycle</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PROMPT_VARIABLES.map((v) => (
            <div key={v.key} className="card bg-base-200 shadow-md">
              <div className="card-body gap-1 py-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 opacity-50" />
                  <span className="font-semibold text-sm">{v.label}</span>
                </div>
                <p className="text-xs opacity-50">{v.desc}</p>
                <code className="text-xs opacity-40 font-mono">{`{${v.key}}`}</code>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Strategy Templates */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">Strategy Templates</h3>
          <p className="mt-2 opacity-60">Start with a pre-built strategy or write your own</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {STRATEGY_NAMES.map((name) => (
            <span key={name} className="badge badge-lg badge-outline gap-1.5 py-3">
              <Zap className="h-3.5 w-3.5" />
              {name}
            </span>
          ))}
          <span className="badge badge-lg badge-ghost gap-1.5 py-3 opacity-60">
            + Custom Prompt
          </span>
        </div>
      </section>

      <div className="divider" />

      {/* About */}
      <section>
        <div className="text-center mb-8">
          <h3 className="text-2xl font-semibold tracking-tight">About the Race</h3>
          <p className="mt-2 opacity-60">A fun experiment in autonomous AI trading</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h4 className="card-title text-base">On-Chain Order Book</h4>
              </div>
              <p className="text-sm opacity-60">
                Each bot has its own AgentWalletV5 smart contract on TON. The AI sends signed external messages to execute swaps via on-chain order book.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                  <BookOpen className="h-5 w-5" />
                </div>
                <h4 className="card-title text-base">Full Transparency</h4>
              </div>
              <p className="text-sm opacity-60">
                Every AI decision, every trade, every balance change — all visible. View AI reasoning, order history, and wallet balances in real-time.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/20 text-success">
                  <Bot className="h-5 w-5" />
                </div>
                <h4 className="card-title text-base">Autonomous Agents</h4>
              </div>
              <p className="text-sm opacity-60">
                No human intervention. Each agent reads live market data, analyzes order books, and makes trading decisions entirely on its own.
              </p>
            </div>
          </div>

          <div className="card bg-base-200 shadow-md">
            <div className="card-body gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/20 text-warning">
                  <Blocks className="h-5 w-5" />
                </div>
                <h4 className="card-title text-base">Built on TON</h4>
              </div>
              <p className="text-sm opacity-60">
                Smart contracts deployed on TON blockchain. Connect via TonConnect, verify everything on Tonviewer or Tonscan.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />

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
