// apps/web/src/components/chat/MessageBubble.tsx
"use client";
import React from "react";
import { Cpu, Terminal, User } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { MiniLineChart, type SeriesPoint } from "@/components/chart/MiniLineChart";

export type UIMessage =
  | { id: string; role: "user" | "assistant"; text: string; ts: number; kind: "text" }
  | { id: string; role: "assistant"; text: string; ts: number; kind: "chart"; chart: { title: string; series: SeriesPoint[] }; data?: any; coinId?: string };

export function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex max-w-[85%] md:max-w-[70%] gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border",
            isUser ? "bg-gradient-to-br from-avax-red to-red-800 border-red-500/30" : "bg-zinc-800 border-white/10"
          )}
        >
          {isUser ? <User className="w-4 h-4 text-white" /> : <Cpu className="w-4 h-4 text-avax-red" />}
        </div>

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">
              {isUser ? "Operator" : "Ava"}
            </span>
            <span className="text-[10px] text-gray-700">{formatTime(message.ts)}</span>
          </div>

          <div
            className={cn(
              "p-4 rounded-2xl backdrop-blur-md text-sm leading-relaxed shadow-lg",
              isUser
                ? "bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 text-gray-100 rounded-tr-none"
                : "bg-zinc-900/60 border border-white/5 text-gray-300 rounded-tl-none shadow-[0_4px_20px_-10px_rgba(0,0,0,0.5)]"
            )}
          >
            {message.kind === "text" ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : (
              <div>
                <p className="mb-2 text-gray-400 text-xs border-b border-white/5 pb-2">Analyzing market data...</p>
                <MiniLineChart series={message.chart.series} width={640} height={220} />
                <p className="text-xs text-gray-500 mt-2">{message.text}</p>
              </div>
            )}

            {!isUser && message.text.includes("Executing") && (
              <div className="flex items-center gap-2 mt-2 text-avax-red text-xs font-mono bg-red-500/5 p-2 rounded border border-red-500/10">
                <Terminal className="w-3 h-3" />
                <span>System Process Active</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
