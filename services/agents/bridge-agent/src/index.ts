// services/agents/bridge-agent/src/index.ts
// BridgeAgent: Cross-chain bridging between testnets (simulated for hackathon)
// In production, this would integrate with LayerZero, Axelar, or CCIP

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
    parseUnits,
    formatUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

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

// ===== env =====
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const PAYTO = (process.env.BRIDGE_AGENT_PAYTO ?? process.env.CHART_AGENT_PAYTO) as `0x${string}` | undefined;
const GAS_PAYER_PK = (process.env.BRIDGE_AGENT_GAS_PAYER_PK ?? process.env.CHART_AGENT_GAS_PAYER_PK) as `0x${string}` | undefined;
const PRICE_BASEUNITS = process.env.BRIDGE_AGENT_PRICE_BASEUNITS || "10000"; // 0.01 USDC

if (!PAYTO) throw new Error("Missing BRIDGE_AGENT_PAYTO (or CHART_AGENT_PAYTO) in .env");
if (!GAS_PAYER_PK) throw new Error("Missing BRIDGE_AGENT_GAS_PAYER_PK (or CHART_AGENT_GAS_PAYER_PK) in .env");

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

// Supported chains for bridging (simulated)
const SUPPORTED_CHAINS: Record<string, { name: string; chainId: number; bridgeFee: string; estimatedTime: string }> = {
    "avalanche-fuji": { name: "Avalanche Fuji", chainId: 43113, bridgeFee: "0.001", estimatedTime: "~10 seconds" },
    "base-sepolia": { name: "Base Sepolia", chainId: 84532, bridgeFee: "0.002", estimatedTime: "~2 minutes" },
    "ethereum-sepolia": { name: "Ethereum Sepolia", chainId: 11155111, bridgeFee: "0.003", estimatedTime: "~5 minutes" },
    "arbitrum-sepolia": { name: "Arbitrum Sepolia", chainId: 421614, bridgeFee: "0.0015", estimatedTime: "~3 minutes" },
};

// Replay protection
const used = new Set<string>();
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
        res.status(402).json(paymentRequired(resourcePath, "Access to BridgeAgent"));
        return { ok: false as const };
    }

    let parsed: any;
    try {
        parsed = JSON.parse(b64ToUtf8(header));
    } catch {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "Invalid X-PAYMENT encoding" });
        return { ok: false as const };
    }

    if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "Unsupported x402 payload" });
        return { ok: false as const };
    }

    const signature = parsed?.payload?.signature as `0x${string}` | undefined;
    const authorization = parsed?.payload?.authorization as
        | { from: `0x${string}`; to: `0x${string}`; value: string; validAfter: string; validBefore: string; nonce: `0x${string}` }
        | undefined;

    if (!signature || !authorization) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "Missing signature/authorization" });
        return { ok: false as const };
    }

    if (authorization.to.toLowerCase() !== PAYTO!.toLowerCase()) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "payTo mismatch" });
        return { ok: false as const };
    }
    if (authorization.value !== PRICE_BASEUNITS) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "value must equal maxAmountRequired" });
        return { ok: false as const };
    }

    const now = Math.floor(Date.now() / 1000);
    const validAfter = Number(authorization.validAfter);
    const validBefore = Number(authorization.validBefore);
    if (!(validAfter <= now && now <= validBefore)) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "authorization not currently valid" });
        return { ok: false as const };
    }

    const maxWindow = 60;
    if (Number(authorization.validBefore) - Number(authorization.validAfter) > maxWindow) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "authorization window too long" });
        return { ok: false as const };
    }

    const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
    if (used.has(key) || inflight.has(key)) {
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "nonce already used" });
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
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: "invalid signature" });
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
        res.status(402).json({ ...paymentRequired(resourcePath, "Access to BridgeAgent"), error: `settlement failed: ${e?.shortMessage ?? e?.message ?? "unknown"}` });
        return { ok: false as const };
    } finally {
        inflight.delete(key);
    }
}

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "bridge-agent", payTo: PAYTO, network: NETWORK, supportedChains: Object.keys(SUPPORTED_CHAINS) }));

const BridgeReq = z.object({
    token: z.string(),
    amount: z.string(),
    fromChain: z.string(),
    toChain: z.string(),
    recipient: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.post("/bridge", async (req, res) => {
    const resourcePath = "/bridge";
    const parsed = BridgeReq.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

    const pay = await verifyAndSettleX402(req, res, resourcePath);
    if (!pay.ok) return;

    const { token, amount, fromChain, toChain, recipient } = parsed.data;

    // Validate chains
    const sourceChain = SUPPORTED_CHAINS[fromChain];
    const destChain = SUPPORTED_CHAINS[toChain];

    if (!sourceChain) {
        return res.status(400).json({ error: "unsupported_source_chain", supported: Object.keys(SUPPORTED_CHAINS) });
    }
    if (!destChain) {
        return res.status(400).json({ error: "unsupported_destination_chain", supported: Object.keys(SUPPORTED_CHAINS) });
    }
    if (fromChain === toChain) {
        return res.status(400).json({ error: "same_chain", message: "Source and destination chains must be different" });
    }

    // Generate simulated bridge quote
    // In production, this would call LayerZero/Axelar/CCIP APIs
    const bridgeFee = Number(sourceChain.bridgeFee) + Number(destChain.bridgeFee);
    const amountNum = parseFloat(amount);
    const amountAfterFee = Math.max(0, amountNum - bridgeFee);

    const quote = {
        token,
        inputAmount: amount,
        outputAmount: amountAfterFee.toFixed(6),
        bridgeFee: bridgeFee.toFixed(6),
        estimatedTime: destChain.estimatedTime,
        route: {
            from: {
                chain: fromChain,
                chainId: sourceChain.chainId,
                name: sourceChain.name,
            },
            to: {
                chain: toChain,
                chainId: destChain.chainId,
                name: destChain.name,
            },
        },
        recipient,
        status: "quote_ready",
        note: "⚠️ This is a simulated quote for hackathon demo. In production, this would integrate with LayerZero, Axelar, or Chainlink CCIP for real cross-chain transfers.",
    };

    // Generate human-readable summary
    const summary = [
        `🌉 Bridge Quote: ${amount} ${token.toUpperCase()}`,
        `From: ${sourceChain.name} → To: ${destChain.name}`,
        `Bridge Fee: ${bridgeFee.toFixed(6)} ${token.toUpperCase()}`,
        `You'll receive: ~${amountAfterFee.toFixed(6)} ${token.toUpperCase()}`,
        `Estimated time: ${destChain.estimatedTime}`,
        `Recipient: ${recipient.slice(0, 10)}...${recipient.slice(-8)}`,
    ].join("\n");

    return res.json({
        quote,
        summary,
        meta: { paidBy: pay.payer, settlementTx: pay.txHash },
    });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4107;
app.listen(port, () => console.log(`bridge-agent listening on http://localhost:${port}`));
