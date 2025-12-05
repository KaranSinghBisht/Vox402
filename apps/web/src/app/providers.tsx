"use client";

// Simple provider wrapper - Privy removed to fix wallet provider conflicts
export function Providers({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
