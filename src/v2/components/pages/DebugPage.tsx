import { useCallback, useState } from 'react';
import { Address } from '@ton/core';
import { Search, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/v2/components/ui/button';
import { Input } from '@/v2/components/ui/input';
import { Card, CardContent } from '@/v2/components/ui/card';
import { Badge } from '@/v2/components/ui/badge';

const OPEN4DEV_BASE = 'https://api.open4dev.xyz/api/v1';

const TOKEN_DECIMALS: Record<string, number> = {
  USDT: 6, USDC: 6, TON: 9, AGNT: 9, BUILD: 9, NOT: 9,
};

function nanoToHuman(nano: number, decimals: number): string {
  const human = nano / 10 ** decimals;
  if (human === 0) return '0';
  if (Math.abs(human) >= 1_000) return human.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(human) >= 1) return human.toFixed(4);
  if (Math.abs(human) >= 0.0001) return human.toFixed(6);
  return human.toFixed(9);
}

function statusColor(status: string): string {
  if (status === 'completed') return 'bg-green-600 text-white';
  if (status === 'open' || status === 'deployed' || status === 'created') return 'bg-blue-500 text-white';
  if (status === 'cancelled' || status === 'closed') return 'bg-muted text-muted-foreground';
  if (status === 'failed') return 'bg-red-600 text-white';
  return '';
}

/** Fetch raw orders JSON from open4dev — returns the full unprocessed response. */
async function fetchRawOrders(rawAddress: string): Promise<{ orders: Record<string, unknown>[]; mode: string }> {
  // Try as owner first
  const ownerRes = await fetch(`${OPEN4DEV_BASE}/orders?owner_raw_address=${encodeURIComponent(rawAddress)}&limit=350`);
  const ownerData = await ownerRes.json() as Record<string, unknown>;
  const ownerOrders = Array.isArray(ownerData.orders) ? ownerData.orders as Record<string, unknown>[] : [];
  if (ownerOrders.length > 0) return { orders: ownerOrders, mode: 'owner' };

  // Try as order's own address
  const orderRes = await fetch(`${OPEN4DEV_BASE}/orders?raw_address=${encodeURIComponent(rawAddress)}&limit=10`);
  const orderData = await orderRes.json() as Record<string, unknown>;
  const orderOrders = Array.isArray(orderData.orders) ? orderData.orders as Record<string, unknown>[] : [];
  if (orderOrders.length > 0) return { orders: orderOrders, mode: 'order_address' };

  return { orders: [], mode: 'none' };
}

/** Fetch coin info by ID. */
async function fetchCoin(id: number): Promise<Record<string, unknown> | null> {
  if (id <= 0) return null;
  try {
    const res = await fetch(`${OPEN4DEV_BASE}/coins/${id}`);
    if (!res.ok) return null;
    return await res.json() as Record<string, unknown>;
  } catch { return null; }
}

type OrderData = {
  raw: Record<string, unknown>;
  fromCoin: Record<string, unknown> | null;
  toCoin: Record<string, unknown> | null;
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button variant="ghost" size="sm" className="h-5 w-5 p-0"
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

function OrderCard({ data }: { data: OrderData }) {
  const [showRaw, setShowRaw] = useState(false);
  const o = data.raw;

  const fromSymbol = String(data.fromCoin?.symbol ?? o.from_symbol ?? `coin#${o.from_coin_id ?? '?'}`);
  const toSymbol = String(data.toCoin?.symbol ?? o.to_symbol ?? `coin#${o.to_coin_id ?? '?'}`);
  const fromDecimals = TOKEN_DECIMALS[fromSymbol.toUpperCase()] ?? Number(data.fromCoin?.decimals ?? o.from_decimals ?? 9);
  const toDecimals = TOKEN_DECIMALS[toSymbol.toUpperCase()] ?? Number(data.toCoin?.decimals ?? o.to_decimals ?? 9);

  const amount = Number(o.amount ?? 0);
  const initialAmount = Number(o.initial_amount ?? 0);
  const priceRate = Number(o.price_rate ?? 0);
  const slippage = Number(o.slippage ?? 0);
  const status = String(o.status ?? '');
  const orderId = Number(o.id ?? 0);
  const rawAddress = String(o.raw_address ?? '');
  const createdAt = String(o.created_at ?? '');

  const absAmount = Math.abs(amount);
  const absInitial = Math.abs(initialAmount);
  const filled = Math.max(0, absInitial - absAmount);

  // Price conversion: price_rate is in nano ratio
  // human_price (toSymbol per fromSymbol) = price_rate × 10^(fromDecimals - toDecimals)
  const priceHuman = priceRate > 0 ? priceRate * (10 ** (fromDecimals - toDecimals)) : 0;
  const priceInverted = priceHuman > 0 ? 1 / priceHuman : 0;

  // Estimated total in target token
  const fromHuman = absInitial / 10 ** fromDecimals;
  const estToHuman = priceHuman > 0 ? fromHuman * priceHuman : 0;

  // Slippage: if >1000 it's likely in some scaled format
  const slippagePct = slippage > 10000 ? slippage / 1_000_000 : slippage > 100 ? slippage / 100 : slippage;

  return (
    <Card className="py-0 overflow-hidden">
      <CardContent className="p-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold">#{orderId}</span>
            <Badge className={statusColor(status)}>{status}</Badge>
            <Badge variant="outline" className="font-mono text-[10px]">{fromSymbol} → {toSymbol}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{new Date(createdAt).toLocaleString()}</span>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowRaw(!showRaw)}>
              {showRaw ? 'Hide' : 'Raw'} JSON
            </Button>
          </div>
        </div>

        {/* Summary boxes */}
        <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-md p-2">
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Initial</div>
            <div className="font-mono text-sm font-bold">{nanoToHuman(absInitial, fromDecimals)} {fromSymbol}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{absInitial.toLocaleString()} nano ({fromDecimals}d)</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Remaining</div>
            <div className="font-mono text-sm font-bold">{nanoToHuman(absAmount, fromDecimals)} {fromSymbol}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{absAmount.toLocaleString()} nano</div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">Filled</div>
            <div className="font-mono text-sm font-bold text-green-500">{nanoToHuman(filled, fromDecimals)} {fromSymbol}</div>
            <div className="font-mono text-[10px] text-muted-foreground">{filled.toLocaleString()} nano</div>
          </div>
        </div>

        {/* Price & details */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Price rate (raw)</span>
            <span className="font-mono">{priceRate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">→ {toSymbol} per {fromSymbol}</span>
            <span className="font-mono font-bold">{priceHuman > 0 && priceHuman < 1e15 ? priceHuman.toPrecision(6) : priceRate.toExponential(4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">→ {fromSymbol} per {toSymbol}</span>
            <span className="font-mono">{priceInverted > 0 && priceInverted < 1e15 ? priceInverted.toPrecision(6) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Est. receive ({toSymbol})</span>
            <span className="font-mono font-bold">{estToHuman > 0 && estToHuman < 1e15 ? `${estToHuman.toFixed(4)} ${toSymbol}` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Slippage</span>
            <span className="font-mono">{slippagePct}% <span className="text-muted-foreground/60">(raw: {slippage})</span></span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">From</span>
            <span className="font-mono">{fromSymbol} (id:{String(o.from_coin_id)}, {fromDecimals}d)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">To</span>
            <span className="font-mono">{toSymbol} (id:{String(o.to_coin_id)}, {toDecimals}d)</span>
          </div>
          <div className="flex items-center justify-between col-span-2 gap-2">
            <span className="text-muted-foreground shrink-0">Order address</span>
            <div className="flex items-center gap-1 min-w-0">
              <a href={`https://tonviewer.com/${rawAddress}`} target="_blank" rel="noreferrer"
                className="font-mono text-[10px] text-primary hover:underline truncate">{rawAddress}</a>
              <CopyButton text={rawAddress} />
            </div>
          </div>
        </div>

        {/* Raw JSON */}
        {showRaw && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase">Raw Order JSON</div>
            <pre className="bg-muted rounded-md p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
              {JSON.stringify(o, null, 2)}
            </pre>
            {data.fromCoin && (
              <>
                <div className="text-[10px] font-bold text-muted-foreground uppercase">From Coin (id:{String(o.from_coin_id)})</div>
                <pre className="bg-muted rounded-md p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {JSON.stringify(data.fromCoin, null, 2)}
                </pre>
              </>
            )}
            {data.toCoin && (
              <>
                <div className="text-[10px] font-bold text-muted-foreground uppercase">To Coin (id:{String(o.to_coin_id)})</div>
                <pre className="bg-muted rounded-md p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {JSON.stringify(data.toCoin, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DebugPage() {
  const [addressInput, setAddressInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderData[]>([]);
  const [rawAddress, setRawAddress] = useState('');
  const [searchMode, setSearchMode] = useState('');

  const search = useCallback(async () => {
    const input = addressInput.trim();
    if (!input) return;

    setLoading(true);
    setError(null);
    setOrders([]);

    try {
      let raw: string;
      if (input.startsWith('0:')) {
        raw = input.toLowerCase();
      } else {
        try { raw = Address.parse(input).toRawString(); }
        catch { raw = input.toLowerCase(); }
      }
      setRawAddress(raw);

      const result = await fetchRawOrders(raw);
      setSearchMode(result.mode);

      // Resolve coins
      const coinIds = new Set<number>();
      for (const o of result.orders) {
        const fid = Number(o.from_coin_id ?? 0);
        const tid = Number(o.to_coin_id ?? 0);
        if (fid > 0) coinIds.add(fid);
        if (tid > 0) coinIds.add(tid);
      }

      const coinMap = new Map<number, Record<string, unknown> | null>();
      await Promise.all([...coinIds].map(async (id) => {
        coinMap.set(id, await fetchCoin(id));
      }));

      const resolved: OrderData[] = result.orders.map((o) => ({
        raw: o,
        fromCoin: coinMap.get(Number(o.from_coin_id ?? 0)) ?? null,
        toCoin: coinMap.get(Number(o.to_coin_id ?? 0)) ?? null,
      }));

      resolved.sort((a, b) => new Date(String(b.raw.created_at)).getTime() - new Date(String(a.raw.created_at)).getTime());
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
      <p className="text-sm text-muted-foreground">
        Enter a wallet address (shows all orders) or a single order contract address.
      </p>

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
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          Raw: {rawAddress} <CopyButton text={rawAddress} />
        </div>
      )}

      {error && (
        <Card className="border-red-500/30 bg-red-500/10 py-0">
          <CardContent className="p-3 text-sm text-red-500">{error}</CardContent>
        </Card>
      )}

      {!loading && orders.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {orders.length} order{orders.length !== 1 ? 's' : ''} found
          <Badge variant="outline" className="text-[10px]">
            {searchMode === 'owner' ? 'by wallet/owner' : searchMode === 'order_address' ? 'by order address' : searchMode}
          </Badge>
        </div>
      )}

      {orders.map((data, i) => (
        <OrderCard key={`${data.raw.id}-${i}`} data={data} />
      ))}

      {!loading && orders.length === 0 && rawAddress && !error && (
        <div className="text-center py-8 text-sm text-muted-foreground">No orders found for this address.</div>
      )}
    </div>
  );
}
