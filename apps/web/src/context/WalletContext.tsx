"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useActiveAccount, useDisconnect, useActiveWallet } from "thirdweb/react";
import { viemAdapter } from "thirdweb/adapters/viem";
import { thirdwebClient } from "@/lib/thirdwebClient";
import { avalancheFuji as thirdwebFuji } from "thirdweb/chains";
import type { Account } from "thirdweb/wallets";
import type { WalletClient } from "viem";

interface WalletContextType {
    isAuthenticated: boolean;
    isLoading: boolean;
    walletAddress: `0x${string}` | null;
    provider: any; // Legacy - may be null for social logins
    thirdwebAccount: Account | undefined; // Thirdweb account for signing
    viemWalletClient: any; // viem-compatible wallet client from thirdweb adapter
    login: () => Promise<void>;
    logout: () => void;
    displayName: string;
}

const WalletContext = createContext<WalletContextType>({
    isAuthenticated: false,
    isLoading: true,
    walletAddress: null,
    provider: null,
    thirdwebAccount: undefined,
    viemWalletClient: null,
    login: async () => { },
    logout: () => { },
    displayName: "",
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
    // Use Thirdweb's hooks for wallet state
    const account = useActiveAccount();
    const wallet = useActiveWallet();
    const { disconnect } = useDisconnect();
    const [isLoading, setIsLoading] = useState(true);

    // Track loading state
    useEffect(() => {
        // Give Thirdweb a moment to restore session
        const timer = setTimeout(() => setIsLoading(false), 500);
        return () => clearTimeout(timer);
    }, []);

    // When account changes, stop loading
    useEffect(() => {
        if (account) {
            setIsLoading(false);
        }
    }, [account]);

    const walletAddress = account?.address as `0x${string}` | null;

    // Create viem wallet client from Thirdweb account
    const viemWalletClient = useMemo(() => {
        if (!account) return null;
        try {
            return viemAdapter.walletClient.toViem({
                client: thirdwebClient,
                chain: thirdwebFuji,
                account,
            });
        } catch (e) {
            console.error("Failed to create viem wallet client:", e);
            return null;
        }
    }, [account]);

    const displayName = walletAddress
        ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
        : "";

    // Login is handled by ConnectButton, but we expose a noop for API compatibility
    const login = useCallback(async () => {
        // ConnectButton handles login - this is for API compatibility
        console.log("Login is handled by ConnectButton");
    }, []);

    const logout = useCallback(() => {
        if (wallet) {
            disconnect(wallet);
        }
    }, [wallet, disconnect]);

    return (
        <WalletContext.Provider value={{
            isAuthenticated: !!account,
            isLoading,
            walletAddress,
            provider: null, // Legacy - use viemWalletClient instead
            thirdwebAccount: account,
            viemWalletClient,
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

