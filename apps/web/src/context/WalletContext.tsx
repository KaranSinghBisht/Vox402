"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { createWalletClient, custom, getAddress } from "viem";
import { avalancheFuji } from "viem/chains";
import { detectProvider, ensureFuji, type EIP1193Provider } from "@/lib/wallet";

interface WalletContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    walletAddress: `0x${string}` | null;
    provider: EIP1193Provider | null;
    login: () => Promise<void>;
    logout: () => void;
    displayName: string;
}

const WalletContext = createContext<WalletContextType>({
    isAuthenticated: false,
    isLoading: true,
    walletAddress: null,
    provider: null,
    login: async () => { },
    logout: () => { },
    displayName: "",
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const [provider, setProvider] = useState<EIP1193Provider | null>(null);
    const [walletAddress, setWalletAddress] = useState<`0x${string}` | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Check for existing connection on mount
    useEffect(() => {
        async function checkConnection() {
            try {
                const p = await detectProvider();
                if (p) {
                    // Try to get accounts without prompting (using eth_accounts usually, but requestAddresses 
                    // often behaves silently if already authorized in many modern extensions)
                    const client = createWalletClient({ chain: avalancheFuji, transport: custom(p as any) });
                    // Note: Standard EIP-1193 doesn't separate 'get' vs 'request' well, 
                    // but we rely on the extension to return silently if trusted.
                    // Ideally we'd use 'eth_accounts' directly but viem abstracts this.
                    // Let's rely on detection.

                    // Actually, let's keep it safer: initially just check provider.
                    // Real auto-connect requires persistance or 'eth_accounts' check.
                    // For now, let's try to request.
                    const accounts = await client.requestAddresses().catch(() => []);

                    if (accounts.length > 0) {
                        setProvider(p);
                        setWalletAddress(getAddress(accounts[0]) as `0x${string}`);
                    }
                }
            } catch (e) {
                console.log("Not connected automatically");
            } finally {
                setIsLoading(false);
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

            if (accounts.length === 0) throw new Error("No accounts found");

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

    const displayName = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : "";

    return (
        <WalletContext.Provider value={{
            isAuthenticated: !!walletAddress,
            isLoading,
            walletAddress,
            provider,
            login,
            logout,
            displayName
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWalletAuth() {
    return useContext(WalletContext);
}
