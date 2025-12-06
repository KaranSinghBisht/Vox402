"use client";

import { WalletProvider } from "@/context/WalletContext";
import { ThirdwebProvider } from "thirdweb/react";
import { Toaster } from "sonner";

// Provider wrapper with Thirdweb + WalletContext
export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ThirdwebProvider>
            <WalletProvider>
                {children}
                <Toaster theme="dark" position="top-center" />
            </WalletProvider>
        </ThirdwebProvider>
    );
}
