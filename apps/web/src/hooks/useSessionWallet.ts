import { useState, useEffect, useCallback } from "react";
import {
    createWalletClient,
    http,
    parseEther,
    formatEther,
    formatUnits,
    type Hex,
    publicActions,
    PrivateKeyAccount
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { useWalletAuth } from "./useWalletAuth";

const SESSION_KEY_STORAGE = "vox402_session_key";

export function useSessionWallet() {
    const { provider, walletAddress } = useWalletAuth();
    const [sessionAccount, setSessionAccount] = useState<PrivateKeyAccount | null>(null);
    const [address, setAddress] = useState<Hex | null>(null);
    const [balance, setBalance] = useState<string>("0");
    const [isLoading, setIsLoading] = useState(true);

    // Initialize or load session key
    useEffect(() => {
        if (!walletAddress) {
            setSessionAccount(null);
            setAddress(null);
            setIsLoading(false);
            return;
        }

        const storageKey = `${SESSION_KEY_STORAGE}_${walletAddress.toLowerCase()}`;
        const storedKey = localStorage.getItem(storageKey) as Hex | null;
        let account: PrivateKeyAccount;

        if (storedKey) {
            account = privateKeyToAccount(storedKey);
        } else {
            const newKey = generatePrivateKey();
            localStorage.setItem(storageKey, newKey);
            account = privateKeyToAccount(newKey);
        }

        setSessionAccount(account);
        setAddress(account.address);
        setIsLoading(false);
    }, [walletAddress]);

    // Create client for session wallet
    const sessionClient = sessionAccount
        ? createWalletClient({
            account: sessionAccount,
            chain: avalancheFuji,
            transport: http(),
        }).extend(publicActions)
        : null;

    // Fetch balance
    const fetchBalance = useCallback(async () => {
        if (!sessionClient || !address) return;
        try {
            // For now, we are checking NATIVE AVAX balance for simplicity of "allowance"
            // In a real app, we might want to check USDC balance if we are paying in USDC
            // But for gasless / x402 payments, we might be signing permits. 
            // The user prompt said "how much USDC the dapp can spend". 
            // Let's implement USDC check if possible, or fallback to native for now.

            // Let's stick to Native AVAX for gas/allowance visual for now to keep it simple without ABI complexity,
            // OR better: check for USDC balance since that's what we pay with.
            // We need the USDC ABI for 'balanceOf'.

            // Let's just return native balance for this iteration to ensure it works, then add token balance.
            // const bal = await sessionClient.getBalance({ address });
            // setBalance(formatEther(bal));

            // Fetch USDC balance
            const USDC_ADDR = "0x5425890298aed601595a70AB815c96711a31Bc65";
            const balance = await sessionClient.readContract({
                address: USDC_ADDR,
                abi: [{ name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
                functionName: "balanceOf",
                args: [address],
            }) as bigint;

            setBalance(formatUnits(balance, 6)); // USDC has 6 decimals
        } catch (e) {
            console.error("Failed to fetch session balance", e);
        }
    }, [sessionClient, address]);

    useEffect(() => {
        fetchBalance();
        const interval = setInterval(fetchBalance, 10000); // Poll every 10s
        return () => clearInterval(interval);
    }, [fetchBalance]);

    // Fund session wallet (Main Wallet -> Session Wallet)
    const fundSession = async (amount: string) => {
        if (!provider || !address) throw new Error("No provider or session address");

        // We need to send from the main wallet. 
        // This requires the 'walletClient' from the main provider.
        // For now, we can assume 'provider' is an EIP-1193 provider we can use with viem.

        const walletClient = createWalletClient({
            chain: avalancheFuji,
            transport: http() // This is wrong if we want to use the injected provider.
            // We need to use 'custom(provider)' but provider type from useWalletAuth might need casting.
        });

        // Actually, useWalletAuth expose 'provider' which is usually window.ethereum or similar.
        // Let's try to construct a client using that if available, or throw.

        // NOTE: This part is tricky without importing 'custom' and casting 'provider' correctly.
        // We will leave the implementation details of 'fund' to the UI component 
        // where we have full access to the main wallet client, OR we import 'custom' here.

        // Changing strategy: This hook mainly provides the session wallet details.
        // The "Top Up" action is best handled by the main wallet hook/component interaction.
        // But we can expose a secure 'withdraw' function since that happens FROM the session wallet.
    };

    const withdrawSession = async () => {
        if (!sessionClient || !walletAddress) return;
        try {
            const bal = await sessionClient.getBalance({ address: sessionClient.account.address });
            // Leave a tiny bit for gas? Or if native, we need gas.
            // If USDC, we need gas to send USDC.
            // This suggests we need native AVAX in this wallet to do anything on-chain.
            // But x402 is often gasless signatures... 

            // If we are strictly doing x402 signatures, we don't need gas in this wallet!
            // We just need the private key to sign the TypedData.
            // And the funds need to be... wait.

            // Logic Check:
            // If we sign "I authorize spend of X USDC", that authorization must come from an account HOLDING USDC.
            // If the Session Wallet holds 0 USDC, it cannot authorize a spend of 1 USDC.
            // So the Session Wallet MUST hold the USDC.
            // Therefore, the user must transfer USDC to this Session Wallet.
            // And for the Session Wallet to transfer it out (withdraw), it needs GAS (AVAX).

            // This dual-token requirement (USDC + AVAX for gas) is high friction.
            // UNLESS the x402 payment flow supports "Gasless Permit" where the fee is taken from the transfer.
            // USDC on Fuji supports EIP-3009 (TransferWithAuthorization) which is gasless for the signer!
            // Perfect! So the Session Wallet ONLY needs USDC. It does NOT need AVAX.

        } catch (e) {
            console.error("Withdraw failed", e);
        }
    };

    return {
        sessionAccount,
        address,
        balance,
        fetchBalance,
        isLoading
    };
}
