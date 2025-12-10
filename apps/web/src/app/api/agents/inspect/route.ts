// Contract Inspector Agent API Route - FREE (No x402 payment required)
// Smart contract analysis on Avalanche Fuji
import { NextRequest, NextResponse } from "next/server";

const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const SNOWTRACE_API_URL = "https://api-testnet.snowtrace.io/api";

// Known function signatures
const KNOWN_SIGNATURES: Record<string, { name: string; type: string }> = {
    "18160ddd": { name: "totalSupply()", type: "ERC20" },
    "70a08231": { name: "balanceOf(address)", type: "ERC20" },
    "a9059cbb": { name: "transfer(address,uint256)", type: "ERC20" },
    "095ea7b3": { name: "approve(address,uint256)", type: "ERC20" },
    "6352211e": { name: "ownerOf(uint256)", type: "ERC721" },
    "38ed1739": { name: "swapExactTokensForTokens", type: "DEX" },
    "7ff36ab5": { name: "swapExactETHForTokens", type: "DEX" },
    "8da5cb5b": { name: "owner()", type: "Ownable" },
};

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

function detectPatterns(bytecode: string): string[] {
    const patterns: Set<string> = new Set();
    for (const [sig, info] of Object.entries(KNOWN_SIGNATURES)) {
        if (bytecode.includes(sig)) patterns.add(info.type);
    }
    return Array.from(patterns);
}

function assessRisk(patterns: string[], bytecode: string, isVerified: boolean): { level: string; flags: string[] } {
    const flags: string[] = [];
    let risk = "low";

    if (!isVerified) {
        flags.push("⚠️ Contract is not verified on Snowtrace");
        risk = "medium";
    }

    if (bytecode.toLowerCase().includes("ff")) {
        // SELFDESTRUCT opcode check (simplified)
        // Real check would need opcode analysis
    }

    if (bytecode.toLowerCase().includes("f4")) {
        flags.push("⚠️ Uses DELEGATECALL (potential proxy)");
        if (risk !== "high") risk = "medium";
    }

    if (flags.length === 0) flags.push("✅ No obvious risk patterns detected");
    return { level: risk, flags };
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { contractAddress } = body;

        if (!contractAddress || !/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
            return NextResponse.json({ error: "Invalid contract address" }, { status: 400 });
        }

        // Get bytecode via RPC
        const bytecode = await rpcCall("eth_getCode", [contractAddress, "latest"]) as string;

        if (!bytecode || bytecode === "0x") {
            return NextResponse.json({
                contractAddress,
                isContract: false,
                message: "This address is not a contract (no bytecode found).",
                meta: { pricing: "FREE" },
            });
        }

        // Try to get contract info from Snowtrace
        let isVerified = false;
        let contractName = "Unknown";

        try {
            const url = `${SNOWTRACE_API_URL}?module=contract&action=getsourcecode&address=${contractAddress}`;
            const response = await fetch(url);
            const data = await response.json() as { status: string; result?: Array<{ SourceCode?: string; ContractName?: string }> };

            if (data.status === "1" && data.result?.[0]?.SourceCode) {
                isVerified = true;
                contractName = data.result[0].ContractName || "Verified Contract";
            }
        } catch { }

        const patterns = detectPatterns(bytecode);
        const risk = assessRisk(patterns, bytecode, isVerified);

        let contractType = "Unknown Contract";
        if (patterns.includes("ERC721")) contractType = "NFT Contract (ERC721)";
        else if (patterns.includes("ERC20")) contractType = "Token Contract (ERC20)";
        else if (patterns.includes("DEX")) contractType = "DEX/Router Contract";
        else if (patterns.includes("Ownable")) contractType = "Ownable Contract";

        const summary = [
            `📋 Contract Analysis: ${contractAddress.slice(0, 10)}...${contractAddress.slice(-8)}`,
            ``,
            `Type: ${contractType}`,
            `Verified: ${isVerified ? "✅ Yes" : "❌ No"}`,
            contractName !== "Unknown" ? `Name: ${contractName}` : null,
            `Bytecode Size: ${Math.floor(bytecode.length / 2)} bytes`,
            ``,
            `Detected Patterns: ${patterns.length > 0 ? patterns.join(", ") : "None"}`,
            ``,
            `Risk Assessment: ${risk.level.toUpperCase()}`,
            ...risk.flags.map(f => `  ${f}`),
        ].filter(Boolean).join("\n");

        return NextResponse.json({
            contractAddress,
            isContract: true,
            contractType,
            contractName,
            isVerified,
            bytecodeSize: Math.floor(bytecode.length / 2),
            patterns,
            risk,
            summary,
            meta: { pricing: "FREE" },
        });
    } catch (error: unknown) {
        console.error("Contract inspection error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: "inspection_failed", message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        agent: "contract-inspector-agent",
        description: "Smart contract analysis for Avalanche Fuji",
        pricing: "FREE",
        supportedChains: ["avalanche-fuji"],
    });
}
