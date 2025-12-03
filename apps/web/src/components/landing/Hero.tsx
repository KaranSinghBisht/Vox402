"use client";
import React from "react";
import { ArrowRight, Terminal, ChevronDown, Activity, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DecryptedText } from "@/components/ui/DecryptedText";
import { DarkVeil } from "@/components/ui/DarkVeil";

export function Hero({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="relative h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-zinc-950 isolate">
      <div className="absolute inset-0 z-0 w-full h-full">
        <DarkVeil />
      </div>
      <div className="absolute inset-0 z-0 bg-gradient-radial from-transparent via-zinc-950/60 to-zinc-950 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl mx-auto px-6 space-y-10">
        <div className="animate-fade-up opacity-0 [animation-delay:200ms]">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-xl group cursor-crosshair hover:border-avax-red/50 transition-all duration-500 hover:scale-105 shadow-2xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-avax-red opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-avax-red" />
            </span>
            <span className="text-[10px] font-mono text-gray-300 tracking-[0.2em] group-hover:text-white transition-colors uppercase shadow-black drop-shadow-md">
              <DecryptedText text="System Online" speed={100} />
            </span>
            <div className="h-3 w-[1px] bg-white/20 mx-1" />
            <span className="text-[10px] font-mono text-avax-red font-bold">FUJI_TESTNET</span>
          </div>
        </div>

        <div className="animate-fade-up opacity-0 [animation-delay:400ms] space-y-4">
          <h1 className="text-6xl md:text-8xl font-bold tracking-tighter text-white leading-[0.9] uppercase drop-shadow-2xl">
            <span className="block text-avax-red relative mix-blend-screen filter drop-shadow-[0_0_20px_rgba(232,65,66,0.6)]">
              VOX402
            </span>
            <span className="block text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400 text-3xl md:text-4xl">
              Voice-first master agent → x402 pay-per-call agents.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 font-mono mt-8 max-w-2xl mx-auto leading-relaxed border-l-2 border-avax-red/50 pl-6 text-left backdrop-blur-md bg-black/50 py-4 rounded-r-xl border-y border-y-white/5 border-r border-r-white/5 shadow-2xl">
            <span className="text-avax-red font-bold">{">>"}</span> Meet <span className="text-gray-200 font-bold">Ava</span> — your voice-first master agent. She routes intents to <span className="text-gray-200">x402 pay-per-call agents</span>, triggers <span className="text-gray-200">402 Payment Required</span>, and settles via <span className="text-gray-200">EIP-712 USDC Authorization</span> on Avalanche (Fuji/Mainnet-ready).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full sm:w-auto animate-fade-up opacity-0 [animation-delay:600ms] items-center">
          <Button
            onClick={onLaunch}
            variant="danger"
            size="lg"
            className="group min-w-[200px] h-14 text-lg font-bold tracking-tight shadow-[0_0_30px_-5px_rgba(232,65,66,0.5)] hover:shadow-[0_0_50px_-10px_rgba(232,65,66,0.7)] transition-all duration-300 relative overflow-hidden skew-x-[-10deg]"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 skew-y-12" />
            <span className="relative flex items-center justify-center skew-x-[10deg]">
              LAUNCH CONSOLE
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="group min-w-[200px] h-14 text-lg font-mono border-white/20 hover:bg-white/10 hover:border-white/40 backdrop-blur-md bg-black/40"
            onClick={() => window.open("https://docs.avalanche.network/", "_blank")}
          >
            <Terminal className="w-5 h-5 mr-3 text-gray-400 group-hover:text-avax-red transition-colors" />
            <span className="group-hover:text-white transition-colors">
              <DecryptedText text="READ_DOCS()" speed={80} />
            </span>
          </Button>
        </div>
      </div>

      <div className="absolute top-1/4 left-10 hidden lg:block opacity-40 hover:opacity-80 transition-opacity mix-blend-overlay pointer-events-none">
        <Globe className="w-24 h-24 text-avax-red animate-[spin_20s_linear_infinite]" />
      </div>
      <div className="absolute bottom-1/4 right-10 hidden lg:block opacity-40 hover:opacity-80 transition-opacity mix-blend-overlay pointer-events-none">
        <Activity className="w-16 h-16 text-white animate-pulse" />
      </div>

      <div className="absolute bottom-10 animate-bounce opacity-50 cursor-pointer hover:opacity-100 hover:text-avax-red transition-colors z-20">
        <ChevronDown className="w-6 h-6" />
      </div>
    </section>
  );
}
