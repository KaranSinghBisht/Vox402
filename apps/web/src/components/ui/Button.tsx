// apps/web/src/components/ui/Button.tsx
"use client";
import React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  const variants = {
    primary:
      "bg-white text-black hover:bg-gray-200 shadow-[0_0_15px_-3px_rgba(255,255,255,0.3)] border border-transparent",
    ghost: "bg-transparent text-gray-400 hover:text-white hover:bg-white/5",
    outline: "bg-transparent border border-white/20 text-white hover:bg-white/5 hover:border-white/40",
    danger:
      "bg-avax-red text-white hover:bg-red-600 shadow-[0_0_20px_-5px_rgba(232,65,66,0.5)] border border-transparent",
  } as const;

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    icon: "h-10 w-10 p-2 flex items-center justify-center",
  } as const;

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
