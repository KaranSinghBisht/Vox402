"use client";

import Link from "next/link";
import { ArrowLeft, Hexagon, Zap, Shield, Mic, BarChart3, RefreshCcw, Layers, Code, Terminal } from "lucide-react";

export default function DocsPage() {
    return (
        <div className="min-h-screen bg-black text-white">
            {/* Header */}
            <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl">
                <div className="container mx-auto flex items-center justify-between h-16 px-4">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-avax-red to-red-900 rounded-lg flex items-center justify-center">
                            <Hexagon className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-bold text-lg">VOX<span className="text-avax-red">402</span></span>
                    </Link>
                    <Link href="/" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        Back to Home
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="container mx-auto px-4 py-12 max-w-4xl">
                {/* Title */}
                <div className="mb-12">
                    <h1 className="text-4xl font-bold mb-4">
                        Documentation
                    </h1>
                    <p className="text-xl text-gray-400">
                        Learn how Vox402 combines voice AI with the x402 payment protocol on Avalanche.
                    </p>
                </div>

                {/* What is Vox402 */}
                <Section title="What is Vox402?" icon={<Hexagon className="w-5 h-5" />}>
                    <p className="text-gray-300 mb-4">
                        <strong className="text-white">Vox402</strong> is a voice-controlled AI assistant that can execute DeFi operations on the Avalanche blockchain. It uses natural voice commands to interact with paid AI agents through the <strong className="text-avax-red">x402 payment protocol</strong>.
                    </p>
                    <p className="text-gray-300">
                        Simply speak commands like <code className="bg-zinc-800 px-2 py-0.5 rounded text-sm">"Swap 10 USDC to AVAX"</code> and Vox402 handles the rest — routing your request to specialized agents, processing micropayments, and executing on-chain transactions.
                    </p>
                </Section>

                {/* x402 Protocol */}
                <Section title="The x402 Payment Protocol" icon={<Zap className="w-5 h-5" />}>
                    <p className="text-gray-300 mb-4">
                        x402 is a decentralized payment protocol that enables <strong className="text-white">pay-per-use AI services</strong>. Instead of subscriptions, you pay only for what you use with instant micropayments.
                    </p>

                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4 mb-4">
                        <h4 className="font-semibold text-white mb-3">How it works:</h4>
                        <ol className="space-y-2 text-gray-300">
                            <li className="flex gap-3">
                                <span className="text-avax-red font-mono">1.</span>
                                You send a request to an AI agent
                            </li>
                            <li className="flex gap-3">
                                <span className="text-avax-red font-mono">2.</span>
                                Agent returns <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">HTTP 402 Payment Required</code> with price
                            </li>
                            <li className="flex gap-3">
                                <span className="text-avax-red font-mono">3.</span>
                                You sign an EIP-712 payment authorization
                            </li>
                            <li className="flex gap-3">
                                <span className="text-avax-red font-mono">4.</span>
                                Agent validates payment and executes your request
                            </li>
                        </ol>
                    </div>

                    <p className="text-gray-400 text-sm">
                        Learn more: <a href="https://build.avax.network/academy/blockchain/x402-payment-infrastructure" target="_blank" rel="noopener noreferrer" className="text-avax-red hover:underline">x402 Payment Infrastructure →</a>
                    </p>
                </Section>

                {/* Architecture */}
                <Section title="Architecture" icon={<Layers className="w-5 h-5" />}>
                    <div className="grid md:grid-cols-2 gap-4 mb-6">
                        <ArchCard
                            title="Frontend (Next.js)"
                            items={["Voice recognition (Web Speech API)", "ElevenLabs/Murf AI TTS", "Thirdweb wallet auth", "Session wallet management"]}
                        />
                        <ArchCard
                            title="AI Layer (Gemini)"
                            items={["Natural language understanding", "Intent routing", "Agent orchestration", "Response generation"]}
                        />
                        <ArchCard
                            title="Agent Network"
                            items={["ChartAgent (free)", "PortfolioAgent (free)", "SwapAgent (paid, x402)", "YieldAgent (paid, x402)"]}
                        />
                        <ArchCard
                            title="Blockchain (Avalanche)"
                            items={["Fuji testnet", "USDC payments", "Token swaps via DEX", "Yield protocol integration"]}
                        />
                    </div>
                </Section>

                {/* Features */}
                <Section title="Features" icon={<Terminal className="w-5 h-5" />}>
                    <div className="grid gap-4">
                        <FeatureRow icon={<Mic className="w-4 h-4" />} title="Voice Commands" desc="Speak naturally to execute DeFi operations" />
                        <FeatureRow icon={<BarChart3 className="w-4 h-4" />} title="Live Charts" desc="Get real-time price charts for any cryptocurrency" />
                        <FeatureRow icon={<RefreshCcw className="w-4 h-4" />} title="Token Swaps" desc="Swap tokens with voice commands via x402 agents" />
                        <FeatureRow icon={<Shield className="w-4 h-4" />} title="Session Wallet" desc="Pre-funded wallet with daily spending limits" />
                    </div>
                </Section>

                {/* Session Wallet */}
                <Section title="Session Wallet" icon={<Shield className="w-5 h-5" />}>
                    <p className="text-gray-300 mb-4">
                        The <strong className="text-white">Session Wallet</strong> is a browser-generated wallet that holds a small USDC allowance for paying AI agents. This enables seamless micropayments without requiring wallet signature for every transaction.
                    </p>

                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
                        <h4 className="font-semibold text-white mb-3">Features:</h4>
                        <ul className="space-y-2 text-gray-300">
                            <li>• <strong>Daily Spending Limits:</strong> Set maximum daily spend (default: $10)</li>
                            <li>• <strong>Auto-Pay:</strong> Automatic payments under your limit</li>
                            <li>• <strong>Withdraw Anytime:</strong> Move funds back to your main wallet</li>
                            <li>• <strong>Local Storage:</strong> Private key stored in browser only</li>
                        </ul>
                    </div>
                </Section>

                {/* Example Commands */}
                <Section title="Example Commands" icon={<Code className="w-5 h-5" />}>
                    <div className="space-y-3">
                        <CommandExample cmd="Show me AVAX chart for 30 days" result="Displays AVAX/USD price chart" />
                        <CommandExample cmd="What's in my portfolio?" result="Shows your token balances" />
                        <CommandExample cmd="Swap 5 USDC to AVAX" result="Executes swap via x402 agent" />
                        <CommandExample cmd="Analyze transaction 0x123..." result="Explains what a transaction did" />
                    </div>
                </Section>

                {/* Getting Started */}
                <Section title="Getting Started" icon={<Zap className="w-5 h-5" />}>
                    <ol className="space-y-4 text-gray-300">
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-avax-red/20 text-avax-red flex items-center justify-center text-sm font-bold shrink-0">1</span>
                            <span>Connect your wallet (Core, MetaMask, or social login)</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-avax-red/20 text-avax-red flex items-center justify-center text-sm font-bold shrink-0">2</span>
                            <span>Fund your session wallet with testnet USDC</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-avax-red/20 text-avax-red flex items-center justify-center text-sm font-bold shrink-0">3</span>
                            <span>Click the mic button and speak your command</span>
                        </li>
                        <li className="flex gap-3">
                            <span className="w-6 h-6 rounded-full bg-avax-red/20 text-avax-red flex items-center justify-center text-sm font-bold shrink-0">4</span>
                            <span>Watch Ava execute your request with x402 payments</span>
                        </li>
                    </ol>
                </Section>

                {/* Links */}
                <div className="mt-12 pt-8 border-t border-white/10">
                    <h3 className="font-semibold text-white mb-4">Resources</h3>
                    <div className="flex flex-wrap gap-4">
                        <a href="https://build.avax.network/academy/blockchain/x402-payment-infrastructure" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-avax-red transition-colors">
                            x402 Docs →
                        </a>
                        <a href="https://docs.avax.network/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-avax-red transition-colors">
                            Avalanche Docs →
                        </a>
                        <a href="https://github.com/KaranSinghBisht/Vox402" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-avax-red transition-colors">
                            GitHub →
                        </a>
                    </div>
                </div>
            </main>
        </div>
    );
}

// Helper Components
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="mb-12">
            <h2 className="flex items-center gap-3 text-2xl font-bold mb-4">
                <span className="text-avax-red">{icon}</span>
                {title}
            </h2>
            {children}
        </section>
    );
}

function ArchCard({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-4">
            <h4 className="font-semibold text-white mb-2">{title}</h4>
            <ul className="text-sm text-gray-400 space-y-1">
                {items.map((item, i) => (
                    <li key={i}>• {item}</li>
                ))}
            </ul>
        </div>
    );
}

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
    return (
        <div className="flex items-start gap-4 p-4 bg-zinc-900/30 border border-white/5 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-avax-red/10 text-avax-red flex items-center justify-center shrink-0">
                {icon}
            </div>
            <div>
                <h4 className="font-semibold text-white">{title}</h4>
                <p className="text-sm text-gray-400">{desc}</p>
            </div>
        </div>
    );
}

function CommandExample({ cmd, result }: { cmd: string; result: string }) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-zinc-900/30 border border-white/5 rounded-lg">
            <code className="text-avax-red font-mono text-sm">"{cmd}"</code>
            <span className="text-gray-500 hidden sm:inline">→</span>
            <span className="text-gray-400 text-sm">{result}</span>
        </div>
    );
}
