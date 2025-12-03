import React from "react";
import { Hexagon, Github, Twitter } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-zinc-950 py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center border border-white/10">
            <Hexagon className="w-5 h-5 text-avax-red" />
          </div>
          <span className="font-bold text-gray-200 tracking-tight">VOX402</span>
        </div>

        <div className="flex gap-6 text-sm text-gray-500">
          <a href="#" className="hover:text-white transition-colors">
            Documentation
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Agents
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Terms
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Privacy
          </a>
        </div>

        <div className="flex items-center gap-4">
          <a href="#" className="text-gray-500 hover:text-white transition-colors">
            <Github className="w-5 h-5" />
          </a>
          <a href="#" className="text-gray-500 hover:text-white transition-colors">
            <Twitter className="w-5 h-5" />
          </a>
          <div className="h-4 w-[1px] bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-mono text-gray-400">All Systems Operational</span>
          </div>
        </div>
      </div>
      <div className="mt-8 text-center text-[10px] text-gray-700 font-mono">
        BUILT ON AVALANCHE • © 2024 VOX PROTOCOL
      </div>
    </footer>
  );
}
