<div align="center">

# 🎙️ Vox402

### Voice-First AI Assistant for DeFi on Avalanche

*Talk to the blockchain. Pay only for what you use.*

[![Built with Gemini](https://img.shields.io/badge/AI-Gemini%202.0-blue)](https://ai.google.dev/)
[![x402 Protocol](https://img.shields.io/badge/Payments-x402-red)](https://www.x402.org/)
[![Avalanche Fuji](https://img.shields.io/badge/Network-Avalanche%20Fuji-e84142)](https://www.avax.network/)

[Demo Video](#demo) • [Features](#features) • [Architecture](#architecture) • [Quick Start](#quick-start)

</div>

---

## 🎯 What is Vox402?

**Vox402** is a voice-first AI assistant that makes DeFi accessible through natural language. Instead of navigating complex UIs, just tell Ava what you want:

> *"Swap 0.1 USDC to AVAX"*  
> *"Invest $5 in stable yield"*  
> *"Show me the AVAX chart for the last 30 days"*

Built for the **Hack2Build: Payments x402 Edition** hackathon, Vox402 demonstrates how AI agents can be monetized with micropayments using the **x402 protocol**.

---

## ✨ Features

### 🎤 Voice-First Experience
- Natural language input via voice or text
- AI-powered intent understanding with Google Gemini 2.0
- Text-to-speech responses from Ava, your DeFi assistant

### 💰 x402 Micropayments
- **Pay-per-use**: Only pay for premium services you actually use
- **Gasless payments**: USDC payments via EIP-3009 `transferWithAuthorization`
- **No subscriptions**: 0.01 USDC per premium agent call

### 🤖 AI Agent Marketplace

| Agent | Type | What it does |
|-------|------|--------------|
| **ChartAgent** | FREE | Fetch crypto price charts (AVAX, BTC, ETH) |
| **PortfolioAgent** | FREE | Analyze wallet balances and holdings |
| **TxAnalyzerAgent** | FREE | Review transaction history |
| **ContractInspectorAgent** | FREE | Smart contract analysis & risk assessment |
| **SwapAgent** | PAID | Execute token swaps (USDC ↔ WAVAX) |
| **BridgeAgent** | PAID | Cross-chain bridging quotes |
| **YieldAgent** | PAID | Multi-step yield investments (~8.5% APY) |

### 🔐 Core Wallet Integration
- Seamless connection with Core browser extension
- Automatic network switching to Avalanche Fuji
- Transaction signing for swaps and deposits

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │ Voice Input │  │ Chat UI      │  │ Execution Panels       │  │
│  │ (Web Speech)│  │ (Messages)   │  │ (Swap, Yield Steps)    │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestrator (Express)                      │
│  ┌─────────────────┐  ┌─────────────────────────────────────┐   │
│  │ Gemini 2.0 API  │  │ Agent Router                        │   │
│  │ (Intent + Tools)│  │ (x402 payment passthrough)          │   │
│  └─────────────────┘  └─────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ ChartAgent  │     │ SwapAgent   │     │ YieldAgent  │
│   (FREE)    │     │  (x402)     │     │  (x402)     │
│ CoinGecko   │     │ Pangolin    │     │ ERC4626     │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Tech Stack

- **Frontend**: Next.js 15, React 19, TailwindCSS, Viem
- **AI**: Google Gemini 2.0 Flash with function calling
- **Payments**: x402 protocol, EIP-3009 gasless USDC transfers
- **Blockchain**: Avalanche Fuji testnet
- **DEX**: Pangolin Router for swaps
- **Yield**: Custom ERC4626 vault

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- [Core Wallet](https://core.app/) browser extension
- Avalanche Fuji testnet USDC ([Faucet](https://core.app/tools/testnet-faucet))

### 1. Clone & Install

```bash
git clone https://github.com/KaranSinghBisht/Vox402.git
cd Vox402
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
# Required
GEMINI_API_KEY=your_gemini_api_key
CHART_AGENT_PAYTO=0xYourPaymentAddress
CHART_AGENT_GAS_PAYER_PK=0xYourPrivateKey

# Optional
GEMINI_MODEL_ID=gemini-2.0-flash
```

### 3. Run All Services

```bash
# Terminal 1: All agents + orchestrator + web
pnpm -r dev
```

Or run individually:
```bash
# Agents (each in a terminal)
cd services/agents/chart-agent && pnpm dev      # :4101
cd services/agents/swap-agent && pnpm dev       # :4103
cd services/agents/portfolio-agent && pnpm dev  # :4104
cd services/agents/tx-analyzer-agent && pnpm dev # :4105
cd services/agents/bridge-agent && pnpm dev     # :4106
cd services/agents/contract-inspector-agent && pnpm dev # :4107
cd services/agents/yield-agent && pnpm dev      # :4108

# Orchestrator
cd apps/orchestrator && pnpm dev                # :4100

# Web
cd apps/web && pnpm dev                         # :3000
```

### 4. Open the App

Visit [http://localhost:3000](http://localhost:3000)

1. Connect your Core wallet
2. Say "Show AVAX 30 day chart" (free)
3. Say "Swap 0.1 USDC to AVAX" (paid - 0.01 USDC)
4. Say "Invest 0.1 USDC in stable yield" (paid - 0.01 USDC)

---

## 📁 Project Structure

```
Vox402/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   └── src/components/     # React components
│   └── orchestrator/           # Express AI router
│       └── src/gemini.ts       # Gemini integration
├── services/agents/
│   ├── chart-agent/            # FREE - Price charts
│   ├── swap-agent/             # PAID - Token swaps
│   ├── portfolio-agent/        # FREE - Wallet analysis
│   ├── tx-analyzer-agent/      # FREE - Tx history
│   ├── bridge-agent/           # PAID - Bridge quotes
│   ├── contract-inspector-agent/ # FREE - Contract analysis
│   └── yield-agent/            # PAID - Yield strategies
├── contracts/
│   └── src/SimpleYieldVault.sol # ERC4626 vault
└── packages/                   # Shared utilities
```

---

## 🔧 Deployed Contracts

| Contract | Address | Network |
|----------|---------|---------|
| **SimpleYieldVault** | `0xd2A081B94871FFE6653273ceC967f9dFbD7F8764` | Avalanche Fuji |
| **USDC** | `0x5425890298aed601595a70AB815c96711a31Bc65` | Avalanche Fuji |
| **WAVAX** | `0xd00ae08403b9bbb9124bb305c09058e32c39a48c` | Avalanche Fuji |
| **Pangolin Router** | `0x688d21b0B8Dc35971AF58cFF1F7Bf65639937860` | Avalanche Fuji |

---

## 🎥 Demo

*Coming soon*

---

## 🏆 Hackathon Tracks

This project addresses:

1. **x402 Integration** - Micropayments for AI agent services
2. **AI + DeFi** - Natural language interface for blockchain
3. **Multi-step Transactions** - Complex DeFi flows via voice

---

## 👥 Team

Built with ❤️ for **Hack2Build: Payments x402 Edition**

---

## 📄 License

MIT
