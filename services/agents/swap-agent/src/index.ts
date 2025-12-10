// services/agents/swap-agent/src/index.ts
// SwapAgent: Token swap quotes + execution for USDC <-> WAVAX on Avalanche Fuji

import path, { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import express from "express";
import cors from "cors";
import { z } from "zod";
import {
  createPublicClient,
  createWalletClient,
  http,
  verifyTypedData,
  encodeFunctionData,
  formatUnits,
  parseUnits,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const app = express();
app.use(
  cors({
    origin: true, // Allow all origins for Railway deployment
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-PAYMENT", "x-payment", "Authorization"],
    exposedHeaders: ["X-PAYMENT-RESPONSE"],
  })
);
app.use(express.json());

// ===== Constants =====
const X402_VERSION = 1 as const;
const NETWORK = "avalanche-fuji" as const;
const CHAIN_ID = 43113 as const;
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const WAVAX_FUJI = "0xd00ae08403b9bbb9124bb305c09058e32c39a48c" as const;

// Router - Pangolin on Fuji
const ROUTER = (process.env.SWAP_AGENT_ROUTER || "0x2D99ABD9008Dc933ff5c0CD271B88309593aB921") as Address;

const TOKEN_INFO: Record<string, { symbol: string; decimals: number; name: string }> = {
  [USDC_FUJI.toLowerCase()]: { symbol: "USDC", decimals: 6, name: "USD Coin" },
  [WAVAX_FUJI.toLowerCase()]: { symbol: "WAVAX", decimals: 18, name: "Wrapped AVAX" },
};

// ABIs
const ERC20_ABI = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

const ROUTER_ABI = [
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForTokens", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactTokensForAVAX", stateMutability: "nonpayable", inputs: [{ name: "amountIn", type: "uint256" }, { name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
  { type: "function", name: "swapExactAVAXForTokens", stateMutability: "payable", inputs: [{ name: "amountOutMin", type: "uint256" }, { name: "path", type: "address[]" }, { name: "to", type: "address" }, { name: "deadline", type: "uint256" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
] as const;

// x402 Payment ABIs
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

// ===== Client setup =====
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const PAYTO = (process.env.SWAP_AGENT_PAYTO || process.env.CHART_AGENT_PAYTO) as Address | undefined;
const GAS_PAYER_PK = (process.env.SWAP_AGENT_GAS_PAYER_PK || process.env.CHART_AGENT_GAS_PAYER_PK) as `0x${string}` | undefined;
const PRICE_BASEUNITS = process.env.SWAP_AGENT_PRICE_BASEUNITS || "10000"; // 0.01 USDC

if (!PAYTO) throw new Error("Missing SWAP_AGENT_PAYTO (or CHART_AGENT_PAYTO) in .env");
if (!GAS_PAYER_PK) throw new Error("Missing SWAP_AGENT_GAS_PAYER_PK (or CHART_AGENT_GAS_PAYER_PK) in .env");

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC_URL) });
const gasAccount = privateKeyToAccount(GAS_PAYER_PK);
const walletClient = createWalletClient({ account: gasAccount, chain: avalancheFuji, transport: http(FUJI_RPC_URL) });

// Replay protection
const used = new Set<string>();
const inflight = new Set<string>();

// ===== Helpers =====
function getTokenInfo(address: string) {
  return TOKEN_INFO[address.toLowerCase()] || { symbol: address.slice(0, 10), decimals: 18, name: "Unknown" };
}

function splitSignature(sig: string): { r: `0x${string}`; s: `0x${string}`; v: number } {
  const hex = sig.slice(2);
  if (hex.length === 130) {
    const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
    const s = `0x${hex.slice(64, 128)}` as `0x${string}`;
    let v = parseInt(hex.slice(128, 130), 16);
    if (v < 27) v += 27;
    return { r, s, v };
  }
  if (hex.length === 128) {
    const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
    const vs = BigInt(`0x${hex.slice(64, 128)}`);
    const v = 27 + Number(vs >> 255n);
    const s = `0x${(vs & ((1n << 255n) - 1n)).toString(16).padStart(64, "0")}` as `0x${string}`;
    return { r, s, v };
  }
  throw new Error("Invalid signature length");
}

function b64ToUtf8(b64: string) { return Buffer.from(b64, "base64").toString("utf8"); }
function utf8ToB64(s: string) { return Buffer.from(s, "utf8").toString("base64"); }

function paymentRequired(resourcePath: string, description: string) {
  return {
    x402Version: X402_VERSION,
    accepts: [{ scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_BASEUNITS, resource: resourcePath, description, payTo: PAYTO, asset: USDC_FUJI, maxTimeoutSeconds: 60 }],
    error: "X-PAYMENT header is required",
  };
}

async function verifyAndSettleX402(req: express.Request, res: express.Response, resourcePath: string) {
  const header = req.header("x-payment") || req.header("X-PAYMENT");
  if (!header) { res.status(402).json(paymentRequired(resourcePath, "Access to SwapAgent")); return { ok: false as const }; }

  let parsed: any;
  try { parsed = JSON.parse(b64ToUtf8(header)); } catch { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "Invalid X-PAYMENT" }); return { ok: false as const }; }

  if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "Unsupported x402" }); return { ok: false as const };
  }

  const signature = parsed?.payload?.signature as `0x${string}` | undefined;
  const authorization = parsed?.payload?.authorization as { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` } | undefined;
  if (!signature || !authorization) { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "Missing signature/authorization" }); return { ok: false as const }; }
  if (authorization.to.toLowerCase() !== PAYTO!.toLowerCase()) { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "payTo mismatch" }); return { ok: false as const }; }
  if (authorization.value !== PRICE_BASEUNITS) { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "value mismatch" }); return { ok: false as const }; }

  const now = Math.floor(Date.now() / 1000);
  if (!(Number(authorization.validAfter) <= now && now <= Number(authorization.validBefore))) { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "authorization expired" }); return { ok: false as const }; }

  const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
  if (used.has(key) || inflight.has(key)) { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "nonce already used" }); return { ok: false as const }; }

  const isValidSig = await verifyTypedData({
    address: authorization.from,
    domain: USDC_EIP712_DOMAIN,
    types: TRANSFER_WITH_AUTH_TYPES,
    primaryType: "TransferWithAuthorization",
    message: { from: authorization.from, to: authorization.to, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore), nonce: authorization.nonce },
    signature,
  });
  if (!isValidSig) { res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: "invalid signature" }); return { ok: false as const }; }

  inflight.add(key);
  try {
    const { v, r, s } = splitSignature(signature);
    const txHash = await walletClient.writeContract({
      address: USDC_FUJI,
      abi: USDC_EIP3009_ABI,
      functionName: "transferWithAuthorization",
      args: [authorization.from, authorization.to, BigInt(authorization.value), BigInt(authorization.validAfter), BigInt(authorization.validBefore), authorization.nonce, v, r, s],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    used.add(key);
    const settlement = { success: true, transaction: txHash, network: NETWORK, payer: authorization.from, errorReason: null };
    res.setHeader("X-PAYMENT-RESPONSE", utf8ToB64(JSON.stringify(settlement)));
    return { ok: true as const, payer: authorization.from, txHash };
  } catch (e: any) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to SwapAgent"), error: `settlement failed: ${e?.shortMessage || e?.message}` });
    return { ok: false as const };
  } finally {
    inflight.delete(key);
  }
}

// ===== Routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "swap-agent", router: ROUTER, pricing: "0.01 USDC (x402)" }));

const QuoteReq = z.object({
  tokenIn: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenOut: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amountIn: z.string().regex(/^\d+$/),
  recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  slippageBps: z.number().int().min(0).max(10000).optional().default(50),
});

app.post("/quote", async (req, res) => {
  const parsed = QuoteReq.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

  const pay = await verifyAndSettleX402(req, res, "/quote");
  if (!pay.ok) return;

  const { tokenIn, tokenOut, amountIn, recipient, slippageBps } = parsed.data;
  const tokenInAddr = tokenIn as Address;
  const tokenOutAddr = tokenOut as Address;
  const recipientAddr = recipient as Address;
  const amountInBn = BigInt(amountIn);

  const tokenInInfo = getTokenInfo(tokenIn);
  const tokenOutInfo = getTokenInfo(tokenOut);

  try {
    // Check current allowance
    const currentAllowance = await publicClient.readContract({
      address: tokenInAddr,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [recipientAddr, ROUTER],
    }) as bigint;

    const needsApproval = currentAllowance < amountInBn;

    // Get quote from router
    let amountOut: bigint;
    let simulated = false;

    try {
      const amounts = await publicClient.readContract({
        address: ROUTER,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInBn, [tokenInAddr, tokenOutAddr]],
      }) as bigint[];
      amountOut = amounts[amounts.length - 1] ?? 0n;
    } catch (e) {
      // Simulated quote if router fails
      simulated = true;
      if (tokenIn.toLowerCase() === USDC_FUJI.toLowerCase()) {
        amountOut = (amountInBn * BigInt(5)) / BigInt(100); // 0.05 AVAX per USDC
      } else {
        amountOut = amountInBn * BigInt(20); // 20 USDC per AVAX
      }
      // Adjust for decimals
      amountOut = (amountOut * BigInt(10 ** tokenOutInfo.decimals)) / BigInt(10 ** tokenInInfo.decimals);
    }

    const minOut = (amountOut * BigInt(10000 - slippageBps)) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min (for quote display only)
    const rate = Number(amountOut) / Number(amountInBn) * Math.pow(10, tokenInInfo.decimals - tokenOutInfo.decimals);

    // Build approve tx data if needed
    const approveTx = needsApproval ? {
      to: tokenInAddr,
      data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [ROUTER, amountInBn] }),
      value: "0",
    } : null;

    // Return swap args for frontend to build tx with fresh deadline
    const swapArgs = {
      amountIn: amountInBn.toString(),
      minOut: minOut.toString(),
      path: [tokenInAddr, tokenOutAddr],
      recipient: recipientAddr,
      router: ROUTER,
    };

    const summary = [
      `💱 Swap Quote`,
      ``,
      `Input: ${formatUnits(amountInBn, tokenInInfo.decimals)} ${tokenInInfo.symbol}`,
      `Output: ~${formatUnits(amountOut, tokenOutInfo.decimals)} ${tokenOutInfo.symbol}`,
      `Min Output: ${formatUnits(minOut, tokenOutInfo.decimals)} ${tokenOutInfo.symbol}`,
      `Rate: 1 ${tokenInInfo.symbol} = ${rate.toFixed(6)} ${tokenOutInfo.symbol}`,
      ``,
      needsApproval ? `⚠️ Approval needed: Click "Approve" first` : `✅ Token already approved`,
      simulated ? `⚠️ Simulated quote (router may lack liquidity)` : ``,
    ].filter(Boolean).join("\n");

    return res.json({
      quote: {
        tokenIn: tokenInAddr,
        tokenOut: tokenOutAddr,
        tokenInSymbol: tokenInInfo.symbol,
        tokenOutSymbol: tokenOutInfo.symbol,
        amountIn: amountInBn.toString(),
        amountInFormatted: formatUnits(amountInBn, tokenInInfo.decimals),
        amountOut: amountOut.toString(),
        amountOutFormatted: formatUnits(amountOut, tokenOutInfo.decimals),
        minOut: minOut.toString(),
        minOutFormatted: formatUnits(minOut, tokenOutInfo.decimals),
        slippageBps,
        rate: rate.toFixed(6),
        simulated,
      },
      needsApproval,
      approveTx,
      swapArgs, // Raw args for frontend to build tx with fresh deadline
      chainId: CHAIN_ID,
      summary,
      meta: { paidBy: pay.payer, settlementTx: pay.txHash },
    });
  } catch (error: any) {
    console.error("Quote error:", error);
    return res.status(500).json({ error: "quote_failed", message: error?.message });
  }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4103;
app.listen(port, () => console.log(`swap-agent listening on http://localhost:${port} (router: ${ROUTER})`));
