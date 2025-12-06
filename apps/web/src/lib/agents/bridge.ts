// apps/web/src/lib/agents/bridge.ts
// Cross-chain bridge agent using LI.FI API
// LI.FI is a bridge/DEX aggregator that finds best routes across chains

const LIFI_BASE_URL = "https://li.quest/v1";

// Chain IDs
export const CHAIN_IDS: Record<string, number> = {
    "avalanche": 43114,
    "avalanche-fuji": 43113,  // Testnet - LI.FI may not support
    "ethereum": 1,
    "ethereum-sepolia": 11155111,
    "base": 8453,
    "base-sepolia": 84532,
    "polygon": 137,
    "arbitrum": 42161,
    "optimism": 10,
    "bsc": 56,
};

// Common tokens by chain
export const TOKENS: Record<number, Record<string, string>> = {
    // Avalanche mainnet
    43114: {
        "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
        "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
        "AVAX": "0x0000000000000000000000000000000000000000", // Native
        "WAVAX": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    },
    // Ethereum mainnet
    1: {
        "USDC": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        "USDT": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        "ETH": "0x0000000000000000000000000000000000000000",
        "WETH": "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    },
    // Base
    8453: {
        "USDC": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "ETH": "0x0000000000000000000000000000000000000000",
        "WETH": "0x4200000000000000000000000000000000000006",
    },
    // Polygon
    137: {
        "USDC": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "USDT": "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
        "MATIC": "0x0000000000000000000000000000000000000000",
        "WMATIC": "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    },
    // Arbitrum
    42161: {
        "USDC": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        "ETH": "0x0000000000000000000000000000000000000000",
        "WETH": "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    },
};

export interface BridgeQuote {
    fromChain: string;
    fromChainId: number;
    toChain: string;
    toChainId: number;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    toAmount: string;
    estimatedGas: string;
    bridgeName: string;
    estimatedTime: string;
    transactionRequest?: {
        to: string;
        data: string;
        value: string;
        gasLimit?: string;
    };
}

export interface BridgeQuoteParams {
    fromChain: string;
    toChain: string;
    fromToken: string;
    toToken: string;
    fromAmount: string;
    fromAddress: string;
    slippage?: number; // default 0.03 (3%)
}

export async function getBridgeQuote(params: BridgeQuoteParams): Promise<BridgeQuote> {
    const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, slippage = 0.03 } = params;

    // Resolve chain IDs
    const fromChainId = CHAIN_IDS[fromChain.toLowerCase()];
    const toChainId = CHAIN_IDS[toChain.toLowerCase()];

    if (!fromChainId) throw new Error(`Unsupported source chain: ${fromChain}`);
    if (!toChainId) throw new Error(`Unsupported destination chain: ${toChain}`);

    // Resolve token addresses
    const fromTokenAddr = resolveToken(fromToken, fromChainId);
    const toTokenAddr = resolveToken(toToken, toChainId);

    // Build query params
    const queryParams = new URLSearchParams({
        fromChain: fromChainId.toString(),
        toChain: toChainId.toString(),
        fromToken: fromTokenAddr,
        toToken: toTokenAddr,
        fromAmount,
        fromAddress,
        slippage: slippage.toString(),
    });

    const url = `${LIFI_BASE_URL}/quote?${queryParams.toString()}`;

    const response = await fetch(url, {
        headers: {
            "Accept": "application/json",
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `LI.FI API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract relevant info from LI.FI response
    const estimate = data.estimate;
    const action = data.action;
    const transactionRequest = data.transactionRequest;

    return {
        fromChain,
        fromChainId,
        toChain,
        toChainId,
        fromToken: action?.fromToken?.symbol || fromToken,
        toToken: action?.toToken?.symbol || toToken,
        fromAmount: estimate?.fromAmount || fromAmount,
        toAmount: estimate?.toAmount || "0",
        estimatedGas: estimate?.gasCosts?.[0]?.amountUSD || "~$0.50",
        bridgeName: data.tool || data.toolDetails?.name || "LI.FI",
        estimatedTime: formatDuration(estimate?.executionDuration || 180),
        transactionRequest: transactionRequest ? {
            to: transactionRequest.to,
            data: transactionRequest.data,
            value: transactionRequest.value || "0",
            gasLimit: transactionRequest.gasLimit,
        } : undefined,
    };
}

function resolveToken(token: string, chainId: number): string {
    // If it's already an address, return it
    if (token.startsWith("0x")) return token;

    // Look up by symbol
    const chainTokens = TOKENS[chainId];
    if (chainTokens) {
        const upper = token.toUpperCase();
        if (chainTokens[upper]) return chainTokens[upper];
    }

    // For native tokens
    if (["ETH", "AVAX", "MATIC", "BNB"].includes(token.toUpperCase())) {
        return "0x0000000000000000000000000000000000000000";
    }

    throw new Error(`Unknown token ${token} on chain ${chainId}`);
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `~${seconds} seconds`;
    if (seconds < 3600) return `~${Math.round(seconds / 60)} minutes`;
    return `~${Math.round(seconds / 3600)} hours`;
}

// Get supported chains
export async function getSupportedChains(): Promise<any[]> {
    const response = await fetch(`${LIFI_BASE_URL}/chains`);
    if (!response.ok) throw new Error("Failed to fetch chains");
    const data = await response.json();
    return data.chains || [];
}

// Get tokens for a chain
export async function getTokens(chainId: number): Promise<any[]> {
    const response = await fetch(`${LIFI_BASE_URL}/tokens?chains=${chainId}`);
    if (!response.ok) throw new Error("Failed to fetch tokens");
    const data = await response.json();
    return data.tokens?.[chainId] || [];
}
