"use client";

import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PortfolioCard } from "@/components/dashboard/PortfolioCard";
import { YieldPosition } from "@/components/dashboard/YieldPosition";
import { ActivityList } from "@/components/dashboard/ActivityList";
import { AllowanceCard } from "@/components/dashboard/AllowanceCard";
import { CommandGuide } from "@/components/dashboard/CommandGuide";

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

                        {/* AI Allowance Card */}
                        <AllowanceCard />
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
