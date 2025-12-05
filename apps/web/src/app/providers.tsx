"use client";

import { WalletProvider } from "@/context/WalletContext";

// Simple provider wrapper with WalletContext
export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WalletProvider>
            {children}
        </WalletProvider>
    );
}
