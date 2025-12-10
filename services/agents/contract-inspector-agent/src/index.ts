// services/agents/contract-inspector-agent/src/index.ts
// ContractInspectorAgent: FREE - Smart contract analysis

import path, { dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(__dirname, "../../../../.env") });

import express from "express";
import cors from "cors";
import { z } from "zod";
import { createPublicClient, http, type Address } from "viem";
import { avalancheFuji } from "viem/chains";

const app = express();
app.use(
    cors({
        origin: true, // Allow all origins for Railway deployment
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        exposedHeaders: ["X-PAYMENT-RESPONSE"],
    })
);
app.use(express.json());

const FUJI_RPC_URL = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const SNOWTRACE_API_URL = "https://api-testnet.snowtrace.io/api";

const publicClient = createPublicClient({
    chain: avalancheFuji,
    transport: http(FUJI_RPC_URL),
});

// Known function signatures
const KNOWN_SIGNATURES: Record<string, { name: string; type: string }> = {
    "0x18160ddd": { name: "totalSupply()", type: "ERC20" },
    "0x70a08231": { name: "balanceOf(address)", type: "ERC20" },
    "0xa9059cbb": { name: "transfer(address,uint256)", type: "ERC20" },
    "0x095ea7b3": { name: "approve(address,uint256)", type: "ERC20" },
    "0x6352211e": { name: "ownerOf(uint256)", type: "ERC721" },
    "0x38ed1739": { name: "swapExactTokensForTokens", type: "DEX" },
    "0x7ff36ab5": { name: "swapExactETHForTokens", type: "DEX" },
    "0x8da5cb5b": { name: "owner()", type: "Ownable" },
};

function detectPatterns(bytecode: string): string[] {
    const patterns: Set<string> = new Set();
    for (const [sig, info] of Object.entries(KNOWN_SIGNATURES)) {
        if (bytecode.includes(sig.slice(2))) patterns.add(info.type);
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

    if (bytecode.includes("selfdestruct")) {
        flags.push("🚨 Contains SELFDESTRUCT opcode");
        risk = "high";
    }

    if (bytecode.includes("delegatecall")) {
        flags.push("⚠️ Uses DELEGATECALL (potential proxy)");
        if (risk !== "high") risk = "medium";
    }

    if (flags.length === 0) flags.push("✅ No obvious risk patterns detected");
    return { level: risk, flags };
}

// ===== routes =====
app.get("/health", (_req, res) => res.json({ ok: true, agent: "contract-inspector-agent", pricing: "FREE" }));

const InspectReq = z.object({
    contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

app.post("/inspect", async (req, res) => {
    const parsed = InspectReq.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });

    const contractAddress = parsed.data.contractAddress as Address;

    try {
        const bytecode = await publicClient.getCode({ address: contractAddress });

        if (!bytecode || bytecode === "0x") {
            return res.json({
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
            const data: any = await response.json();

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

        return res.json({
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
    } catch (error: any) {
        console.error("Contract inspection error:", error);
        return res.status(500).json({ error: "inspection_failed", message: error?.message });
    }
});

const port = process.env.PORT ? Number(process.env.PORT) : 4106;
app.listen(port, () => console.log(`contract-inspector-agent (FREE) listening on http://localhost:${port}`));
