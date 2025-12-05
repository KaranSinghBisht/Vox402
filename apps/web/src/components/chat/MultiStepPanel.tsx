// apps/web/src/components/chat/MultiStepPanel.tsx
"use client";

import React, { useState } from "react";
import { ArrowRight, Check, Loader2, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { createWalletClient, custom } from "viem";
import { avalancheFuji } from "viem/chains";

interface Step {
    step: number;
    type: string;
    description: string;
    tx?: {
        to: string;
        data: string;
        value: string;
    };
    status: string;
}

interface YieldStrategy {
    name: string;
    apy: number;
    tokenSymbol: string;
    description: string;
}

interface MultiStepPanelProps {
    strategy: YieldStrategy;
    amount: string;
    estimatedApy: number;
    estimatedYieldYear: string;
    steps: Step[];
    chainId: number;
    provider: any;
    walletAddr: `0x${string}`;
    onComplete: (txHash: string) => void;
    onError: (error: string) => void;
}

export function MultiStepPanel({
    strategy,
    amount,
    estimatedApy,
    estimatedYieldYear,
    steps,
    chainId,
    provider,
    walletAddr,
    onComplete,
    onError,
}: MultiStepPanelProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [stepStatuses, setStepStatuses] = useState<string[]>(steps.map(() => "pending"));
    const [txHashes, setTxHashes] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);

    async function executeStep(stepIndex: number) {
        const step = steps[stepIndex];
        if (!step.tx || !provider) return;

        setIsProcessing(true);

        // Update status to processing
        setStepStatuses(prev => {
            const updated = [...prev];
            updated[stepIndex] = "processing";
            return updated;
        });

        try {
            const client = createWalletClient({
                chain: avalancheFuji,
                transport: custom(provider),
            });

            const hash = await client.sendTransaction({
                account: walletAddr,
                to: step.tx.to as `0x${string}`,
                data: step.tx.data as `0x${string}`,
                value: BigInt(step.tx.value),
            });

            // Update status to complete
            setStepStatuses(prev => {
                const updated = [...prev];
                updated[stepIndex] = "complete";
                return updated;
            });
            setTxHashes(prev => [...prev, hash]);

            // Move to next step or complete
            if (stepIndex === steps.length - 1) {
                onComplete(hash);
            } else {
                setCurrentStep(stepIndex + 1);
            }
        } catch (e: any) {
            setStepStatuses(prev => {
                const updated = [...prev];
                updated[stepIndex] = "error";
                return updated;
            });
            onError(`Step ${stepIndex + 1} failed: ${e?.shortMessage || e?.message || "Unknown error"}`);
        } finally {
            setIsProcessing(false);
        }
    }

    const allComplete = stepStatuses.every(s => s === "complete");

    return (
        <div className="w-full max-w-md mx-auto my-4 rounded-xl overflow-hidden border border-red-500/30 bg-red-500/5">
            <div className="h-1 w-full bg-gradient-to-r from-red-500 to-orange-500" />

            <div className="p-5">
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-red-400" />
                    <span className="font-mono text-sm font-bold tracking-wider uppercase text-red-400">
                        Yield Investment
                    </span>
                </div>

                {/* Strategy Info */}
                <div className="bg-black/40 rounded-lg p-4 border border-white/5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <div className="text-lg font-bold text-white">{strategy.name}</div>
                            <div className="text-xs text-gray-500">{strategy.description}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold text-green-400">{estimatedApy}%</div>
                            <div className="text-xs text-gray-500">APY</div>
                        </div>
                    </div>
                    <div className="flex justify-between text-sm border-t border-white/5 pt-3">
                        <div>
                            <span className="text-gray-500">Deposit: </span>
                            <span className="text-white font-mono">{amount} {strategy.tokenSymbol}</span>
                        </div>
                        <div>
                            <span className="text-gray-500">Est. Yield/yr: </span>
                            <span className="text-green-400 font-mono">+{estimatedYieldYear}</span>
                        </div>
                    </div>
                </div>

                {/* Steps */}
                <div className="space-y-3">
                    {steps.map((step, idx) => {
                        const status = stepStatuses[idx];
                        const isActive = idx === currentStep && !allComplete;

                        return (
                            <div
                                key={idx}
                                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${status === "complete" ? "border-green-500/50 bg-green-500/5" :
                                    status === "processing" ? "border-yellow-500/50 bg-yellow-500/5" :
                                        status === "error" ? "border-red-500/50 bg-red-500/5" :
                                            isActive ? "border-red-500/50 bg-red-500/5" :
                                                "border-white/10 bg-white/5 opacity-50"
                                    }`}
                            >
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${status === "complete" ? "bg-green-500 text-black" :
                                    status === "processing" ? "bg-yellow-500 text-black" :
                                        status === "error" ? "bg-red-500 text-white" :
                                            isActive ? "bg-red-500 text-white" :
                                                "bg-white/10 text-gray-400"
                                    }`}>
                                    {status === "complete" ? <Check className="w-4 h-4" /> :
                                        status === "processing" ? <Loader2 className="w-4 h-4 animate-spin" /> :
                                            step.step}
                                </div>
                                <div className="flex-1">
                                    <div className="text-sm font-medium capitalize">{step.type.replace(/_/g, " ")}</div>
                                    <div className="text-xs text-gray-500">{step.description}</div>
                                </div>
                                {isActive && status === "pending" && (
                                    <Button
                                        size="sm"
                                        variant="primary"
                                        onClick={() => executeStep(idx)}
                                        disabled={isProcessing}
                                        className="bg-red-500 hover:bg-red-600"
                                    >
                                        {step.type === "approve" ? "Approve" : step.type === "deposit" ? "Deposit" : "Execute"}
                                    </Button>
                                )}
                                {txHashes[idx] && (
                                    <a
                                        href={`https://testnet.snowscan.xyz/tx/${txHashes[idx]}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-red-400 hover:underline"
                                    >
                                        View
                                    </a>
                                )}
                            </div>
                        );
                    })}
                </div>

                {allComplete && (
                    <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 text-center">
                        <div className="text-red-400 font-bold text-lg mb-1">🎉 Investment Complete!</div>
                        <div className="text-sm text-gray-300">
                            You invested {amount} {strategy.tokenSymbol} into {strategy.name}
                        </div>
                        <div className="text-xs text-green-400 mt-2">
                            Earning ~{estimatedApy}% APY → +{estimatedYieldYear} {strategy.tokenSymbol}/year
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

