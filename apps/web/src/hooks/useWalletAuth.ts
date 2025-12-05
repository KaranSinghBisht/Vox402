// apps/web/src/hooks/useWalletAuth.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import { createWalletClient, custom, getAddress } from "viem";
import { avalancheFuji } from "viem/chains";
import { detectProvider, ensureFuji, type EIP1193Provider } from "@/lib/wallet";

export interface WalletAuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    walletAddress: `0x${string}` | null;
    provider: EIP1193Provider | null;
    login: () => Promise<void>; // Simplified to single login method
    logout: () => void;
    displayName: string;
    authMethod: "core" | "none";
}

export function useWalletAuth(): WalletAuthState {
    const [provider, setProvider] = useState<EIP1193Provider | null>(null);
    const [walletAddress, setWalletAddress] = useState<`0x${string}` | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Auto-detect if already connected
    useEffect(() => {
        async function checkConnection() {
            const p = await detectProvider();
            if (p) {
                try {
                    const client = createWalletClient({ chain: avalancheFuji, transport: custom(p as any) });
                    const accounts = await client.requestAddresses();
                    if (accounts.length > 0) {
                        setProvider(p);
                        setWalletAddress(getAddress(accounts[0]) as `0x${string}`);
                    }
                } catch {
                    // Not authorized or connected yet
                }
            }
        }
        checkConnection();
    }, []);

    const login = useCallback(async () => {
        setIsLoading(true);
        try {
            const p = await detectProvider();
            if (!p) throw new Error("Core wallet not detected. Please install Core extension.");
            await ensureFuji(p);
            const client = createWalletClient({ chain: avalancheFuji, transport: custom(p as any) });
            const accounts = await client.requestAddresses();
            const addr = getAddress(accounts[0]) as `0x${string}`;
            setProvider(p);
            setWalletAddress(addr);
        } catch (e) {
            console.error("Wallet connection failed:", e);
            throw e;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(() => {
        setProvider(null);
        setWalletAddress(null);
    }, []);

    const displayName = walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "";

    return {
        isAuthenticated: !!walletAddress,
        isLoading,
        walletAddress,
        provider,
        login,
        logout,
        displayName,
        authMethod: walletAddress ? "core" : "none",
    };
}
