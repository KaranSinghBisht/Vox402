// apps/web/src/lib/gemini.ts
// Gemini AI integration for Ava - the master AI agent

import {
    canMakeRequest,
    getCachedResponse,
    cacheResponse,
    recordRequest,
    handleRateLimitError,
    getUsageStats,
} from "./rate-limiter";

const GEMINI_MODEL = process.env.GEMINI_MODEL_ID || "gemini-2.0-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Tool definitions for function calling
const AGENT_TOOLS = {
    functionDeclarations: [
        {
            name: "call_chart_agent",
            description: "Fetches price history charts for cryptocurrencies. Use this when the user asks about price history, charts, or price trends for any token.",
            parameters: {
                type: "object",
                properties: {
                    coinId: {
                        type: "string",
                        description: "CoinGecko coin ID, e.g. 'avalanche-2' for AVAX, 'bitcoin', 'ethereum', 'usd-coin' for USDC",
                    },
                    days: {
                        type: "number",
                        description: "Number of days of history to fetch (1-365). Defaults to 30.",
                    },
                    vs: {
                        type: "string",
                        description: "Currency to compare against, e.g. 'usd', 'eur'. Defaults to 'usd'.",
                    },
                },
                required: ["coinId"],
            },
        },
        {
            name: "call_portfolio_agent",
            description: "Analyzes a wallet address on Avalanche Fuji testnet. Returns native AVAX balance, ERC20 token holdings, and a summary. Use when user asks about wallet balance, holdings, or portfolio.",
            parameters: {
                type: "object",
                properties: {
                    address: {
                        type: "string",
                        description: "The wallet address to analyze (0x...)",
                    },
                },
                required: ["address"],
            },
        },
        {
            name: "call_tx_analyzer_agent",
            description: "Analyzes transactions on Avalanche Fuji. Can analyze either: (1) recent transaction history for a wallet address, OR (2) a specific transaction by its hash. Use txHash when user provides a specific 0x... transaction hash to analyze.",
            parameters: {
                type: "object",
                properties: {
                    address: {
                        type: "string",
                        description: "The wallet address to analyze transactions for (0x...). Optional if txHash is provided.",
                    },
                    limit: {
                        type: "number",
                        description: "Number of recent transactions to analyze. Defaults to 10.",
                    },
                    txHash: {
                        type: "string",
                        description: "Specific transaction hash to analyze (0x...). If provided, analyzes this single transaction instead of wallet history.",
                    },
                },
                required: [],
            },
        },
        {
            name: "call_swap_agent",
            description: "Swaps tokens on Avalanche Fuji testnet. ONLY supports AVAX <-> USDC swaps on testnet. Use when user wants to swap, exchange, or trade tokens. This is a testnet demo with test tokens. If user asks about mainnet swaps, explain this is a testnet demo.",
            parameters: {
                type: "object",
                properties: {
                    tokenIn: {
                        type: "string",
                        description: "Token to swap from. Supported: 'USDC', 'AVAX', 'WAVAX'.",
                    },
                    tokenOut: {
                        type: "string",
                        description: "Token to swap to. Supported: 'USDC', 'AVAX', 'WAVAX'.",
                    },
                    amountIn: {
                        type: "string",
                        description: "Amount to swap in human-readable format (e.g., '1.5' for 1.5 tokens).",
                    },
                    recipient: {
                        type: "string",
                        description: "Address to receive the swapped tokens (usually the user's connected wallet).",
                    },
                },
                required: ["tokenIn", "tokenOut", "amountIn", "recipient"],
            },
        },
        {
            name: "call_bridge_agent",
            description: "Bridges tokens cross-chain on MAINNET ONLY (not testnets like Sepolia or Fuji). Uses LI.FI for Avalanche, Ethereum, Base, Polygon, Arbitrum. IMPORTANT: If user asks about testnet bridging, explain that bridge only works on mainnet due to LI.FI liquidity requirements. Do NOT attempt to bridge on testnets - politely explain this limitation.",
            parameters: {
                type: "object",
                properties: {
                    token: {
                        type: "string",
                        description: "Token to bridge: 'USDC', 'AVAX', 'ETH', 'MATIC', 'USDT'.",
                    },
                    amount: {
                        type: "string",
                        description: "Amount to bridge in human-readable format, e.g. '10' or '0.5'.",
                    },
                    fromChain: {
                        type: "string",
                        description: "Source chain: 'avalanche', 'ethereum', 'base', 'polygon', 'arbitrum'.",
                    },
                    toChain: {
                        type: "string",
                        description: "Destination chain: 'avalanche', 'ethereum', 'base', 'polygon', 'arbitrum'.",
                    },
                    recipient: {
                        type: "string",
                        description: "Address to receive the bridged tokens (user's connected wallet).",
                    },
                },
                required: ["token", "amount", "fromChain", "toChain", "recipient"],
            },
        },
        {
            name: "call_contract_inspector_agent",
            description: "Inspects a smart contract on Avalanche Fuji. Provides basic analysis of contract type, functions, and risk assessment. Use when user asks about a contract, wants to check if a contract is safe, or needs contract details.",
            parameters: {
                type: "object",
                properties: {
                    contractAddress: {
                        type: "string",
                        description: "The contract address to inspect (0x...)",
                    },
                },
                required: ["contractAddress"],
            },
        },
        {
            name: "call_yield_agent",
            description: "Invests USDC into a yield-generating vault (~8.5% APY). Currently only supports USDC deposits. Use when user wants to invest, earn yield, deposit into lending. NOTE: AVAX staking is not available yet - only USDC yield works.",
            parameters: {
                type: "object",
                properties: {
                    amount: {
                        type: "string",
                        description: "Human-readable amount of USDC to invest, e.g. '5' or '0.1'",
                    },
                    token: {
                        type: "string",
                        description: "Token to invest. Currently only 'USDC' is supported.",
                    },
                    strategy: {
                        type: "string",
                        description: "Investment strategy. Only 'stable_yield' is available (~8.5% APY).",
                    },
                },
                required: ["amount"],
            },
        },
    ],
};

const SYSTEM_PROMPT = `You are Ava, a friendly and knowledgeable AI assistant for Vox402 - a voice-first DeFi platform on Avalanche.

## Your Personality
- Warm, professional, and concise
- You explain DeFi concepts simply when needed
- You're proactive about suggesting what you can help with

## Your Capabilities

### FREE Services (no payment required)
1. **ChartAgent** - Fetches crypto price history charts (AVAX, BTC, ETH, etc.)
2. **PortfolioAgent** - Analyzes wallet balances and holdings on Avalanche Fuji
3. **TxAnalyzerAgent** - Analyzes transaction history for any wallet
4. **ContractInspectorAgent** - Basic smart contract analysis and risk assessment

### PAID Services (x402 - 0.01 USDC per call)
1. **SwapAgent** - Gets quotes and executes token swaps (USDC <-> AVAX)
2. **BridgeAgent** - Bridges tokens between Avalanche Fuji and other testnets
3. **YieldAgent** - Invests tokens into yield-generating strategies (e.g., "invest $5 in stable yield" = ~8% APY)

## Important Context
- You operate on Avalanche Fuji TESTNET (chain ID 43113)
- Free services work immediately after connecting wallet
- Paid services require a USDC payment signature
- Users connect their Core wallet to interact

## How to Respond
1. If the user's request matches an agent capability, call the appropriate agent function
2. For FREE services, just say you'll fetch/analyze the data
3. For PAID services, mention that it requires a small USDC payment
4. If the user hasn't connected their wallet but needs one for the request, remind them to connect
5. For general questions about crypto/DeFi/Avalanche, answer directly without calling an agent
6. Be concise - this is voice-first, keep responses speakable

## User's Wallet
If the user has connected their wallet, their address will be provided in the context.
When they ask about "my balance" or "my transactions", use their connected wallet address.
`;

export type AgentCall =
    | { agent: "chart"; args: { coinId: string; days: number; vs: string } }
    | { agent: "portfolio"; args: { address: string } }
    | { agent: "tx_analyzer"; args: { address?: string; limit?: number; txHash?: string } }
    | { agent: "swap"; args: { tokenIn: string; tokenOut: string; amountIn: string; recipient: string; network?: string } }
    | { agent: "bridge"; args: { token: string; amount: string; fromChain: string; toChain: string; recipient: string; network?: string } }
    | { agent: "contract_inspector"; args: { contractAddress: string } }
    | { agent: "yield"; args: { amount: string; token?: string; strategy?: string } };

export interface GeminiResponse {
    textReply: string;
    agentCall: AgentCall | null;
}

interface ConversationMessage {
    role: "user" | "model";
    parts: Array<{ text?: string; functionCall?: any; functionResponse?: any }>;
}

// In-memory conversation storage (for serverless, consider Redis/Upstash for persistence)
const conversations = new Map<string, ConversationMessage[]>();

export async function chat(
    userMessage: string,
    sessionId: string,
    walletAddr?: string
): Promise<GeminiResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return {
            textReply: "I'm having trouble connecting to my AI backend. Please ensure GEMINI_API_KEY is configured.",
            agentCall: null,
        };
    }

    // Check for cached response first
    const cached = getCachedResponse(userMessage, walletAddr);
    if (cached) {
        console.log("[Gemini] Using cached response");
        return cached;
    }

    // Check rate limits before making request
    const rateCheck = canMakeRequest();
    if (!rateCheck.allowed) {
        const stats = getUsageStats();
        console.warn(`[Gemini] Rate limit: ${rateCheck.reason}`);
        return {
            textReply: `⚠️ ${rateCheck.reason} (Used ${stats.daily}/${stats.limit} today)`,
            agentCall: null,
        };
    }

    // Log remaining requests
    if (rateCheck.remaining !== undefined && rateCheck.remaining <= 5) {
        console.warn(`[Gemini] Warning: Only ${rateCheck.remaining} requests remaining today`);
    }

    // Get or create conversation history
    let history = conversations.get(sessionId) || [];

    // Add wallet context to user message if available
    const contextualMessage = walletAddr
        ? `[User's connected wallet: ${walletAddr}]\n\nUser: ${userMessage}`
        : `User: ${userMessage}`;

    // Add user message to history
    history.push({
        role: "user",
        parts: [{ text: contextualMessage }],
    });

    // Keep history manageable (last 20 messages)
    if (history.length > 20) {
        history = history.slice(-20);
    }

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }],
                },
                contents: history,
                tools: [AGENT_TOOLS],
                toolConfig: {
                    functionCallingConfig: {
                        mode: "AUTO",
                    },
                },
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                },
            }),
        });

        // Record this request for rate limiting
        recordRequest();

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Gemini API error:", response.status, errorText);

            // Handle rate limit errors specially
            if (response.status === 429) {
                const errorMessage = handleRateLimitError({ message: errorText });
                return {
                    textReply: errorMessage,
                    agentCall: null,
                };
            }

            return {
                textReply: "I encountered an error processing your request. Please try again.",
                agentCall: null,
            };
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const content = candidate?.content;

        if (!content?.parts?.length) {
            return {
                textReply: "I didn't quite understand that. Could you rephrase?",
                agentCall: null,
            };
        }

        // Process response parts
        let textReply = "";
        let agentCall: AgentCall | null = null;

        for (const part of content.parts) {
            if (part.text) {
                textReply += part.text;
            }

            if (part.functionCall) {
                const fc = part.functionCall;
                const args = fc.args || {};

                switch (fc.name) {
                    case "call_chart_agent":
                        agentCall = {
                            agent: "chart",
                            args: {
                                coinId: args.coinId || "avalanche-2",
                                days: args.days || 30,
                                vs: args.vs || "usd",
                            },
                        };
                        break;

                    case "call_portfolio_agent":
                        agentCall = {
                            agent: "portfolio",
                            args: {
                                address: args.address,
                            },
                        };
                        break;

                    case "call_tx_analyzer_agent":
                        agentCall = {
                            agent: "tx_analyzer",
                            args: {
                                address: args.address,
                                limit: args.limit || 10,
                                txHash: args.txHash,
                            },
                        };
                        break;

                    case "call_swap_agent":
                        agentCall = {
                            agent: "swap",
                            args: {
                                tokenIn: args.tokenIn,
                                tokenOut: args.tokenOut,
                                amountIn: args.amountIn,
                                recipient: args.recipient,
                                network: args.network,
                            },
                        };
                        break;

                    case "call_bridge_agent":
                        agentCall = {
                            agent: "bridge",
                            args: {
                                token: args.token,
                                amount: args.amount,
                                fromChain: args.fromChain,
                                toChain: args.toChain,
                                recipient: args.recipient,
                                network: args.network,
                            },
                        };
                        break;

                    case "call_contract_inspector_agent":
                        agentCall = {
                            agent: "contract_inspector",
                            args: {
                                contractAddress: args.contractAddress,
                            },
                        };
                        break;

                    case "call_yield_agent":
                        agentCall = {
                            agent: "yield",
                            args: {
                                amount: args.amount,
                                token: args.token || "USDC",
                                strategy: args.strategy || "stable_yield",
                            },
                        };
                        break;
                }
            }
        }

        // Add model response to history
        history.push({
            role: "model",
            parts: content.parts,
        });

        // Save updated history
        conversations.set(sessionId, history);

        // If no text reply but there's a function call, generate a default message
        if (!textReply && agentCall) {
            switch (agentCall.agent) {
                case "chart":
                    textReply = `Let me fetch that ${agentCall.args.coinId} chart for you.`;
                    break;
                case "portfolio":
                    textReply = `I'll analyze the portfolio for you.`;
                    break;
                case "tx_analyzer":
                    textReply = `Let me check the transaction history.`;
                    break;
                case "swap":
                    textReply = `I'll get a swap quote. This execution costs 0.01 USDC.`;
                    break;
                case "bridge":
                    textReply = `I'll check the bridge options. This execution costs 0.01 USDC.`;
                    break;
                case "contract_inspector":
                    textReply = `I'll inspect that contract for you.`;
                    break;
                case "yield":
                    textReply = `I'll set up that yield strategy. This execution costs 0.01 USDC.`;
                    break;
            }
        }

        // Cache successful response (only for non-agent-call responses to avoid stale data)
        const result = { textReply, agentCall };
        if (!agentCall) {
            cacheResponse(userMessage, walletAddr, result);
        }

        return result;
    } catch (error: any) {
        console.error("Gemini chat error:", error);
        return {
            textReply: `Sorry, I had trouble processing that: ${error?.message || "Unknown error"}`,
            agentCall: null,
        };
    }
}

// Clear conversation history for a session
export function clearSession(sessionId: string): void {
    conversations.delete(sessionId);
}
