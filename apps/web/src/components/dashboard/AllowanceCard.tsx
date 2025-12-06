
"use client";

import { useState } from "react";
import { Plus, RefreshCw, Copy, ExternalLink, ShieldCheck, Settings, ArrowDownLeft } from "lucide-react";
import { useSessionWallet } from "@/hooks/useSessionWallet";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { createWalletClient, custom } from "viem";
import { avalancheFuji } from "viem/chains";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function AllowanceCard() {
    const {
        address: sessionAddress,
        balance,
        fetchBalance,
        isLoading,
        dailyLimit,
        dailySpent,
        setDailyLimit,
        withdrawToMainWallet,
    } = useSessionWallet();
    const { provider, walletAddress } = useWalletAuth();
    const [amount, setAmount] = useState("1");
    const [isFunding, setIsFunding] = useState(false);
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [showLimitSettings, setShowLimitSettings] = useState(false);
    const [limitInput, setLimitInput] = useState(String(dailyLimit));

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
            const amountUnits = BigInt(Number(amount) * 1000000);

            await client.writeContract({
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

            toast.success("Funding transaction sent!");
            setTimeout(() => fetchBalance(), 3000);

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

    const handleWithdraw = async () => {
        if (Number(balance) <= 0) {
            toast.error("No funds to withdraw");
            return;
        }

        try {
            setIsWithdrawing(true);
            const hash = await withdrawToMainWallet();
            toast.success("Withdraw successful!", {
                description: `Tx: ${hash.slice(0, 10)}...`
            });
            setTimeout(() => fetchBalance(), 3000);
        } catch (e: any) {
            console.error(e);
            toast.error("Withdraw failed", { description: e?.message });
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleSaveLimit = () => {
        const newLimit = Number(limitInput);
        if (isNaN(newLimit) || newLimit <= 0) {
            toast.error("Invalid limit");
            return;
        }
        setDailyLimit(newLimit);
        setShowLimitSettings(false);
        toast.success(`Daily limit set to $${newLimit}`);
    };

    const spentPercent = dailyLimit > 0 ? Math.min((dailySpent / dailyLimit) * 100, 100) : 0;

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

                    {/* Withdraw Button */}
                    {Number(balance) > 0 && (
                        <button
                            onClick={handleWithdraw}
                            disabled={isWithdrawing}
                            className="mt-3 w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {isWithdrawing ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                                <ArrowDownLeft className="w-4 h-4" />
                            )}
                            Withdraw All to Main Wallet
                        </button>
                    )}

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

                {/* Daily Spending Limit */}
                <div className="bg-black/40 rounded-xl p-4 border border-white/5">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">Daily Limit</span>
                        <button
                            onClick={() => { setLimitInput(String(dailyLimit)); setShowLimitSettings(!showLimitSettings); }}
                            className="p-1 hover:bg-white/5 rounded-full transition"
                        >
                            <Settings className="w-3 h-3 text-gray-500" />
                        </button>
                    </div>

                    {showLimitSettings ? (
                        <div className="flex gap-2 items-center">
                            <input
                                type="number"
                                value={limitInput}
                                onChange={(e) => setLimitInput(e.target.value)}
                                className="flex-1 bg-zinc-800 border border-white/10 rounded px-2 py-1 text-sm text-white"
                                placeholder="10"
                            />
                            <button
                                onClick={handleSaveLimit}
                                className="bg-avax-red text-white px-3 py-1 rounded text-xs font-medium"
                            >
                                Save
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-lg font-mono text-white">
                                    ${dailySpent.toFixed(2)}
                                </span>
                                <span className="text-sm text-gray-500">/ ${dailyLimit} today</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className={cn(
                                        "h-full rounded-full transition-all",
                                        spentPercent > 90 ? "bg-red-500" : spentPercent > 70 ? "bg-yellow-500" : "bg-green-500"
                                    )}
                                    style={{ width: `${spentPercent}%` }}
                                />
                            </div>
                        </>
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
                        Agents use this to pay automatically. Daily limit protects against overspending.
                    </p>
                </div>
            </div>
        </div>
    );
}

