// apps/web/src/lib/agents/swap.ts
// Swap agent with mainnet/testnet support
// Mainnet: Uses Trader Joe API for quotes
// Testnet: Proxies to existing swap-agent service with x402

import { formatUnits, parseUnits } from "viem";

// Trader Joe API for mainnet
const TRADER_JOE_API = "https://api.traderjoexyz.com";

// Network configuration
export const SWAP_CONFIG = {
    mainnet: {
        chainId: 43114,
        routerAddress: "0x60aE616a2155Ee3d9A68541Ba4544862310933d4", // Trader Joe Router
        usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        wavax: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
        nativeToken: "0x0000000000000000000000000000000000000000",
    },
    testnet: {
        chainId: 43113,
        routerAddress: "0x2D99ABD9008Dc933ff5c0CD271B88309593aB921", // Pangolin
        usdc: "0x5425890298aed601595a70AB815c96711a31Bc65",
        wavax: "0xd00ae08403b9bbb9124bb305c09058e32c39a48c",
        nativeToken: "0x0000000000000000000000000000000000000000",
    },
};

export interface SwapQuote {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    amountOutFormatted: string;
    priceImpact: string;
    route: string[];
    network: "mainnet" | "testnet";
    chainId: number;
    tx?: {
        to: string;
        data: string;
        value: string;
    };
}

// Get mainnet swap quote using LI.FI (works for same-chain swaps too)
export async function getMainnetSwapQuote(args: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    recipient: string;
}): Promise<SwapQuote> {
    const { tokenIn, tokenOut, amountIn, recipient } = args;
    const config = SWAP_CONFIG.mainnet;

    // Use LI.FI for mainnet swaps (works for same-chain swaps on Avalanche)
    const queryParams = new URLSearchParams({
        fromChain: config.chainId.toString(),
        toChain: config.chainId.toString(),
        fromToken: tokenIn,
        toToken: tokenOut,
        fromAmount: amountIn,
        fromAddress: recipient,
        slippage: "0.03",
    });

    const url = `https://li.quest/v1/quote?${queryParams.toString()}`;

    try {
        const response = await fetch(url, {
            headers: { "Accept": "application/json" },
        });

        if (!response.ok) {
            throw new Error(`LI.FI API error: ${response.status}`);
        }

        const data = await response.json();
        const estimate = data.estimate;
        const transactionRequest = data.transactionRequest;

        // Determine token decimals for formatting
        const tokenInUpper = tokenIn.toUpperCase();
        const tokenOutUpper = tokenOut.toUpperCase();
        const outDecimals = tokenOutUpper.includes("USDC") || tokenOutUpper.includes("USDT") ? 6 : 18;

        const amountOutFormatted = estimate?.toAmount
            ? formatUnits(BigInt(estimate.toAmount), outDecimals)
            : "0";

        return {
            tokenIn: data.action?.fromToken?.symbol || "TOKEN",
            tokenOut: data.action?.toToken?.symbol || "TOKEN",
            amountIn,
            amountOut: estimate?.toAmount || "0",
            amountOutFormatted,
            priceImpact: estimate?.priceImpact || "< 0.1%",
            route: [data.action?.fromToken?.symbol, data.action?.toToken?.symbol].filter(Boolean),
            network: "mainnet",
            chainId: config.chainId,
            tx: transactionRequest ? {
                to: transactionRequest.to,
                data: transactionRequest.data,
                value: transactionRequest.value || "0",
            } : undefined,
        };
    } catch (error: any) {
        throw new Error(`Mainnet swap quote failed: ${error.message}`);
    }
}

// Testnet swap - returns structured info for the external swap agent
export async function getTestnetSwapInfo(args: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    recipient: string;
}): Promise<{ args: any; requiresX402: boolean }> {
    return {
        args: {
            ...args,
            slippageBps: 50,
        },
        requiresX402: true,
    };
}
