// Registry Search API - Search for agents in Reap Protocol and other registries
import { NextRequest, NextResponse } from "next/server";
import { REAP_CONTRACTS } from "@/lib/reap-registry";

// Types for external agents
export type ExternalAgent = {
    id: string;
    name: string;
    description: string;
    url: string;
    price: string;
    priceUsd: number;
    registry: "reap" | "mcp" | "a2a" | "native";
    category: string;
    rating?: number;
    verified?: boolean;
};

// Mock agents for demo (simulating Reap registry results)
const MOCK_EXTERNAL_AGENTS: ExternalAgent[] = [
    {
        id: "reap-swap-1",
        name: "DexMaster Agent",
        description: "Multi-DEX aggregator for best swap rates",
        url: "https://dexmaster.example.com/api/swap",
        price: "0.005 USDC",
        priceUsd: 0.005,
        registry: "reap",
        category: "swap",
        rating: 4.8,
        verified: true,
    },
    {
        id: "reap-swap-2",
        name: "QuickSwap AI",
        description: "Fast swaps optimized for gas efficiency",
        url: "https://quickswap-ai.example.com/swap",
        price: "0.008 USDC",
        priceUsd: 0.008,
        registry: "reap",
        category: "swap",
        rating: 4.5,
        verified: true,
    },
    {
        id: "reap-swap-3",
        name: "Pangolin Pro",
        description: "Native Pangolin DEX integration",
        url: "https://pangolin-pro.example.com/api",
        price: "FREE",
        priceUsd: 0,
        registry: "reap",
        category: "swap",
        rating: 4.2,
        verified: false,
    },
    {
        id: "reap-yield-1",
        name: "YieldMax Protocol",
        description: "Automated yield optimization across DeFi",
        url: "https://yieldmax.example.com/api/invest",
        price: "0.02 USDC",
        priceUsd: 0.02,
        registry: "reap",
        category: "yield",
        rating: 4.7,
        verified: true,
    },
    {
        id: "reap-yield-2",
        name: "StableFarm AI",
        description: "Stablecoin yield farming strategies",
        url: "https://stablefarm.example.com/deposit",
        price: "0.015 USDC",
        priceUsd: 0.015,
        registry: "reap",
        category: "yield",
        rating: 4.4,
        verified: true,
    },
    {
        id: "reap-analyze-1",
        name: "ChainScope",
        description: "Deep transaction and wallet analysis",
        url: "https://chainscope.example.com/analyze",
        price: "0.01 USDC",
        priceUsd: 0.01,
        registry: "reap",
        category: "analytics",
        rating: 4.6,
        verified: true,
    },
];

// Native Vox402 agents for comparison
const NATIVE_AGENTS: ExternalAgent[] = [
    {
        id: "vox402-swap",
        name: "Vox402 Swap",
        description: "Native swap agent (USDC ↔ WAVAX)",
        url: "/api/agents/swap",
        price: "0.01 USDC",
        priceUsd: 0.01,
        registry: "native",
        category: "swap",
        rating: 5.0,
        verified: true,
    },
    {
        id: "vox402-yield",
        name: "Vox402 Yield",
        description: "Native yield strategies (ERC4626)",
        url: "/api/agents/yield",
        price: "0.01 USDC",
        priceUsd: 0.01,
        registry: "native",
        category: "yield",
        rating: 5.0,
        verified: true,
    },
    {
        id: "vox402-analyze",
        name: "Vox402 Analyzer",
        description: "Native transaction analyzer",
        url: "/api/agents/analyze",
        price: "FREE",
        priceUsd: 0,
        registry: "native",
        category: "analytics",
        rating: 5.0,
        verified: true,
    },
];

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { category, includeNative = true } = body;

        if (!category) {
            return NextResponse.json({ error: "Missing category" }, { status: 400 });
        }

        // Filter agents by category
        const externalAgents = MOCK_EXTERNAL_AGENTS.filter(
            (a) => a.category === category
        );

        const nativeAgents = includeNative
            ? NATIVE_AGENTS.filter((a) => a.category === category)
            : [];

        // Sort by price (cheapest first), with native first
        const allAgents = [...nativeAgents, ...externalAgents].sort(
            (a, b) => a.priceUsd - b.priceUsd
        );

        return NextResponse.json({
            category,
            agents: allAgents,
            totalCount: allAgents.length,
            nativeCount: nativeAgents.length,
            externalCount: externalAgents.length,
            reapContract: REAP_CONTRACTS["avalanche-fuji"],
            note: "External agents are simulated for demo. In production, these come from Reap Protocol registry.",
        });
    } catch (error) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
}

export async function GET() {
    return NextResponse.json({
        description: "Search for agents across registries",
        usage: "POST with { category: 'swap' | 'yield' | 'analytics' }",
        reapContract: REAP_CONTRACTS["avalanche-fuji"],
        supportedCategories: ["swap", "yield", "analytics"],
    });
}
