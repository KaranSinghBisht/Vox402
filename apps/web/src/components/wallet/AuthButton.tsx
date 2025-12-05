// apps/web/src/components/wallet/AuthButton.tsx
"use client";

import React, { useState } from "react";
import { Wallet, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWalletAuth } from "@/hooks/useWalletAuth";

export function AuthButton() {
    const { isAuthenticated, isLoading, walletAddress, displayName, login, logout } = useWalletAuth();
    const [showDropdown, setShowDropdown] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleLogin() {
        try {
            setError(null);
            await login();
        } catch (e: any) {
            setError(e?.message || "Failed to connect");
        }
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900/50 backdrop-blur-sm border border-white/10 rounded-full">
                <div className="w-4 h-4 border-2 border-avax-red/30 border-t-avax-red rounded-full animate-spin" />
                <span className="text-xs text-gray-400">Connecting...</span>
            </div>
        );
    }

    if (isAuthenticated && walletAddress) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowDropdown(!showDropdown)}
                    className="flex items-center gap-3 bg-zinc-900/50 backdrop-blur-sm border border-white/10 hover:border-white/20 rounded-full pl-3 pr-4 py-2 transition-colors"
                >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-avax-red to-red-700 flex items-center justify-center">
                        <Wallet className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="text-left">
                        <div className="text-xs font-medium text-white">{displayName}</div>
                        <div className="text-[10px] text-gray-500">Avalanche Fuji</div>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
                </button>

                {showDropdown && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                        <div className="absolute right-0 top-full mt-2 w-56 bg-zinc-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50">
                            <div className="p-3 border-b border-white/5">
                                <div className="text-xs text-gray-500 mb-1">Connected Wallet</div>
                                <div className="text-sm font-mono text-white break-all">{walletAddress}</div>
                            </div>
                            <button
                                onClick={() => { logout(); setShowDropdown(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-white/5 transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                Disconnect
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    // Not authenticated
    return (
        <div className="flex items-center gap-2">
            <Button
                variant="primary"
                size="sm"
                onClick={handleLogin}
                className="gap-2 font-medium text-xs rounded-full bg-[#E84142] hover:bg-[#d13a3b] text-white border-0 shadow-[0_0_15px_-3px_rgba(232,65,66,0.3)] hover:shadow-[0_0_20px_-3px_rgba(232,65,66,0.5)] transition-all"
            >
                <Wallet className="w-4 h-4" />
                Connect Wallet
            </Button>
            {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
    );
}
