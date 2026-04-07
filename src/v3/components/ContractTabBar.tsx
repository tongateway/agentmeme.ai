import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Bot } from 'lucide-react';
import type { ContractListItem } from '@/lib/api';

export type TabKey = { kind: 'contract'; contractId: string } | { kind: 'deploy' };

export function tabEquals(a: TabKey, b: TabKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'deploy') return true;
  return (a as { kind: 'contract'; contractId: string }).contractId ===
    (b as { kind: 'contract'; contractId: string }).contractId;
}

type ContractTabBarProps = {
  contracts: ContractListItem[] | null;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  loading: boolean;
  onRename?: (contractId: string, newName: string) => Promise<void>;
};

function fmtAddrShort(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}\u2026${addr.slice(-4)}`;
}

export function ContractTabBar({ contracts, activeTab, onTabChange, loading, onRename }: ContractTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const startEditing = useCallback((c: ContractListItem) => {
    setEditingId(c.id);
    setEditValue((c.name && c.name.trim()) || '');
  }, []);

  const commitRename = useCallback(async () => {
    if (!editingId || !onRename) {
      setEditingId(null);
      return;
    }
    const trimmed = editValue.trim();
    if (trimmed) {
      try {
        await onRename(editingId, trimmed);
      } catch {
        // silently fail
      }
    }
    setEditingId(null);
  }, [editingId, editValue, onRename]);

  const cancelEditing = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitRename();
      } else if (e.key === 'Escape') {
        cancelEditing();
      }
    },
    [commitRename, cancelEditing],
  );

  return (
    <div
      ref={scrollRef}
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-white/5 bg-gray-900/80 p-1 backdrop-blur-sm"
      style={{ scrollbarWidth: 'none' }}
    >
      {loading && !contracts?.length ? (
        <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm text-gray-400">
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-600 border-t-[#00C389]" />
          Loading...
        </div>
      ) : null}

      {contracts?.map((c) => {
        const isActive = activeTab.kind === 'contract' && activeTab.contractId === c.id;
        const isEditing = editingId === c.id;

        return (
          <motion.button
            key={c.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? 'bg-white/10 text-white shadow-sm'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
            type="button"
            onClick={() => onTabChange({ kind: 'contract', contractId: c.id })}
            onDoubleClick={(e) => {
              if (isActive && onRename) {
                e.preventDefault();
                startEditing(c);
              }
            }}
          >
            <Bot className="h-3.5 w-3.5 shrink-0 opacity-50" />
            {isEditing ? (
              <input
                ref={inputRef}
                className="w-28 rounded border border-white/10 bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-white outline-none focus:border-[#00C389]/50"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                maxLength={40}
                placeholder="Agent name"
              />
            ) : (
              <span className="font-mono text-xs">{(c.name && c.name.trim()) || fmtAddrShort(c.address)}</span>
            )}
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                c.status === 'deploying'
                  ? 'animate-pulse bg-yellow-400'
                  : c.status === 'paused'
                    ? 'bg-gray-500'
                    : 'bg-[#00C389]'
              }`}
              title={(c.status ?? 'active').toUpperCase()}
            />
            {c.trading_pairs && (
              <span className="text-[10px] opacity-40">{c.trading_pairs}</span>
            )}
          </motion.button>
        );
      })}

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
          activeTab.kind === 'deploy'
            ? 'bg-[#00C389]/20 text-[#00C389]'
            : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
        }`}
        type="button"
        onClick={() => onTabChange({ kind: 'deploy' })}
        aria-label="Deploy new agent"
      >
        <Plus className="h-4 w-4" />
        <span className="text-xs">Deploy new</span>
      </motion.button>
    </div>
  );
}
