import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Bot } from 'lucide-react';
import type { ContractListItem } from '@/lib/api';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { cn } from '../lib/utils';

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
        'inline-flex max-w-full items-center gap-0 overflow-x-auto rounded-xl p-1 shadow-sm',
        'bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800',
      )}
      style={{ scrollbarWidth: 'none' }}
    >
      {loading && !contracts?.length ? (
        <Button variant="ghost" size="sm" disabled className="shrink-0 gap-1.5">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading...
        </Button>
      ) : null}

      {contracts?.map((c) => {
        const isActive = activeTab.kind === 'contract' && activeTab.contractId === c.id;
        const isEditing = editingId === c.id;

        return (
          <button
            key={c.id}
            type="button"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors',
              isActive
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-neutral-50'
                : 'text-neutral-600 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50',
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
              <Input
                ref={inputRef}
                className="h-6 w-28 text-xs font-mono"
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
                c.status === 'deploying' ? 'bg-amber-500 animate-pulse' :
                c.status === 'paused' ? 'bg-neutral-400 dark:bg-neutral-600' :
                'bg-emerald-500',
              )}
              title={(c.status ?? 'active').toUpperCase()}
            />
            {c.trading_pairs && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{c.trading_pairs}</Badge>
            )}
          </button>
        );
      })}

      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium shrink-0 transition-colors',
          activeTab.kind === 'deploy'
            ? 'bg-white text-violet-700 shadow-sm dark:bg-neutral-800 dark:text-violet-400'
            : 'text-neutral-600 hover:bg-neutral-200/50 dark:text-neutral-400 dark:hover:bg-neutral-800/50',
        )}
        onClick={() => onTabChange({ kind: 'deploy' })}
        aria-label="Deploy new agent"
      >
        <Plus className="size-4" />
        <span className="text-xs">Deploy new</span>
      </button>
    </div>
  );
}
