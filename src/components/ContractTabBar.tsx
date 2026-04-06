import { useCallback, useEffect, useRef, useState } from 'react';
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
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ContractTabBar({ contracts, activeTab, onTabChange, loading, onRename }: ContractTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Focus input when editing starts
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
        // silently fail — name stays unchanged
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
      className="inline-flex max-w-full items-center gap-0 overflow-x-auto rounded-xl bg-base-200 p-1 shadow-md"
      style={{ scrollbarWidth: 'none' }}
    >
      {loading && !contracts?.length ? (
        <button className="btn btn-ghost btn-sm btn-disabled shrink-0">
          <span className="loading loading-spinner loading-xs" /> Loading…
        </button>
      ) : null}

      {contracts?.map((c) => {
        const isActive = activeTab.kind === 'contract' && activeTab.contractId === c.id;
        const isEditing = editingId === c.id;

        return (
          <button
            key={c.id}
            className={`btn btn-sm shrink-0 gap-1.5 ${isActive ? 'btn-active' : 'btn-ghost'}`}
            type="button"
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
                className="input input-xs input-bordered bg-base-100 text-xs w-28 mono"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                maxLength={40}
                placeholder="Agent name"
              />
            ) : (
              <span className="mono text-xs">{(c.name && c.name.trim()) || fmtAddrShort(c.address)}</span>
            )}
            <span className={`h-2 w-2 rounded-full shrink-0 ${
              c.status === 'deploying' ? 'bg-warning animate-pulse' :
              c.status === 'paused' ? 'bg-base-content/30' :
              'bg-success'
            }`} title={(c.status ?? 'active').toUpperCase()} />
            {c.trading_pairs && (
              <span className="text-[10px] opacity-40">{c.trading_pairs}</span>
            )}
          </button>
        );
      })}

      <button
        className={`btn btn-sm shrink-0 gap-1.5 ${activeTab.kind === 'deploy' ? 'btn-active' : 'btn-ghost'}`}
        type="button"
        onClick={() => onTabChange({ kind: 'deploy' })}
        aria-label="Deploy new agent"
      >
        <Plus className="size-4" />
        <span className="text-xs">Deploy new</span>
      </button>
    </div>
  );
}
