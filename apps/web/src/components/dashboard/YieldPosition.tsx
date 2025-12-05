"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http, formatUnits } from "viem";
import { avalancheFuji } from "viem/chains";
import { TrendingUp, ArrowRight, PiggyBank } from "lucide-react";
import { useWalletAuth } from "@/hooks/useWalletAuth";

const VAULT_ADDR = "0xd2A081B94871FFE6653273ceC967f9dFbD7F8764";
const VAULT_ABI = [
    {
        name: "balanceOf",
        type: "function",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "convertToAssets",
        type: "function",
        inputs: [{ name: "shares", type: "uint256" }],
        outputs: [{ name: "", type: "uint256" }],
        stateMutability: "view",
    },
    {
        name: "name",
        type: "function",
        inputs: [],
        outputs: [{ name: "", type: "string" }],
        stateMutability: "view",
    },
] as const;

export function YieldPosition() {
    const { walletAddress } = useWalletAuth();
    const [shares, setShares] = useState<string>("0");
    const [assets, setAssets] = useState<string>("0");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!walletAddress) {
            setShares("0");
            setAssets("0");
            return;
        }

        const fetchYield = async () => {
            setLoading(true);
            try {
                const client = createPublicClient({
                    chain: avalancheFuji,
                    transport: http(),
                });

                const shareBalance = await client.readContract({
                    address: VAULT_ADDR,
                    abi: VAULT_ABI,
                    functionName: "balanceOf",
                    args: [walletAddress],
                });

                if (shareBalance > BigInt(0)) {
                    const assetValue = await client.readContract({
                        address: VAULT_ADDR,
                        abi: VAULT_ABI,
                        functionName: "convertToAssets",
                        args: [shareBalance],
                    });

                    setShares(formatUnits(shareBalance, 6)); // Assuming 6 decimals like USDC
                    setAssets(formatUnits(assetValue, 6));
                } else {
                    setShares("0");
                    setAssets("0");
                }
            } catch (e) {
                console.error("Failed to fetch yield position", e);
            } finally {
                setLoading(false);
            }
        };

        fetchYield();
        const interval = setInterval(fetchYield, 15000);
        return () => clearInterval(interval);
    }, [walletAddress]);

    if (!walletAddress || (!loading && Number(shares) === 0)) {
        return (
            <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 h-[200px] flex flex-col items-center justify-center text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
                <PiggyBank className="w-10 h-10 text-red-500/50 mb-3" />
                <h3 className="text-gray-400 font-medium">No Yield Positions</h3>
                <p className="text-sm text-gray-500 mt-1 max-w-[200px]">
                    Invest USDC in stable yield to start earning ~8.5% APY
                </p>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-zinc-900 to-black border border-red-500/20 rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
                <TrendingUp className="w-24 h-24 text-red-500" />
            </div>

            <div className="flex items-center gap-2 mb-6">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
                    <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="text-white font-medium">Active Yield Strategy</h3>
                    <div className="text-xs text-green-400 font-mono">Simulated ~8.5% APY</div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-8 relative z-10">
                <div>
                    <div className="text-xs text-gray-500 mb-1">Principal (USDC)</div>
                    <div className="text-2xl font-bold text-white font-mono">
                        {loading ? "..." : assets}
                    </div>
                </div>
                <div>
                    <div className="text-xs text-gray-500 mb-1">Vault Shares (voxUSDC)</div>
                    <div className="text-2xl font-bold text-red-400 font-mono">
                        {loading ? "..." : shares}
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs">
                <span className="text-gray-500">Vault Contract</span>
                <a
                    href={`https://testnet.snowtrace.io/address/${VAULT_ADDR}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-red-400 hover:text-red-300 flex items-center gap-1 font-mono"
                >
                    {VAULT_ADDR.slice(0, 6)}...{VAULT_ADDR.slice(-4)}
                    <ArrowRight className="w-3 h-3" />
                </a>
            </div>
        </div>
    );
}
