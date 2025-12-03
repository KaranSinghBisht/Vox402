// apps/web/src/components/wallet/WalletConnect.tsx
"use client";
import React from "react";
import { Wallet, Radio, Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { truncateAddress } from "@/lib/utils";

export function WalletConnect({
  isConnected,
  address,
  networkLabel = "Fuji Network",
  onConnect,
  onSettings,
}: {
  isConnected: boolean;
  address: string | null;
  networkLabel?: string;
  onConnect: () => void;
  onSettings?: () => void;
}) {
  return (
    <div className="flex items-center gap-4">
      {isConnected ? (
        <div className="flex items-center gap-3 bg-zinc-900/50 backdrop-blur-sm border border-white/10 rounded-full pl-4 pr-1 py-1">
          <div className="flex items-center gap-2">
            <Radio className="w-3 h-3 text-avax-red animate-pulse" />
            <span className="text-xs font-mono text-gray-300">{networkLabel}</span>
          </div>
          <div className="h-4 w-[1px] bg-white/10 mx-1" />
          <Button variant="ghost" size="sm" className="h-7 rounded-full text-xs font-mono border border-white/5 hover:bg-zinc-800">
            <span className="mr-2 text-avax-red">●</span>
            {truncateAddress(address ?? "")}
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={onConnect}
          className="gap-2 font-mono text-xs rounded-full border-avax-red/50 text-avax-red hover:bg-avax-red/10"
        >
          <Wallet className="w-4 h-4" />
          Connect Core
        </Button>
      )}

      <button className="text-gray-500 hover:text-white transition-colors" onClick={onSettings} aria-label="Settings">
        <Settings className="w-5 h-5" />
      </button>
    </div>
  );
}
