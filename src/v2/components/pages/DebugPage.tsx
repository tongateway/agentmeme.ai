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

// Coin ID 0 is often native TON in the open4dev API
const KNOWN_COINS: Record<number, DexCoin> = {
  0: { id: 0, name: 'Toncoin', symbol: 'TON' },
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  );
}

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
          // Use known coins first (e.g., id=0 is TON)
          if (KNOWN_COINS[id]) {
            coinMap.set(id, KNOWN_COINS[id]);
            return;
          }
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

        // Amounts in human-readable
        const absAmount = Math.abs(o.amount);
        const absInitial = Math.abs(o.initial_amount);
        const humanAmount = nanoToHuman(absAmount, fromSymbol);
        const humanInitialAmount = nanoToHuman(absInitial, fromSymbol);
        const filled = absInitial > 0 ? absInitial - absAmount : 0;
        const humanFilled = nanoToHuman(filled, fromSymbol);

        // Price: raw price_rate is nano-to-nano. Convert to human price.
        // human_price = price_rate * 10^(from_decimals - to_decimals)
        const humanPriceRate = o.price_rate > 0 ? o.price_rate * (10 ** (fromDecimals - toDecimals)) : 0;
        const invertedHumanPrice = humanPriceRate > 0 ? 1 / humanPriceRate : 0;

        // Estimate "to" amount using human price
        const fromHuman = absInitial / 10 ** fromDecimals;
        const estimatedToHuman = humanPriceRate > 0 ? fromHuman * humanPriceRate : 0;

        // Slippage: raw value is in basis points (divide by 100 for %)
        const slippagePct = o.slippage > 1000 ? o.slippage / 1_000_000 : o.slippage;

        return (
          <Card key={`${o.id}-${o.raw_address}`} className="py-0 overflow-hidden">
            <CardContent className="p-3 space-y-2">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">#{o.id}</span>
                  <Badge className={statusColor(o.status)}>{o.status}</Badge>
                  <Badge variant="outline" className="font-mono text-[10px]">{fromSymbol} → {toSymbol}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString()}
                </span>
              </div>

              {/* Key values — large */}
              <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-md p-2">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Initial</div>
                  <div className="font-mono text-sm font-bold">{humanInitialAmount} {fromSymbol}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{fmtNano(absInitial)} nano</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Remaining</div>
                  <div className="font-mono text-sm font-bold">{humanAmount} {fromSymbol}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{fmtNano(absAmount)} nano</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase">Filled</div>
                  <div className="font-mono text-sm font-bold text-green-500">{humanFilled} {fromSymbol}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{fmtNano(filled)} nano</div>
                </div>
              </div>

              {/* Detail rows */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <Row label="Price rate (raw)" value={o.price_rate.toExponential(4)} />
                <Row label={`Price (${toSymbol} per ${fromSymbol})`} value={humanPriceRate > 0 ? humanPriceRate.toPrecision(6) : '—'} bold />
                <Row label={`Price (${fromSymbol} per ${toSymbol})`} value={invertedHumanPrice > 0 ? invertedHumanPrice.toPrecision(6) : '—'} />
                <Row label={`Est. total (${toSymbol})`} value={estimatedToHuman > 0 ? `${estimatedToHuman.toFixed(6)} ${toSymbol}` : '—'} bold />
                <Row label="Slippage" value={`${slippagePct}%`} />
                <Row label="From" value={`${fromSymbol} (id:${o.from_coin_id}, ${fromDecimals} decimals)`} />
                <Row label="To" value={`${toSymbol} (id:${o.to_coin_id}, ${toDecimals} decimals)`} />
                <div className="flex justify-between col-span-2">
                  <span className="text-muted-foreground">Order address</span>
                  <a href={`https://tonviewer.com/${o.raw_address}`} target="_blank" rel="noreferrer"
                    className="font-mono text-primary hover:underline">
                    {o.raw_address}
                  </a>
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
