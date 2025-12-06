"use client";

import React, { useState, useEffect } from "react";
import { Globe, Home, Star, Shield, CheckCircle, Loader2, ExternalLink, Zap } from "lucide-react";

type ExternalAgent = {
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

type Props = {
    isOpen: boolean;
    onClose: () => void;
    category: "swap" | "yield" | "analytics";
    onSelectAgent: (agent: ExternalAgent) => void;
    userQuery: string;
};

export function AgentChoiceModal({ isOpen, onClose, category, onSelectAgent, userQuery }: Props) {
    const [agents, setAgents] = useState<ExternalAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedAgent, setSelectedAgent] = useState<ExternalAgent | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchAgents();
        }
    }, [isOpen, category]);

    async function fetchAgents() {
        setLoading(true);
        try {
            const res = await fetch("/api/registry/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category }),
            });
            const data = await res.json();
            setAgents(data.agents || []);
        } catch (err) {
            console.error("Failed to fetch agents:", err);
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    const nativeAgent = agents.find((a) => a.registry === "native");
    const externalAgents = agents.filter((a) => a.registry !== "native");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-avax-red/20 to-purple-500/20">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Globe className="w-6 h-6 text-avax-red" />
                        Choose Your Agent
                    </h2>
                    <p className="text-gray-400 mt-1 text-sm">
                        "{userQuery}" - Select an agent to handle this request
                    </p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 text-avax-red animate-spin" />
                        <span className="ml-3 text-gray-400">Searching registries...</span>
                    </div>
                ) : (
                    <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
                        {/* Native Agent Section */}
                        {nativeAgent && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Home className="w-4 h-4" />
                                    Native Agent
                                </h3>
                                <AgentCard
                                    agent={nativeAgent}
                                    isSelected={selectedAgent?.id === nativeAgent.id}
                                    onSelect={() => setSelectedAgent(nativeAgent)}
                                    isNative
                                />
                            </div>
                        )}

                        {/* External Agents Section */}
                        {externalAgents.length > 0 && (
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Globe className="w-4 h-4" />
                                    Explore Registry ({externalAgents.length} agents)
                                </h3>
                                <div className="space-y-3">
                                    {externalAgents.map((agent) => (
                                        <AgentCard
                                            key={agent.id}
                                            agent={agent}
                                            isSelected={selectedAgent?.id === agent.id}
                                            onSelect={() => setSelectedAgent(agent)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="p-4 border-t border-gray-700 flex justify-between items-center bg-gray-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => selectedAgent && onSelectAgent(selectedAgent)}
                        disabled={!selectedAgent}
                        className="px-6 py-2 bg-gradient-to-r from-avax-red to-red-600 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:from-avax-red/90 hover:to-red-500 transition-all flex items-center gap-2"
                    >
                        <Zap className="w-4 h-4" />
                        {selectedAgent?.priceUsd === 0
                            ? "Use Agent (Free)"
                            : `Pay ${selectedAgent?.price || ""} & Execute`}
                    </button>
                </div>
            </div>
        </div>
    );
}

function AgentCard({
    agent,
    isSelected,
    onSelect,
    isNative = false,
}: {
    agent: ExternalAgent;
    isSelected: boolean;
    onSelect: () => void;
    isNative?: boolean;
}) {
    return (
        <div
            onClick={onSelect}
            className={`
                p-4 rounded-xl border cursor-pointer transition-all duration-200
                ${isSelected
                    ? "border-avax-red bg-avax-red/10 shadow-lg shadow-avax-red/20"
                    : "border-gray-700 bg-gray-800/50 hover:border-gray-500"
                }
                ${isNative ? "ring-1 ring-avax-red/30" : ""}
            `}
        >
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-white">{agent.name}</h4>
                        {agent.verified && (
                            <Shield className="w-4 h-4 text-green-400" />
                        )}
                        {isNative && (
                            <span className="text-xs bg-avax-red/20 text-avax-red px-2 py-0.5 rounded-full">
                                Native
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-gray-400 mt-1">{agent.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {agent.rating && (
                            <span className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-yellow-400" />
                                {agent.rating}
                            </span>
                        )}
                        <span className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            {agent.registry.toUpperCase()}
                        </span>
                        {!isNative && (
                            <span className="flex items-center gap-1 text-blue-400">
                                <ExternalLink className="w-3 h-3" />
                                External
                            </span>
                        )}
                    </div>
                </div>
                <div className="text-right">
                    <span
                        className={`font-bold ${agent.priceUsd === 0 ? "text-green-400" : "text-white"
                            }`}
                    >
                        {agent.priceUsd === 0 ? "FREE" : agent.price}
                    </span>
                    {isSelected && (
                        <CheckCircle className="w-5 h-5 text-avax-red mt-2" />
                    )}
                </div>
            </div>
        </div>
    );
}
