"use client";

import Link from "next/link";
import { ChevronLeft, Hexagon } from "lucide-react";
import { AuthButton } from "@/components/wallet/AuthButton";

export function DashboardHeader() {
    return (
        <header className="h-16 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
            <div className="container mx-auto h-full flex items-center justify-between px-4">
                <div className="flex items-center gap-6">
                    <Link href="/app" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors group">
                        <ChevronLeft className="w-4 h-4 opacity-70 group-hover:opacity-100" />
                        <span className="hidden sm:inline">Back to Chat</span>
                    </Link>

                    <div className="h-5 w-px bg-white/10" />

                    <Link href="/dashboard" className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-avax-red to-red-900 rounded-lg flex items-center justify-center shadow-[0_0_15px_-3px_rgba(232,65,66,0.4)]">
                            <Hexagon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight leading-none text-white">
                                VOX<span className="text-avax-red">402</span>
                            </h1>
                            <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
                                Dashboard
                            </p>
                        </div>
                    </Link>
                </div>

                <AuthButton />
            </div>
        </header>
    );
}
