"use client";

import { useState, useEffect, useCallback } from "react";
import { useWalletAuth } from "./useWalletAuth";

export type AgentPayment = {
    id: string;
    agentName: string;
    action: string;
    amount: string;
    token: string;
    timestamp: number;
    status: "success" | "pending" | "failed";
    txHash?: string;
    details?: string;
};

const STORAGE_KEY = "vox402_agent_payments";

export function useAgentHistory() {
    const { walletAddress } = useWalletAuth();
    const [payments, setPayments] = useState<AgentPayment[]>([]);

    // Load payments from localStorage on mount
    useEffect(() => {
        if (!walletAddress) {
            setPayments([]);
            return;
        }

        const key = `${STORAGE_KEY}_${walletAddress.toLowerCase()}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            try {
                setPayments(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse agent payments", e);
                setPayments([]);
            }
        }
    }, [walletAddress]);

    // Save payments to localStorage
    const savePayments = useCallback((newPayments: AgentPayment[]) => {
        if (!walletAddress) return;
        const key = `${STORAGE_KEY}_${walletAddress.toLowerCase()}`;
        localStorage.setItem(key, JSON.stringify(newPayments));
        setPayments(newPayments);
    }, [walletAddress]);

    // Record a new payment
    const recordPayment = useCallback((payment: Omit<AgentPayment, "id" | "timestamp">) => {
        const newPayment: AgentPayment = {
            ...payment,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
        };

        const updated = [newPayment, ...payments].slice(0, 50); // Keep last 50
        savePayments(updated);
        return newPayment;
    }, [payments, savePayments]);

    // Update payment status (e.g., pending -> success)
    const updatePaymentStatus = useCallback((id: string, status: AgentPayment["status"], txHash?: string) => {
        const updated = payments.map(p =>
            p.id === id ? { ...p, status, txHash: txHash || p.txHash } : p
        );
        savePayments(updated);
    }, [payments, savePayments]);

    // Clear all payments
    const clearHistory = useCallback(() => {
        if (!walletAddress) return;
        const key = `${STORAGE_KEY}_${walletAddress.toLowerCase()}`;
        localStorage.removeItem(key);
        setPayments([]);
    }, [walletAddress]);

    return {
        payments,
        recordPayment,
        updatePaymentStatus,
        clearHistory,
    };
}
