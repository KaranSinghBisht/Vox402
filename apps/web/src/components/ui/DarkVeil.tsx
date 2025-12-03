"use client";
import React from "react";

// Lightweight animated background; avoids heavy WebGL to stay SSR-friendly
export function DarkVeil({ className = "" }: { className?: string }) {
  return (
    <div className={"absolute inset-0 overflow-hidden " + className} aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-black via-zinc-950 to-black opacity-80" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(232,65,66,0.12),transparent_25%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.05),transparent_20%),radial-gradient(circle_at_40%_70%,rgba(232,65,66,0.08),transparent_30%)] animate-pulse" />
    </div>
  );
}
