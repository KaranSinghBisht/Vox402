// Yield Agent API Route - Using Thirdweb x402 Facilitator
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, encodeFunctionData, formatUnits, parseUnits, type Address } from "viem";
import { avalancheFuji } from "viem/chains";
import { settleAgentPayment, createX402Response, USDC_FUJI, WAVAX_FUJI, CHAIN_ID } from "@/lib/x402";

// Real ERC4626 Yield Vault deployed on Fuji
const YIELD_VAULT_ADDRESS = "0xd2A081B94871FFE6653273ceC967f9dFbD7F8764" as Address;

// Yield strategies - NOTE: Only USDC vault is deployed
const YIELD_STRATEGIES: Record<string, {
    name: string;
    apy: number;
    token: Address;
    tokenSymbol: string;
    description: string;
}> = {
    stable_yield: {
        name: "Stable USDC Vault",
        apy: 8.5,
        token: USDC_FUJI,
        tokenSymbol: "USDC",
        description: "Low-risk USDC lending pool",
    },
    // avax_staking is disabled - requires separate WAVAX vault deployment
    // The current vault only accepts USDC deposits
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

// Viem client
const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc"),
});

export async function POST(request: NextRequest) {
    // Settle x402 payment via Thirdweb
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000";

    const result = await settleAgentPayment(
        request,
        `${baseUrl}/api/agents/yield`,
        "$0.01"
    );

    if (result.status !== 200) {
        return createX402Response(result);
    }

    // Payment verified - process invest request
    try {
        const body = await request.json();
        const { amount, token = "USDC", strategy = "stable_yield", userAddress } = body;

        if (!amount || !userAddress) {
            return NextResponse.json({ error: "Missing amount or userAddress" }, { status: 400 });
        }

        const strategyInfo = YIELD_STRATEGIES[strategy as keyof typeof YIELD_STRATEGIES] || YIELD_STRATEGIES.stable_yield;
        const userAddr = userAddress as Address;

        // Parse amount to base units
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
        type Step = { step: number; type: string; description: string; tx?: { to: Address; data: string; value: string }; status: string };
        const steps: Step[] = [];

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

        // Calculate estimated yield
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

        return NextResponse.json({
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
        }, {
            headers: result.responseHeaders,
        });
    } catch (error: unknown) {
        console.error("Yield invest error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "invest_failed", message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        agent: "yield-agent",
        description: "DeFi yield strategies on Avalanche Fuji",
        pricing: "$0.01 per request (x402)",
        vaultAddress: YIELD_VAULT_ADDRESS,
        strategies: Object.entries(YIELD_STRATEGIES).map(([key, val]) => ({
            id: key,
            name: val.name,
            apy: val.apy,
            token: val.tokenSymbol,
        })),
    });
}
