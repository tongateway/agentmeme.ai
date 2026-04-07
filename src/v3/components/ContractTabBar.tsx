import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Bot } from 'lucide-react';
import type { ContractListItem } from '@/lib/api';
import { cn } from '../utils/cn';

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
      className={cn(
        'inline-flex max-w-full items-center gap-0 overflow-x-auto rounded-xl p-1',
        'bg-gray-900/50 border border-white/10',
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {loading && !contracts?.length ? (
        <button
          type="button"
          disabled
          className="shrink-0 gap-1.5 inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-500"
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading...
        </button>
      ) : null}

      {contracts?.map((c) => {
        const isActive = activeTab.kind === 'contract' && activeTab.contractId === c.id;
        const isEditing = editingId === c.id;

        return (
          <motion.button
            key={c.id}
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors relative',
              isActive
                ? 'bg-gray-800 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5',
            )}
            onClick={() => onTabChange({ kind: 'contract', contractId: c.id })}
            onDoubleClick={(e) => {
              if (isActive && onRename) {
                e.preventDefault();
                startEditing(c);
              }
            }}
          >
            <Bot className="size-3.5 opacity-50 shrink-0" />
            {isEditing ? (
              <input
                ref={inputRef}
                className="h-6 w-28 text-xs font-mono bg-gray-900 border border-white/10 text-white rounded-md px-2"
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
              className={cn(
                'h-2 w-2 rounded-full shrink-0',
                c.status === 'deploying' ? 'bg-yellow-500 animate-pulse' :
                c.status === 'paused' ? 'bg-gray-500' :
                'bg-[#00C389]',
              )}
              title={(c.status ?? 'active').toUpperCase()}
            />
            {c.trading_pairs && (
              <span className="text-[10px] px-1.5 py-0 rounded bg-white/5 text-gray-400 border border-white/5">
                {c.trading_pairs}
              </span>
            )}
          </motion.button>
        );
      })}

      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors',
          activeTab.kind === 'deploy'
            ? 'bg-[#00C389]/20 text-[#00C389] shadow-sm'
            : 'text-gray-400 hover:text-white hover:bg-white/5',
        )}
        onClick={() => onTabChange({ kind: 'deploy' })}
        aria-label="Deploy new agent"
      >
        <Plus className="size-4" />
        <span className="text-xs">Deploy new</span>
      </motion.button>
    </div>
  );
}
