// services/agents/portfolio-agent/src/index.ts
// PortfolioAgent: FREE - Wallet analysis on Avalanche Fuji

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
    http,
    formatEther,
    formatUnits,
    type Address,
} from "viem";
import { avalancheFuji } from "viem/chains";

const app = express();
app.use(
    cors({
        origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(express.json());

const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
const WAVAX_FUJI = "0xd00ae08403b9bbb9124bb305c09058e32c39a48c" as const;

const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC_URL),
});

// Known tokens on Fuji
const KNOWN_TOKENS: Array<{ address: Address; symbol: string; decimals: number }> = [
    { address: USDC_FUJI, symbol: "USDC", decimals: 6 },
    { address: WAVAX_FUJI, symbol: "WAVAX", decimals: 18 },
];

const ERC20_ABI = [
    { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "b", type: "uint256" }] },
] as const;

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "portfolio-agent", pricing: "FREE" }));

const AnalyzeReq = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.post("/analyze", async (req, res) => {
    const parsed = AnalyzeReq.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

    const address = parsed.data.address as Address;

    try {
        // Get native AVAX balance
        const nativeBalance = await publicClient.getBalance({ address });
        const avaxFormatted = formatEther(nativeBalance);

        // Get transaction count
        const txCount = await publicClient.getTransactionCount({ address });

        // Get token balances
        const tokenBalances = await Promise.all(
            KNOWN_TOKENS.map(async (token) => {
                try {
                    const balance = await publicClient.readContract({
                        address: token.address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [address],
                    }) as bigint;

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

        const tokens = tokenBalances.filter((t): t is NonNullable<typeof t> => t !== null && BigInt(t.balance) > 0n);

        // Generate summary
        const summaryParts = [`Address: ${address}`, `Native AVAX: ${avaxFormatted} AVAX`, `Total Transactions: ${txCount}`];

        if (tokens.length > 0) {
            summaryParts.push("Token Holdings:");
            tokens.forEach((t) => {
                summaryParts.push(`  - ${t.symbol}: ${t.formatted}`);
            });
        } else {
            summaryParts.push("No known token holdings found.");
        }

        const summary = summaryParts.join("\n");

        return res.json({
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
    } catch (error: any) {
        console.error("Portfolio analysis error:", error);
        return res.status(500).json({ error: "analysis_failed", message: error?.message });
    }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4104;
app.listen(port, () => console.log(`portfolio-agent (FREE) listening on http://localhost:${port}`));
