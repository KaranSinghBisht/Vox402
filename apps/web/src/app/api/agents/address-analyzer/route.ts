// Address Analyzer Agent API Route - FREE
// Comprehensive wallet/address analysis on Avalanche Fuji
import { NextRequest, NextResponse } from "next/server";
import { formatEther, formatUnits } from "viem";

const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const SNOWTRACE_API_URL = "https://api-testnet.snowtrace.io/api";
const COINGECKO_API = "https://api.coingecko.com/api/v3";

const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65";
const WAVAX_FUJI = "0xd00ae08403b9bbb9124bb305c09058e32c39a48c";

const KNOWN_TOKENS = [
    { address: USDC_FUJI, symbol: "USDC", decimals: 6, coingeckoId: "usd-coin" },
    { address: WAVAX_FUJI, symbol: "WAVAX", decimals: 18, coingeckoId: "avalanche-2" },
];

const KNOWN_SPENDERS: Record<string, string> = {
    "0x000000000022d473030f116ddee9f6b43ac78ba3": "Uniswap Permit2",
    "0x60ae616a2155ee3d9a68541ba4544862310933d4": "TraderJoe Router",
};

// RPC helper
async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
    const res = await fetch(FUJI_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const data = await res.json();
    return data.result;
}

async function getBalance(address: string): Promise<bigint> {
    const result = await rpcCall("eth_getBalance", [address, "latest"]);
    return BigInt((result as string) || "0");
}

async function getTransactionCount(address: string): Promise<number> {
    const result = await rpcCall("eth_getTransactionCount", [address, "latest"]);
    return parseInt((result as string) || "0", 16);
}

async function getCode(address: string): Promise<string> {
    const result = await rpcCall("eth_getCode", [address, "latest"]);
    return (result as string) || "0x";
}

async function getTokenBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    const data = "0x70a08231" + walletAddress.slice(2).padStart(64, "0");
    const result = await rpcCall("eth_call", [{ to: tokenAddress, data }, "latest"]);
    if (!result || result === "0x") return BigInt(0);
    return BigInt(result as string);
}

async function getAllowance(tokenAddress: string, owner: string, spender: string): Promise<bigint> {
    const ownerPadded = owner.slice(2).padStart(64, "0");
    const spenderPadded = spender.slice(2).padStart(64, "0");
    const data = "0xdd62ed3e" + ownerPadded + spenderPadded;
    const result = await rpcCall("eth_call", [{ to: tokenAddress, data }, "latest"]);
    if (!result || result === "0x") return BigInt(0);
    return BigInt(result as string);
}

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

    if (!to) return { type: "contract_creation", description: "Deployed a new contract" };

    if (input && input !== "0x" && input.length > 10) {
        const sig = input.slice(0, 10).toLowerCase();
        if (sig === "0xa9059cbb") return { type: "token_transfer", description: "ERC-20 Token Transfer" };
        if (sig === "0x095ea7b3") return { type: "token_approval", description: "Token Approval" };
        if (["0x38ed1739", "0x7ff36ab5", "0x18cbafe5"].includes(sig)) return { type: "swap", description: "DEX Swap" };
        if (["0xe8e33700", "0xf305d719"].includes(sig)) return { type: "add_liquidity", description: "Added Liquidity" };
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
    if ((categories.receive || 0) > (categories.send || 0) * 2) patterns.push("Primarily receiving funds (accumulation)");
    if ((categories.send || 0) > (categories.receive || 0) * 2) patterns.push("Primarily sending funds (distribution)");

    return patterns;
}

function generateRecommendations(avaxBalance: number, approvals: any[], patterns: string[], tokens: any[]): string[] {
    const recs: string[] = [];

    if (avaxBalance < 0.1) recs.push("💡 Low native AVAX balance. Consider topping up for gas costs.");

    const riskyApprovals = approvals.filter(a => a.isUnlimited || !a.spenderName);
    if (riskyApprovals.length > 0) recs.push("🔒 Review and revoke unnecessary token approvals.");

    if (patterns.includes("Active DeFi trader (multiple swaps detected)")) {
        recs.push("📊 Consider using a DEX aggregator for better rates.");
    }

    if (tokens.length === 0) recs.push("💰 No ERC-20 tokens found - might be fresh wallet or tokens on other chains.");

    if (recs.length === 0) recs.push("✅ Wallet appears healthy. Continue practicing good security hygiene.");

    return recs;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { address, includeTransactions = true, txLimit = 10 } = body;

        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
            return NextResponse.json({ error: "Invalid address" }, { status: 400 });
        }

        // 1. Address Overview
        const [bytecode, txCount, nativeBalance] = await Promise.all([
            getCode(address),
            getTransactionCount(address),
            getBalance(address),
        ]);

        const isContract = bytecode && bytecode !== "0x";
        let addressType = isContract ? (bytecode.includes("delegatecall") ? "proxy" : "contract") : "EOA";
        let isVerified = false;
        let contractName = "";

        if (isContract) {
            try {
                const url = `${SNOWTRACE_API_URL}?module=contract&action=getsourcecode&address=${address}`;
                const response = await fetch(url);
                const data: any = await response.json();
                if (data.status === "1" && data.result?.[0]?.SourceCode) {
                    isVerified = true;
                    contractName = data.result[0].ContractName || "";
                }
            } catch { }
        }

        // 2. Balances with USD values
        const priceIds = ["avalanche-2", ...KNOWN_TOKENS.filter(t => t.coingeckoId).map(t => t.coingeckoId!)];
        const prices = await fetchPrices(priceIds);
        const avaxPrice = prices["avalanche-2"] || 0;
        const avaxFormatted = formatEther(nativeBalance);
        const avaxUsdValue = parseFloat(avaxFormatted) * avaxPrice;

        const tokenBalances = await Promise.all(
            KNOWN_TOKENS.map(async (token) => {
                try {
                    const balance = await getTokenBalance(token.address, address);
                    if (balance === BigInt(0)) return null;
                    const formatted = formatUnits(balance, token.decimals);
                    const price = token.coingeckoId ? prices[token.coingeckoId] || 0 : 0;
                    return {
                        address: token.address,
                        symbol: token.symbol,
                        balance: balance.toString(),
                        formatted,
                        usdValue: Math.round(parseFloat(formatted) * price * 100) / 100,
                    };
                } catch { return null; }
            })
        );

        const tokens = tokenBalances.filter((t): t is NonNullable<typeof t> => t !== null);
        const totalUsdValue = Math.round((avaxUsdValue + tokens.reduce((sum, t) => sum + t.usdValue, 0)) * 100) / 100;

        // 3. Recent Activity
        let recentActivity: any[] = [];
        let patterns: string[] = [];

        if (includeTransactions) {
            try {
                const url = `${SNOWTRACE_API_URL}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${txLimit}&sort=desc`;
                const response = await fetch(url);
                const data: any = await response.json();

                if (data.status === "1" && Array.isArray(data.result)) {
                    recentActivity = data.result.map((tx: any) => {
                        const cat = categorizeTransaction(tx, address);
                        const value = BigInt(tx.value || "0");
                        const timestamp = new Date(Number(tx.timeStamp) * 1000);
                        return {
                            date: timestamp.toISOString().split("T")[0],
                            txHash: tx.hash,
                            type: cat.type,
                            description: cat.description,
                            from: tx.from,
                            to: tx.to || "(Contract Creation)",
                            value: formatEther(value),
                            isError: tx.isError === "1",
                        };
                    });
                    patterns = detectPatterns(data.result, address);
                }
            } catch { }
        }

        // 4. Security Assessment - Token Approvals
        const approvals: any[] = [];
        for (const token of KNOWN_TOKENS) {
            for (const [spenderAddr, spenderName] of Object.entries(KNOWN_SPENDERS)) {
                try {
                    const allowance = await getAllowance(token.address, address, spenderAddr);
                    if (allowance > BigInt(0)) {
                        const formatted = formatUnits(allowance, token.decimals);
                        const isUnlimited = allowance > BigInt("0xffffffffffffffffffffffffffffffff");
                        approvals.push({
                            token: token.symbol,
                            spender: spenderAddr,
                            spenderName,
                            allowance: isUnlimited ? "Unlimited" : formatted,
                            isUnlimited,
                        });
                    }
                } catch { }
            }
        }

        const riskFlags: string[] = [];
        const unlimitedApprovals = approvals.filter(a => a.isUnlimited);
        if (unlimitedApprovals.length > 0) riskFlags.push(`⚠️ ${unlimitedApprovals.length} unlimited approval(s)`);
        if (isContract && !isVerified) riskFlags.push("⚠️ Unverified contract");
        if (riskFlags.length === 0) riskFlags.push("✅ No risk flags detected");

        const overallRisk = unlimitedApprovals.length > 2 ? "high" : unlimitedApprovals.length > 0 ? "medium" : "low";

        // 5. Recommendations
        const recommendations = generateRecommendations(parseFloat(avaxFormatted), approvals, patterns, tokens);

        // 6. Summary
        const summary = [
            `📊 **Address Analysis for ${address.slice(0, 10)}...${address.slice(-8)}**`,
            ``,
            `**Overview**: ${addressType === "EOA" ? "Wallet (EOA)" : isVerified ? `Verified ${contractName || "Contract"}` : "Smart Contract"} | ${txCount} transactions`,
            ``,
            `**Holdings** ≈ $${totalUsdValue.toFixed(2)}`,
            `• ${avaxFormatted} AVAX ($${avaxUsdValue.toFixed(2)})`,
            ...tokens.map(t => `• ${t.formatted} ${t.symbol} ($${t.usdValue.toFixed(2)})`),
            patterns.length > 0 ? `\n**Patterns**: ${patterns.join(" | ")}` : "",
            `\n**Security**: ${overallRisk.toUpperCase()} risk`,
            ...riskFlags.map(f => `• ${f}`),
            `\n**Recommendations**`,
            ...recommendations.map(r => `• ${r}`),
        ].filter(Boolean).join("\n");

        return NextResponse.json({
            overview: { address, chain: "Avalanche Fuji (43113)", type: addressType, isContract, isVerified, contractName, transactionCount: txCount },
            balances: {
                native: { symbol: "AVAX", formatted: avaxFormatted, usdValue: Math.round(avaxUsdValue * 100) / 100, price: avaxPrice },
                tokens,
                totalUsdValue,
            },
            recentActivity,
            patterns,
            security: { overallRisk, flags: riskFlags, approvals },
            recommendations,
            summary,
            meta: { pricing: "FREE", timestamp: new Date().toISOString() },
        });
    } catch (error: unknown) {
        console.error("Address analysis error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "analysis_failed", message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        agent: "address-analyzer-agent",
        description: "Comprehensive wallet/address analysis with holdings, transactions, security, and recommendations",
        pricing: "FREE",
        supportedChains: ["avalanche-fuji"],
        features: ["balances", "usd-values", "transaction-history", "pattern-detection", "security-assessment", "recommendations"],
    });
}
