// services/agents/wallet-agent/src/index.ts
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
  type Address,
  encodeFunctionData,
} from "viem";
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

// ===== x402 + Fuji constants =====
const X402_VERSION = 1 as const;
const NETWORK = "avalanche-fuji" as const;
const CHAIN_ID = 43113 as const;
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;

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

const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "b", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "d", type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ name: "s", type: "string" }] },
] as const;

// ===== env =====
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

// allow dedicated vars, fallback to chart-agent vars so you can ship faster
const PAYTO =
  (process.env.WALLET_AGENT_PAYTO as `0x${string}` | undefined) ??
  (process.env.CHART_AGENT_PAYTO as `0x${string}` | undefined);

const GAS_PAYER_PK =
  (process.env.WALLET_AGENT_GAS_PAYER_PK as `0x${string}` | undefined) ??
  (process.env.CHART_AGENT_GAS_PAYER_PK as `0x${string}` | undefined);

const PRICE_BASEUNITS = process.env.WALLET_AGENT_PRICE_BASEUNITS || "10000"; // 0.01 USDC default

if (!PAYTO) throw new Error("Missing WALLET_AGENT_PAYTO (or CHART_AGENT_PAYTO) in .env");
if (!GAS_PAYER_PK) throw new Error("Missing WALLET_AGENT_GAS_PAYER_PK (or CHART_AGENT_GAS_PAYER_PK) in .env");

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

function splitSignature(sig: string): { r: `0x${string}`; s: `0x${string}`; v: number } {
  if (typeof sig !== "string" || !sig.startsWith("0x")) throw new Error("Invalid signature");
  const hex = sig.slice(2);

  if (hex.length === 130) {
    const r = (`0x${hex.slice(0, 64)}`) as `0x${string}`;
    const s = (`0x${hex.slice(64, 128)}`) as `0x${string}`;
    let v = parseInt(hex.slice(128, 130), 16);
    if (v < 27) v += 27;
    return { r, s, v };
  }

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

async function verifyAndSettleX402(req: express.Request, res: express.Response, resourcePath: string) {
  const header = req.header("x-payment") || req.header("X-PAYMENT");
  if (!header) {
    res.status(402).json(paymentRequired(resourcePath, "Access to WalletAgent"));
    return { ok: false as const };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(b64ToUtf8(header));
  } catch {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "Invalid X-PAYMENT encoding" });
    return { ok: false as const };
  }

  if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "Unsupported x402 payload" });
    return { ok: false as const };
  }

  const signature = parsed?.payload?.signature as `0x${string}` | undefined;
  const authorization = parsed?.payload?.authorization as
    | { from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` }
    | undefined;

  if (!signature || !authorization) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "Missing signature/authorization" });
    return { ok: false as const };
  }

  if (authorization.to.toLowerCase() !== PAYTO!.toLowerCase()) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "payTo mismatch" });
    return { ok: false as const };
  }
  if (authorization.value !== PRICE_BASEUNITS) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "value must equal maxAmountRequired" });
    return { ok: false as const };
  }

  const now = Math.floor(Date.now() / 1000);
  const validAfter = Number(authorization.validAfter);
  const validBefore = Number(authorization.validBefore);
  if (!(validAfter <= now && now <= validBefore)) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "authorization not currently valid" });
    return { ok: false as const };
  }

  const maxWindow = 60;
  if (Number(authorization.validBefore) - Number(authorization.validAfter) > maxWindow) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "authorization window too long" });
    return { ok: false as const };
  }

  const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
  if (used.has(key) || inflight.has(key)) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "nonce already used" });
    return { ok: false as const };
  }

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
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: "invalid signature" });
    return { ok: false as const };
  }

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
    used.add(key);

    const settlement = { success: true, transaction: txHash, network: NETWORK, payer: authorization.from, errorReason: null };
    res.setHeader("X-PAYMENT-RESPONSE", utf8ToB64(JSON.stringify(settlement)));
    return { ok: true as const, payer: authorization.from, txHash };
  } catch (e: any) {
    res.status(402).json({ ...paymentRequired(resourcePath, "Access to WalletAgent"), error: `settlement failed: ${e?.shortMessage ?? e?.message ?? "unknown"}` });
    return { ok: false as const };
  } finally {
    inflight.delete(key);
  }
}

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "wallet-agent", payTo: PAYTO, network: NETWORK }));

const BalanceReq = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokens: z
    .array(
      z.object({
        address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
        symbol: z.string().optional(),
        decimals: z.number().int().min(0).max(255).optional(),
      })
    )
    .optional(),
});

app.post("/balances", async (req, res) => {
  const resourcePath = "/balances";
  const parsed = BalanceReq.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

  const pay = await verifyAndSettleX402(req, res, resourcePath);
  if (!pay.ok) return;

  const address = parsed.data.address as Address;
  const tokens = parsed.data.tokens ?? [{ address: USDC_FUJI, symbol: "USDC", decimals: 6 }];

  const nativeWei = await publicClient.getBalance({ address });
  const native = {
    symbol: "AVAX",
    wei: nativeWei.toString(),
  };

  const tokenBalances = await Promise.all(
    tokens.map(async (t) => {
      const token = t.address as Address;
      const [bal, dec, sym] = await Promise.all([
        publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }) as Promise<bigint>,
        typeof t.decimals === "number"
          ? Promise.resolve(BigInt(t.decimals))
          : (publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }) as Promise<number>).then((n) => BigInt(n)),
        t.symbol
          ? Promise.resolve(t.symbol)
          : (publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }) as Promise<string>).catch(() => "TOKEN"),
      ]);

      return {
        address: token,
        symbol: sym,
        decimals: Number(dec),
        balance: bal.toString(),
      };
    })
  );

  return res.json({
    address,
    native,
    tokens: tokenBalances,
    meta: { paidBy: pay.payer, settlementTx: pay.txHash },
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4102;
app.listen(port, () => console.log(`wallet-agent listening on http://localhost:${port}`));
