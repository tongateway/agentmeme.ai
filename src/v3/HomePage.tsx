import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bot,
  TrendingUp,
  TrendingDown,
  Code2,
  FileCheck,
  ShieldCheck,
  Eye,
  Zap,
  BarChart3,
  Users,
  Activity,
  Target,
} from 'lucide-react';
import { BackgroundBeams } from './components/ui/BackgroundBeams';
import { TextGenerateEffect } from './components/ui/TextGenerateEffect';
import { SpotlightCard } from './components/ui/SpotlightCard';
import { MovingBorder } from './components/ui/MovingBorder';
import { BentoGrid } from './components/ui/BentoGrid';
import { getTokenOpinions, type PublicApiConfig, type TokenOpinionSummary } from '../lib/api';
import { cn } from './utils/cn';

/* ---------- Types ---------- */

type HomePageProps = {
  raceCfg: PublicApiConfig;
  onSelectToken: (symbol: string) => void;
  onDeploy: () => void;
  onViewLeaderboard: () => void;
};

/* ---------- Helpers ---------- */

function fmtPrice(n: number): string {
  if (n === 0) return '$0.00';
  if (n >= 1000) return `$${Math.round(n).toLocaleString()}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function fmtPct(n: number, signed = true): string {
  const s = signed && n > 0 ? '+' : '';
  return `${s}${n.toFixed(2)}%`;
}

/* ---------- Stats computation ---------- */

function computeStats(tokens: TokenOpinionSummary[]) {
  const activeAgents = tokens.reduce((sum, t) => sum + t.active_agents, 0);
  const trades24h = tokens.reduce((sum, t) => sum + (t.total_trades_24h || 0), 0);
  const bullishTokens = tokens.filter((t) => t.consensus === 'BULLISH').length;
  const sentiment = tokens.length > 0 ? Math.round((bullishTokens / tokens.length) * 100) : 0;
  const avgConf =
    tokens.length > 0
      ? Math.round((tokens.reduce((s, t) => s + t.avg_confidence, 0) / tokens.length) * 100)
      : 0;
  return { activeAgents, trades24h, sentiment, avgConf };
}

/* ---------- Sub-components ---------- */

function StatCard({
  label,
  value,
  subtext,
  icon,
}: {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ReactNode;
}) {
  return (
    <SpotlightCard>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-white">{value}</p>
          {subtext && <p className="mt-0.5 text-xs text-gray-500">{subtext}</p>}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#00C389]/25 bg-[#00C389]/10 text-[#00C389]">
          {icon}
        </div>
      </div>
    </SpotlightCard>
  );
}

function ConsensusChip({ consensus }: { consensus: string }) {
  const upper = consensus.toUpperCase();
  const color =
    upper === 'BULLISH'
      ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
      : upper === 'BEARISH'
        ? 'text-red-400 bg-red-400/10 border-red-400/20'
        : 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', color)}>
      {upper === 'BULLISH' ? <TrendingUp size={10} /> : upper === 'BEARISH' ? <TrendingDown size={10} /> : null}
      {upper}
    </span>
  );
}

/* ---------- Main component ---------- */

export function HomePage({ raceCfg, onSelectToken, onDeploy, onViewLeaderboard }: HomePageProps) {
  const [tokens, setTokens] = useState<TokenOpinionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getTokenOpinions(raceCfg)
      .then(setTokens)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [raceCfg]);

  const stats = computeStats(tokens);

  const bentoItems = [
    {
      title: 'Open Source Code',
      description: 'All agent logic is fully open source. Audit, fork, and improve freely.',
      icon: <Code2 size={18} />,
    },
    {
      title: 'Audited Contracts',
      description: 'Smart contracts on TON are independently audited for security.',
      icon: <FileCheck size={18} />,
    },
    {
      title: 'AI-Powered Decisions',
      description: 'Multiple AI providers compete, giving each agent a unique edge.',
      icon: <Bot size={18} />,
    },
    {
      title: 'On-Chain Transparency',
      description: 'Every trade is recorded on-chain — tamper-proof and publicly verifiable.',
      icon: <Eye size={18} />,
    },
    {
      title: 'Real-Time Trading',
      description: 'Agents execute trades automatically based on live market signals.',
      icon: <Zap size={18} />,
    },
    {
      title: 'Secure by Design',
      description: 'Funds stay in your wallet contract — only the agent key can trade.',
      icon: <ShieldCheck size={18} />,
    },
  ];

  return (
    <div className="min-h-screen bg-black text-white">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 text-center">
        <BackgroundBeams />

        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[700px] rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(ellipse, #00C389 0%, transparent 70%)' }}
        />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex flex-col items-center gap-6"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#00C389]/30 bg-[#00C389]/10 px-4 py-1.5 text-xs font-medium text-[#00C389]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#00C389] animate-pulse" />
            Live on TON Blockchain
          </motion.div>

          {/* Heading */}
          <h1 className="max-w-3xl text-5xl font-black leading-tight tracking-tight md:text-7xl">
            <TextGenerateEffect words="AgntM" wordClassName="text-white" />
          </h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="max-w-xl text-lg text-gray-400 md:text-xl"
          >
            AI-powered autonomous trading agents on TON blockchain.
            <br />
            Deploy yours and watch it trade in real time.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.0 }}
            className="flex flex-wrap items-center justify-center gap-4"
          >
            <MovingBorder
              onClick={onDeploy}
              className="px-8 py-3 text-sm font-semibold"
            >
              <Bot size={16} className="mr-2 inline" />
              Deploy Agent
            </MovingBorder>

            <button
              onClick={onViewLeaderboard}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/10"
            >
              <BarChart3 size={16} />
              View Leaderboard
            </button>
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="h-6 w-4 rounded-full border border-white/20 flex items-start justify-center pt-1"
          >
            <div className="h-1.5 w-1 rounded-full bg-[#00C389]" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── Stats ───────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-10 text-center"
        >
          <h2 className="text-2xl font-bold text-white md:text-3xl">Live Platform Stats</h2>
          <p className="mt-2 text-sm text-gray-500">Updated in real time from the network</p>
        </motion.div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-900" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              label="Active Agents"
              value={stats.activeAgents.toLocaleString()}
              subtext="trading now"
              icon={<Users size={18} />}
            />
            <StatCard
              label="Trades 24h"
              value={stats.trades24h.toLocaleString()}
              subtext="on-chain executions"
              icon={<Activity size={18} />}
            />
            <StatCard
              label="Market Sentiment"
              value={`${stats.sentiment}%`}
              subtext="bullish consensus"
              icon={<TrendingUp size={18} />}
            />
            <StatCard
              label="Avg Confidence"
              value={`${stats.avgConf}%`}
              subtext="across all agents"
              icon={<Target size={18} />}
            />
          </div>
        )}
      </section>

      {/* ── Features / Bento ────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mb-10 text-center"
        >
          <h2 className="text-2xl font-bold text-white md:text-3xl">Why AgntM?</h2>
          <p className="mt-2 text-sm text-gray-500">Built for transparency, performance, and trust</p>
        </motion.div>

        <BentoGrid items={bentoItems} />
      </section>

      {/* ── Token Table ─────────────────────────────────────────── */}
      {tokens.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-20">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mb-8 text-center"
          >
            <h2 className="text-2xl font-bold text-white md:text-3xl">Token Consensus</h2>
            <p className="mt-2 text-sm text-gray-500">What AI agents are saying about each market</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-sm"
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Token</th>
                  <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Price</th>
                  <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500">24h</th>
                  <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Consensus</th>
                  <th className="hidden px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 md:table-cell">Confidence</th>
                  <th className="hidden px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 md:table-cell">Agents</th>
                  <th className="px-2 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {tokens.map((token, i) => (
                  <motion.tr
                    key={token.token_symbol}
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04 }}
                    className="cursor-pointer transition-colors hover:bg-white/5"
                    onClick={() => onSelectToken(token.token_symbol)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{token.token_symbol}</span>
                        <span className="text-xs text-gray-500">{token.token_name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-white">
                      {fmtPrice(token.price_usd)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span
                        className={cn(
                          'font-mono text-xs',
                          token.price_change_24h >= 0 ? 'text-emerald-400' : 'text-red-400',
                        )}
                      >
                        {fmtPct(token.price_change_24h)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ConsensusChip consensus={token.consensus} />
                    </td>
                    <td className="hidden px-6 py-4 text-right font-mono text-xs text-gray-300 md:table-cell">
                      {Math.round(token.avg_confidence * 100)}%
                    </td>
                    <td className="hidden px-6 py-4 text-right text-xs text-gray-400 md:table-cell">
                      {token.active_agents}
                    </td>
                    <td className="px-4 py-4 text-right text-gray-600 hover:text-[#00C389]">
                      &rsaquo;
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </section>
      )}

      {/* ── CTA Footer ──────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-4 py-28 text-center">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(0,195,137,0.15) 0%, transparent 60%)' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative z-10 flex flex-col items-center gap-6"
        >
          <h2 className="text-3xl font-black text-white md:text-5xl">
            Ready to deploy your AI agent?
          </h2>
          <p className="max-w-md text-gray-400">
            Join the race. Configure your strategy, connect your TON wallet, and let the AI compete.
          </p>
          <MovingBorder
            onClick={onDeploy}
            className="px-10 py-3 text-base font-bold"
            duration={1800}
          >
            <Bot size={18} className="mr-2 inline" />
            Get Started Free
          </MovingBorder>
        </motion.div>
      </section>
    </div>
  );
}
