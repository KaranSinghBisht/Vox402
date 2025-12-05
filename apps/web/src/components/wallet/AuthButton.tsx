// apps/web/src/components/wallet/AuthButton.tsx
"use client";

import React from "react";
import { ConnectButton, darkTheme } from "thirdweb/react";
import { thirdwebClient } from "@/lib/thirdwebClient";
import { avalancheFuji } from "thirdweb/chains";
import { inAppWallet, createWallet } from "thirdweb/wallets";

// Configure wallets: Social login + Core/MetaMask
const wallets = [
    inAppWallet({
        auth: {
            options: ["google", "email", "passkey", "phone"],
        },
    }),
    createWallet("io.metamask"),
    createWallet("app.core.extension"), // Core Wallet
    createWallet("com.coinbase.wallet"),
    createWallet("me.rainbow"),
];

// Custom theme based on dark theme with Avax red accent
const voxTheme = darkTheme({
    colors: {
        accentText: "#E84142",
        primaryButtonBg: "#E84142",
    },
});

export function AuthButton() {
    return (
        <ConnectButton
            client={thirdwebClient}
            chain={avalancheFuji}
            wallets={wallets}
            connectModal={{
                size: "compact",
                title: "Connect to Vox402",
                showThirdwebBranding: false,
            }}
            theme={voxTheme}
            connectButton={{
                label: "Connect Wallet",
                style: {
                    fontSize: "12px",
                    fontWeight: "500",
                    borderRadius: "9999px",
                    padding: "8px 16px",
                    background: "#E84142",
                    boxShadow: "0 0 15px -3px rgba(232,65,66,0.3)",
                },
            }}
            detailsButton={{
                style: {
                    fontSize: "12px",
                    borderRadius: "9999px",
                    padding: "8px 16px",
                    background: "rgba(24,24,27,0.5)",
                    border: "1px solid rgba(255,255,255,0.1)",
                },
            }}
        />
    );
}
