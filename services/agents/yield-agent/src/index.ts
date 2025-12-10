// services/agents/yield-agent/src/index.ts
// YieldAgent: Multi-step DeFi - "Invest $X in stable yield"
// Orchestrates: check balance → swap if needed → deposit into yield pool

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

// Real ERC4626 Yield Vault deployed on Fuji
const YIELD_VAULT_ADDRESS = "0xd2A081B94871FFE6653273ceC967f9dFbD7F8764" as const;

// Yield strategies
const YIELD_STRATEGIES = {
    stable_yield: {
        name: "Stable USDC Vault",
        apy: 8.5,
        token: USDC_FUJI,
        tokenSymbol: "USDC",
        description: "Low-risk USDC lending pool",
    },
    avax_staking: {
        name: "AVAX Staking",
        apy: 5.2,
        token: WAVAX_FUJI,
        tokenSymbol: "WAVAX",
        description: "Native AVAX liquid staking",
    },
};

// ABIs
const ERC20_ABI = [
    { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "success", type: "bool" }] },
    { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

// ERC4626 Vault ABI
const VAULT_ABI = [
    { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [{ name: "shares", type: "uint256" }] },
    { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }], outputs: [{ name: "shares", type: "uint256" }] },
    { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "convertToAssets", stateMutability: "view", inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "assets", type: "uint256" }] },
    { type: "function", name: "getUserPosition", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "shares", type: "uint256" }, { name: "assets", type: "uint256" }, { name: "depositTime", type: "uint256" }, { name: "pendingYield", type: "uint256" }] },
] as const;

// x402 Payment constants
const USDC_EIP712_DOMAIN = { name: "USD Coin", version: "2", chainId: CHAIN_ID, verifyingContract: USDC_FUJI } as const;
const TRANSFER_WITH_AUTH_TYPES = {
    TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
    ],
} as const;
const USDC_EIP3009_ABI = [{
    type: "function", name: "transferWithAuthorization", stateMutability: "nonpayable",
    inputs: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
        { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" },
    ],
    outputs: [],
}] as const;

// ===== Client setup =====
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const PAYTO = (process.env.YIELD_AGENT_PAYTO || process.env.CHART_AGENT_PAYTO) as Address | undefined;
const GAS_PAYER_PK = (process.env.YIELD_AGENT_GAS_PAYER_PK || process.env.CHART_AGENT_GAS_PAYER_PK) as `0x${string}` | undefined;
const PRICE_BASEUNITS = process.env.YIELD_AGENT_PRICE_BASEUNITS || "10000"; // 0.01 USDC

if (!PAYTO) throw new Error("Missing YIELD_AGENT_PAYTO in .env");
if (!GAS_PAYER_PK) throw new Error("Missing YIELD_AGENT_GAS_PAYER_PK in .env");

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC_URL) });
const gasAccount = privateKeyToAccount(GAS_PAYER_PK);
const walletClient = createWalletClient({ account: gasAccount, chain: avalancheFuji, transport: http(FUJI_RPC_URL) });

// Replay protection
const used = new Set<string>();
const inflight = new Set<string>();

// ===== Helpers =====
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

function paymentRequired(resourcePath: string) {
    return {
        x402Version: X402_VERSION,
        accepts: [{ scheme: "exact", network: NETWORK, maxAmountRequired: PRICE_BASEUNITS, resource: resourcePath, description: "Access to YieldAgent", payTo: PAYTO, asset: USDC_FUJI, maxTimeoutSeconds: 60 }],
        error: "X-PAYMENT header is required",
    };
}

async function verifyAndSettleX402(req: express.Request, res: express.Response, resourcePath: string) {
    const header = req.header("x-payment") || req.header("X-PAYMENT");
    if (!header) { res.status(402).json(paymentRequired(resourcePath)); return { ok: false as const }; }

    let parsed: any;
    try { parsed = JSON.parse(b64ToUtf8(header)); } catch { res.status(402).json({ ...paymentRequired(resourcePath), error: "Invalid X-PAYMENT" }); return { ok: false as const }; }

    if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
        res.status(402).json({ ...paymentRequired(resourcePath), error: "Unsupported x402" }); return { ok: false as const };
    }

    const signature = parsed?.payload?.signature as `0x${string}` | undefined;
    const authorization = parsed?.payload?.authorization as { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` } | undefined;
    if (!signature || !authorization) { res.status(402).json({ ...paymentRequired(resourcePath), error: "Missing signature" }); return { ok: false as const }; }
    if (authorization.to.toLowerCase() !== PAYTO!.toLowerCase() || authorization.value !== PRICE_BASEUNITS) {
        res.status(402).json({ ...paymentRequired(resourcePath), error: "Payment mismatch" }); return { ok: false as const };
    }

    const now = Math.floor(Date.now() / 1000);
    if (!(Number(authorization.validAfter) <= now && now <= Number(authorization.validBefore))) {
        res.status(402).json({ ...paymentRequired(resourcePath), error: "Authorization expired" }); return { ok: false as const };
    }

    const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
    if (used.has(key) || inflight.has(key)) { res.status(402).json({ ...paymentRequired(resourcePath), error: "Nonce used" }); return { ok: false as const }; }

    const isValidSig = await verifyTypedData({
        address: authorization.from, domain: USDC_EIP712_DOMAIN, types: TRANSFER_WITH_AUTH_TYPES,
        primaryType: "TransferWithAuthorization",
        message: { from: authorization.from, to: authorization.to, value: BigInt(authorization.value), validAfter: BigInt(authorization.validAfter), validBefore: BigInt(authorization.validBefore), nonce: authorization.nonce },
        signature,
    });
    if (!isValidSig) { res.status(402).json({ ...paymentRequired(resourcePath), error: "Invalid signature" }); return { ok: false as const }; }

    inflight.add(key);
    try {
        const { v, r, s } = splitSignature(signature);
        const txHash = await walletClient.writeContract({
            address: USDC_FUJI, abi: USDC_EIP3009_ABI, functionName: "transferWithAuthorization",
            args: [authorization.from, authorization.to, BigInt(authorization.value), BigInt(authorization.validAfter), BigInt(authorization.validBefore), authorization.nonce, v, r, s],
        });
        await publicClient.waitForTransactionReceipt({ hash: txHash });
        used.add(key);
        res.setHeader("X-PAYMENT-RESPONSE", utf8ToB64(JSON.stringify({ success: true, transaction: txHash, network: NETWORK, payer: authorization.from })));
        return { ok: true as const, payer: authorization.from, txHash };
    } catch (e: any) {
        res.status(402).json({ ...paymentRequired(resourcePath), error: `Settlement failed: ${e?.message}` });
        return { ok: false as const };
    } finally { inflight.delete(key); }
}

// ===== Routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "yield-agent", strategies: Object.keys(YIELD_STRATEGIES), pricing: "0.01 USDC (x402)" }));

const InvestReq = z.object({
    amount: z.string().regex(/^\d+(\.\d+)?$/), // Human-readable amount like "5" or "0.1"
    token: z.string().optional().default("USDC"), // Token to invest
    strategy: z.string().optional().default("stable_yield"),
    userAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.post("/invest", async (req, res) => {
    const parsed = InvestReq.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

    const pay = await verifyAndSettleX402(req, res, "/invest");
    if (!pay.ok) return;

    const { amount, token, strategy, userAddress } = parsed.data;
    const strategyInfo = YIELD_STRATEGIES[strategy as keyof typeof YIELD_STRATEGIES] || YIELD_STRATEGIES.stable_yield;
    const userAddr = userAddress as Address;

    try {
        // Parse amount to base units (USDC = 6 decimals)
        const decimals = token.toUpperCase() === "USDC" ? 6 : 18;
        const amountBn = parseUnits(amount, decimals);
        const tokenAddress = token.toUpperCase() === "USDC" ? USDC_FUJI : WAVAX_FUJI;

        // Check user's token balance
        const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [userAddr],
        }) as bigint;

        const hasEnoughBalance = balance >= amountBn;

        // Check current allowance for vault
        const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [userAddr, YIELD_VAULT_ADDRESS],
        }) as bigint;

        const needsApproval = allowance < amountBn;

        // Build execution steps
        const steps: Array<{ step: number; type: string; description: string; tx?: any; status: string }> = [];

        // Step 1: Approve (if needed)
        if (needsApproval) {
            steps.push({
                step: 1,
                type: "approve",
                description: `Approve ${strategyInfo.tokenSymbol} for yield vault`,
                tx: {
                    to: tokenAddress,
                    data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [YIELD_VAULT_ADDRESS, amountBn] }),
                    value: "0",
                },
                status: "pending",
            });
        }

        // Step 2: Deposit into ERC4626 vault
        steps.push({
            step: needsApproval ? 2 : 1,
            type: "deposit",
            description: `Deposit ${amount} ${strategyInfo.tokenSymbol} into ${strategyInfo.name}`,
            tx: {
                to: YIELD_VAULT_ADDRESS,
                data: encodeFunctionData({ abi: VAULT_ABI, functionName: "deposit", args: [amountBn, userAddr] }),
                value: "0",
            },
            status: "pending",
        });

        // Calculate estimated yield (1 year)
        const estimatedYieldYear = (Number(amount) * strategyInfo.apy) / 100;

        const summary = [
            `📈 Investment Plan: ${strategyInfo.name}`,
            ``,
            `Amount: ${amount} ${strategyInfo.tokenSymbol}`,
            `Strategy: ${strategyInfo.description}`,
            `APY: ${strategyInfo.apy}%`,
            `Est. Yield (1yr): +${estimatedYieldYear.toFixed(4)} ${strategyInfo.tokenSymbol}`,
            ``,
            hasEnoughBalance ? `✅ You have enough ${strategyInfo.tokenSymbol}` : `⚠️ Insufficient balance (have: ${formatUnits(balance, decimals)})`,
            needsApproval ? `⚠️ Approval needed first` : `✅ Already approved`,
            ``,
            `Steps: ${steps.length}`,
            ...steps.map(s => `  ${s.step}. ${s.description}`),
        ].join("\n");

        return res.json({
            strategy: strategyInfo,
            amount,
            amountBaseUnits: amountBn.toString(),
            tokenAddress,
            vaultAddress: YIELD_VAULT_ADDRESS,
            userBalance: balance.toString(),
            userBalanceFormatted: formatUnits(balance, decimals),
            hasEnoughBalance,
            needsApproval,
            steps,
            estimatedApy: strategyInfo.apy,
            estimatedYieldYear: estimatedYieldYear.toFixed(4),
            chainId: CHAIN_ID,
            summary,
            meta: { paidBy: pay.payer, settlementTx: pay.txHash },
        });
    } catch (error: any) {
        console.error("Invest error:", error);
        return res.status(500).json({ error: "invest_failed", message: error?.message });
    }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4108;
app.listen(port, () => console.log(`yield-agent listening on http://localhost:${port}`));
