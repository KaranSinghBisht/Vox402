// apps/orchestrator/src/index.ts
import express from "express";
import cors from "cors";
import { z } from "zod";

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-PAYMENT"],
    exposedHeaders: ["X-PAYMENT-RESPONSE"],
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

const ChatReq = z.object({ text: z.string().min(1) });

type NextAction =
  | { kind: "chart"; args: { coinId: string; days: number; vs: string } }
  | { kind: "wallet"; args: {} }
  | { kind: "swap"; args: {} };

app.post("/chat", (req, res) => {
  const parsed = ChatReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const text = parsed.data.text.toLowerCase();

  let reply = "Try: “Show AVAX 30d chart”.";
  let nextAction: NextAction | null = null;

  if (text.includes("chart") || text.includes("avax")) {
    reply =
      "I can fetch your AVAX price history. I’ll ask ChartAgent, which will return HTTP 402 with x402 payment requirements. You’ll sign a USDC authorization and I’ll retry.";
    nextAction = { kind: "chart", args: { coinId: "avalanche-2", days: 30, vs: "usd" } };
  }

  return res.json({ reply, nextAction });
});

const RunReq = z.object({
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chart"), args: z.object({ coinId: z.string(), days: z.number(), vs: z.string() }) }),
    z.object({ kind: z.literal("wallet"), args: z.object({}).passthrough() }),
    z.object({ kind: z.literal("swap"), args: z.object({}).passthrough() }),
  ]),
  xPayment: z.string().optional(),
});

app.post("/run", async (req, res) => {
  const parsed = RunReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { action } = parsed.data;
  const xPayment = req.header("x-payment") ?? req.header("X-PAYMENT") ?? parsed.data.xPayment;

  if (action.kind !== "chart") {
    return res.json({ status: "todo", message: `${action.kind} not wired yet.` });
  }

  const agentUrl = "http://localhost:4101/chart";
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (xPayment) headers["X-PAYMENT"] = xPayment;

  const r = await fetch(agentUrl, { method: "POST", headers, body: JSON.stringify(action.args) });

  // forward x402 settlement header if present
  const xPaymentResponse = r.headers.get("x-payment-response") || r.headers.get("X-PAYMENT-RESPONSE");
  if (xPaymentResponse) res.setHeader("X-PAYMENT-RESPONSE", xPaymentResponse);

  const body = await r.json().catch(() => ({}));

  if (r.status === 402) {
    return res.status(402).json({
      status: "payment_required",
      // this body is the Payment Required Response JSON
      ...body,
    });
  }

  if (!r.ok) {
    return res.status(502).json({ status: "error", upstream_status: r.status, body });
  }

  return res.json({
    status: "ok",
    result: body,
    xPaymentResponse, // base64 settlement JSON (client can decode and show tx hash)
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => console.log(`orchestrator listening on http://localhost:${port}`));
