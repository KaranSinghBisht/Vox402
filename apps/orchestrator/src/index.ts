// apps/orchestrator/src/index.ts
import express from "express";
import cors from "cors";
import { z } from "zod";

const app = express();
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-PAYMENT", "x-payment", "Authorization"],
    exposedHeaders: ["X-PAYMENT-RESPONSE"],
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

const ChatReq = z.object({
  text: z.string().min(1),
  walletAddr: z.string().optional(), // passed from web UI if connected
});

type NextAction =
  | { kind: "chart"; args: { coinId: string; days: number; vs: string } }
  | { kind: "wallet"; args: { address: string } }
  | { kind: "swap"; args: { tokenIn: string; tokenOut: string; amountIn: string; recipient: string; slippageBps?: number } };

app.post("/chat", (req, res) => {
  const parsed = ChatReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const text = parsed.data.text.toLowerCase();
  const walletAddr = parsed.data.walletAddr;

  let reply = "Try: “Show AVAX 30d chart” or “Show my USDC balance”.";
  let nextAction: NextAction | null = null;

  if (text.includes("chart") || text.includes("avax")) {
    reply =
      "I can fetch your AVAX price history. I’ll ask ChartAgent (x402-gated). You’ll sign a USDC authorization and I’ll retry.";
    nextAction = { kind: "chart", args: { coinId: "avalanche-2", days: 30, vs: "usd" } };
  } else if (text.includes("balance") || text.includes("funds") || text.includes("my usdc")) {
    if (!walletAddr) {
      reply = "Connect your wallet first, then ask again (I need your address).";
      nextAction = null;
    } else {
      reply =
        "Got it. I’ll ask WalletAgent for your AVAX + USDC balances (x402-gated). You’ll sign a USDC authorization and I’ll retry.";
      nextAction = { kind: "wallet", args: { address: walletAddr } };
    }
  } else if (text.includes("swap") || text.includes("quote swap") || text.includes("quote")) {
    if (!walletAddr) {
      reply = "Connect your wallet first (I need a recipient address).";
      nextAction = null;
    } else {
      // env mappings (your seeded mock tokens)
      const TOKEN_A = process.env.SWAP_AGENT_TOKEN_A; // VOXA
      const TOKEN_B = process.env.SWAP_AGENT_TOKEN_B; // VOXB

      const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);

      const resolveToken = (raw: string) => {
        const t = raw.trim().toLowerCase();
        if (t === "voxa" && TOKEN_A) return TOKEN_A;
        if (t === "voxb" && TOKEN_B) return TOKEN_B;
        if (isAddr(raw)) return raw;
        return null;
      };

      const parseHumanToBase18 = (rawAmt: string) => {
        // simple decimal -> 18dp baseunits (good for your MockERC20 18 decimals)
        // examples: "1" -> 1e18, "0.5" -> 5e17, "12.34" -> 12340000000000000000
        const m = rawAmt.trim().match(/^(\d+)(?:\.(\d+))?$/);
        if (!m) return null;
        const whole = m[1];
        const frac = (m[2] ?? "").slice(0, 18).padEnd(18, "0");
        return (BigInt(whole) * 10n ** 18n + BigInt(frac || "0")).toString();
      };

      // try to detect patterns like:
      // "quote swap 1 voxa to voxb"
      // "swap 0.25 voxa for voxb"
      // "swap 1000000000000000000 0x... to 0x..."
      const words = text.replace(/[,]/g, " ").split(/\s+/).filter(Boolean);

      const swapIdx = words.indexOf("swap");
      let amountRaw: string | null = null;
      let tokenInRaw: string | null = null;
      let tokenOutRaw: string | null = null;

      if (swapIdx >= 0) {
        amountRaw = words[swapIdx + 1] ?? null;
        tokenInRaw = words[swapIdx + 2] ?? null;

        // find "to"/"for"/"into" and use next word as tokenOut
        const toIdx =
          words.indexOf("to", swapIdx) >= 0
            ? words.indexOf("to", swapIdx)
            : words.indexOf("for", swapIdx) >= 0
            ? words.indexOf("for", swapIdx)
            : words.indexOf("into", swapIdx) >= 0
            ? words.indexOf("into", swapIdx)
            : -1;

        tokenOutRaw = toIdx >= 0 ? (words[toIdx + 1] ?? null) : null;
      }

      // resolve tokens
      const tokenIn = tokenInRaw ? resolveToken(tokenInRaw) : null;
      const tokenOut = tokenOutRaw ? resolveToken(tokenOutRaw) : null;

      // amount: allow baseunits if it's huge integer, otherwise treat as human-decimal (18dp)
      let amountIn: string | null = null;
      if (amountRaw) {
        if (/^\d+$/.test(amountRaw) && amountRaw.length > 18) {
          amountIn = amountRaw; // already baseunits
        } else {
          amountIn = parseHumanToBase18(amountRaw);
        }
      }

      if (tokenIn && tokenOut && amountIn) {
        reply =
          "Got it. I’ll ask SwapAgent for a quote (x402-gated). You’ll sign a USDC authorization and I’ll retry.";
        nextAction = {
          kind: "swap",
          args: {
            tokenIn,
            tokenOut,
            amountIn,
            recipient: walletAddr,
            slippageBps: 50,
          },
        };
      } else {
        reply =
          "Swap quote needs: amount + tokenIn + tokenOut. Try: “Quote swap 1 VOXA to VOXB”. (Or provide addresses + baseunits.)";
        nextAction = null;
      }
    }
  }

  return res.json({ reply, nextAction });
});

const RunReq = z.object({
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chart"), args: z.object({ coinId: z.string(), days: z.number(), vs: z.string() }) }),
    z.object({ kind: z.literal("wallet"), args: z.object({ address: z.string().min(1) }) }),
    z.object({
      kind: z.literal("swap"),
      args: z.object({
        tokenIn: z.string(),
        tokenOut: z.string(),
        amountIn: z.string(),
        recipient: z.string(),
        slippageBps: z.number().optional(),
      }),
    }),
  ]),
  xPayment: z.string().optional(),
});

function pickXPayment(req: express.Request, bodyValue?: string) {
  return req.header("x-payment") ?? req.header("X-PAYMENT") ?? bodyValue;
}

async function callAgent(agentUrl: string, args: any, xPayment?: string, res?: express.Response) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (xPayment) headers["X-PAYMENT"] = xPayment;

  const r = await fetch(agentUrl, { method: "POST", headers, body: JSON.stringify(args) });

  const xPaymentResponse = r.headers.get("x-payment-response") || r.headers.get("X-PAYMENT-RESPONSE");
  if (xPaymentResponse && res) res.setHeader("X-PAYMENT-RESPONSE", xPaymentResponse);

  const body = await r.json().catch(() => ({}));
  return { r, body, xPaymentResponse };
}

app.post("/run", async (req, res) => {
  const parsed = RunReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { action } = parsed.data;
  const xPayment = pickXPayment(req, parsed.data.xPayment);

  // configurable endpoints (defaults = local dev ports)
  const CHART_AGENT_URL = process.env.CHART_AGENT_URL || "http://localhost:4101/chart";
  const WALLET_AGENT_URL = process.env.WALLET_AGENT_URL || "http://localhost:4102/balances";
  const SWAP_AGENT_URL = process.env.SWAP_AGENT_URL || "http://localhost:4103/quote";

  let agentUrl = "";
  if (action.kind === "chart") agentUrl = CHART_AGENT_URL;
  if (action.kind === "wallet") agentUrl = WALLET_AGENT_URL;
  if (action.kind === "swap") agentUrl = SWAP_AGENT_URL;

  const { r, body, xPaymentResponse } = await callAgent(agentUrl, action.args, xPayment, res);

  if (r.status === 402) {
    return res.status(402).json({
      status: "payment_required",
      ...body,
    });
  }

  if (!r.ok) {
    return res.status(502).json({ status: "error", upstream_status: r.status, body });
  }

  return res.json({
    status: "ok",
    result: body,
    xPaymentResponse,
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => console.log(`orchestrator listening on http://localhost:${port}`));
