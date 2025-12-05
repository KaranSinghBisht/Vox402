
"use client";

import { useState } from "react";
import { Wallet, Plus, RefreshCw, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useSessionWallet } from "@/hooks/useSessionWallet";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { createWalletClient, custom, parseEther } from "viem";
import { avalancheFuji } from "viem/chains";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function AllowanceCard() {
    const { address: sessionAddress, balance, fetchBalance, isLoading } = useSessionWallet();
    const { provider, walletAddress } = useWalletAuth();
    const [amount, setAmount] = useState("1");
    const [isFunding, setIsFunding] = useState(false);

    const handleFund = async () => {
        if (!provider || !sessionAddress) {
            toast.error("Please connect your main wallet first");
            return;
        }

        if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
            toast.error("Invalid amount");
            return;
        }

        try {
            setIsFunding(true);
            const client = createWalletClient({
                chain: avalancheFuji,
                transport: custom(provider as any),
            });

            const USDC_ADDR = "0x5425890298aed601595a70AB815c96711a31Bc65";
            const amountUnits = BigInt(Number(amount) * 1000000); // 6 decimals

            const hash = await client.writeContract({
                address: USDC_ADDR,
                abi: [{
                    name: "transfer",
                    type: "function",
                    stateMutability: "nonpayable",
                    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
                    outputs: [{ name: "", type: "bool" }]
                }],
                functionName: "transfer",
                account: walletAddress as `0x${string}`,
                args: [sessionAddress, amountUnits],
            });

            toast.success("Funding transaction sent!", {
                description: "Waiting for confirmation...",
            });

            // Wait a bit and refresh balance
            setTimeout(() => {
                fetchBalance();
                toast.info("Session balance updating...");
            }, 3000);

        } catch (e: any) {
            console.error(e);
            toast.error("Funding failed", { description: e?.message });
        } finally {
            setIsFunding(false);
        }
    };

    const copyAddress = () => {
        if (sessionAddress) {
            navigator.clipboard.writeText(sessionAddress);
            toast.success("Session address copied");
        }
    };

    return (
        <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 bg-gradient-to-bl from-avax-red/10 to-transparent rounded-bl-3xl">
                <ShieldCheck className="w-6 h-6 text-avax-red/50 group-hover:text-avax-red transition-colors" />
            </div>

            <div className="flex flex-col gap-6">
                <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        AI Agent Allowance
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                        Funds available for autonomous agent actions.
                    </p>
                </div>

                <div className="bg-black/40 rounded-xl p-4 border border-white/5 backdrop-blur-sm">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">Available Balance</span>
                        <button
                            onClick={() => fetchBalance()}
                            disabled={isLoading}
                            className="p-1 hover:bg-white/5 rounded-full transition"
                        >
                            <RefreshCw className={cn("w-3 h-3 text-gray-500", isLoading && "animate-spin")} />
                        </button>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-mono font-medium text-white">
                            {Number(balance).toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500 font-bold">USDC</span>
                    </div>

                    {sessionAddress && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                            <span className="text-[10px] text-gray-600 font-mono">
                                {sessionAddress.slice(0, 6)}...{sessionAddress.slice(-4)}
                            </span>
                            <button onClick={copyAddress} className="text-gray-600 hover:text-white transition">
                                <Copy className="w-3 h-3" />
                            </button>
                            <a
                                href={`https://testnet.snowtrace.io/address/${sessionAddress}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-600 hover:text-white transition"
                            >
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}
                </div>

                <div className="space-y-3">
                    <label className="text-xs text-gray-400 font-medium">Top Up Allowance</label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-zinc-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-avax-red/50 transition-colors"
                                placeholder="10.0"
                            />
                            <span className="absolute right-3 top-2 text-xs text-gray-500 font-bold">USDC</span>
                        </div>
                        <button
                            onClick={handleFund}
                            disabled={isFunding || !provider}
                            className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                        >
                            {isFunding ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <Plus className="w-4 h-4" />
                            )}
                            Top Up
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                        Deposited funds are stored in a local session key. Agents use this to pay for transactions automatically without popups.
                    </p>
                </div>
            </div>
        </div>
    );
}
