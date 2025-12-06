// Thirdweb x402 Payment Utilities for Agent API Routes
import { createThirdwebClient } from "thirdweb";
import { facilitator, settlePayment, type SettlePaymentResult } from "thirdweb/x402";
import { avalancheFuji } from "thirdweb/chains";

// Constants
export const USDC_FUJI = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
export const WAVAX_FUJI = "0xd00ae08403b9bbb9124bb305c09058e32c39a48c" as const;
export const CHAIN_ID = 43113 as const;

// Get Thirdweb client (lazy initialization)
let _client: ReturnType<typeof createThirdwebClient> | null = null;

function getClient() {
    if (!_client) {
        const secretKey = process.env.THIRDWEB_SECRET_KEY;
        if (!secretKey) {
            throw new Error("Missing THIRDWEB_SECRET_KEY environment variable");
        }
        _client = createThirdwebClient({ secretKey });
    }
    return _client;
}

// Get facilitator for x402 payments
export function getX402Facilitator() {
    const client = getClient();
    const serverWalletAddress = process.env.CHART_AGENT_PAYTO;

    if (!serverWalletAddress) {
        throw new Error("Missing CHART_AGENT_PAYTO environment variable");
    }

    return facilitator({
        client,
        serverWalletAddress: serverWalletAddress as `0x${string}`,
    });
}

// Settle x402 payment for an agent endpoint
export async function settleAgentPayment(
    request: Request,
    resourceUrl: string,
    priceUsd: string = "$0.01"
): Promise<SettlePaymentResult> {
    const paymentData = request.headers.get("x-payment");
    const serverWalletAddress = process.env.CHART_AGENT_PAYTO;

    if (!serverWalletAddress) {
        throw new Error("Missing CHART_AGENT_PAYTO environment variable");
    }

    return settlePayment({
        resourceUrl,
        method: request.method as "GET" | "POST",
        paymentData,
        payTo: serverWalletAddress as `0x${string}`,
        network: avalancheFuji,
        price: priceUsd,
        facilitator: getX402Facilitator(),
        routeConfig: {
            description: `Access to ${resourceUrl}`,
            mimeType: "application/json",
        },
    });
}

// Helper to create x402 response (for non-200 cases)
export function createX402Response(result: SettlePaymentResult): Response {
    // For 402 responses, responseBody exists; for 200 we shouldn't call this
    const body = "responseBody" in result ? result.responseBody : { error: "Unknown error" };
    return Response.json(body, {
        status: result.status,
        headers: result.responseHeaders,
    });
}

