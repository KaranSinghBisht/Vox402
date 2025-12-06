// Agent Discovery API - Lists all Vox402 agents and allows discovery via Reap Protocol
import { NextRequest, NextResponse } from "next/server";
import { VOX402_AGENTS, REAP_CONTRACTS } from "@/lib/reap-registry";

export async function GET(request: NextRequest) {
    const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "http://localhost:3000";

    // Build full agent list with URLs
    const agents = VOX402_AGENTS.map(agent => ({
        ...agent,
        url: `${baseUrl}${agent.endpoint}`,
        x402Compatible: agent.pricing !== "FREE",
    }));

    return NextResponse.json({
        name: "Vox402 Agent Network",
        description: "Voice-controlled AI agents for DeFi on Avalanche",
        version: "1.0.0",
        chain: "avalanche-fuji",
        chainId: 43113,
        reapRegistry: REAP_CONTRACTS["avalanche-fuji"],
        agents,
        totalAgents: agents.length,
        paidAgents: agents.filter(a => a.x402Compatible).length,
        freeAgents: agents.filter(a => !a.x402Compatible).length,
    });
}

export async function POST(request: NextRequest) {
    // Search for agents by capability
    try {
        const body = await request.json();
        const { query, category, onlyFree } = body;

        const baseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : "http://localhost:3000";

        let filteredAgents = VOX402_AGENTS;

        // Filter by category
        if (category) {
            filteredAgents = filteredAgents.filter(a => a.category === category);
        }

        // Filter by free only
        if (onlyFree) {
            filteredAgents = filteredAgents.filter(a => a.pricing === "FREE");
        }

        // Search by query
        if (query) {
            const q = query.toLowerCase();
            filteredAgents = filteredAgents.filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.description.toLowerCase().includes(q) ||
                a.id.toLowerCase().includes(q)
            );
        }

        const results = filteredAgents.map(agent => ({
            ...agent,
            url: `${baseUrl}${agent.endpoint}`,
            x402Compatible: agent.pricing !== "FREE",
        }));

        return NextResponse.json({
            query: query || null,
            category: category || null,
            results,
            count: results.length,
        });
    } catch (error) {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
}
