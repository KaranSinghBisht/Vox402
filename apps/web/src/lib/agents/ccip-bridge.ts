// apps/web/src/lib/agents/ccip-bridge.ts
// Chainlink CCIP cross-chain bridge for testnets
// Supports Avalanche Fuji, Base Sepolia, Ethereum Sepolia

import { encodeFunctionData, parseUnits } from "viem";

// CCIP Router ABI - minimal for ccipSend and getFee
export const CCIP_ROUTER_ABI = [
    {
        name: "ccipSend",
        type: "function",
        stateMutability: "payable",
        inputs: [
            { name: "destinationChainSelector", type: "uint64" },
            {
                name: "message",
                type: "tuple",
                components: [
                    { name: "receiver", type: "bytes" },
                    { name: "data", type: "bytes" },
                    {
                        name: "tokenAmounts", type: "tuple[]", components: [
                            { name: "token", type: "address" },
                            { name: "amount", type: "uint256" }
                        ]
                    },
                    { name: "feeToken", type: "address" },
                    { name: "extraArgs", type: "bytes" }
                ]
            }
        ],
        outputs: [{ name: "messageId", type: "bytes32" }]
    },
    {
        name: "getFee",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "destinationChainSelector", type: "uint64" },
            {
                name: "message",
                type: "tuple",
                components: [
                    { name: "receiver", type: "bytes" },
                    { name: "data", type: "bytes" },
                    {
                        name: "tokenAmounts", type: "tuple[]", components: [
                            { name: "token", type: "address" },
                            { name: "amount", type: "uint256" }
                        ]
                    },
                    { name: "feeToken", type: "address" },
                    { name: "extraArgs", type: "bytes" }
                ]
            }
        ],
        outputs: [{ name: "fee", type: "uint256" }]
    }
] as const;

// ERC20 approval ABI
export const ERC20_ABI = [
    {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
            { name: "spender", type: "address" },
            { name: "amount", type: "uint256" }
        ],
        outputs: [{ name: "", type: "bool" }]
    },
    {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" }
        ],
        outputs: [{ name: "", type: "uint256" }]
    }
] as const;

// CCIP Testnet Configuration
export const CCIP_CHAINS = {
    "avalanche-fuji": {
        chainId: 43113,
        name: "Avalanche Fuji",
        router: "0xF694E193200268f9a4868e4Aa017A0118C9a8177" as `0x${string}`,
        chainSelector: BigInt("14767482510784806043"),
        link: "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846" as `0x${string}`,
        usdc: "0x5425890298aed601595a70AB815c96711a31Bc65" as `0x${string}`,
        rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    },
    "base-sepolia": {
        chainId: 84532,
        name: "Base Sepolia",
        router: "0xD3b0F2a24c770c89736c6414C78D82A2E8088a93" as `0x${string}`,
        chainSelector: BigInt("10344971235874465080"),
        link: "0xE4aB69C077896252FAFBD49EFD26B5D171A32410" as `0x${string}`,
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
        rpcUrl: "https://sepolia.base.org",
    },
    "ethereum-sepolia": {
        chainId: 11155111,
        name: "Ethereum Sepolia",
        router: "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59" as `0x${string}`,
        chainSelector: BigInt("16015286601757825753"),
        link: "0x779877A7B0D9E8603169DdbD7836e478b4624789" as `0x${string}`,
        usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
        rpcUrl: "https://ethereum-sepolia.publicnode.com",
    },
} as const;

export type CCIPChainKey = keyof typeof CCIP_CHAINS;

// CCIP extraArgs for gas limit - EVMExtraArgsV1 tag + gas limit
// Tag: 0x97a657c90000000000000000000000000000000000000000000000000000000000000000
// + gasLimit uint256
function encodeExtraArgs(gasLimit: bigint = BigInt(200000)): `0x${string}` {
    // EVMExtraArgsV1Tag = 0x97a657c9
    const tag = "0x97a657c9";
    const gasLimitHex = gasLimit.toString(16).padStart(64, "0");
    return `${tag}${gasLimitHex}` as `0x${string}`;
}

// Encode receiver address to bytes
function encodeReceiver(address: string): `0x${string}` {
    return address.toLowerCase() as `0x${string}`;
}

export interface CCIPBridgeQuote {
    fromChain: CCIPChainKey;
    toChain: CCIPChainKey;
    token: string;
    tokenAddress: `0x${string}`;
    amount: string;
    amountWei: bigint;
    estimatedFee: string;
    feeToken: "LINK" | "NATIVE";
    estimatedTime: string;
    routerAddress: `0x${string}`;
    destinationChainSelector: bigint;
    message: {
        receiver: `0x${string}`;
        data: `0x${string}`;
        tokenAmounts: Array<{ token: `0x${string}`; amount: bigint }>;
        feeToken: `0x${string}`;
        extraArgs: `0x${string}`;
    };
}

export async function getCCIPBridgeQuote(params: {
    fromChain: string;
    toChain: string;
    token: string;
    amount: string;
    recipient: string;
}): Promise<CCIPBridgeQuote> {
    const { fromChain, toChain, token, amount, recipient } = params;

    // Normalize chain names
    const fromKey = normalizeChainName(fromChain);
    const toKey = normalizeChainName(toChain);

    if (!fromKey || !CCIP_CHAINS[fromKey]) {
        throw new Error(`Unsupported source chain: ${fromChain}. Supported: ${Object.keys(CCIP_CHAINS).join(", ")}`);
    }
    if (!toKey || !CCIP_CHAINS[toKey]) {
        throw new Error(`Unsupported destination chain: ${toChain}. Supported: ${Object.keys(CCIP_CHAINS).join(", ")}`);
    }

    const sourceChain = CCIP_CHAINS[fromKey];
    const destChain = CCIP_CHAINS[toKey];

    // Resolve token address on source chain
    const tokenAddress = resolveTokenAddress(token, fromKey);
    if (!tokenAddress) {
        throw new Error(`Token ${token} not supported on ${fromChain}`);
    }

    // Parse amount
    const decimals = token.toUpperCase() === "USDC" ? 6 : 18;
    const amountWei = parseUnits(amount, decimals);

    // Build CCIP message
    const message = {
        receiver: encodeReceiver(recipient),
        data: "0x" as `0x${string}`,
        tokenAmounts: [{ token: tokenAddress, amount: amountWei }],
        feeToken: "0x0000000000000000000000000000000000000000" as `0x${string}`, // Pay with native
        extraArgs: encodeExtraArgs(BigInt(200000)),
    };

    return {
        fromChain: fromKey,
        toChain: toKey,
        token: token.toUpperCase(),
        tokenAddress,
        amount,
        amountWei,
        estimatedFee: "~0.01 AVAX", // Approximate for testnet
        feeToken: "NATIVE",
        estimatedTime: "~5-10 minutes",
        routerAddress: sourceChain.router,
        destinationChainSelector: destChain.chainSelector,
        message,
    };
}

function normalizeChainName(chain: string): CCIPChainKey | null {
    const lower = chain.toLowerCase().replace(/[\s_-]/g, "");

    // Avalanche Fuji testnet - many variations
    if (
        lower.includes("fuji") ||
        lower === "avalanchefuji" ||
        lower === "avalanche" ||
        lower === "avax" ||
        lower === "avaxfuji"
    ) {
        return "avalanche-fuji";
    }

    // Base Sepolia testnet
    if (
        lower.includes("basesepolia") ||
        lower === "base" ||
        lower.includes("sepolia") && lower.includes("base")
    ) {
        return "base-sepolia";
    }

    // Ethereum Sepolia testnet
    if (
        lower.includes("ethereumsepolia") ||
        lower === "sepolia" ||
        lower === "ethereum" ||
        lower === "eth" ||
        lower === "ethsepolia"
    ) {
        return "ethereum-sepolia";
    }

    return null;
}

function resolveTokenAddress(token: string, chain: CCIPChainKey): `0x${string}` | null {
    const upper = token.toUpperCase();
    const chainConfig = CCIP_CHAINS[chain];

    if (upper === "USDC") return chainConfig.usdc;
    if (upper === "LINK") return chainConfig.link;

    // If it's already an address, return it
    if (token.startsWith("0x") && token.length === 42) {
        return token as `0x${string}`;
    }

    return null;
}

// Build transaction data for approval
export function buildApprovalTx(
    tokenAddress: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
): { to: `0x${string}`; data: `0x${string}` } {
    const data = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
    });

    return { to: tokenAddress, data };
}

// Build transaction data for CCIP send
export function buildCCIPSendTx(
    quote: CCIPBridgeQuote
): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
    const data = encodeFunctionData({
        abi: CCIP_ROUTER_ABI,
        functionName: "ccipSend",
        args: [quote.destinationChainSelector, quote.message],
    });

    // Estimate fee in native (0.01 AVAX/ETH for testnet)
    const estimatedFeeWei = parseUnits("0.02", 18); // Buffer for fee

    return {
        to: quote.routerAddress,
        data,
        value: estimatedFeeWei,
    };
}
