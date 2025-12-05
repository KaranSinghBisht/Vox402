"use client";

import { Mic, Command, Zap, ArrowRightLeft, TrendingUp, ShieldCheck, Search } from "lucide-react";

const COMMANDS = [
    {
        icon: <Zap className="w-4 h-4 text-yellow-400" />,
        title: "Portfolio Check",
        phrase: "How is my portfolio doing?",
        desc: "Analyzes balances across tokens"
    },
    {
        icon: <ArrowRightLeft className="w-4 h-4 text-blue-400" />,
        title: "Swap Tokens",
        phrase: "Swap 1 USDC to AVAX",
        desc: "Executes trades on Pangolin"
    },
    {
        icon: <TrendingUp className="w-4 h-4 text-green-400" />,
        title: "Earn Yield",
        phrase: "Invest my USDC in yield",
        desc: "Deposits into ERC4626 Vault"
    },
    {
        icon: <Search className="w-4 h-4 text-purple-400" />,
        title: "Analyze Tx",
        phrase: "Analyze my last transaction",
        desc: "Explains transaction details"
    },
];

export function CommandGuide() {
    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 h-full">
            <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                    <Mic className="w-4 h-4 text-red-400" />
                </div>
                <div>
                    <h3 className="text-white font-medium">Voice Commands</h3>
                    <p className="text-xs text-gray-500">Try saying these to Ava</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {COMMANDS.map((cmd, i) => (
                    <div key={i} className="group p-3 rounded-xl bg-black/20 border border-white/5 hover:bg-white/5 transition-colors cursor-default">
                        <div className="flex items-center gap-2 mb-2">
                            {cmd.icon}
                            <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{cmd.title}</span>
                        </div>
                        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1.5 mb-1 group-hover:bg-white/10 transition-colors">
                            <Command className="w-3 h-3 text-gray-600" />
                            <span className="text-xs text-red-200 font-mono">"{cmd.phrase}"</span>
                        </div>
                        <div className="text-[10px] text-gray-500 pl-1">{cmd.desc}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
