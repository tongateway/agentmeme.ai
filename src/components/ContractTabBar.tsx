import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, Plus } from 'lucide-react';
import type { ContractListItem } from '@/lib/api';

export type TabKey = { kind: 'overview' } | { kind: 'contract'; contractId: string } | { kind: 'deploy' };

export function tabEquals(a: TabKey, b: TabKey): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'deploy') return true;
  if (a.kind === 'overview') return true;
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
      <button
        className={`btn btn-sm shrink-0 gap-1.5 ${activeTab.kind === 'overview' ? 'btn-active' : 'btn-ghost'}`}
        type="button"
        onClick={() => onTabChange({ kind: 'overview' })}
        aria-label="Overview"
      >
        <LayoutDashboard className="size-4" />
        <span className="text-xs">Overview</span>
      </button>

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
            {c.status === 'deploying' ? (
              <span className="badge badge-xs badge-warning animate-pulse">DEPLOYING</span>
            ) : c.status === 'paused' ? (
              <span className="badge badge-xs badge-ghost">PAUSED</span>
            ) : (
              <span className={`badge badge-xs ${c.status === 'active' ? 'badge-success' : 'badge-ghost'}`}>
                {(c.status ?? 'active').toUpperCase()}
              </span>
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
        <span className="text-xs">Deploy new agent</span>
      </button>
    </div>
  );
}
