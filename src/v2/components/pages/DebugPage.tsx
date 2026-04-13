import { useCallback, useState } from 'react';
import { Address } from '@ton/core';
import { Search, Loader2 } from 'lucide-react';
import { getDexOrders, getDexOrderByAddress, getDexCoin, type DexOrder, type DexCoin } from '@/lib/api';
import { Button } from '@/v2/components/ui/button';
import { Input } from '@/v2/components/ui/input';
import { Card, CardContent } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';

const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6,
  USDC: 6,
  TON: 9,
  AGNT: 9,
  BUILD: 9,
  NOT: 9,
};

function nanoToHuman(nano: number, symbol: string): string {
  const decimals = TOKEN_DECIMALS[symbol.toUpperCase()] ?? 9;
  const human = nano / 10 ** decimals;
  if (human === 0) return '0';
  if (human >= 1_000) return human.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (human >= 1) return human.toFixed(4);
  if (human >= 0.0001) return human.toFixed(6);
  return human.toFixed(9);
}

function fmtNano(nano: number): string {
  return nano.toLocaleString();
}

function statusColor(status: string): string {
  if (status === 'completed') return 'bg-green-600 text-white';
  if (status === 'open' || status === 'deployed' || status === 'created') return 'bg-blue-500 text-white';
  if (status === 'cancelled' || status === 'closed') return 'bg-muted text-muted-foreground';
  if (status === 'failed') return 'bg-red-600 text-white';
  return '';
}

type ResolvedOrder = DexOrder & {
  fromCoin: DexCoin | null;
  toCoin: DexCoin | null;
};

export function DebugPage() {
  const [addressInput, setAddressInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<ResolvedOrder[]>([]);
  const [rawAddress, setRawAddress] = useState('');

  const search = useCallback(async () => {
    const input = addressInput.trim();
    if (!input) return;

    setLoading(true);
    setError(null);
    setOrders([]);

    try {
      // Normalize address to raw format (0:hex)
      let raw: string;
      if (input.startsWith('0:') || input.startsWith('0:')) {
        raw = input.toLowerCase();
      } else {
        try {
          raw = Address.parse(input).toRawString();
        } catch {
          raw = input.toLowerCase();
        }
      }
      setRawAddress(raw);

      // Try as owner/wallet address first, then as order contract address
      let allOrders = await getDexOrders(raw, { limit: 350 });
      let searchMode = 'wallet';
      if (allOrders.length === 0) {
        // Try as order's own address
        allOrders = await getDexOrderByAddress(raw);
        searchMode = 'order';
      }
      void searchMode; // used for display below

      // Collect unique coin IDs and resolve them
      const coinIds = new Set<number>();
      for (const o of allOrders) {
        if (o.from_coin_id) coinIds.add(o.from_coin_id);
        if (o.to_coin_id) coinIds.add(o.to_coin_id);
      }

      const coinMap = new Map<number, DexCoin | null>();
      await Promise.all(
        [...coinIds].map(async (id) => {
          const coin = await getDexCoin(id);
          coinMap.set(id, coin);
        }),
      );

      const resolved: ResolvedOrder[] = allOrders.map((o) => ({
        ...o,
        fromCoin: coinMap.get(o.from_coin_id) ?? null,
        toCoin: coinMap.get(o.to_coin_id) ?? null,
      }));

      // Sort newest first
      resolved.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setOrders(resolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [addressInput]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Debug: Order Inspector</h1>
      <p className="text-sm text-muted-foreground">Enter a contract/wallet address to inspect all DEX orders with human-readable values.</p>

      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="EQ... or 0:hex address"
          value={addressInput}
          onChange={(e) => setAddressInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void search()}
          className="flex-1 font-mono text-sm"
        />
        <Button onClick={() => void search()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
      </div>

      {rawAddress && (
        <div className="text-xs font-mono text-muted-foreground">
          Raw: {rawAddress}
        </div>
      )}

      {error && (
        <Card className="border-red-500/30 bg-red-500/10 py-0">
          <CardContent className="p-3 text-sm text-red-500">{error}</CardContent>
        </Card>
      )}

      {!loading && orders.length > 0 && (
        <div className="text-sm text-muted-foreground">
          {orders.length} order{orders.length !== 1 ? 's' : ''} found
          {orders.length === 1 && orders[0].raw_address.toLowerCase() === rawAddress.replace(/^0:/, '').toLowerCase() && (
            <Badge variant="outline" className="ml-2 text-[10px]">matched by order address</Badge>
          )}
        </div>
      )}

      {orders.map((o) => {
        const fromSymbol = o.fromCoin?.symbol ?? `coin#${o.from_coin_id}`;
        const toSymbol = o.toCoin?.symbol ?? `coin#${o.to_coin_id}`;
        const fromDecimals = TOKEN_DECIMALS[fromSymbol.toUpperCase()] ?? 9;
        const toDecimals = TOKEN_DECIMALS[toSymbol.toUpperCase()] ?? 9;

        // Price rate: the raw rate from the API
        // Display price depends on decimal adjustment
        const decAdj = 10 ** (toDecimals - fromDecimals);
        const displayPrice = o.price_rate > 0 ? o.price_rate * decAdj : 0;
        const invertedPrice = displayPrice > 0 ? 1 / displayPrice : 0;

        // Amounts in human
        const humanAmount = nanoToHuman(o.amount, fromSymbol);
        const humanInitialAmount = nanoToHuman(o.initial_amount, fromSymbol);

        // Estimate "to" amount
        const fromHuman = o.initial_amount / 10 ** fromDecimals;
        const estimatedToHuman = displayPrice > 0 ? fromHuman / displayPrice : 0;

        return (
          <Card key={o.id} className="py-0 overflow-hidden">
            <CardContent className="p-3 space-y-2">
              {/* Header: ID + status + time */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">#{o.id}</span>
                  <Badge className={statusColor(o.status)}>{o.status}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {fromSymbol} → {toSymbol}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString()}
                </span>
              </div>

              {/* Data grid */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount ({fromSymbol})</span>
                  <span className="font-mono font-bold">{humanAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount (nano)</span>
                  <span className="font-mono text-muted-foreground">{fmtNano(o.amount)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial ({fromSymbol})</span>
                  <span className="font-mono font-bold">{humanInitialAmount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Initial (nano)</span>
                  <span className="font-mono text-muted-foreground">{fmtNano(o.initial_amount)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price rate (raw)</span>
                  <span className="font-mono">{o.price_rate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price ({toSymbol}/{fromSymbol})</span>
                  <span className="font-mono font-bold">{displayPrice > 0 ? displayPrice.toPrecision(6) : '—'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Price ({fromSymbol}/{toSymbol})</span>
                  <span className="font-mono">{invertedPrice > 0 ? invertedPrice.toPrecision(6) : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Est. total ({toSymbol})</span>
                  <span className="font-mono">{estimatedToHuman > 0 ? nanoToHuman(estimatedToHuman * 10 ** toDecimals, toSymbol) : '—'}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Slippage</span>
                  <span className="font-mono">{o.slippage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Address</span>
                  <a
                    href={`https://tonviewer.com/${o.raw_address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-primary hover:underline truncate max-w-[12rem]"
                  >
                    {o.raw_address.slice(0, 8)}…{o.raw_address.slice(-6)}
                  </a>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">From coin</span>
                  <span className="font-mono">{fromSymbol} (id:{o.from_coin_id}, {fromDecimals}d)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To coin</span>
                  <span className="font-mono">{toSymbol} (id:{o.to_coin_id}, {toDecimals}d)</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!loading && orders.length === 0 && rawAddress && !error && (
        <div className="text-center py-8 text-sm text-muted-foreground">No orders found for this address.</div>
      )}
    </div>
  );
}
