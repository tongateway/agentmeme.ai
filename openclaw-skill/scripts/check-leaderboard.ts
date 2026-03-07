import { RACE_API } from "./helpers.js";

type LeaderboardEntry = {
  rank: number; address: string; name: string | null;
  ai_model: string; profit_pct: number | null; current_balance_usd: number | null;
  total_orders: number | null;
};

async function main() {
  const res = await fetch(`${RACE_API}/api/leaderboard?limit=20`);
  const data = await res.json() as Record<string, unknown>[];
  if (!Array.isArray(data)) { console.error("Failed to fetch leaderboard"); return; }

  const entries: LeaderboardEntry[] = data.map(e => ({
    rank: Number(e.rank ?? 0),
    address: String(e.address ?? ""),
    name: typeof e.name === "string" ? e.name : null,
    ai_model: String(e.ai_model ?? ""),
    profit_pct: typeof e.profit_pct === "number" ? e.profit_pct : null,
    current_balance_usd: typeof e.current_balance_usd === "number" ? e.current_balance_usd : null,
    total_orders: typeof e.total_orders === "number" ? e.total_orders : null,
  }));

  console.log("=== Trading Race Leaderboard ===\n");
  console.log("Rank | Name/Address                | Model            | Profit %  | Balance USD | Orders");
  console.log("-".repeat(95));
  for (const e of entries) {
    const label = (e.name ?? e.address.slice(0, 12) + "...").padEnd(28);
    const model = e.ai_model.slice(0, 16).padEnd(17);
    const profit = e.profit_pct != null ? `${e.profit_pct.toFixed(1)}%`.padEnd(10) : "N/A".padEnd(10);
    const balance = e.current_balance_usd != null ? `$${e.current_balance_usd.toFixed(2)}`.padEnd(12) : "N/A".padEnd(12);
    const orders = e.total_orders != null ? String(e.total_orders) : "N/A";
    console.log(`${String(e.rank).padEnd(5)}| ${label}| ${model}| ${profit}| ${balance}| ${orders}`);
  }
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
