// TX Analyzer Agent API Route - FREE (No x402 payment required)
import { NextRequest, NextResponse } from "next/server";
import { formatEther } from "viem";

// Snowtrace API for transaction history
const SNOWTRACE_API_URL = "https://api-testnet.snowtrace.io/api";

// Transaction categorization
function categorizeTransaction(tx: Record<string, string>, address: string): string {
    const addrLower = address.toLowerCase();
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const input = tx.input || "";

    if (!to || to === "") return "contract_creation";

    if (input && input !== "0x" && input.length > 10) {
        const sig = input.slice(0, 10).toLowerCase();
        if (sig === "0xa9059cbb") return "token_transfer";
        if (sig === "0x095ea7b3") return "token_approval";
        if (sig === "0x38ed1739" || sig === "0x7ff36ab5" || sig === "0x18cbafe5") return "swap";
        if (sig === "0xe8e33700" || sig === "0xf305d719") return "add_liquidity";
        if (sig === "0xbaa2abde" || sig === "0x02751cec") return "remove_liquidity";
        return "contract_interaction";
    }

    if (from === addrLower) return "send";
    if (to === addrLower) return "receive";
    return "unknown";
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { address, limit = 10 } = body;

        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return NextResponse.json({ error: "Invalid address" }, { status: 400 });
        }

        const limitNum = Math.min(Math.max(1, Number(limit)), 50);
        const url = `${SNOWTRACE_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limitNum}&sort=desc`;

        const response = await fetch(url);
        const data = await response.json() as { status: string; result: Record<string, string>[] };

        if (data.status !== "1" || !Array.isArray(data.result)) {
            return NextResponse.json({
                address,
                transactions: [],
                summary: {
                    totalTransactions: 0,
                    categories: {},
                    netValueFlow: "0",
                    message: "No transactions found for this address.",
                },
                meta: { pricing: "FREE" },
            });
        }

        const categoryCounts: Record<string, number> = {};
        let totalIn = BigInt(0);
        let totalOut = BigInt(0);

        const transactions = data.result.map((tx) => {
            const category = categorizeTransaction(tx, address);
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;

            const value = BigInt(tx.value || "0");
            const isOutgoing = tx.from?.toLowerCase() === address.toLowerCase();

            if (isOutgoing) totalOut += value;
            else totalIn += value;

            return {
                hash: tx.hash,
                blockNumber: Number(tx.blockNumber),
                timestamp: Number(tx.timeStamp),
                from: tx.from,
                to: tx.to,
                value: tx.value,
                valueFormatted: formatEther(value),
                isError: tx.isError === "1",
                category,
                direction: isOutgoing ? "out" : "in",
            };
        });

        const netFlow = totalIn - totalOut;

        const summaryParts = [
            `Analyzed ${transactions.length} recent transactions for ${address.slice(0, 10)}...${address.slice(-8)}`,
            "",
            "Activity Breakdown:",
        ];

        for (const [cat, count] of Object.entries(categoryCounts)) {
            summaryParts.push(`  - ${cat.replace(/_/g, " ")}: ${count} tx${count > 1 ? "s" : ""}`);
        }

        summaryParts.push("");
        summaryParts.push(`Net AVAX Flow: ${netFlow >= BigInt(0) ? "+" : ""}${formatEther(netFlow)} AVAX`);

        return NextResponse.json({
            address,
            transactions,
            summary: {
                totalTransactions: transactions.length,
                categories: categoryCounts,
                totalIn: totalIn.toString(),
                totalOut: totalOut.toString(),
                netValueFlow: netFlow.toString(),
                netValueFlowFormatted: formatEther(netFlow),
                humanReadable: summaryParts.join("\n"),
            },
            meta: { pricing: "FREE" },
        });
    } catch (error: unknown) {
        console.error("TX analysis error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "analysis_failed", message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        agent: "tx-analyzer-agent",
        description: "Transaction history analysis for Avalanche addresses",
        pricing: "FREE",
        supportedChains: ["avalanche-fuji"],
    });
}
