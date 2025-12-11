// services/agents/address-analyzer-agent/src/index.ts
// AddressAnalyzerAgent: FREE - Comprehensive wallet/address analysis
// Combines: portfolio, tx history, contract inspection, security assessment

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
        origin: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(express.json());

// ===== Configuration =====
const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const SNOWTRACE_API_URL = "https://api-testnet.snowtrace.io/api";
const COINGECKO_API = "https://api.coingecko.com/api/v3";

const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC_URL),
});

// ===== Known Tokens on Fuji =====
const KNOWN_TOKENS: Array<{ address: Address; symbol: string; decimals: number; coingeckoId?: string }> = [
    { address: "0x5425890298aed601595a70AB815c96711a31Bc65", symbol: "USDC", decimals: 6, coingeckoId: "usd-coin" },
    { address: "0xd00ae08403b9bbb9124bb305c09058e32c39a48c", symbol: "WAVAX", decimals: 18, coingeckoId: "avalanche-2" },
];

// Common spender addresses (approvals)
const KNOWN_SPENDERS: Record<string, string> = {
    "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
    "0x60ae616a2155ee3d9a68541ba4544862310933d4": "TraderJoe Router",
    "0xdef1c0ded9bec7f1a1670819833240f027b25eff": "0x Exchange Proxy",
};

// ===== ABIs =====
const ERC20_ABI = [
    { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
    { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
    { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
    { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
] as const;

// ===== Helper Functions =====
async function fetchPrices(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    try {
        const response = await fetch(`${COINGECKO_API}/simple/price?ids=${ids.join(",")}&vs_currencies=usd`);
        const data: any = await response.json();
        const prices: Record<string, number> = {};
        for (const id of ids) {
            if (data[id]?.usd) prices[id] = data[id].usd;
        }
        return prices;
    } catch {
        return {};
    }
}

function categorizeTransaction(tx: any, address: string): { type: string; description: string } {
    const addrLower = address.toLowerCase();
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const input = tx.input || "";

    if (!to || to === "") return { type: "contract_creation", description: "Deployed a new contract" };

    if (input && input !== "0x" && input.length > 10) {
        const sig = input.slice(0, 10).toLowerCase();
        if (sig === "0xa9059cbb") return { type: "token_transfer", description: "ERC-20 Token Transfer" };
        if (sig === "0x095ea7b3") return { type: "token_approval", description: "Token Approval" };
        if (sig === "0x38ed1739" || sig === "0x7ff36ab5" || sig === "0x18cbafe5") return { type: "swap", description: "DEX Swap" };
        if (sig === "0xe8e33700" || sig === "0xf305d719") return { type: "add_liquidity", description: "Added Liquidity" };
        if (sig === "0xbaa2abde" || sig === "0x02751cec") return { type: "remove_liquidity", description: "Removed Liquidity" };
        if (sig === "0xd0e30db0") return { type: "wrap", description: "Wrapped AVAX" };
        if (sig === "0x2e1a7d4d") return { type: "unwrap", description: "Unwrapped WAVAX" };
        return { type: "contract_interaction", description: "Smart Contract Interaction" };
    }

    if (from === addrLower) return { type: "send", description: "Sent AVAX" };
    if (to === addrLower) return { type: "receive", description: "Received AVAX" };
    return { type: "unknown", description: "Unknown Transaction" };
}

function detectPatterns(transactions: any[], address: string): string[] {
    const patterns: string[] = [];
    const categories: Record<string, number> = {};

    for (const tx of transactions) {
        const cat = categorizeTransaction(tx, address);
        categories[cat.type] = (categories[cat.type] || 0) + 1;
    }

    if ((categories.swap || 0) >= 2) patterns.push("Active DeFi trader (multiple swaps detected)");
    if ((categories.add_liquidity || 0) >= 1) patterns.push("Liquidity provider activity");
    if ((categories.token_approval || 0) >= 3) patterns.push("Multiple token approvals (review for security)");
    if ((categories.receive || 0) > (categories.send || 0) * 2) patterns.push("Primarily receiving funds (accumulation pattern)");
    if ((categories.send || 0) > (categories.receive || 0) * 2) patterns.push("Primarily sending funds (distribution pattern)");
    if (categories.contract_creation) patterns.push("Contract deployer (developer activity)");

    return patterns;
}

function assessRisk(bytecode: string | null, isVerified: boolean, approvals: any[]): { level: string; flags: string[] } {
    const flags: string[] = [];
    let riskScore = 0;

    // Contract-specific risks
    if (bytecode) {
        if (!isVerified) {
            flags.push("⚠️ Contract is not verified on Snowtrace");
            riskScore += 2;
        }
        if (bytecode.includes("selfdestruct")) {
            flags.push("🚨 Contains SELFDESTRUCT opcode - can be destroyed");
            riskScore += 3;
        }
        if (bytecode.includes("delegatecall")) {
            flags.push("⚠️ Uses DELEGATECALL (proxy pattern)");
            riskScore += 1;
        }
    }

    // Approval risks
    const unlimitedApprovals = approvals.filter(a => a.isUnlimited);
    if (unlimitedApprovals.length > 0) {
        flags.push(`⚠️ ${unlimitedApprovals.length} unlimited token approval(s) active`);
        riskScore += unlimitedApprovals.length;
    }

    const unknownSpenders = approvals.filter(a => !a.spenderName);
    if (unknownSpenders.length > 0) {
        flags.push(`⚠️ ${unknownSpenders.length} approval(s) to unknown contracts`);
        riskScore += unknownSpenders.length;
    }

    if (flags.length === 0) flags.push("✅ No obvious risk patterns detected");

    return {
        level: riskScore >= 5 ? "high" : riskScore >= 2 ? "medium" : "low",
        flags,
    };
}

function generateRecommendations(analysis: any): string[] {
    const recs: string[] = [];

    // Balance recommendations
    const avaxBalance = parseFloat(analysis.balances.native.formatted);
    if (avaxBalance < 0.1) {
        recs.push("💡 Low native AVAX balance. Consider topping up for gas costs.");
    }

    // Approval recommendations
    const riskyApprovals = analysis.security.approvals.filter((a: any) => a.isUnlimited || !a.spenderName);
    if (riskyApprovals.length > 0) {
        recs.push("🔒 Review and revoke unnecessary token approvals to reduce risk.");
    }

    // Pattern-based recommendations
    if (analysis.patterns.includes("Active DeFi trader (multiple swaps detected)")) {
        recs.push("📊 Consider using a DEX aggregator to get better swap rates.");
    }

    if (analysis.patterns.includes("Multiple token approvals (review for security)")) {
        recs.push("🛡️ Use approval management tools like revoke.cash to audit approvals.");
    }

    // General recommendations
    if (analysis.balances.tokens.length === 0) {
        recs.push("💰 No ERC-20 tokens found. This might be a fresh wallet or tokens are on other chains.");
    }

    if (recs.length === 0) {
        recs.push("✅ Wallet appears healthy. Continue practicing good security hygiene.");
    }

    return recs;
}

// ===== Routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "address-analyzer-agent", pricing: "FREE" }));

const AnalyzeReq = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    includeTransactions: z.boolean().optional().default(true),
    txLimit: z.number().int().min(1).max(50).optional().default(10),
});

app.post("/analyze", async (req, res) => {
    const parsed = AnalyzeReq.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

    const { address, includeTransactions, txLimit } = parsed.data;
    const addr = address as Address;

    try {
        // ===== 1. Address Overview =====
        const [bytecode, txCount, nativeBalance] = await Promise.all([
            publicClient.getCode({ address: addr }),
            publicClient.getTransactionCount({ address: addr }),
            publicClient.getBalance({ address: addr }),
        ]);

        const isContract = bytecode && bytecode !== "0x";
        let addressType: "EOA" | "contract" | "proxy" = isContract ? "contract" : "EOA";
        let isVerified = false;
        let contractName = "";

        if (isContract) {
            // Check for proxy pattern
            if (bytecode!.includes("delegatecall")) addressType = "proxy";

            // Check verification status
            try {
                const url = `${SNOWTRACE_API_URL}?module=contract&action=getsourcecode&address=${addr}`;
                const response = await fetch(url);
                const data: any = await response.json();
                if (data.status === "1" && data.result?.[0]?.SourceCode) {
                    isVerified = true;
                    contractName = data.result[0].ContractName || "";
                }
            } catch { }
        }

        const overview = {
            address: addr,
            chain: "Avalanche Fuji (43113)",
            type: addressType,
            isContract,
            isVerified,
            contractName: contractName || undefined,
            transactionCount: txCount,
        };

        // ===== 2. Balances & Holdings =====
        // Fetch prices
        const priceIds = ["avalanche-2", ...KNOWN_TOKENS.filter(t => t.coingeckoId).map(t => t.coingeckoId!)];
        const prices = await fetchPrices(priceIds);
        const avaxPrice = prices["avalanche-2"] || 0;

        const avaxFormatted = formatEther(nativeBalance);
        const avaxUsdValue = parseFloat(avaxFormatted) * avaxPrice;

        // Get token balances
        const tokenBalances = await Promise.all(
            KNOWN_TOKENS.map(async (token) => {
                try {
                    const balance = await publicClient.readContract({
                        address: token.address,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [addr],
                    }) as bigint;

                    if (balance === 0n) return null;

                    const formatted = formatUnits(balance, token.decimals);
                    const price = token.coingeckoId ? prices[token.coingeckoId] || 0 : 0;
                    const usdValue = parseFloat(formatted) * price;

                    return {
                        address: token.address,
                        symbol: token.symbol,
                        decimals: token.decimals,
                        balance: balance.toString(),
                        formatted,
                        usdValue: Math.round(usdValue * 100) / 100,
                    };
                } catch {
                    return null;
                }
            })
        );

        const tokens = tokenBalances.filter((t): t is NonNullable<typeof t> => t !== null);
        const totalUsdValue = avaxUsdValue + tokens.reduce((sum, t) => sum + t.usdValue, 0);

        const balances = {
            native: {
                symbol: "AVAX",
                balance: nativeBalance.toString(),
                formatted: avaxFormatted,
                usdValue: Math.round(avaxUsdValue * 100) / 100,
                price: avaxPrice,
            },
            tokens,
            totalUsdValue: Math.round(totalUsdValue * 100) / 100,
        };

        // ===== 3. Recent Activity =====
        let recentActivity: any[] = [];
        let patterns: string[] = [];

        if (includeTransactions) {
            try {
                const url = `${SNOWTRACE_API_URL}?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=${txLimit}&sort=desc`;
                const response = await fetch(url);
                const data: any = await response.json();

                if (data.status === "1" && Array.isArray(data.result)) {
                    recentActivity = data.result.map((tx: any) => {
                        const cat = categorizeTransaction(tx, addr);
                        const value = BigInt(tx.value || "0");
                        const timestamp = new Date(Number(tx.timeStamp) * 1000);

                        return {
                            date: timestamp.toISOString().split("T")[0],
                            time: timestamp.toISOString().split("T")[1].slice(0, 8),
                            txHash: tx.hash,
                            type: cat.type,
                            description: cat.description,
                            from: tx.from,
                            to: tx.to || "(Contract Creation)",
                            value: formatEther(value),
                            isError: tx.isError === "1",
                        };
                    });

                    patterns = detectPatterns(data.result, addr);
                }
            } catch { }
        }

        // ===== 4. Security Assessment =====
        // Check token approvals
        const approvals: any[] = [];
        for (const token of KNOWN_TOKENS) {
            for (const [spenderAddr, spenderName] of Object.entries(KNOWN_SPENDERS)) {
                try {
                    const allowance = await publicClient.readContract({
                        address: token.address,
                        abi: ERC20_ABI,
                        functionName: "allowance",
                        args: [addr, spenderAddr as Address],
                    }) as bigint;

                    if (allowance > 0n) {
                        const formatted = formatUnits(allowance, token.decimals);
                        const isUnlimited = allowance > BigInt("0xffffffffffffffffffffffffffffffff");

                        approvals.push({
                            token: token.symbol,
                            tokenAddress: token.address,
                            spender: spenderAddr,
                            spenderName,
                            allowance: isUnlimited ? "Unlimited" : formatted,
                            isUnlimited,
                        });
                    }
                } catch { }
            }
        }

        const risk = assessRisk(bytecode || null, isVerified, approvals);

        const security = {
            overallRisk: risk.level,
            flags: risk.flags,
            approvals,
            contractLegitimacy: isContract ? {
                verified: isVerified,
                verdict: isVerified ? "✅ Verified on Snowtrace" : "⚠️ Unverified contract",
            } : null,
        };

        // ===== 5. Generate Recommendations =====
        const analysisData = { balances, patterns, security };
        const recommendations = generateRecommendations(analysisData);

        // ===== 6. Generate Summary =====
        const summaryParts = [
            `📊 **Address Analysis for ${addr.slice(0, 10)}...${addr.slice(-8)}**`,
            ``,
            `**Overview**`,
            `• Chain: Avalanche Fuji (Testnet)`,
            `• Type: ${addressType === "EOA" ? "Externally Owned Account (Wallet)" : isVerified ? `Verified ${contractName || "Contract"}` : "Smart Contract"}`,
            `• Total Transactions: ${txCount}`,
            ``,
            `**Holdings** (≈ $${balances.totalUsdValue.toFixed(2)} USD)`,
            `• Native: ${avaxFormatted} AVAX ($${avaxUsdValue.toFixed(2)})`,
        ];

        if (tokens.length > 0) {
            tokens.forEach(t => summaryParts.push(`• ${t.symbol}: ${t.formatted} ($${t.usdValue.toFixed(2)})`));
        } else {
            summaryParts.push(`• No ERC-20 tokens found`);
        }

        if (patterns.length > 0) {
            summaryParts.push(``, `**Key Patterns**`);
            patterns.forEach(p => summaryParts.push(`• ${p}`));
        }

        summaryParts.push(``, `**Security Assessment**: ${risk.level.toUpperCase()} risk`);
        risk.flags.forEach(f => summaryParts.push(`• ${f}`));

        summaryParts.push(``, `**Recommendations**`);
        recommendations.forEach(r => summaryParts.push(`• ${r}`));

        const summary = summaryParts.join("\n");

        // ===== Return Complete Analysis =====
        return res.json({
            overview,
            balances,
            recentActivity,
            patterns,
            security,
            recommendations,
            summary,
            meta: { pricing: "FREE", timestamp: new Date().toISOString() },
        });

    } catch (error: any) {
        console.error("Address analysis error:", error);
        return res.status(500).json({ error: "analysis_failed", message: error?.message });
    }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4107;
app.listen(port, () => console.log(`address-analyzer-agent (FREE) listening on http://localhost:${port}`));
