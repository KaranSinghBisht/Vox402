"use client";

import React, { useState, useEffect } from "react";
import { Sparkles, Home, Star, Shield, CheckCircle2, Loader2, ExternalLink, Zap, X, Radio } from "lucide-react";

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
            // Auto-select native agent
            const native = data.agents?.find((a: ExternalAgent) => a.registry === "native");
            if (native) setSelectedAgent(native);
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-xl bg-zinc-900/95 border border-white/10 rounded-3xl overflow-hidden shadow-2xl shadow-avax-red/10 animate-in fade-in zoom-in-95 duration-200">
                {/* Decorative gradient */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-avax-red/20 via-avax-red/5 to-transparent pointer-events-none" />
                <div className="absolute top-[-50px] right-[-50px] w-[150px] h-[150px] bg-avax-red/20 rounded-full blur-[80px] pointer-events-none" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
                >
                    <X className="w-5 h-5 text-gray-400" />
                </button>

                {/* Header */}
                <div className="relative p-6 pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-avax-red to-red-600 flex items-center justify-center shadow-lg shadow-avax-red/30">
                            <Radio className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Agent Registry</h2>
                            <p className="text-sm text-gray-400">Powered by Reap Protocol</p>
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-300 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                        <span className="text-gray-500">Request:</span> &quot;{userQuery}&quot;
                    </p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="relative">
                            <Loader2 className="w-10 h-10 text-avax-red animate-spin" />
                            <div className="absolute inset-0 rounded-full bg-avax-red/20 blur-xl" />
                        </div>
                        <span className="text-gray-400 text-sm">Discovering agents...</span>
                    </div>
                ) : (
                    <div className="px-6 pb-2 space-y-4 max-h-[50vh] overflow-y-auto">
                        {/* Native Agent - Featured */}
                        {nativeAgent && (
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Home className="w-4 h-4 text-avax-red" />
                                    <span className="text-xs font-semibold text-avax-red uppercase tracking-wider">Recommended</span>
                                </div>
                                <NativeAgentCard
                                    agent={nativeAgent}
                                    isSelected={selectedAgent?.id === nativeAgent.id}
                                    onSelect={() => setSelectedAgent(nativeAgent)}
                                />
                            </div>
                        )}

                        {/* External Agents */}
                        {externalAgents.length > 0 && (
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">External Agents</span>
                                    <span className="text-xs text-gray-600">({externalAgents.length})</span>
                                </div>
                                <div className="space-y-2">
                                    {externalAgents.map((agent) => (
                                        <ExternalAgentCard
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
                <div className="p-4 border-t border-white/5 bg-black/20 flex items-center justify-between gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => selectedAgent && onSelectAgent(selectedAgent)}
                        disabled={!selectedAgent}
                        className="flex-1 max-w-[200px] px-4 py-2.5 bg-gradient-to-r from-avax-red to-red-600 hover:from-red-500 hover:to-red-700 text-white rounded-xl font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-avax-red/20 hover:shadow-avax-red/30 flex items-center justify-center gap-2"
                    >
                        <Zap className="w-4 h-4" />
                        {selectedAgent?.priceUsd === 0
                            ? "Execute Free"
                            : `Pay ${selectedAgent?.price || "..."}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Native agent card - featured styling
function NativeAgentCard({ agent, isSelected, onSelect }: { agent: ExternalAgent; isSelected: boolean; onSelect: () => void }) {
    return (
        <div
            onClick={onSelect}
            className={`
                relative p-4 rounded-2xl cursor-pointer transition-all duration-200 overflow-hidden
                ${isSelected
                    ? "bg-gradient-to-br from-avax-red/20 to-avax-red/5 border-2 border-avax-red shadow-lg shadow-avax-red/20"
                    : "bg-white/5 border border-white/10 hover:border-avax-red/50 hover:bg-white/10"
                }
            `}
        >
            {/* Native badge glow */}
            {isSelected && (
                <div className="absolute top-0 right-0 w-24 h-24 bg-avax-red/30 rounded-full blur-[50px] pointer-events-none" />
            )}

            <div className="relative flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg font-bold text-white">{agent.name}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase bg-avax-red text-white rounded-full">
                            Native
                        </span>
                        {agent.verified && <Shield className="w-4 h-4 text-green-400" />}
                    </div>
                    <p className="text-sm text-gray-400">{agent.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                        {agent.rating && (
                            <span className="flex items-center gap-1 text-xs text-yellow-400">
                                <Star className="w-3 h-3 fill-yellow-400" />
                                {agent.rating}
                            </span>
                        )}
                        <span className="text-xs text-gray-500">Vox402</span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <span className={`text-lg font-bold ${agent.priceUsd === 0 ? "text-green-400" : "text-white"}`}>
                        {agent.priceUsd === 0 ? "FREE" : agent.price}
                    </span>
                    {isSelected && <CheckCircle2 className="w-6 h-6 text-avax-red" />}
                </div>
            </div>
        </div>
    );
}

// External agent card - compact styling
function ExternalAgentCard({ agent, isSelected, onSelect }: { agent: ExternalAgent; isSelected: boolean; onSelect: () => void }) {
    return (
        <div
            onClick={onSelect}
            className={`
                p-3 rounded-xl cursor-pointer transition-all duration-200
                ${isSelected
                    ? "bg-purple-500/10 border border-purple-500/50"
                    : "bg-white/5 border border-transparent hover:border-white/20 hover:bg-white/10"
                }
            `}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate">{agent.name}</span>
                        {agent.verified && <Shield className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{agent.description}</p>
                </div>
                <div className="flex items-center gap-3">
                    {agent.rating && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Star className="w-3 h-3 text-yellow-400" />
                            {agent.rating}
                        </span>
                    )}
                    <span className={`text-sm font-semibold ${agent.priceUsd === 0 ? "text-green-400" : "text-gray-300"}`}>
                        {agent.priceUsd === 0 ? "FREE" : agent.price}
                    </span>
                    {isSelected ? (
                        <CheckCircle2 className="w-5 h-5 text-purple-400" />
                    ) : (
                        <ExternalLink className="w-4 h-4 text-gray-500" />
                    )}
                </div>
            </div>
        </div>
    );
}
