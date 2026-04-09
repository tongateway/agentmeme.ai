import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTonAddress } from '@tonconnect/ui-react';
import { Address } from '@ton/core';
import { Bot, Plus, Loader2 } from 'lucide-react';
import { listRaceContracts, listContractsFromLeaderboard, type ContractListItem, type PublicApiConfig } from '@/lib/api';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/v2/components/ui/button';
import { cn } from '@/v2/lib/utils';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://ai-api.open4dev.xyz';

function fmtAddrShort(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function normalizeTonAddress(addr: string): string {
  try {
    return Address.parse(addr).toRawString();
  } catch {
    return addr.toLowerCase();
  }
}

function statusDotClass(status: string | undefined): string {
  if (status === 'deploying') return 'bg-yellow-500 animate-pulse';
  if (status === 'paused') return 'bg-muted-foreground/40';
  return 'bg-green-500';
}

export function ContractTabBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: activeId } = useParams<{ id?: string }>();
  const tonAddress = useTonAddress();

  const raceCfg: PublicApiConfig = useMemo(() => ({ baseUrl: API_BASE }), []);
  const { jwtToken } = useAuth(raceCfg);

  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(false);

  const walletRawAddress = useMemo(
    () => (tonAddress ? normalizeTonAddress(tonAddress) : null),
    [tonAddress],
  );

  const isDeployTab =
    location.pathname === '/trader/deploy' || location.pathname.endsWith('/trader/deploy');

  const load = useCallback(async () => {
    if (!walletRawAddress) {
      setContracts([]);
      return;
    }
    setLoading(true);
    try {
      const cfg: PublicApiConfig = { baseUrl: API_BASE, jwtToken };
      let all = await listRaceContracts(cfg, 'active,paused,deploying');
      if (all.length === 0) {
        all = await listContractsFromLeaderboard(cfg);
      }
      // Filter to contracts owned by the current wallet using normalized raw addresses
      const mine = all.filter((c) => {
        if (!c.owner_address) return false;
        return normalizeTonAddress(c.owner_address) === walletRawAddress;
      });
      mine.sort((a, b) => {
        const byCreated = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (byCreated !== 0) return byCreated;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      setContracts(mine);
    } catch {
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [walletRawAddress, jwtToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tonAddress) {
    return null;
  }

  return (
    <div className="mb-4 flex max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-muted/40 p-1 scrollbar-none">
      {loading && contracts.length === 0 && (
        <div className="flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading…
        </div>
      )}

      {contracts.map((c) => {
        const isActive = activeId === c.id;
        const displayName = (c.name && c.name.trim()) || fmtAddrShort(c.address);
        return (
          <Button
            key={c.id}
            variant={isActive ? 'secondary' : 'ghost'}
            size="sm"
            className={cn('h-8 shrink-0 gap-1.5', isActive && 'bg-background shadow-sm')}
            onClick={() => navigate(`/trader/${c.id}`)}
          >
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono text-xs">{displayName}</span>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(c.status)}`}
              title={(c.status ?? 'active').toUpperCase()}
            />
            {c.trading_pairs && (
              <span className="text-[10px] text-muted-foreground">{c.trading_pairs}</span>
            )}
          </Button>
        );
      })}

      <Button
        variant={isDeployTab ? 'secondary' : 'ghost'}
        size="sm"
        className={cn('h-8 shrink-0 gap-1.5', isDeployTab && 'bg-background shadow-sm')}
        onClick={() => navigate('/trader/deploy')}
      >
        <Plus className="h-4 w-4" />
        <span className="text-xs">Deploy new</span>
      </Button>
    </div>
  );
}
