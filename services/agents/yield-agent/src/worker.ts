// services/agents/yield-agent/src/worker.ts
// YieldAgent: Cloudflare Worker version using Hono
// DeFi yield strategies on Avalanche Fuji

import { Hono, Context } from "hono";
import { cors } from "hono/cors";
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
const YIELD_VAULT_ADDRESS = "0xd2A081B94871FFE6653273ceC967f9dFbD7F8764" as const;

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
] as const;

const VAULT_ABI = [
    { type: "function", name: "deposit", stateMutability: "nonpayable", inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [{ name: "shares", type: "uint256" }] },
] as const;

// x402 Payment constants
const USDC_EIP712_DOMAIN = { name: "USD Coin", version: "2", chainId: CHAIN_ID, verifyingContract: USDC_FUJI } as const;

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

const used = new Set<string>();

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
            description: "Access to YieldAgent",
            payTo,
            asset: USDC_FUJI,
            maxTimeoutSeconds: 60,
        }],
        error: "X-PAYMENT header is required",
    };
}

// ===== Routes =====
app.get("/health", (c: Context<{ Bindings: Env }>) => {
    return c.json({ ok: true, agent: "yield-agent", strategies: Object.keys(YIELD_STRATEGIES), pricing: "0.01 USDC (x402)" });
});

app.post("/invest", async (c: Context<{ Bindings: Env }>) => {
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
        return c.json(paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), 402);
    }

    let parsed: any;
    try {
        parsed = JSON.parse(b64ToUtf8(header));
    } catch {
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Invalid X-PAYMENT" }, 402);
    }

    if (parsed?.x402Version !== 1 || parsed?.scheme !== "exact" || parsed?.network !== NETWORK) {
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Unsupported x402" }, 402);
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
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Missing signature" }, 402);
    }

    if (authorization.to.toLowerCase() !== PAYTO.toLowerCase() || authorization.value !== PRICE_BASEUNITS) {
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Payment mismatch" }, 402);
    }

    const now = Math.floor(Date.now() / 1000);
    if (!(Number(authorization.validAfter) <= now && now <= Number(authorization.validBefore))) {
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Authorization expired" }, 402);
    }

    const key = `${authorization.from.toLowerCase()}:${authorization.nonce.toLowerCase()}`;
    if (used.has(key)) {
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Nonce used" }, 402);
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
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: "Invalid signature" }, 402);
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
        return c.json({ ...paymentRequired("/invest", PAYTO, PRICE_BASEUNITS), error: `Settlement failed: ${e?.message}` }, 402);
    }

    // Payment verified - process invest request
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: "invalid_payload" }, 400);
    }

    const { amount, token = "USDC", strategy = "stable_yield", userAddress } = body;

    if (!amount || !userAddress) {
        return c.json({ error: "Missing amount or userAddress" }, 400);
    }

    const strategyInfo = YIELD_STRATEGIES[strategy as keyof typeof YIELD_STRATEGIES] || YIELD_STRATEGIES.stable_yield;
    const userAddr = userAddress as Address;

    try {
        const decimals = token.toUpperCase() === "USDC" ? 6 : 18;
        const amountBn = parseUnits(amount, decimals);
        const tokenAddress = token.toUpperCase() === "USDC" ? USDC_FUJI : WAVAX_FUJI;

        const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [userAddr],
        }) as bigint;

        const hasEnoughBalance = balance >= amountBn;

        const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [userAddr, YIELD_VAULT_ADDRESS],
        }) as bigint;

        const needsApproval = allowance < amountBn;

        const steps: Array<{ step: number; type: string; description: string; tx?: any; status: string }> = [];

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
        ].join("\n");

        const settlement = { success: true, transaction: txHash, network: NETWORK, payer: authorization.from };

        return c.json({
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
            meta: { paidBy: authorization.from, settlementTx: txHash },
        }, {
            headers: {
                "X-PAYMENT-RESPONSE": utf8ToB64(JSON.stringify(settlement)),
            },
        });
    } catch (error: any) {
        console.error("Invest error:", error);
        return c.json({ error: "invest_failed", message: error?.message }, 500);
    }
});

export default app;
