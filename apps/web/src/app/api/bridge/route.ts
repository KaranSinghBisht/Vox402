// apps/web/src/app/api/bridge/route.ts
// Cross-chain bridge API endpoint - uses LI.FI for real quotes
import { NextRequest, NextResponse } from "next/server";
import { getBridgeQuote, CHAIN_IDS } from "@/lib/agents/bridge";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { token, amount, fromChain, toChain, recipient } = body;

        // Validate inputs
        if (!token || !amount || !fromChain || !toChain || !recipient) {
            return NextResponse.json(
                { error: "Missing required fields: token, amount, fromChain, toChain, recipient" },
                { status: 400 }
            );
        }

        // Check if chains are supported
        if (!CHAIN_IDS[fromChain.toLowerCase()]) {
            return NextResponse.json(
                { error: `Unsupported source chain: ${fromChain}`, supportedChains: Object.keys(CHAIN_IDS) },
                { status: 400 }
            );
        }
        if (!CHAIN_IDS[toChain.toLowerCase()]) {
            return NextResponse.json(
                { error: `Unsupported destination chain: ${toChain}`, supportedChains: Object.keys(CHAIN_IDS) },
                { status: 400 }
            );
        }

        // Parse amount to base units (assuming 6 decimals for USDC, 18 for others)
        const decimals = token.toUpperCase() === "USDC" || token.toUpperCase() === "USDT" ? 6 : 18;
        const amountFloat = parseFloat(amount);
        const fromAmount = (BigInt(Math.floor(amountFloat * 10 ** decimals))).toString();

        // Get quote from LI.FI
        const quote = await getBridgeQuote({
            fromChain,
            toChain,
            fromToken: token,
            toToken: token, // Same token for bridging
            fromAmount,
            fromAddress: recipient,
            slippage: 0.03,
        });

        // Format output amount for display
        const toAmountFloat = Number(quote.toAmount) / 10 ** decimals;

        // Generate human-readable summary
        const summary = [
            `🌉 Cross-Chain Bridge Quote`,
            `From: ${quote.fromChain} → To: ${quote.toChain}`,
            `Amount: ${amount} ${token.toUpperCase()} → ~${toAmountFloat.toFixed(4)} ${token.toUpperCase()}`,
            `Bridge: ${quote.bridgeName}`,
            `Estimated time: ${quote.estimatedTime}`,
            `Gas cost: ${quote.estimatedGas}`,
        ].join("\n");

        return NextResponse.json({
            success: true,
            quote: {
                ...quote,
                toAmountFormatted: toAmountFloat.toFixed(4),
                inputAmount: amount,
            },
            summary,
            // Include transaction data if available (for execution)
            tx: quote.transactionRequest ? {
                to: quote.transactionRequest.to,
                data: quote.transactionRequest.data,
                value: quote.transactionRequest.value,
                chainId: quote.fromChainId,
            } : null,
        });
    } catch (error: any) {
        console.error("Bridge API error:", error);

        // Check if it's a "no routes found" type error
        if (error.message?.includes("No routes found") || error.message?.includes("unable to find")) {
            return NextResponse.json(
                {
                    error: "No bridge route available",
                    message: "Could not find a bridge route for this token/chain combination. Try a different chain or token.",
                    supportedChains: Object.keys(CHAIN_IDS),
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { error: "Bridge quote failed", message: error?.message || "Unknown error" },
            { status: 500 }
        );
    }
}

// GET to check supported chains
export async function GET() {
    return NextResponse.json({
        supportedChains: Object.keys(CHAIN_IDS),
        note: "Use mainnet chain names (avalanche, ethereum, base, polygon, arbitrum). Testnets may have limited support.",
    });
}
