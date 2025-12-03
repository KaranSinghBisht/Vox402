// apps/web/src/components/landing/Marketplace.tsx
import React from "react";
import { LineChart, Wallet, Shuffle, Globe, Code, FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { DecryptedText } from "@/components/ui/DecryptedText";

const agents = [
  {
    icon: LineChart,
    name: "ChartAgent",
    price: "0.01 USDC",
    desc: "AVAX/USD 30d price history via x402 pay-per-call. Returns inline chart.",
    tags: ["Data", "402", "USDC"],
  },
  {
    icon: Shuffle,
    name: "SwapAgent",
    price: "0.10 USDC",
    desc: "Route + quote swaps, then request EIP-712 auth before broadcasting.",
    tags: ["Routing", "Tx", "402"],
  },
  {
    icon: Wallet,
    name: "PortfolioAgent",
    price: "0.05 USDC",
    desc: "Wallet analytics, PnL, and risk surface with human-readable reports.",
    tags: ["DeFi", "Read-Only"],
  },
  {
    icon: Globe,
    name: "BridgeAgent",
    price: "0.08 USDC",
    desc: "Finds optimal cross-chain routes; executes only after 402 settlement.",
    tags: ["Cross-chain", "402"],
  },
  {
    icon: Code,
    name: "ContractInspector",
    price: "0.20 USDC",
    desc: "Static heuristics for verified contracts; highlights common risks.",
    tags: ["Security"],
  },
  {
    icon: FileText,
    name: "TxReporter",
    price: "0.12 USDC",
    desc: "USDC-priced CSV export for taxes and compliance tooling.",
    tags: ["Utility"],
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
            <p className="text-gray-400 font-mono text-sm">Modular intelligence. Pay only for what you use.</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-white">
                <DecryptedText text="24" speed={150} />
              </div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">Active Nodes</div>
            </div>
            <div className="h-8 w-[1px] bg-white/10" />
            <div className="text-right">
              <div className="text-2xl font-mono font-bold text-avax-red">$0.04</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">Avg Cost</div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent, idx) => (
            <SpotlightCard key={idx} className="group cursor-pointer bg-zinc-900/20 hover:bg-zinc-900/40" spotlightColor="rgba(232, 65, 66, 0.2)">
              <div className="p-6 h-full flex flex-col relative z-20">
                <div className="flex justify-between items-start mb-6">
                  <div className="p-2.5 bg-zinc-950 rounded-lg border border-white/10 group-hover:border-avax-red/50 transition-colors duration-300 shadow-inner">
                    <agent.icon className="w-5 h-5 text-gray-400 group-hover:text-avax-red transition-colors" />
                  </div>
                  <span className="px-2 py-1 rounded text-[10px] font-mono font-bold bg-white/5 text-gray-300 border border-white/5 group-hover:bg-avax-red/10 group-hover:text-avax-red group-hover:border-avax-red/20 transition-all">
                    {agent.price} <span className="text-gray-600">/ OP</span>
                  </span>
                </div>

                <h3 className="text-lg font-bold mb-2 text-gray-200 group-hover:text-white transition-colors">{agent.name}</h3>
                <p className="text-sm text-gray-500 mb-6 flex-1 leading-relaxed">{agent.desc}</p>

                <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                  <div className="flex gap-2">
                    {agent.tags.map((tag, tIdx) => (
                      <span key={tIdx} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-950 text-gray-600 border border-white/5 font-mono group-hover:border-white/10 transition-colors">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/5 group-hover:bg-white/10 transition-colors">
                    <Plus className="w-3 h-3 text-gray-500 group-hover:text-white transition-colors" />
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
