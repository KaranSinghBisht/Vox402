// apps/web/src/components/chat/InputArea.tsx
"use client";
import React, { useRef } from "react";
import { Loader2, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function InputArea({
  value,
  onChange,
  onSend,
  isLoading,
  onVoiceToggle,
  isListening,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isLoading: boolean;
  onVoiceToggle: () => void;
  isListening: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative w-full max-w-3xl mx-auto px-4 pb-6 pt-2">
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-avax-red/20 via-white/10 to-avax-red/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />

        <div className="relative flex items-center bg-zinc-900 border border-white/10 rounded-xl p-2 shadow-2xl">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isLoading}
            onClick={() => {
              onVoiceToggle();
              inputRef.current?.focus();
            }}
            className={cn("rounded-lg transition-all duration-300", isListening ? "bg-avax-red text-white animate-pulse" : "text-gray-400 hover:text-white")}
          >
            <Mic className={cn("w-5 h-5", isListening && "animate-bounce")} />
          </Button>

          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isListening ? "Listening..." : "Type a command or use voice..."}
            className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 font-mono text-sm px-4 h-10 outline-none"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isLoading) onSend();
            }}
          />

          <div className="flex items-center gap-1">
            <span className="hidden md:flex text-[10px] text-gray-600 font-mono mr-2 border border-white/5 px-1.5 py-0.5 rounded">CMD+K</span>
            <Button
              type="button"
              variant="primary"
              size="icon"
              disabled={!value.trim() || isLoading}
              className="h-9 w-9 bg-white text-black hover:bg-gray-200"
              onClick={onSend}
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
