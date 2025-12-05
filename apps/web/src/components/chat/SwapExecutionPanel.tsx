// apps/web/src/components/chat/SwapExecutionPanel.tsx
"use client";

import React, { useState } from "react";
import { ArrowRight, Check, Loader2, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createWalletClient, custom } from "viem";
import { avalancheFuji } from "viem/chains";

interface SwapQuote {
    tokenIn: string;
    tokenOut: string;
    tokenInSymbol: string;
    tokenOutSymbol: string;
    amountInFormatted: string;
    amountOutFormatted: string;
    minOutFormatted: string;
    slippageBps: number;
    rate: string;
}

interface SwapTx {
    to: string;
    data: string;
    value: string;
}

interface SwapExecutionPanelProps {
    quote: SwapQuote;
    needsApproval: boolean;
    approveTx: SwapTx | null;
    swapTx: SwapTx;
    chainId: number;
    provider: any;
    walletAddr: `0x${string}`;
    onComplete: (txHash: string) => void;
    onError: (error: string) => void;
}

export function SwapExecutionPanel({
    quote,
    needsApproval,
    approveTx,
    swapTx,
    chainId,
    provider,
    walletAddr,
    onComplete,
    onError,
}: SwapExecutionPanelProps) {
    const [step, setStep] = useState<"idle" | "approving" | "approved" | "swapping" | "done">(
        needsApproval ? "idle" : "approved"
    );
    const [approveTxHash, setApproveTxHash] = useState<string | null>(null);
    const [swapTxHash, setSwapTxHash] = useState<string | null>(null);

    async function handleApprove() {
        if (!approveTx || !provider) return;
        setStep("approving");

        try {
            const client = createWalletClient({
                chain: avalancheFuji,
                transport: custom(provider),
            });

            const hash = await client.sendTransaction({
                account: walletAddr,
                to: approveTx.to as `0x${string}`,
                data: approveTx.data as `0x${string}`,
                value: BigInt(approveTx.value),
            });

            setApproveTxHash(hash);
            setStep("approved");
        } catch (e: any) {
            onError(`Approval failed: ${e?.shortMessage || e?.message || "Unknown error"}`);
            setStep("idle");
        }
    }

    async function handleSwap() {
        if (!swapTx || !provider) return;
        setStep("swapping");

        try {
            const client = createWalletClient({
                chain: avalancheFuji,
                transport: custom(provider),
            });

            const hash = await client.sendTransaction({
                account: walletAddr,
                to: swapTx.to as `0x${string}`,
                data: swapTx.data as `0x${string}`,
                value: BigInt(swapTx.value),
            });

            setSwapTxHash(hash);
            setStep("done");
            onComplete(hash);
        } catch (e: any) {
            onError(`Swap failed: ${e?.shortMessage || e?.message || "Unknown error"}`);
            setStep("approved");
        }
    }

    return (
        <div className="w-full max-w-md mx-auto my-4 rounded-xl overflow-hidden border border-green-500/30 bg-green-500/5">
            <div className="h-1 w-full bg-green-500" />

            <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <ArrowRightLeft className="w-5 h-5 text-green-400" />
                    <span className="font-mono text-sm font-bold tracking-wider uppercase text-green-400">
                        Execute Swap
                    </span>
                </div>

                {/* Quote Summary */}
                <div className="bg-black/40 rounded-lg p-4 border border-white/5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="text-center">
                            <div className="text-xl font-bold text-white">{quote.amountInFormatted}</div>
                            <div className="text-xs text-gray-500">{quote.tokenInSymbol}</div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-green-400" />
                        <div className="text-center">
                            <div className="text-xl font-bold text-white">{quote.amountOutFormatted}</div>
                            <div className="text-xs text-gray-500">{quote.tokenOutSymbol}</div>
                        </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 border-t border-white/5 pt-2">
                        <span>Min: {quote.minOutFormatted} {quote.tokenOutSymbol}</span>
                        <span>Slippage: {quote.slippageBps / 100}%</span>
                    </div>
                </div>

                {/* Steps */}
                <div className="space-y-3">
                    {/* Step 1: Approve (if needed) */}
                    {needsApproval && (
                        <div className={`flex items-center gap-3 p-3 rounded-lg border ${step === "approving" ? "border-yellow-500/50 bg-yellow-500/5" :
                                step === "approved" || step === "swapping" || step === "done" ? "border-green-500/50 bg-green-500/5" :
                                    "border-white/10 bg-white/5"
                            }`}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "approved" || step === "swapping" || step === "done" ? "bg-green-500 text-black" :
                                    step === "approving" ? "bg-yellow-500 text-black" :
                                        "bg-white/10 text-gray-400"
                                }`}>
                                {step === "approved" || step === "swapping" || step === "done" ? <Check className="w-4 h-4" /> : "1"}
                            </div>
                            <div className="flex-1">
                                <div className="text-sm font-medium">Approve {quote.tokenInSymbol}</div>
                                <div className="text-xs text-gray-500">Allow router to spend your tokens</div>
                            </div>
                            {step === "idle" && (
                                <Button size="sm" variant="primary" onClick={handleApprove} className="bg-green-500 hover:bg-green-600">
                                    Approve
                                </Button>
                            )}
                            {step === "approving" && <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />}
                            {(step === "approved" || step === "swapping" || step === "done") && approveTxHash && (
                                <span className="text-xs text-green-400">Approved</span>
                            )}
                        </div>
                    )}

                    {/* Step 2: Swap */}
                    <div className={`flex items-center gap-3 p-3 rounded-lg border ${step === "swapping" ? "border-yellow-500/50 bg-yellow-500/5" :
                            step === "done" ? "border-green-500/50 bg-green-500/5" :
                                "border-white/10 bg-white/5"
                        }`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step === "done" ? "bg-green-500 text-black" :
                                step === "swapping" ? "bg-yellow-500 text-black" :
                                    "bg-white/10 text-gray-400"
                            }`}>
                            {step === "done" ? <Check className="w-4 h-4" /> : needsApproval ? "2" : "1"}
                        </div>
                        <div className="flex-1">
                            <div className="text-sm font-medium">Execute Swap</div>
                            <div className="text-xs text-gray-500">Swap {quote.tokenInSymbol} for {quote.tokenOutSymbol}</div>
                        </div>
                        {step === "approved" && (
                            <Button size="sm" variant="primary" onClick={handleSwap} className="bg-green-500 hover:bg-green-600">
                                Swap
                            </Button>
                        )}
                        {step === "swapping" && <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />}
                        {step === "done" && swapTxHash && (
                            <a
                                href={`https://testnet.snowscan.xyz/tx/${swapTxHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-400 hover:underline"
                            >
                                View Tx
                            </a>
                        )}
                    </div>
                </div>

                {step === "done" && (
                    <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                        <div className="text-green-400 font-medium">✅ Swap Complete!</div>
                        <div className="text-xs text-gray-400 mt-1">
                            Swapped {quote.amountInFormatted} {quote.tokenInSymbol} for ~{quote.amountOutFormatted} {quote.tokenOutSymbol}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
