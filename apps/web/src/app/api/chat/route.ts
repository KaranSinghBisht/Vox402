// apps/web/src/app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { chat, clearSession, type AgentCall } from "@/lib/gemini";

// Network configuration
const NETWORKS = {
    mainnet: {
        chainId: 43114,
        usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        wavax: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    },
    testnet: {
        chainId: 43113,
        usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
        wavax: "0xd00ae08403b9bbb9124bb305c09058e32c39a48c",
    },
};

function resolveToken(raw: string, network: "mainnet" | "testnet" = "testnet"): string {
    const upper = raw.toUpperCase().trim();
    const config = NETWORKS[network];
    if (upper === "USDC") return config.usdc;
    if (upper === "AVAX" || upper === "WAVAX") return config.wavax;
    return raw; // Assume it's already an address
}

function getTokenDecimals(token: string): number {
    const upper = token.toUpperCase().trim();
    if (upper === "USDC") return 6;
    return 18; // Default for AVAX, WAVAX, and most tokens
}

// Convert Gemini AgentCall to NextAction format for frontend compatibility
type NextAction =
    | { kind: "chart"; args: { coinId: string; days: number; vs: string } }
    | { kind: "wallet"; args: { address: string } }
    | { kind: "portfolio"; args: { address: string } }
    | { kind: "tx_analyzer"; args: { address?: string; limit?: number; txHash?: string } }
    | { kind: "swap"; args: { tokenIn: string; tokenOut: string; amountIn: string; recipient: string; slippageBps?: number; network?: string; chainId?: number } }
    | { kind: "bridge"; args: { token: string; amount: string; fromChain: string; toChain: string; recipient: string; network?: string } }
    | { kind: "contract_inspector"; args: { contractAddress: string } }
    | { kind: "yield"; args: { amount: string; token: string; strategy: string; userAddress: string } };

function agentCallToNextAction(agentCall: AgentCall, walletAddr?: string): NextAction | null {
    switch (agentCall.agent) {
        case "chart":
            return { kind: "chart", args: agentCall.args };
        case "portfolio":
            return { kind: "portfolio", args: agentCall.args };
        case "tx_analyzer":
            return { kind: "tx_analyzer", args: agentCall.args };
        case "swap":
            // Determine network (default to testnet for safety)
            const network = (agentCall.args.network?.toLowerCase() === "mainnet" ? "mainnet" : "testnet") as "mainnet" | "testnet";
            const chainId = NETWORKS[network].chainId;

            // Parse human-readable amount to baseunits
            const amountRaw = agentCall.args.amountIn;
            let amountIn: string;
            const decimals = getTokenDecimals(agentCall.args.tokenIn);
            const m = amountRaw.trim().match(/^(\d+)(?:\.(\d+))?$/);
            if (m) {
                const whole = m[1];
                const frac = (m[2] ?? "").slice(0, decimals).padEnd(decimals, "0");
                amountIn = (BigInt(whole) * BigInt(10) ** BigInt(decimals) + BigInt(frac || "0")).toString();
            } else {
                amountIn = amountRaw; // Assume already in baseunits
            }
            return {
                kind: "swap",
                args: {
                    tokenIn: resolveToken(agentCall.args.tokenIn, network),
                    tokenOut: resolveToken(agentCall.args.tokenOut, network),
                    amountIn,
                    recipient: agentCall.args.recipient,
                    slippageBps: 50,
                    network,
                    chainId,
                },
            };
        case "bridge":
            return {
                kind: "bridge",
                args: {
                    ...agentCall.args,
                    network: agentCall.args.network?.toLowerCase() === "mainnet" ? "mainnet" : "testnet",
                },
            };
        case "contract_inspector":
            return { kind: "contract_inspector", args: agentCall.args };
        case "yield":
            return {
                kind: "yield",
                args: {
                    amount: agentCall.args.amount,
                    token: agentCall.args.token || "USDC",
                    strategy: agentCall.args.strategy || "stable_yield",
                    userAddress: walletAddr || "",
                },
            };
        default:
            return null;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { text, walletAddr, sessionId } = body;

        if (!text || typeof text !== "string") {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        const sid = sessionId || "default";
        const result = await chat(text, sid, walletAddr);

        // Convert agent call to NextAction format
        const nextAction = result.agentCall
            ? agentCallToNextAction(result.agentCall, walletAddr)
            : null;

        return NextResponse.json({
            reply: result.textReply,
            nextAction,
        });
    } catch (error: any) {
        console.error("Chat API error:", error);
        return NextResponse.json(
            { error: "Internal server error", message: error?.message },
            { status: 500 }
        );
    }
}

// Session clear endpoint
export async function DELETE(request: NextRequest) {
    try {
        const { sessionId } = await request.json();
        if (sessionId) {
            clearSession(sessionId);
        }
        return NextResponse.json({ ok: true });
    } catch {
        return NextResponse.json({ ok: true });
    }
}
