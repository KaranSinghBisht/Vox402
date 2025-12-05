import { useState, useEffect, useCallback } from "react";
import {
    createWalletClient,
    http,
    formatUnits,
    type Hex,
    publicActions,
    PrivateKeyAccount
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { useWalletAuth } from "./useWalletAuth";

const SESSION_KEY_STORAGE = "vox402_session_key";
const DAILY_LIMIT_STORAGE = "vox402_daily_limit";
const DAILY_SPEND_STORAGE = "vox402_daily_spend";

function getTodayKey() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

export function useSessionWallet() {
    const { provider, walletAddress } = useWalletAuth();
    const [sessionAccount, setSessionAccount] = useState<PrivateKeyAccount | null>(null);
    const [address, setAddress] = useState<Hex | null>(null);
    const [balance, setBalance] = useState<string>("0");
    const [isLoading, setIsLoading] = useState(true);

    // Spending limits
    const [dailyLimit, setDailyLimitState] = useState<number>(10); // Default $10/day
    const [dailySpent, setDailySpent] = useState<number>(0);

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

        // Load spending limits
        const limitKey = `${DAILY_LIMIT_STORAGE}_${walletAddress.toLowerCase()}`;
        const savedLimit = localStorage.getItem(limitKey);
        if (savedLimit) setDailyLimitState(Number(savedLimit));

        // Load today's spend (reset if new day)
        const spendKey = `${DAILY_SPEND_STORAGE}_${walletAddress.toLowerCase()}`;
        const savedSpend = localStorage.getItem(spendKey);
        if (savedSpend) {
            const { date, amount } = JSON.parse(savedSpend);
            if (date === getTodayKey()) {
                setDailySpent(amount);
            } else {
                // New day, reset
                setDailySpent(0);
                localStorage.setItem(spendKey, JSON.stringify({ date: getTodayKey(), amount: 0 }));
            }
        }

        setIsLoading(false);
    }, [walletAddress]);

    // Set daily limit
    const setDailyLimit = useCallback((limit: number) => {
        if (!walletAddress) return;
        setDailyLimitState(limit);
        const limitKey = `${DAILY_LIMIT_STORAGE}_${walletAddress.toLowerCase()}`;
        localStorage.setItem(limitKey, String(limit));
    }, [walletAddress]);

    // Record a spend
    const recordSpend = useCallback((amount: number) => {
        if (!walletAddress) return;
        const newSpent = dailySpent + amount;
        setDailySpent(newSpent);
        const spendKey = `${DAILY_SPEND_STORAGE}_${walletAddress.toLowerCase()}`;
        localStorage.setItem(spendKey, JSON.stringify({ date: getTodayKey(), amount: newSpent }));
    }, [walletAddress, dailySpent]);

    // Check if we can spend
    const canSpend = useCallback((amount: number): boolean => {
        return (dailySpent + amount) <= dailyLimit;
    }, [dailySpent, dailyLimit]);

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
            const USDC_ADDR = "0x5425890298aed601595a70AB815c96711a31Bc65";
            const balance = await sessionClient.readContract({
                address: USDC_ADDR,
                abi: [{ name: "balanceOf", type: "function", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }],
                functionName: "balanceOf",
                args: [address],
            }) as bigint;

            setBalance(formatUnits(balance, 6));
        } catch (e) {
            console.error("Failed to fetch session balance", e);
        }
    }, [sessionClient, address]);

    useEffect(() => {
        fetchBalance();
        const interval = setInterval(fetchBalance, 10000);
        return () => clearInterval(interval);
    }, [fetchBalance]);

    return {
        sessionAccount,
        address,
        balance,
        fetchBalance,
        isLoading,
        // Spending limits
        dailyLimit,
        dailySpent,
        setDailyLimit,
        recordSpend,
        canSpend,
    };
}

