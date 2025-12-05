"use client";

import { WalletProvider } from "@/context/WalletContext";

import { Toaster } from "sonner";

// Simple provider wrapper with WalletContext
export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WalletProvider>
            {children}
            <Toaster theme="dark" position="top-center" />
        </WalletProvider>
    );
}
