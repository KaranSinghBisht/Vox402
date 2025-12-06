"use client";
import React from "react";
import { ArrowRight, Terminal, ChevronDown, Activity, Globe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DecryptedText } from "@/components/ui/DecryptedText";
import { DarkVeil } from "@/components/ui/DarkVeil";
import { AvaAvatar } from "@/components/landing/AvaAvatar";

export function Hero({ onLaunch }: { onLaunch: () => void }) {
  return (
    <section className="relative min-h-screen w-full flex items-center overflow-hidden bg-zinc-950 isolate">
      <div className="absolute inset-0 z-0 w-full h-full">
        <DarkVeil />
      </div>
      <div className="absolute inset-0 z-0 bg-gradient-radial from-transparent via-zinc-950/60 to-zinc-950 pointer-events-none" />

      {/* Main Content - Split Layout */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center min-h-screen py-20">

        {/* Left: Text Content */}
        <div className="flex flex-col space-y-8 lg:pr-8">
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

          <div className="animate-fade-up opacity-0 [animation-delay:400ms] space-y-6">
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white leading-[0.9] uppercase drop-shadow-2xl">
              <span className="block text-gray-300 text-xl md:text-2xl font-mono mb-2 opacity-80">HI, I'M</span>
              <span className="block text-avax-red relative mix-blend-screen filter drop-shadow-[0_0_20px_rgba(232,65,66,0.6)]">
                AVA
              </span>
            </h1>

            <p className="text-base md:text-lg text-gray-400 font-mono max-w-xl leading-relaxed border-l-2 border-avax-red/50 pl-6 backdrop-blur-md bg-black/50 py-4 rounded-r-xl border-y border-y-white/5 border-r border-r-white/5 shadow-2xl">
              I help you trade crypto using just your voice. I can show you real-time charts, execute instant swaps, and provide market insights — all through natural conversation with me.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 animate-fade-up opacity-0 [animation-delay:600ms]">
            <Button
              onClick={onLaunch}
              variant="danger"
              size="lg"
              className="group min-w-[180px] h-12 text-base font-bold tracking-tight shadow-[0_0_30px_-5px_rgba(232,65,66,0.5)] hover:shadow-[0_0_50px_-10px_rgba(232,65,66,0.7)] transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              <span className="relative flex items-center justify-center">
                Start Speaking
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </span>
            </Button>

            <Button
              variant="outline"
              size="lg"
              className="group min-w-[180px] h-12 text-base font-mono border-white/20 hover:bg-white/10 hover:border-white/40 backdrop-blur-md bg-black/40"
              onClick={() => window.open("https://docs.avalanche.network/", "_blank")}
            >
              <Terminal className="w-4 h-4 mr-2 text-gray-400 group-hover:text-avax-red transition-colors" />
              <span className="group-hover:text-white transition-colors">
                Read Docs
              </span>
            </Button>
          </div>

          {/* Feature Pills */}
          <div className="flex flex-wrap gap-3 animate-fade-up opacity-0 [animation-delay:800ms]">
            {["x402 Integration", "Instant Transactions", "Real-time Voice", "Live Charts"].map((feature) => (
              <div
                key={feature}
                className="px-4 py-2 rounded-full border border-white/10 bg-black/40 text-xs font-mono text-gray-400 hover:border-avax-red/50 hover:text-white transition-all cursor-default"
              >
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Ava Avatar */}
        <div className="hidden lg:block relative h-[600px] xl:h-[700px] animate-fade-up opacity-0 [animation-delay:300ms]">
          <AvaAvatar />
        </div>
      </div>

      {/* Decorative Elements */}
      <div className="absolute top-1/4 left-10 hidden xl:block opacity-30 pointer-events-none">
        <Globe className="w-20 h-20 text-avax-red animate-[spin_20s_linear_infinite]" />
      </div>
      <div className="absolute bottom-1/4 right-10 hidden xl:block opacity-30 pointer-events-none">
        <Activity className="w-14 h-14 text-white animate-pulse" />
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce opacity-50 cursor-pointer hover:opacity-100 hover:text-avax-red transition-colors z-20">
        <ChevronDown className="w-6 h-6" />
      </div>
    </section>
  );
}

