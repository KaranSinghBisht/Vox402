"use client";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { YieldPosition } from "@/components/dashboard/YieldPosition";
import { ActivityList } from "@/components/dashboard/ActivityList";

export default function DashboardPage() {
    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500/30">
            <DashboardHeader />

            <main className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Portfolio Overview */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <PortfolioCard />
                            <YieldPosition />
                        </div>

                        {/* Chart Area could go here later */}
                        <div className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5 h-[300px] flex items-center justify-center text-gray-600 border-dashed">
                            Portfolio History Chart (Coming Soon)
                        </div>
                    </div>

                    {/* Activity Feed */}
                    <div className="lg:col-span-1">
                        <ActivityList />
                    </div>
                </div>
            </main>
        </div>
    );
}
