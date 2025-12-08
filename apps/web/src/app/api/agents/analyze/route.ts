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
        const { address, limit = 10, txHash } = body;

        // Single transaction lookup by hash
        if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
            const txUrl = `${SNOWTRACE_API_URL}?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}`;
            const receiptUrl = `${SNOWTRACE_API_URL}?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}`;

            const [txResponse, receiptResponse] = await Promise.all([
                fetch(txUrl),
                fetch(receiptUrl),
            ]);

            const txData = await txResponse.json();
            const receiptData = await receiptResponse.json();

            if (!txData.result || txData.result === null) {
                return NextResponse.json({ error: "Transaction not found", txHash }, { status: 404 });
            }

            const tx = txData.result;
            const receipt = receiptData.result;
            const valueWei = BigInt(tx.value || "0");
            const input = tx.input || "";

            // Determine transaction type and decode details
            let txType = "transfer";
            let tokenTransferInfo: { from?: string; to?: string; amount?: string; token?: string } | null = null;

            if (!tx.to) {
                txType = "contract_creation";
            } else if (input && input !== "0x" && input.length > 10) {
                const sig = input.slice(0, 10).toLowerCase();

                // Standard ERC-20 transfer: transfer(address,uint256)
                if (sig === "0xa9059cbb") {
                    txType = "token_transfer";
                    if (input.length >= 138) {
                        const toAddr = "0x" + input.slice(34, 74);
                        const amountHex = input.slice(74, 138);
                        const amount = BigInt("0x" + amountHex);
                        tokenTransferInfo = { to: toAddr, amount: amount.toString() };
                    }
                }
                // Token approval: approve(address,uint256)
                else if (sig === "0x095ea7b3") txType = "token_approval";
                // Swaps
                else if (sig === "0x38ed1739" || sig === "0x7ff36ab5" || sig === "0x18cbafe5") txType = "swap";
                // EIP-3009 transferWithAuthorization (x402 payments!)
                else if (sig === "0xe3ee160e") {
                    txType = "x402_payment";
                    if (input.length >= 202) {
                        const fromAddr = "0x" + input.slice(34, 74);
                        const toAddr = "0x" + input.slice(98, 138);
                        const amountHex = input.slice(138, 202);
                        const amount = BigInt("0x" + amountHex);
                        // USDC has 6 decimals
                        const amountFormatted = (Number(amount) / 1_000_000).toFixed(2);
                        tokenTransferInfo = { from: fromAddr, to: toAddr, amount: amountFormatted, token: "USDC" };
                    }
                }
                // receiveWithAuthorization (EIP-3009)
                else if (sig === "0xef55bec6") {
                    txType = "x402_payment";
                }
                else txType = "contract_interaction";
            }

            // Build summary with decoded info
            const summaryLines = [
                `📋 Transaction Analysis`,
                ``,
                `Hash: ${txHash.slice(0, 10)}...${txHash.slice(-8)}`,
                `From: ${tx.from}`,
                `To: ${tx.to || "(Contract Creation)"}`,
            ];

            if (valueWei > BigInt(0)) {
                summaryLines.push(`Value: ${formatEther(valueWei)} AVAX`);
            }

            // Add decoded token transfer info
            if (tokenTransferInfo) {
                if (txType === "x402_payment") {
                    summaryLines.push(`💳 x402 Payment: ${tokenTransferInfo.amount} ${tokenTransferInfo.token || "tokens"}`);
                    if (tokenTransferInfo.from) summaryLines.push(`   Payer: ${tokenTransferInfo.from.slice(0, 10)}...${tokenTransferInfo.from.slice(-6)}`);
                    if (tokenTransferInfo.to) summaryLines.push(`   Recipient: ${tokenTransferInfo.to.slice(0, 10)}...${tokenTransferInfo.to.slice(-6)}`);
                } else if (txType === "token_transfer" && tokenTransferInfo.to) {
                    summaryLines.push(`🪙 Token Transfer to: ${tokenTransferInfo.to.slice(0, 10)}...${tokenTransferInfo.to.slice(-6)}`);
                }
            }

            summaryLines.push(`Type: ${txType.replace(/_/g, " ")}`);
            summaryLines.push(`Status: ${receipt?.status === "0x1" ? "✅ Success" : receipt?.status === "0x0" ? "❌ Failed" : "⏳ Pending"}`);
            summaryLines.push(`Block: ${parseInt(tx.blockNumber, 16)}`);

            const summary = summaryLines.join("\n");

            return NextResponse.json({
                txHash,
                transaction: {
                    hash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    value: tx.value,
                    valueFormatted: formatEther(valueWei),
                    gasPrice: tx.gasPrice,
                    blockNumber: parseInt(tx.blockNumber, 16),
                    input: input.length > 100 ? input.slice(0, 100) + "..." : input,
                    type: txType,
                    status: receipt?.status === "0x1" ? "success" : receipt?.status === "0x0" ? "failed" : "pending",
                    tokenTransfer: tokenTransferInfo,
                },
                summary,
                meta: { pricing: "FREE" },
            });
        }

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
