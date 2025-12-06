// Swap Agent API Route - Using Thirdweb x402 Facilitator
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, encodeFunctionData, formatUnits, type Address } from "viem";
import { avalancheFuji } from "viem/chains";
import { settleAgentPayment, createX402Response, USDC_FUJI, WAVAX_FUJI, CHAIN_ID } from "@/lib/x402";

// Router - Pangolin on Fuji
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

function getTokenInfo(address: string) {
    return TOKEN_INFO[address.toLowerCase()] || { symbol: address.slice(0, 10), decimals: 18, name: "Unknown" };
}

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
        `${baseUrl}/api/agents/swap`,
        "$0.01"
    );

    if (result.status !== 200) {
        return createX402Response(result);
    }

    // Payment verified - process swap request
    try {
        const body = await request.json();
        const { tokenIn, tokenOut, amountIn, recipient, slippageBps = 50 } = body;

        if (!tokenIn || !tokenOut || !amountIn || !recipient) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const tokenInAddr = tokenIn as Address;
        const tokenOutAddr = tokenOut as Address;
        const recipientAddr = recipient as Address;
        const amountInBn = BigInt(amountIn);

        const tokenInInfo = getTokenInfo(tokenIn);
        const tokenOutInfo = getTokenInfo(tokenOut);

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
            amountOut = amounts[amounts.length - 1] ?? BigInt(0);
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

        const minOut = (amountOut * BigInt(10000 - slippageBps)) / BigInt(10000);
        const rate = Number(amountOut) / Number(amountInBn) * Math.pow(10, tokenInInfo.decimals - tokenOutInfo.decimals);

        // Build approve tx data if needed
        const approveTx = needsApproval ? {
            to: tokenInAddr,
            data: encodeFunctionData({ abi: ERC20_ABI, functionName: "approve", args: [ROUTER, amountInBn] }),
            value: "0",
        } : null;

        // Swap args for frontend
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

        return NextResponse.json({
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
        }, {
            headers: result.responseHeaders,
        });
    } catch (error: unknown) {
        console.error("Swap quote error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "quote_failed", message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        agent: "swap-agent",
        description: "Token swap quotes for USDC <-> WAVAX on Avalanche Fuji",
        pricing: "$0.01 per request (x402)",
        router: ROUTER,
        supportedTokens: Object.values(TOKEN_INFO).map(t => t.symbol),
    });
}
