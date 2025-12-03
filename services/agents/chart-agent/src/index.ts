// services/agents/chart-agent/src/index.ts
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });
import express from "express";
import cors from "cors";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, verifyTypedData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

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

// ===== x402 + Avalanche Fuji constants (from Avalanche x402 course) =====
// Network strings + USDC Fuji address documented by Avalanche Builder Hub.  [oai_citation:2‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/02-http-payment-required)
const X402_VERSION = 1 as const;
const NETWORK = "avalanche-fuji" as const;
const CHAIN_ID = 43113 as const;
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const; // USDC Fuji  [oai_citation:3‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/02-http-payment-required)

// EIP-3009 domain in Avalanche guide: name "USD Coin", version "2"  [oai_citation:4‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/03-x-payment-header)
const USDC_EIP712_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: CHAIN_ID,
  verifyingContract: USDC_FUJI,
} as const;

const TRANSFER_WITH_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

// Minimal EIP-3009 ABI
const USDC_EIP3009_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// ===== env =====
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const PAYTO = process.env.CHART_AGENT_PAYTO as `0x${string}` | undefined;
const GAS_PAYER_PK = process.env.CHART_AGENT_GAS_PAYER_PK as `0x${string}` | undefined;
const PRICE_BASEUNITS = process.env.CHART_AGENT_PRICE_BASEUNITS || "10000"; // 0.01 USDC  [oai_citation:5‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/02-http-payment-required)

if (!PAYTO) throw new Error("Missing CHART_AGENT_PAYTO in .env");
if (!GAS_PAYER_PK) throw new Error("Missing CHART_AGENT_GAS_PAYER_PK in .env");

const publicClient = createPublicClient({
  chain: avalancheFuji,
  transport: http(FUJI_RPC_URL),
});

const gasAccount = privateKeyToAccount(GAS_PAYER_PK);
const walletClient = createWalletClient({
  account: gasAccount,
  chain: avalancheFuji,
  transport: http(FUJI_RPC_URL),
});

// replay protection (MVP): memory-only
const used = new Set<string>(); // `${from}:${nonce}`
const inflight = new Set<string>();

// ===== helpers =====
function splitSignature(sig: string): { r: `0x${string}`; s: `0x${string}`; v: number } {
  if (typeof sig !== "string" || !sig.startsWith("0x")) throw new Error("Invalid signature");
  const hex = sig.slice(2);

  // 65-byte signature: r(32) + s(32) + v(1)
  if (hex.length === 130) {
    const r = (`0x${hex.slice(0, 64)}`) as `0x${string}`;
    const s = (`0x${hex.slice(64, 128)}`) as `0x${string}`;
    let v = parseInt(hex.slice(128, 130), 16);
    if (v < 27) v += 27;
    return { r, s, v };
  }

  // 64-byte EIP-2098 compact signature: r(32) + vs(32)
  if (hex.length === 128) {
    const r = (`0x${hex.slice(0, 64)}`) as `0x${string}`;
    const vsHex = `0x${hex.slice(64, 128)}`;
    const vs = BigInt(vsHex);
    const vBit = Number(vs >> 255n);
    const sMask = (1n << 255n) - 1n;
    const sBig = vs & sMask;
    const s = (`0x${sBig.toString(16).padStart(64, "0")}`) as `0x${string}`;
    const v = 27 + vBit;
    return { r, s, v };
  }

  throw new Error("Unsupported signature length");
}

function b64ToUtf8(b64: string) {
  return Buffer.from(b64, "base64").toString("utf8");
}
function utf8ToB64(s: string) {
  return Buffer.from(s, "utf8").toString("base64");
}

function paymentRequired(resourcePath: string, description: string) {
  // 402 response schema matches Avalanche docs  [oai_citation:6‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/02-http-payment-required)
  return {
    x402Version: X402_VERSION,
    accepts: [
      {
        scheme: "exact",
        network: NETWORK,
        maxAmountRequired: PRICE_BASEUNITS,
        resource: resourcePath,
        description,
        payTo: PAYTO,
        asset: USDC_FUJI,
        maxTimeoutSeconds: 60,
      },
    ],
    error: "X-PAYMENT header is required",
  };
}

const ChartReq = z.object({
  coinId: z.string().default("avalanche-2"),
  vs: z.string().default("usd"),
  days: z.number().min(1).max(365).default(30),
});

async function verifyAndSettleX402(req: express.Request, res: express.Response, resourcePath: string) {
  const header = req.header("x-payment") || req.header("X-PAYMENT");
  if (!header) {
    res.status(402).json(paymentRequired(resourcePath, "Access to ChartAgent"));
    return { ok: false as const };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(b64ToUtf8(header));
  } catch {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "Invalid X-PAYMENT encoding" });
    return { ok: false as const };
  }

  // Expected X-PAYMENT shape (Avalanche docs)  [oai_citation:7‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/03-x-payment-header)
  if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "Unsupported x402 payload" });
    return { ok: false as const };
  }

  const signature = parsed?.payload?.signature as `0x${string}` | undefined;
  const authorization = parsed?.payload?.authorization as
    | {
        from: `0x${string}`;
        to: `0x${string}`;
        value: string;
        validAfter: string;
        validBefore: string;
        nonce: `0x${string}`;
      }
    | undefined;

  if (!signature || !authorization) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "Missing signature/authorization" });
    return { ok: false as const };
  }

  // Basic checks against our payment requirements
  if (authorization.to.toLowerCase() !== PAYTO!.toLowerCase()) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "payTo mismatch" });
    return { ok: false as const };
  }
  if (authorization.value !== PRICE_BASEUNITS) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "value must equal maxAmountRequired" });
    return { ok: false as const };
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = Number(authorization.validAfter);
  const validBefore = Number(authorization.validBefore);
  if (!(validAfter <= now && now <= validBefore)) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "authorization not currently valid" });
    return { ok: false as const };
  }

  const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
  if (used.has(key) || inflight.has(key)) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "nonce already used" });
    return { ok: false as const };
  }

  const maxWindow = 60;
  if (Number(authorization.validBefore) - Number(authorization.validAfter) > maxWindow) {
    res
      .status(402)
      .json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "authorization window too long" });
    return { ok: false as const };
  }

  // Verify EIP-712 signature (same typed data as docs)  [oai_citation:8‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/03-x-payment-header)
  const isValidSig = await verifyTypedData({
    address: authorization.from,
    domain: USDC_EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: authorization.from,
      to: authorization.to,
      value: BigInt(authorization.value),
      validAfter: BigInt(authorization.validAfter),
      validBefore: BigInt(authorization.validBefore),
      nonce: authorization.nonce,
    },
    signature,
  });

  if (!isValidSig) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: "invalid signature" });
    return { ok: false as const };
  }

  // Settle onchain by submitting transferWithAuthorization (server pays gas)
  inflight.add(key);

  try {
    const { v, r, s } = splitSignature(signature);
    const txHash = await walletClient.writeContract({
      address: USDC_FUJI,
      abi: USDC_EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [
        authorization.from,
        authorization.to,
        BigInt(authorization.value),
        BigInt(authorization.validAfter),
        BigInt(authorization.validBefore),
        authorization.nonce,
        v,
        r,
        s,
      ],
    });

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Mark nonce used after successful settlement
    used.add(key);

    // X-PAYMENT-RESPONSE schema from Avalanche docs  [oai_citation:9‡Avalanche Builder Hub](https://build.avax.network/academy/blockchain/x402-payment-infrastructure/03-technical-architecture/04-x-payment-response-header)
    const settlement = {
      success: true,
      transaction: txHash,
      network: NETWORK,
      payer: authorization.from,
      errorReason: null,
    };
    res.setHeader("X-PAYMENT-RESPONSE", utf8ToB64(JSON.stringify(settlement)));
    return { ok: true as const, payer: authorization.from, txHash };
  } catch (e: any) {
    res
      .status(402)
      .json({ ...paymentRequired(resourcePath, "Access to ChartAgent"), error: `settlement failed: ${e?.shortMessage ?? e?.message ?? "unknown"}` });
    return { ok: false as const };
  } finally {
    inflight.delete(key);
  }
}

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "chart-agent", payTo: PAYTO, network: NETWORK }));

app.post("/chart", async (req, res) => {
  const resourcePath = "/chart";

  const parsed = ChartReq.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

  const pay = await verifyAndSettleX402(req, res, resourcePath);
  if (!pay.ok) return;

  const { coinId, vs, days } = parsed.data;

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
    meta: { source: "coingecko", points: series.length, paidBy: pay.payer, settlementTx: pay.txHash },
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4101;
app.listen(port, () => console.log(`chart-agent listening on http://localhost:${port}`));
