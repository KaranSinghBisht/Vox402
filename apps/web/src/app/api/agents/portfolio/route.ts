// Portfolio Agent API Route - FREE (No x402 payment required)
// Wallet analysis on Avalanche Fuji using direct RPC calls
import { NextRequest, NextResponse } from "next/server";
import { formatEther, formatUnits } from "viem";

const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65";
const WAVAX_FUJI = "0xd00ae08403b9bbb9124bb305c09058e32c39a48c";

// Known tokens on Fuji
const KNOWN_TOKENS = [
    { address: USDC_FUJI, symbol: "USDC", decimals: 6 },
    { address: WAVAX_FUJI, symbol: "WAVAX", decimals: 18 },
];

// Direct RPC call helper
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(FUJI_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
        }),
    });
    const data = await res.json();
    return data.result;
}

// Get native balance
async function getBalance(address: string): Promise<bigint> {
    const result = await rpcCall("eth_getBalance", [address, "latest"]);
    return BigInt(result as string);
}

// Get transaction count
async function getTransactionCount(address: string): Promise<number> {
    const result = await rpcCall("eth_getTransactionCount", [address, "latest"]);
    return parseInt(result as string, 16);
}

// Get ERC20 balance
async function getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    // balanceOf(address) selector: 0x70a08231
    const data = "0x70a08231" + walletAddress.slice(2).padStart(64, "0");
    const result = await rpcCall("eth_call", [
        { to: tokenAddress, data },
        "latest",
    ]);
    if (!result || result === "0x") return BigInt(0);
    return BigInt(result as string);
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { address } = body;

        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return NextResponse.json({ error: "Invalid address" }, { status: 400 });
        }

        // Get native AVAX balance
        const nativeBalance = await getBalance(address);
        const avaxFormatted = formatEther(nativeBalance);

        // Get transaction count
        const txCount = await getTransactionCount(address);

        // Get token balances
        const tokenBalances = await Promise.all(
            KNOWN_TOKENS.map(async (token) => {
                try {
                    const balance = await getTokenBalance(token.address, address);
                    return {
                        address: token.address,
                        symbol: token.symbol,
                        decimals: token.decimals,
                        balance: balance.toString(),
                        formatted: formatUnits(balance, token.decimals),
                    };
                } catch {
                    return null;
                }
            })
        );

        const tokens = tokenBalances.filter(
            (t): t is NonNullable<typeof t> => t !== null && BigInt(t.balance) > BigInt(0)
        );

        // Generate summary
        const summaryParts = [
            `Address: ${address}`,
            `Native AVAX: ${avaxFormatted} AVAX`,
            `Total Transactions: ${txCount}`,
        ];

        if (tokens.length > 0) {
            summaryParts.push("Token Holdings:");
            tokens.forEach((t) => {
                summaryParts.push(`  - ${t.symbol}: ${t.formatted}`);
            });
        } else {
            summaryParts.push("No known token holdings found.");
        }

        const summary = summaryParts.join("\n");

        return NextResponse.json({
            address,
            native: {
                symbol: "AVAX",
                balance: nativeBalance.toString(),
                formatted: avaxFormatted,
            },
            tokens,
            transactionCount: txCount,
            summary,
            meta: { pricing: "FREE" },
        });
    } catch (error: unknown) {
        console.error("Portfolio analysis error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "analysis_failed", message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        agent: "portfolio-agent",
        description: "Wallet portfolio tracking and analysis for Avalanche Fuji",
        pricing: "FREE",
        supportedChains: ["avalanche-fuji"],
    });
}
