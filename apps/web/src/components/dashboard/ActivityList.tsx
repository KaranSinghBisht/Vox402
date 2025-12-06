"use client";

import { Activity, Zap, ArrowDownLeft, RefreshCcw, Trash2 } from "lucide-react";
import { useAgentHistory } from "@/hooks/useAgentHistory";
import { formatTime } from "@/lib/utils";

export function ActivityList() {
    const { payments, clearHistory } = useAgentHistory();

    const getIcon = (action: string) => {
        if (action.toLowerCase().includes("swap")) return <RefreshCcw className="w-4 h-4" />;
        if (action.toLowerCase().includes("bridge")) return <ArrowDownLeft className="w-4 h-4" />;
        return <Zap className="w-4 h-4" />;
    };

    const getColor = (status: string) => {
        if (status === "success") return "bg-green-500/10 text-green-400";
        if (status === "pending") return "bg-yellow-500/10 text-yellow-400";
        return "bg-red-500/10 text-red-400";
    };

    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 h-full">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-gray-400 font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Agent Payment History
                </h3>
                {payments.length > 0 && (
                    <button
                        onClick={clearHistory}
                        className="text-gray-600 hover:text-red-400 transition-colors p-1"
                        title="Clear history"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                )}
            </div>

            {payments.length === 0 ? (
                <div className="text-center py-12 text-gray-600">
                    <Zap className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No agent payments yet</p>
                    <p className="text-xs mt-1">Use Ava to trigger paid agents</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {payments.map((payment) => (
                        <div
                            key={payment.id}
                            className="flex items-center justify-between p-3 rounded-xl bg-black/20 hover:bg-black/40 transition-colors border border-white/5"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getColor(payment.status)}`}>
                                    {getIcon(payment.action)}
                                </div>
                                <div>
                                    <div className="text-sm font-medium text-white">{payment.agentName}</div>
                                    <div className="text-[10px] text-gray-500">
                                        {payment.action} • {formatTime(payment.timestamp)}
                                    </div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-sm font-mono text-white">
                                    -{payment.amount} <span className="text-xs text-gray-500">{payment.token}</span>
                                </div>
                                <div className={`text-[10px] capitalize ${payment.status === "success" ? "text-green-400" :
                                        payment.status === "pending" ? "text-yellow-400" : "text-red-400"
                                    }`}>
                                    {payment.status}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

