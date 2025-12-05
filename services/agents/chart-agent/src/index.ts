// services/agents/chart-agent/src/index.ts
// ChartAgent: FREE - Price history charts via CoinGecko

import path, { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
import express from "express";
import cors from "cors";
import { z } from "zod";

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "chart-agent", pricing: "FREE" }));

const ChartReq = z.object({
  coinId: z.string().min(1).default("avalanche-2"),
  vs: z.string().min(1).default("usd"),
  days: z.number().int().min(1).max(365).default(30),
});

app.post("/chart", async (req, res) => {
  const parsed = ChartReq.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

  const { coinId, vs, days } = parsed.data;

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${encodeURIComponent(vs)}&days=${days}`;
    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) return res.status(502).json({ error: "upstream_failed", status: r.status });

    const j: any = await r.json();
    const prices: [number, number][] = Array.isArray(j?.prices) ? j.prices : [];
    const series = prices.map(([t, price]) => ({ t, price }));

    return res.json({
      coinId,
      vs,
      days,
      series,
      meta: { source: "coingecko", points: series.length, pricing: "FREE" },
    });
  } catch (error: any) {
    console.error("Chart fetch error:", error);
    return res.status(500).json({ error: "fetch_failed", message: error?.message });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4101;
app.listen(port, () => console.log(`chart-agent (FREE) listening on http://localhost:${port}`));
