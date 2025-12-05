// apps/web/src/hooks/useWalletAuth.types.ts
import type { EIP1193Provider } from "@/lib/wallet";

export interface WalletAuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    walletAddress: `0x${string}` | null;
    provider: EIP1193Provider | null;
    login: () => Promise<void>;
    logout: () => void;
    displayName: string;
}
