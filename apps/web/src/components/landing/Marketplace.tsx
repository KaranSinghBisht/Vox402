// apps/web/src/components/landing/Marketplace.tsx
import React from "react";
import { LineChart, Wallet, Shuffle, Globe, Code, Plus, Search, Sparkles } from "lucide-react";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { DecryptedText } from "@/components/ui/DecryptedText";

const agents = [
  // FREE Agents
  {
    icon: LineChart,
    name: "ChartAgent",
    price: "FREE",
    desc: "Price history charts for AVAX, BTC, ETH and more via CoinGecko.",
    tags: ["Charts", "Free"],
    isFree: true,
  },
  {
    icon: Wallet,
    name: "PortfolioAgent",
    price: "FREE",
    desc: "Wallet analysis: AVAX balance, ERC20 holdings, and summary.",
    tags: ["DeFi", "Free"],
    isFree: true,
  },
  {
    icon: Search,
    name: "TxAnalyzer",
    price: "FREE",
    desc: "Transaction history with categorization and flow tracking.",
    tags: ["Analytics", "Free"],
    isFree: true,
  },
  {
    icon: Code,
    name: "ContractInspector",
    price: "FREE",
    desc: "Smart contract analysis: bytecode patterns and risk assessment.",
    tags: ["Security", "Free"],
    isFree: true,
  },
  // PAID Agents (x402)
  {
    icon: Shuffle,
    name: "SwapAgent",
    price: "0.01 USDC",
    desc: "Real-time swap quotes for USDC ↔ WAVAX via Pangolin DEX.",
    tags: ["DEX", "x402"],
    isFree: false,
  },
  {
    icon: Globe,
    name: "BridgeAgent",
    price: "0.01 USDC",
    desc: "Cross-chain bridge quotes for Fuji, Base Sepolia, and more.",
    tags: ["Cross-chain", "x402"],
    isFree: false,
  },
  {
    icon: Shuffle,
    name: "YieldAgent",
    price: "0.01 USDC",
    desc: "Multi-step DeFi: invest in stable yield pools earning ~8% APY.",
    tags: ["Yield", "x402"],
    isFree: false,
  },
];

export function Marketplace() {
  return (
    <section className="py-24 px-6 bg-zinc-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-noise opacity-20 pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-20%] w-[800px] h-[800px] bg-avax-red/5 rounded-full blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4 border-b border-white/5 pb-8">
          <div>
            <h2 className="text-3xl font-bold mb-2 tracking-tight">Agent Marketplace</h2>
            <p className="text-gray-400 font-mono text-sm">Free to explore. Pay only when you trade.</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-green-400">
                <DecryptedText text="4" speed={150} /> FREE
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">Read-Only Agents</div>
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-avax-red">
                <DecryptedText text="2" speed={150} /> PAID
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">DeFi Actions</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent, idx) => (
            <SpotlightCard
              key={idx}
              className="group cursor-pointer bg-zinc-900/20 hover:bg-zinc-900/40"
              spotlightColor={agent.isFree ? "rgba(34, 197, 94, 0.2)" : "rgba(232, 65, 66, 0.2)"}
            >
              <div className="p-6 h-full flex flex-col relative z-20">
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-2.5 bg-zinc-950 rounded-lg border transition-colors duration-300 shadow-inner ${agent.isFree
                    ? "border-green-500/20 group-hover:border-green-500/50"
                    : "border-white/10 group-hover:border-avax-red/50"
                    }`}>
                    <agent.icon className={`w-5 h-5 transition-colors ${agent.isFree
                      ? "text-green-400 group-hover:text-green-300"
                      : "text-gray-400 group-hover:text-avax-red"
                      }`} />
                  </div>
                  <span className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition-all ${agent.isFree
                    ? "bg-green-500/10 text-green-400 border-green-500/20"
                    : "bg-white/5 text-gray-300 border-white/5 group-hover:bg-avax-red/10 group-hover:text-avax-red group-hover:border-avax-red/20"
                    }`}>
                    {agent.price}
                  </span>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-gray-200 group-hover:text-white transition-colors">{agent.name}</h3>
                  {agent.isFree && <Sparkles className="w-4 h-4 text-green-400" />}
                </div>
                <p className="text-sm text-gray-500 mb-6 flex-1 leading-relaxed">{agent.desc}</p>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    {agent.tags.map((tag, tIdx) => (
                      <span key={tIdx} className={`text-[10px] px-2 py-0.5 rounded-full font-mono transition-colors ${tag === "Free"
                        ? "bg-green-500/10 text-green-400 border border-green-500/20"
                        : tag === "x402"
                          ? "bg-avax-red/10 text-avax-red border border-avax-red/20"
                          : "bg-zinc-950 text-gray-600 border border-white/5 group-hover:border-white/10"
                        }`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${agent.isFree ? "bg-green-500/10 group-hover:bg-green-500/20" : "bg-white/5 group-hover:bg-white/10"
                    }`}>
                    <Plus className={`w-3 h-3 transition-colors ${agent.isFree ? "text-green-400" : "text-gray-500 group-hover:text-white"
                      }`} />
                  </div>
                </div>
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}
