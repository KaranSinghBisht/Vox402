"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { avalancheFuji } from "viem/chains";
import { Wallet, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useWalletAuth } from "@/hooks/useWalletAuth";

// Token addresses on Fuji
const USDC_ADDR = "0x5425890298aed601595a70AB815c96711a31Bc65";
const ERC20_ABI = [
    {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "decimals",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "uint8" }],
        stateMutability: "view",
    },
] as const;

export function PortfolioCard() {
    const { walletAddress } = useWalletAuth();
    const [avaxBalance, setAvaxBalance] = useState<string>("0.00");
    const [usdcBalance, setUsdcBalance] = useState<string>("0.00");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!walletAddress) {
            setAvaxBalance("0.00");
            setUsdcBalance("0.00");
            return;
        }

        const fetchBalances = async () => {
            setLoading(true);
            try {
                const client = createPublicClient({
                    chain: avalancheFuji,
                    transport: http(),
                });

                const [avax, usdc] = await Promise.all([
                    client.getBalance({ address: walletAddress }),
                    client.readContract({
                        address: USDC_ADDR,
                        abi: ERC20_ABI,
                        functionName: "balanceOf",
                        args: [walletAddress],
                    }),
                ]);

                setAvaxBalance(Number(formatEther(avax)).toFixed(4));
                setUsdcBalance(Number(formatUnits(usdc, 6)).toFixed(2));
            } catch (e) {
                console.error("Failed to fetch balances", e);
            } finally {
                setLoading(false);
            }
        };

        fetchBalances();
        // Refresh every 15s
        const interval = setInterval(fetchBalances, 15000);
        return () => clearInterval(interval);
    }, [walletAddress]);

    if (!walletAddress) {
        return (
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center h-[200px]">
                <Wallet className="w-10 h-10 text-gray-600 mb-3" />
                <h3 className="text-gray-400 font-medium">Wallet Not Connected</h3>
                <p className="text-sm text-gray-500 mt-1">Connect your wallet to view portfolio</p>
            </div>
        );
    }

    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Wallet className="w-24 h-24 rotate-12" />
            </div>

            <h3 className="text-gray-400 font-medium mb-4 flex items-center gap-2">
                <Wallet className="w-4 h-4" />
                Wallet Balance
            </h3>

            <div className="space-y-6 relative z-10">
                <div>
                    <div className="text-sm text-gray-500 mb-1">Total Net Worth</div>
                    <div className="text-3xl font-bold text-white flex items-baseline gap-1">
                        <span className="text-gray-500 text-lg">$</span>
                        {loading ? (
                            <span className="animate-pulse bg-white/10 rounded h-8 w-24 block" />
                        ) : (
                            (Number(usdcBalance) + Number(avaxBalance) * 40).toFixed(2) // Mock AVAX price $40
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                        <div className="text-xs text-gray-500 mb-1">USDC Balance</div>
                        <div className="text-xl font-mono text-white">
                            {loading ? "..." : usdcBalance}
                        </div>
                    </div>
                    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                        <div className="text-xs text-gray-500 mb-1">AVAX Balance</div>
                        <div className="text-xl font-mono text-white">
                            {loading ? "..." : avaxBalance}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
