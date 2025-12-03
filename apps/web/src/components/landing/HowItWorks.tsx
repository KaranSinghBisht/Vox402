import React from "react";
import { Mic, Cpu, ShieldCheck, Zap, Radio, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SpotlightCard } from "@/components/ui/SpotlightCard";
import { DecryptedText } from "@/components/ui/DecryptedText";

const steps = [
  {
    icon: Mic,
    title: "INPUT_STREAM",
    subtitle: "Voice/Text Intent",
    desc: "Natural language captured via browser API. Transcribed and tokenized in real-time.",
    color: "text-blue-400",
  },
  {
    icon: Cpu,
    title: "ROUTER_NODE",
    subtitle: "Intent Analysis",
    desc: "Master agent deconstructs request and selects optimal sub-agent from registry.",
    color: "text-purple-400",
  },
  {
    icon: ShieldCheck,
    title: "402_GATEWAY",
    subtitle: "Payment Wall",
    desc: "Micro-payment request generated via EIP-712. User signs to decrypt logic.",
    color: "text-avax-red",
  },
  {
    icon: Zap,
    title: "EXECUTION",
    subtitle: "On-Chain Settle",
    desc: "Agent receives funds, executes logic (swap, bridge, analyze), returns result.",
    color: "text-yellow-400",
  },
];

export function HowItWorks() {
  return (
    <section className="py-32 px-6 bg-zinc-950 relative z-10 overflow-hidden">
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[128px] pointer-events-none" />

      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-20 gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-avax-red font-mono text-xs tracking-widest uppercase">
              <Radio className="w-4 h-4 animate-pulse" />
              <DecryptedText text="Protocol Sequence" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
              Trustless <span className="text-gray-600">Coordination</span>
            </h2>
          </div>
          <p className="text-gray-400 max-w-sm font-mono text-sm leading-relaxed border-l border-white/10 pl-4">
            Economic alignment between user intents and autonomous agent services via 402 Payment Required.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          <div className="hidden md:block absolute top-16 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-zinc-800 via-white/20 to-zinc-800 z-0" />

          {steps.map((step, idx) => (
            <div key={idx} className="relative group z-10 h-full">
              <SpotlightCard className="h-full bg-zinc-900/40 hover:bg-zinc-900/60 border-white/5">
                <div className="p-8 h-full flex flex-col relative z-20">
                  <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-8 bg-zinc-950 border border-white/10 shadow-xl group-hover:scale-110 group-hover:border-white/20 transition-all duration-500")}> 
                    <step.icon className={cn("w-6 h-6 transition-colors", step.color)} />
                  </div>

                  <div className="font-mono text-[10px] text-gray-500 mb-1 tracking-widest uppercase">Step_0{idx + 1}</div>
                  <h3 className="text-xl font-bold mb-1 text-gray-100 group-hover:text-white transition-colors">{step.title}</h3>
                  <div className="text-sm font-medium text-gray-500 mb-4">{step.subtitle}</div>

                  <p className="text-sm text-gray-400 leading-relaxed mt-auto border-t border-white/5 pt-4 group-hover:text-gray-300 transition-colors">
                    {step.desc}
                  </p>
                </div>
              </SpotlightCard>

              {idx < steps.length - 1 && (
                <div className="md:hidden flex justify-center py-4">
                  <ArrowRight className="w-5 h-5 text-gray-700 rotate-90" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
