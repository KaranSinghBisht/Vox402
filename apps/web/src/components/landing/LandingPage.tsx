"use client";
import { useRouter } from "next/navigation";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Marketplace } from "@/components/landing/Marketplace";
import { Features } from "@/components/landing/Features";
import { Footer } from "@/components/landing/Footer";

export function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-zinc-950 text-white selection:bg-avax-red/30">
      <Hero onLaunch={() => router.push("/app")} />
      <HowItWorks />
      <Marketplace />
      <Features />
      <Footer />
    </div>
  );
}
