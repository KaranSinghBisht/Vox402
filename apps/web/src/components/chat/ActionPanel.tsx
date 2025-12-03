// apps/web/src/components/chat/ActionPanel.tsx
"use client";
import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowRight, Loader2, Key, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export function ActionPanel({
  status,
  amountLabel,
  tokenLabel,
  recipientLabel,
  txHash,
  onSign,
}: {
  status: "idle" | "running" | "402_payment_required" | "signing" | "completed";
  amountLabel: string;
  tokenLabel: string;
  recipientLabel: string;
  txHash?: string | null;
  onSign: () => void;
}) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (status === "running") {
      setProgress(0);
      const interval = setInterval(() => setProgress((p) => Math.min(p + 10, 90)), 200);
      return () => clearInterval(interval);
    }
  }, [status]);

  if (status === "idle") return null;

  const isPaymentRequired = status === "402_payment_required";
  const isCompleted = status === "completed";
  const isSigning = status === "signing";

  return (
    <div
      className={cn(
        "w-full max-w-md mx-auto my-4 rounded-xl overflow-hidden border transition-all duration-500",
        isPaymentRequired ? "border-avax-red/50 bg-avax-red/5 shadow-[0_0_40px_-10px_rgba(232,65,66,0.15)]" : "border-white/10 bg-zinc-900/60"
      )}
    >
      <div className={cn("h-1 w-full", isPaymentRequired ? "bg-avax-red" : "bg-zinc-700")} />

      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {isPaymentRequired ? (
              <AlertCircle className="w-5 h-5 text-avax-red" />
            ) : isCompleted ? (
              <ShieldCheck className="w-5 h-5 text-green-400" />
            ) : (
              <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
            )}

            <span
              className={cn(
                "font-mono text-sm font-bold tracking-wider uppercase",
                isPaymentRequired ? "text-avax-red" : "text-gray-300"
              )}
            >
              {isPaymentRequired ? "402 Payment Required" : isCompleted ? "Transaction Settled" : "Executing Logic"}
            </span>
          </div>

          {status === "running" && <span className="font-mono text-xs text-gray-500">{progress}%</span>}
        </div>

        <div className="space-y-4">
          <div className="bg-black/40 rounded-lg p-3 border border-white/5 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Operation</span>
              <span className="text-gray-200 font-mono">x402.payPerCall</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Amount</span>
              <span className="text-white font-mono font-bold text-lg">
                {amountLabel} {tokenLabel}
              </span>
            </div>
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-500">To</span>
              <Badge variant="outline" className="text-[10px]">{recipientLabel}</Badge>
            </div>
          </div>

          {isPaymentRequired && (
            <div className="flex flex-col gap-2 pt-2">
              <Button variant="danger" onClick={onSign} className="w-full flex items-center justify-between group">
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  <span>Sign & Authorize</span>
                </div>
                <ArrowRight className="w-4 h-4 opacity-50 group-hover:translate-x-1 transition-transform" />
              </Button>
              <div className="text-center">
                <span className="text-[10px] text-gray-600 uppercase tracking-widest">Awaiting Signature</span>
              </div>
            </div>
          )}

          {isSigning && (
            <div className="flex items-center justify-center gap-3 py-4 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin text-avax-red" />
              <span className="text-sm font-mono">Broadcasting to Fuji...</span>
            </div>
          )}

          {isCompleted && txHash && (
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-green-400 text-xs font-mono uppercase">
                <ShieldCheck className="w-3 h-3" />
                <span>Confirmed</span>
              </div>
              <div className="bg-black/50 p-2 rounded border border-white/5 font-mono text-[10px] text-gray-400 break-all">{txHash}</div>
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6 w-full text-gray-500 hover:text-green-400"
                onClick={() => window.open(`https://testnet.snowscan.xyz/tx/${txHash}`, "_blank")}
              >
                View on Snowscan
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
