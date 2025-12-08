// apps/web/src/app/api/run/route.ts
// Agent execution endpoint - proxies to agent services or runs inline
import { NextRequest, NextResponse } from "next/server";
import { getBridgeQuote, CHAIN_IDS } from "@/lib/agents/bridge";
import { getMainnetSwapQuote, SWAP_CONFIG } from "@/lib/agents/swap";

// Agent URL configuration
// Local dev: use external agent services running on localhost
// Vercel production: use internal Next.js API routes (no external agents available)
const isVercel = !!process.env.VERCEL;

const getBaseUrl = () => {
    if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
    return "http://localhost:3000";
};

// External agent URLs (local dev only)
const WALLET_AGENT_URL = process.env.WALLET_AGENT_URL || "http://localhost:4102/balances";
const PORTFOLIO_AGENT_URL = process.env.PORTFOLIO_AGENT_URL || "http://localhost:4104/analyze";
const TX_ANALYZER_AGENT_URL = process.env.TX_ANALYZER_AGENT_URL || "http://localhost:4105/analyze";
const SWAP_AGENT_URL = process.env.SWAP_AGENT_URL || "http://localhost:4103/quote";
const CONTRACT_INSPECTOR_AGENT_URL = process.env.CONTRACT_INSPECTOR_AGENT_URL || "http://localhost:4106/inspect";
const YIELD_AGENT_URL = process.env.YIELD_AGENT_URL || "http://localhost:4108/invest";

// ============ Inline agent implementations ============

// Chart agent - FREE, uses CoinGecko
async function inlineChartAgent(args: { coinId: string; days: number; vs: string }) {
    const { coinId, vs, days } = args;
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=${encodeURIComponent(vs)}&days=${days}`;

    const r = await fetch(url, { headers: { accept: "application/json" } });
    if (!r.ok) {
        return { error: "upstream_failed", status: r.status };
    }

    const j: any = await r.json();
    const prices: [number, number][] = Array.isArray(j?.prices) ? j.prices : [];
    const series = prices.map(([t, price]) => ({ t, price }));

    return {
        coinId,
        vs,
        days,
        series,
        meta: { source: "coingecko", points: series.length, pricing: "FREE" },
    };
}

// Mainnet swap - uses LI.FI for quotes (no x402 payment)
async function inlineMainnetSwapAgent(args: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    recipient: string;
}) {
    try {
        const quote = await getMainnetSwapQuote(args);
        return {
            quote,
            summary: [
                `💱 Mainnet Swap Quote`,
                `${quote.tokenIn} → ${quote.tokenOut}`,
                `Amount: ${quote.amountOutFormatted} ${quote.tokenOut}`,
                `Price impact: ${quote.priceImpact}`,
                `Chain: Avalanche (${quote.chainId})`,
            ].join("\n"),
            network: "mainnet",
            requiresApproval: true,
            tx: quote.tx,
        };
    } catch (error: any) {
        return {
            error: "mainnet_swap_failed",
            message: error?.message || "Failed to get mainnet swap quote",
        };
    }
}

// Bridge agent - Mainnet only via LI.FI
async function inlineBridgeAgent(args: {
    token: string;
    amount: string;
    fromChain: string;
    toChain: string;
    recipient: string;
}) {
    const { token, amount, fromChain, toChain, recipient } = args;

    // Parse amount to base units
    const decimals = token.toUpperCase() === "USDC" || token.toUpperCase() === "USDT" ? 6 : 18;
    const amountFloat = parseFloat(amount);
    const fromAmount = (BigInt(Math.floor(amountFloat * 10 ** decimals))).toString();

    try {
        const quote = await getBridgeQuote({
            fromChain,
            toChain,
            fromToken: token,
            toToken: token,
            fromAmount,
            fromAddress: recipient,
            slippage: 0.03,
        });

        const toAmountFloat = Number(quote.toAmount) / 10 ** decimals;

        return {
            quote: {
                ...quote,
                toAmountFormatted: toAmountFloat.toFixed(4),
                inputAmount: amount,
            },
            summary: [
                `🌉 Cross-Chain Bridge via LI.FI`,
                `From: ${quote.fromChain} → To: ${quote.toChain}`,
                `Amount: ${amount} ${token.toUpperCase()} → ~${toAmountFloat.toFixed(4)} ${token.toUpperCase()}`,
                `Bridge: ${quote.bridgeName}`,
                `Estimated time: ${quote.estimatedTime}`,
                `⚠️ This uses REAL mainnet funds`,
            ].join("\n"),
            network: "mainnet",
            tx: quote.transactionRequest ? {
                to: quote.transactionRequest.to,
                data: quote.transactionRequest.data,
                value: quote.transactionRequest.value,
                chainId: quote.fromChainId,
            } : null,
        };
    } catch (error: any) {
        return {
            error: "bridge_failed",
            message: error?.message || "Failed to get bridge quote",
            hint: "Supported chains: avalanche, ethereum, base, polygon, arbitrum. Supported tokens: USDC, AVAX, ETH, MATIC.",
        };
    }
}

// Call external agent services (local dev)
async function callExternalAgent(
    agentUrl: string,
    args: any,
    xPayment?: string
): Promise<{ status: number; body: any; xPaymentResponse?: string }> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (xPayment) headers["X-PAYMENT"] = xPayment;

    try {
        const r = await fetch(agentUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(args),
        });

        const xPaymentResponse = r.headers.get("x-payment-response") || r.headers.get("X-PAYMENT-RESPONSE") || undefined;
        const body = await r.json().catch(() => ({}));

        return { status: r.status, body, xPaymentResponse };
    } catch (error: any) {
        return {
            status: 502,
            body: { error: "agent_unreachable", message: error?.message, hint: `Is the agent running at ${agentUrl}?` },
        };
    }
}

// Call internal Next.js API routes (Vercel production)
async function callInternalAgent(
    endpoint: string,
    args: any,
    xPayment?: string
): Promise<{ status: number; body: any; xPaymentResponse?: string }> {
    const baseUrl = getBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (xPayment) headers["X-PAYMENT"] = xPayment;

    try {
        const r = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(args),
        });

        const xPaymentResponse = r.headers.get("x-payment-response") || r.headers.get("X-PAYMENT-RESPONSE") || undefined;
        const body = await r.json().catch(() => ({}));

        return { status: r.status, body, xPaymentResponse };
    } catch (error: any) {
        return {
            status: 502,
            body: { error: "agent_unreachable", message: error?.message },
        };
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { action, xPayment: bodyXPayment } = body;

        if (!action?.kind) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        // Get x-payment from header or body
        const xPayment = request.headers.get("x-payment") || request.headers.get("X-PAYMENT") || bodyXPayment;

        // Determine network from action args
        const network = action.args?.network?.toLowerCase() === "mainnet" ? "mainnet" : "testnet";

        let agentUrl = "";
        let agentEndpoint = "";
        let agentArgs = action.args;
        let inlineAgent: "chart" | "bridge" | "swap_mainnet" | null = null;

        // Route to appropriate agent
        // Local dev: use external localhost agents
        // Vercel: use internal Next.js API routes
        switch (action.kind) {
            case "chart":
                inlineAgent = "chart";
                break;
            case "bridge":
                inlineAgent = "bridge";
                break;
            case "swap":
                agentUrl = SWAP_AGENT_URL;
                agentEndpoint = "/api/agents/swap";
                break;
            case "wallet":
            case "portfolio":
                agentUrl = action.kind === "wallet" ? WALLET_AGENT_URL : PORTFOLIO_AGENT_URL;
                agentEndpoint = "/api/agents/portfolio";
                break;
            case "tx_analyzer":
                agentUrl = TX_ANALYZER_AGENT_URL;
                agentEndpoint = "/api/agents/analyze";
                break;
            case "contract_inspector":
                agentUrl = CONTRACT_INSPECTOR_AGENT_URL;
                agentEndpoint = "/api/agents/inspect";
                break;
            case "yield":
                agentUrl = YIELD_AGENT_URL;
                agentEndpoint = "/api/agents/yield";
                break;
            default:
                return NextResponse.json({ error: "Unknown action kind" }, { status: 400 });
        }

        // Handle inline implementations
        if (inlineAgent === "chart") {
            const result = await inlineChartAgent(action.args);
            return NextResponse.json({ status: "ok", result });
        }
        if (inlineAgent === "bridge") {
            const result = await inlineBridgeAgent(action.args);
            if (result.error) {
                return NextResponse.json({ status: "error", ...result }, { status: 400 });
            }
            return NextResponse.json({ status: "ok", result });
        }
        if (inlineAgent === "swap_mainnet") {
            const result = await inlineMainnetSwapAgent(action.args);
            if (result.error) {
                return NextResponse.json({ status: "error", ...result }, { status: 400 });
            }
            return NextResponse.json({ status: "ok", result });
        }

        // Call agent: external (local dev) or internal (Vercel)
        // With fallback: if external agent fails, try internal route
        let agentResult: { status: number; body: any; xPaymentResponse?: string };

        if (isVercel) {
            agentResult = await callInternalAgent(agentEndpoint, agentArgs, xPayment);
        } else {
            agentResult = await callExternalAgent(agentUrl, agentArgs, xPayment);
            // Fallback to internal route if external agent is unreachable
            if (agentResult.status === 502 && agentEndpoint) {
                console.log(`External agent at ${agentUrl} unreachable, falling back to internal route ${agentEndpoint}`);
                agentResult = await callInternalAgent(agentEndpoint, agentArgs, xPayment);
            }
        }

        const { status, body: agentBody, xPaymentResponse } = agentResult;

        // Create response with x-payment-response header if present
        const responseHeaders: Record<string, string> = {};
        if (xPaymentResponse) {
            responseHeaders["X-PAYMENT-RESPONSE"] = xPaymentResponse;
        }

        if (status === 402) {
            return NextResponse.json(
                { status: "payment_required", ...agentBody },
                { status: 402, headers: responseHeaders }
            );
        }

        if (status >= 400) {
            return NextResponse.json(
                { status: "error", upstream_status: status, body: agentBody },
                { status: 502, headers: responseHeaders }
            );
        }

        return NextResponse.json(
            { status: "ok", result: agentBody, xPaymentResponse },
            { headers: responseHeaders }
        );
    } catch (error: any) {
        console.error("Run API error:", error);
        return NextResponse.json(
            { status: "error", message: error?.message || "Internal server error" },
            { status: 500 }
        );
    }
}

