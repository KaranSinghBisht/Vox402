// Reap Protocol Registry Utilities
// Register agents with Reap's on-chain registry for discoverability

// Agent metadata for registration
export const VOX402_AGENTS = [
    {
        id: "chart-agent",
        name: "Vox402 Chart Agent",
        description: "Real-time cryptocurrency price charts",
        endpoint: "/api/run",
        pricing: "FREE",
        category: "analytics",
        registry: "x402" as const,
    },
    {
        id: "portfolio-agent",
        name: "Vox402 Portfolio Agent",
        description: "Wallet portfolio tracking and analysis",
        endpoint: "/api/run",
        pricing: "FREE",
        category: "analytics",
        registry: "x402" as const,
    },
    {
        id: "bridge-agent",
        name: "Vox402 Bridge Agent",
        description: "Cross-chain bridge information",
        endpoint: "/api/bridge",
        pricing: "FREE",
        category: "bridge",
        registry: "x402" as const,
    },
    {
        id: "swap-agent",
        name: "Vox402 Swap Agent",
        description: "Token swaps on Avalanche (USDC <-> WAVAX)",
        endpoint: "/api/agents/swap",
        pricing: "$0.01 USDC",
        category: "defi",
        registry: "x402" as const,
    },
    {
        id: "yield-agent",
        name: "Vox402 Yield Agent",
        description: "DeFi yield strategies and vault deposits",
        endpoint: "/api/agents/yield",
        pricing: "$0.01 USDC",
        category: "defi",
        registry: "x402" as const,
    },
    {
        id: "tx-analyzer-agent",
        name: "Vox402 TX Analyzer",
        description: "Transaction history analysis",
        endpoint: "/api/agents/analyze",
        pricing: "FREE",
        category: "analytics",
        registry: "x402" as const,
    },
    {
        id: "contract-inspector-agent",
        name: "Vox402 Contract Inspector",
        description: "Smart contract analysis and verification",
        endpoint: "/api/agents/inspect",
        pricing: "$0.01 USDC",
        category: "security",
        registry: "x402" as const,
    },
    {
        id: "wallet-agent",
        name: "Vox402 Wallet Agent",
        description: "Wallet operations and management",
        endpoint: "/api/agents/wallet",
        pricing: "FREE",
        category: "wallet",
        registry: "x402" as const,
    },
];

// Reap Protocol contract addresses
export const REAP_CONTRACTS = {
    "avalanche-fuji": {
        registry: "0x93498CAda15768E301AB8C6fc3Bc17402Ad078AA" as const,
        holocronRouter: "0x2cEC5Bf3a0D3fEe4E13e8f2267176BdD579F4fd8" as const,
        middleware: "https://avax2.api.reap.deals",
    },
};

// Get full agent URL
export function getAgentUrl(agentId: string, baseUrl: string): string | undefined {
    const agent = VOX402_AGENTS.find(a => a.id === agentId);
    if (!agent) return undefined;
    return `${baseUrl}${agent.endpoint}`;
}

// Get agent metadata by ID
export function getAgentMetadata(agentId: string) {
    return VOX402_AGENTS.find(a => a.id === agentId);
}
