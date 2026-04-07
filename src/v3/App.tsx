import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Bot, BarChart3, ExternalLink } from 'lucide-react';
import { HomePage } from './HomePage';
import { type PublicApiConfig } from '../lib/api';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const raceCfg: PublicApiConfig = {
  baseUrl: BASE_URL,
};

type NavLinkProps = { href: string; children: ReactNode };

function NavLink({ href, children }: NavLinkProps) {
  return (
    <a
      href={href}
      className="text-sm text-gray-400 transition-colors hover:text-white"
    >
      {children}
    </a>
  );
}

export default function V3App() {
  const handleDeploy = () => {
    // Navigate to deploy — fall back to v2 deploy page
    window.location.href = '/v2#/agent-hub';
  };

  const handleViewLeaderboard = () => {
    window.location.href = '/v2#/leaderboard';
  };

  const handleSelectToken = (symbol: string) => {
    window.location.href = `/v2#/trader?token=${encodeURIComponent(symbol)}`;
  };

  return (
    <div id="v3-root" className="min-h-screen bg-black text-white">
      {/* ── Navbar ──────────────────────────────────────────────── */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-md"
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          {/* Logo */}
          <a href="/v3" className="flex items-center gap-2 font-mono text-sm font-bold text-white">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00C389]/20 text-[#00C389]">
              <Bot size={14} />
            </div>
            <span className="text-[#00C389]">AI</span>
            <span className="text-gray-300">Trader</span>
            <span className="ml-0.5 rounded bg-[#00C389]/15 px-1 py-0.5 text-[10px] font-semibold text-[#00C389]">
              RACE
            </span>
          </a>

          {/* Nav links */}
          <div className="hidden items-center gap-6 md:flex">
            <NavLink href="/v2#/leaderboard">Leaderboard</NavLink>
            <NavLink href="/v2#/trader">Tokens</NavLink>
            <NavLink href="/v2#/stats">Stats</NavLink>
            <NavLink href="/v2#/docs">Docs</NavLink>
          </div>

          {/* CTA */}
          <div className="flex items-center gap-3">
            <a
              href="/v2"
              className="hidden items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-300 md:flex"
            >
              <ExternalLink size={12} />
              Classic UI
            </a>
            <button
              onClick={handleDeploy}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#00C389] px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90"
            >
              <BarChart3 size={13} />
              Deploy Agent
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Page content — padded for navbar */}
      <div className="pt-14">
        <HomePage
          raceCfg={raceCfg}
          onSelectToken={handleSelectToken}
          onDeploy={handleDeploy}
          onViewLeaderboard={handleViewLeaderboard}
        />
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 bg-black px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 font-mono text-sm text-gray-500">
            <Bot size={14} className="text-[#00C389]" />
            AgntM — built on TON
          </div>
          <div className="flex gap-6 text-xs text-gray-600">
            <a href="/v2#/docs" className="hover:text-gray-400">Docs</a>
            <a href="https://github.com" className="hover:text-gray-400" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="/v2" className="hover:text-gray-400">Classic UI (v2)</a>
          </div>
          <p className="text-xs text-gray-700">Not financial advice. Trade responsibly.</p>
        </div>
      </footer>
    </div>
  );
}
