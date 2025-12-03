// apps/web/src/components/ui/Badge.tsx
"use client";
import React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "outline";
  className?: string;
}) {
  const variants = {
    default: "bg-zinc-800 text-gray-300 border border-white/10",
    success: "bg-green-500/10 text-green-400 border border-green-500/20",
    warning: "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
    error: "bg-red-500/10 text-red-400 border border-red-500/20",
    outline: "bg-transparent border border-white/20 text-gray-400",
  } as const;

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider", variants[variant], className)}>
      {children}
    </span>
  );
}
