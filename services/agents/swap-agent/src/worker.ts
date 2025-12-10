// services/agents/swap-agent/src/worker.ts
// SwapAgent: Cloudflare Worker version using Hono
// Token swap quotes for USDC <-> WAVAX on Avalanche Fuji

import { Hono, Context } from "hono";
import { cors } from "hono/cors";
import {
    createPublicClient,
    createWalletClient,
    http,
    verifyTypedData,
    encodeFunctionData,
    formatUnits,
    type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

type Env = {
    FUJI_RPC_URL: string;
    CHART_AGENT_PAYTO: string;
    CHART_AGENT_GAS_PAYER_PK: string;
    PRICE_BASEUNITS: string;
};

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use("*", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-PAYMENT", "x-payment", "Authorization"],
    exposeHeaders: ["X-PAYMENT-RESPONSE"],
}));

// ===== Constants =====
const X402_VERSION = 1 as const;
const NETWORK = "avalanche-fuji" as const;
const CHAIN_ID = 43113 as const;
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const WAVAX_FUJI = "0xd00ae08403b9bbb9124bb305c09058e32c39a48c" as const;
const ROUTER = "0x2D99ABD9008Dc933ff5c0CD271B88309593aB921" as Address;

const TOKEN_INFO: Record<string, { symbol: string; decimals: number; name: string }> = {
    [USDC_FUJI.toLowerCase()]: { symbol: "USDC", decimals: 6, name: "USD Coin" },
    [WAVAX_FUJI.toLowerCase()]: { symbol: "WAVAX", decimals: 18, name: "Wrapped AVAX" },
};

// ABIs
const ERC20_ABI = [
    { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const ROUTER_ABI = [
    { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ name: "amountIn", type: "uint256" }, { name: "path", type: "address[]" }], outputs: [{ name: "amounts", type: "uint256[]" }] },
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

const USDC_EIP3009_ABI = [{
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
}] as const;

// Replay protection (note: Workers are stateless, so this only works per-invocation)
// For production, use KV or D1 for persistent nonce tracking
const used = new Set<string>();

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

// Base64 helpers (Workers-compatible)
function b64ToUtf8(b64: string): string {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
}

function utf8ToB64(s: string): string {
    return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

function paymentRequired(resourcePath: string, payTo: string, priceBaseunits: string) {
    return {
        x402Version: X402_VERSION,
        accepts: [{
            scheme: "exact",
            network: NETWORK,
            maxAmountRequired: priceBaseunits,
            resource: resourcePath,
            description: "Access to SwapAgent",
            payTo,
            asset: USDC_FUJI,
            maxTimeoutSeconds: 60,
        }],
        error: "X-PAYMENT header is required",
    };
}

// ===== Routes =====
app.get("/health", (c: Context<{ Bindings: Env }>) => {
    return c.json({ ok: true, agent: "swap-agent", router: ROUTER, pricing: "0.01 USDC (x402)" });
});

app.post("/quote", async (c: Context<{ Bindings: Env }>) => {
    const env = c.env;
    const PAYTO = env.CHART_AGENT_PAYTO as Address;
    const GAS_PAYER_PK = env.CHART_AGENT_GAS_PAYER_PK as `0x${string}`;
    const PRICE_BASEUNITS = env.PRICE_BASEUNITS || "10000";
    const FUJI_RPC_URL = env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";

    if (!PAYTO || !GAS_PAYER_PK) {
        return c.json({ error: "Missing payment configuration" }, 500);
    }

    // Verify x402 payment
    const header = c.req.header("x-payment") || c.req.header("X-PAYMENT");
    if (!header) {
        return c.json(paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), 402);
    }

    let parsed: any;
    try {
        parsed = JSON.parse(b64ToUtf8(header));
    } catch {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "Invalid X-PAYMENT" }, 402);
    }

    if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "Unsupported x402" }, 402);
    }

    const signature = parsed?.payload?.signature as `0x${string}` | undefined;
    const authorization = parsed?.payload?.authorization as {
        from: Address;
        to: Address;
        value: string;
        validAfter: string;
        validBefore: string;
        nonce: `0x${string}`;
    } | undefined;

    if (!signature || !authorization) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "Missing signature/authorization" }, 402);
    }

    if (authorization.to.toLowerCase() !== PAYTO.toLowerCase()) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "payTo mismatch" }, 402);
    }

    if (authorization.value !== PRICE_BASEUNITS) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "value mismatch" }, 402);
    }

    const now = Math.floor(Date.now() / 1000);
    if (!(Number(authorization.validAfter) <= now && now <= Number(authorization.validBefore))) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "authorization expired" }, 402);
    }

    const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
    if (used.has(key)) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "nonce already used" }, 402);
    }

    // Verify signature
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
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: "invalid signature" }, 402);
    }

    // Settle payment on-chain
    const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC_URL) });
    const gasAccount = privateKeyToAccount(GAS_PAYER_PK);
    const walletClient = createWalletClient({ account: gasAccount, chain: avalancheFuji, transport: http(FUJI_RPC_URL) });

    let txHash: `0x${string}`;
    try {
        const { v, r, s } = splitSignature(signature);
        txHash = await walletClient.writeContract({
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
    } catch (e: any) {
        return c.json({ ...paymentRequired("/quote", PAYTO, PRICE_BASEUNITS), error: `settlement failed: ${e?.shortMessage || e?.message}` }, 402);
    }

    // Payment verified - process swap request
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "invalid_payload" }, 400);
    }

    const { tokenIn, tokenOut, amountIn, recipient, slippageBps = 50 } = body;

    if (!tokenIn || !tokenOut || !amountIn || !recipient) {
        return c.json({ error: "Missing required fields: tokenIn, tokenOut, amountIn, recipient" }, 400);
    }

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
        } catch {
            // Simulated quote if router fails
            simulated = true;
            if (tokenIn.toLowerCase() === USDC_FUJI.toLowerCase()) {
                amountOut = (amountInBn * BigInt(5)) / BigInt(100);
            } else {
                amountOut = amountInBn * BigInt(20);
            }
            amountOut = (amountOut * BigInt(10 ** tokenOutInfo.decimals)) / BigInt(10 ** tokenInInfo.decimals);
        }

        const minOut = (amountOut * BigInt(10000 - slippageBps)) / 10000n;
        const rate = Number(amountOut) / Number(amountInBn) * Math.pow(10, tokenInInfo.decimals - tokenOutInfo.decimals);

        // Build approve tx data if needed
        const approveTx = needsApproval ? {
            to: tokenInAddr,
            data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [ROUTER, amountInBn] }),
            value: "0",
        } : null;

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
            needsApproval ? `⚠️ Approval needed first` : `✅ Token already approved`,
            simulated ? `⚠️ Simulated quote (router may lack liquidity)` : ``,
        ].filter(Boolean).join("\n");

        const settlement = { success: true, transaction: txHash, network: NETWORK, payer: authorization.from };

        return c.json({
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
            swapArgs,
            chainId: CHAIN_ID,
            summary,
            meta: { paidBy: authorization.from, settlementTx: txHash },
        }, {
            headers: {
                "X-PAYMENT-RESPONSE": utf8ToB64(JSON.stringify(settlement)),
            },
        });
    } catch (error: any) {
        console.error("Quote error:", error);
        return c.json({ error: "quote_failed", message: error?.message }, 500);
    }
});

export default app;
