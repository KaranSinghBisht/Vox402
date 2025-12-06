import React from "react";
import { Fingerprint, Database, Zap, Lock } from "lucide-react";

export function Features() {
  const items = [
    { icon: Fingerprint, title: "EIP-712 Signatures", desc: "Human-readable typed data signing. You always know exactly what you are authorizing." },
    { icon: Lock, title: "Non-Custodial", desc: "Agents never hold your keys. They only request permission to execute specific encoded transactions." },
    { icon: Database, title: "On-Chain Receipts", desc: "Every 402 payment settles on Avalanche with an immutable log of the service request." },
  ];

  return (
    <section className="py-24 px-6 border-t border-white/5 bg-zinc-900/20">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div className="space-y-8">
            <h2 className="text-3xl font-bold">Protocol Security</h2>
            <p className="text-gray-400 text-lg leading-relaxed">
              Vox402 is built on the premise that AI agents should be economically aligned but cryptographically constrained.
            </p>

            <div className="space-y-6">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="shrink-0 mt-1">
                    <item.icon className="w-5 h-5 text-avax-red" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-200">{item.title}</h3>
                    <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 bg-avax-red rounded-xl blur-lg opacity-10" />
            <div className="relative h-full glass-panel rounded-xl p-6 font-mono text-xs text-gray-400 overflow-hidden">
              <div className="flex gap-1.5 mb-4">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
              </div>
              <pre className="language-json whitespace-pre-wrap">
                {`// EIP-712 Typed Data
{
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" }
    ],
    "AgentRequest": [
      { "name": "agentId", "type": "uint256" },
      { "name": "price", "type": "uint256" },
      { "name": "expiry", "type": "uint256" }
    ]
  },
  "domain": {
    "name": "Vox402",
    "version": "1",
    "chainId": 43113
  },
  "message": {
    "agentId": 42,
    "price": "10000", // 0.01 USDC
    "expiry": 1715420000
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
