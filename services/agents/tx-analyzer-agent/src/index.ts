// services/agents/tx-analyzer-agent/src/index.ts
// TxAnalyzerAgent: FREE - Transaction history analysis

import path, { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import express from "express";
import cors from "cors";
import { z } from "zod";
import { formatEther } from "viem";

const app = express();
app.use(
    cors({
        origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(express.json());

// Snowtrace API for transaction history
const SNOWTRACE_API_URL = "https://api-testnet.snowtrace.io/api";

// Transaction categorization
function categorizeTransaction(tx: any, address: string): string {
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

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "tx-analyzer-agent", pricing: "FREE" }));

const AnalyzeReq = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    limit: z.number().int().min(1).max(50).optional().default(10),
});

app.post("/analyze", async (req, res) => {
    const parsed = AnalyzeReq.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

    const { address, limit } = parsed.data;

    try {
        const url = `${SNOWTRACE_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`;
        const response = await fetch(url);
        const data: any = await response.json();

        if (data.status !== "1" || !Array.isArray(data.result)) {
            return res.json({
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
        let totalIn = 0n;
        let totalOut = 0n;

        const transactions = data.result.map((tx: any) => {
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
            summaryParts.push(`  - ${cat.replace(/_/g, " ")}: ${count} transaction${count > 1 ? "s" : ""}`);
        }

        summaryParts.push("");
        summaryParts.push(`Net AVAX Flow: ${netFlow >= 0n ? "+" : ""}${formatEther(netFlow)} AVAX`);

        return res.json({
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
    } catch (error: any) {
        console.error("Transaction analysis error:", error);
        return res.status(500).json({ error: "analysis_failed", message: error?.message });
    }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4105;
app.listen(port, () => console.log(`tx-analyzer-agent (FREE) listening on http://localhost:${port}`));
