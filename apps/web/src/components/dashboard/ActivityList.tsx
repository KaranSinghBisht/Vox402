"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, ArrowDownLeft, RefreshCcw, Zap } from "lucide-react";
import { formatTime } from "@/lib/utils";

export type ActivityItem = {
    id: string;
    type: "swap" | "deposit" | "payment";
    title: string;
    amount?: string;
    token?: string;
    ts: number;
    status: "success" | "pending" | "failed";
    hash?: string;
};

// Mock data for demo purposes if empty
const DEMO_ACTIVITY: ActivityItem[] = [
    {
        id: "1",
        type: "payment",
        title: "Yield Agent Service Fee",
        amount: "0.01",
        token: "USDC",
        ts: Date.now() - 1000 * 60 * 5, // 5 mins ago
        status: "success",
    },
    {
        id: "2",
        type: "deposit",
        title: "Invest in Stable Yield",
        amount: "5.00",
        token: "USDC",
        ts: Date.now() - 1000 * 60 * 15, // 15 mins ago
        status: "success",
        hash: "0x...",
    },
];

export function ActivityList() {
    const [activities, setActivities] = useState<ActivityItem[]>(DEMO_ACTIVITY);

    // In a real app, this would query an indexer or subgraph
    // For this hackathon, we're using static mock data to demonstrate the UI

    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 h-full">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-gray-400 font-medium flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Recent Activity
                </h3>
            </div>

            <div className="space-y-4">
                {activities.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-black/20 hover:bg-black/40 transition-colors border border-white/5">
                        <div className="flex items-center gap-3">
                            <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.type === "payment" ? "bg-red-500/10 text-red-400" :
                                        item.type === "deposit" ? "bg-green-500/10 text-green-400" :
                                            "bg-blue-500/10 text-blue-400"
                                    }`}
                            >
                                {item.type === "payment" ? <Zap className="w-4 h-4" /> :
                                    item.type === "deposit" ? <ArrowDownLeft className="w-4 h-4" /> :
                                        <RefreshCcw className="w-4 h-4" />}
                            </div>
                            <div>
                                <div className="text-sm font-medium text-white">{item.title}</div>
                                <div className="text-[10px] text-gray-500">{formatTime(item.ts)}</div>
                            </div>
                        </div>

                        <div className="text-right">
                            {item.amount && (
                                <div className="text-sm font-mono text-white">
                                    -{item.amount} <span className="text-xs text-gray-500">{item.token}</span>
                                </div>
                            )}
                            <div className="text-[10px] text-green-400 capitalize">{item.status}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
