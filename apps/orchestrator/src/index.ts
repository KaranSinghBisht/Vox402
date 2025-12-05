// apps/orchestrator/src/index.ts
import path, { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import express from "express";
import cors from "cors";
import { z } from "zod";
import { chat as geminiChat, type AgentCall, clearSession } from "./gemini.js";

const app = express();
app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-PAYMENT", "x-payment", "Authorization"],
    exposedHeaders: ["X-PAYMENT-RESPONSE"],
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// ============ Chat Endpoint (Gemini-powered) ============

const ChatReq = z.object({
  text: z.string().min(1),
  walletAddr: z.string().optional(),
  sessionId: z.string().optional(),
});

// Convert Gemini AgentCall to NextAction format for frontend compatibility
type NextAction =
  | { kind: "chart"; args: { coinId: string; days: number; vs: string } }
  | { kind: "wallet"; args: { address: string } }
  | { kind: "portfolio"; args: { address: string } }
  | { kind: "tx_analyzer"; args: { address: string; limit: number } }
  | { kind: "swap"; args: { tokenIn: string; tokenOut: string; amountIn: string; recipient: string; slippageBps?: number } }
  | { kind: "bridge"; args: { token: string; amount: string; fromChain: string; toChain: string; recipient: string } }
  | { kind: "contract_inspector"; args: { contractAddress: string } }
  | { kind: "yield"; args: { amount: string; token: string; strategy: string; userAddress: string } };

function agentCallToNextAction(agentCall: AgentCall, walletAddr?: string): NextAction | null {
  switch (agentCall.agent) {
    case "chart":
      return { kind: "chart", args: agentCall.args };
    case "portfolio":
      return { kind: "portfolio", args: agentCall.args };
    case "tx_analyzer":
      return { kind: "tx_analyzer", args: agentCall.args };
    case "swap":
      // Parse human-readable amount to baseunits
      const amountRaw = agentCall.args.amountIn;
      let amountIn: string;
      const decimals = getTokenDecimals(agentCall.args.tokenIn);
      const m = amountRaw.trim().match(/^(\d+)(?:\.(\d+))?$/);
      if (m) {
        const whole = m[1];
        const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
        amountIn = (BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac || "0")).toString();
      } else {
        amountIn = amountRaw; // Assume already in baseunits
      }
      return {
        kind: "swap",
        args: {
          tokenIn: resolveToken(agentCall.args.tokenIn),
          tokenOut: resolveToken(agentCall.args.tokenOut),
          amountIn,
          recipient: agentCall.args.recipient,
          slippageBps: 50,
        },
      };
    case "bridge":
      return { kind: "bridge", args: agentCall.args };
    case "contract_inspector":
      return { kind: "contract_inspector", args: agentCall.args };
    case "yield":
      return {
        kind: "yield",
        args: {
          amount: agentCall.args.amount,
          token: agentCall.args.token || "USDC",
          strategy: agentCall.args.strategy || "stable_yield",
          userAddress: walletAddr || "",
        },
      };
    default:
      return null;
  }
}

// Token resolution for swap agent - now supports real tokens
const FUJI_USDC = process.env.FUJI_USDC || "0x5425890298aed601595a70AB815c96711a31Bc65";
const FUJI_WAVAX = process.env.FUJI_WAVAX || "0xd00ae08403b9bbb9124bb305c09058e32c39a48c";
const TOKEN_A = process.env.SWAP_AGENT_TOKEN_A;
const TOKEN_B = process.env.SWAP_AGENT_TOKEN_B;

function resolveToken(raw: string): string {
  const t = raw.trim().toLowerCase();
  // Real tokens
  if (t === "usdc") return FUJI_USDC;
  if (t === "avax" || t === "wavax") return FUJI_WAVAX;
  // Mock tokens (legacy)
  if (t === "voxa" && TOKEN_A) return TOKEN_A;
  if (t === "voxb" && TOKEN_B) return TOKEN_B;
  // Address passthrough
  if (/^0x[a-fA-F0-9]{40}$/.test(raw)) return raw;
  return raw;
}

function getTokenDecimals(token: string): number {
  const t = token.trim().toLowerCase();
  if (t === "usdc") return 6;
  return 18; // Default for AVAX and most ERC20s
}

app.post("/chat", async (req, res) => {
  const parsed = ChatReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { text, walletAddr, sessionId } = parsed.data;
  const session = sessionId || `session-${Date.now()}`;

  try {
    const geminiResponse = await geminiChat(text, session, walletAddr);

    let nextAction: NextAction | null = null;
    if (geminiResponse.agentCall) {
      nextAction = agentCallToNextAction(geminiResponse.agentCall, walletAddr);
    }

    return res.json({
      reply: geminiResponse.textReply,
      nextAction,
      sessionId: session,
    });
  } catch (error: any) {
    console.error("Chat error:", error);
    return res.json({
      reply: "I'm having trouble processing that. Please try again.",
      nextAction: null,
      sessionId: session,
    });
  }
});

// Clear session endpoint
app.post("/session/clear", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) {
    clearSession(sessionId);
  }
  return res.json({ ok: true });
});

// ============ Run Endpoint (executes agent calls) ============

const RunReq = z.object({
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chart"), args: z.object({ coinId: z.string(), days: z.number(), vs: z.string() }) }),
    z.object({ kind: z.literal("wallet"), args: z.object({ address: z.string().min(1) }) }),
    z.object({ kind: z.literal("portfolio"), args: z.object({ address: z.string().min(1) }) }),
    z.object({ kind: z.literal("tx_analyzer"), args: z.object({ address: z.string().min(1), limit: z.number().optional() }) }),
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
    z.object({ kind: z.literal("bridge"), args: z.object({ token: z.string(), amount: z.string(), fromChain: z.string(), toChain: z.string(), recipient: z.string() }) }),
    z.object({ kind: z.literal("contract_inspector"), args: z.object({ contractAddress: z.string().min(1) }) }),
    z.object({ kind: z.literal("yield"), args: z.object({ amount: z.string(), token: z.string(), strategy: z.string(), userAddress: z.string() }) }),
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

// Agent URL configuration
const CHART_AGENT_URL = process.env.CHART_AGENT_URL || "http://localhost:4101/chart";
const WALLET_AGENT_URL = process.env.WALLET_AGENT_URL || "http://localhost:4102/balances";
const PORTFOLIO_AGENT_URL = process.env.PORTFOLIO_AGENT_URL || "http://localhost:4104/analyze";
const TX_ANALYZER_AGENT_URL = process.env.TX_ANALYZER_AGENT_URL || "http://localhost:4105/analyze";
const SWAP_AGENT_URL = process.env.SWAP_AGENT_URL || "http://localhost:4103/quote";
const BRIDGE_AGENT_URL = process.env.BRIDGE_AGENT_URL || "http://localhost:4107/bridge";
const CONTRACT_INSPECTOR_AGENT_URL = process.env.CONTRACT_INSPECTOR_AGENT_URL || "http://localhost:4106/inspect";
const YIELD_AGENT_URL = process.env.YIELD_AGENT_URL || "http://localhost:4108/invest";

app.post("/run", async (req, res) => {
  const parsed = RunReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload", details: parsed.error.flatten() });

  const { action } = parsed.data;
  const xPayment = pickXPayment(req, parsed.data.xPayment);

  let agentUrl = "";
  let agentArgs = action.args;

  switch (action.kind) {
    case "chart":
      agentUrl = CHART_AGENT_URL;
      break;
    case "wallet":
    case "portfolio":
      // Both wallet and portfolio use portfolio agent for now
      agentUrl = action.kind === "wallet" ? WALLET_AGENT_URL : PORTFOLIO_AGENT_URL;
      break;
    case "tx_analyzer":
      agentUrl = TX_ANALYZER_AGENT_URL;
      break;
    case "swap":
      agentUrl = SWAP_AGENT_URL;
      break;
    case "bridge":
      agentUrl = BRIDGE_AGENT_URL;
      break;
    case "contract_inspector":
      agentUrl = CONTRACT_INSPECTOR_AGENT_URL;
      break;
    case "yield":
      agentUrl = YIELD_AGENT_URL;
      break;
    default:
      return res.status(400).json({ error: "Unknown action kind" });
  }

  try {
    const { r, body, xPaymentResponse } = await callAgent(agentUrl, agentArgs, xPayment, res);

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
  } catch (error: any) {
    console.error("Run error:", error);
    return res.status(502).json({
      status: "error",
      message: error?.message || "Failed to reach agent",
      hint: `Is the agent running at ${agentUrl}?`
    });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => console.log(`orchestrator listening on http://localhost:${port}`));
