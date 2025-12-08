// apps/web/src/components/Vox402App.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createWalletClient, custom, getAddress, http, type Hex } from "viem";
import { avalancheFuji } from "viem/chains";
import { Hexagon, Activity, ChevronLeft } from "lucide-react";
import { b64decodeUtf8, b64encodeUtf8 } from "@/lib/base64";
import { randomBytes32Hex } from "@/lib/random";
import { detectProvider, ensureFuji, type EIP1193Provider } from "@/lib/wallet";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { useSessionWallet } from "@/hooks/useSessionWallet";
import { useAgentHistory } from "@/hooks/useAgentHistory";
import { privateKeyToAccount } from "viem/accounts";
import { AuthButton } from "@/components/wallet/AuthButton";
import { MessageBubble, type UIMessage } from "@/components/chat/MessageBubble";
import { InputArea } from "@/components/chat/InputArea";
import { ActionPanel } from "@/components/chat/ActionPanel";
import { SwapExecutionPanel } from "@/components/chat/SwapExecutionPanel";
import { MultiStepPanel } from "@/components/chat/MultiStepPanel";
import { AgentChoiceModal } from "@/components/AgentChoiceModal";
import { type SeriesPoint } from "@/components/chart/MiniLineChart";

type NextAction =
  | { kind: "chart"; args: { coinId: string; days: number; vs: string } }
  | { kind: "wallet"; args: { address: string } }
  | { kind: "portfolio"; args: { address: string } }
  | { kind: "tx_analyzer"; args: { address?: string; limit?: number; txHash?: string } }
  | { kind: "swap"; args: { tokenIn: string; tokenOut: string; amountIn: string; recipient: string; slippageBps?: number } }
  | { kind: "bridge"; args: { token: string; amount: string; fromChain: string; toChain: string; recipient: string } }
  | { kind: "contract_inspector"; args: { contractAddress: string } }
  | { kind: "yield"; args: { amount: string; token: string; strategy: string; userAddress: string } }
  | null;

type PaymentRequirements = {
  x402Version: number;
  accepts: Array<{
    scheme: "exact";
    network: "avalanche-fuji";
    maxAmountRequired: string;
    resource: string;
    description?: string;
    payTo: `0x${string}`;
    asset: `0x${string}`;
    maxTimeoutSeconds?: number;
  }>;
  error?: string;
};

function canUseSpeechRecognition() {
  return typeof window !== "undefined" && (!!(window as any).webkitSpeechRecognition || !!(window as any).SpeechRecognition);
}

import { playElevenLabsTTS } from "@/lib/tts";

function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = async (text: string) => {
    // Check if API key is configured
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;

    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setIsSpeaking(true);

    if (apiKey) {
      console.log("[TTS] Calling ElevenLabs with key:", apiKey.slice(0, 8) + "...");
      const audio = await playElevenLabsTTS(text, apiKey);
      if (audio) {
        audioRef.current = audio;
        audio.onended = () => setIsSpeaking(false);
        audio.onerror = () => setIsSpeaking(false);
        return; // ElevenLabs success
      }
    }

    // Fallback: Browser TTS
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      // Try to find a female voice for fallback
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => /female|woman|zira|susan|victoria|samantha/i.test(v.name));
      if (voice) u.voice = voice;

      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(u);
    } else {
      setIsSpeaking(false);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  return { speak, stopSpeaking, isSpeaking };
}

export function Vox402App() {
  // API routes - works both locally and on Vercel
  const supportsSR = useMemo(canUseSpeechRecognition, []);
  const { speak, stopSpeaking, isSpeaking } = useTTS();

  // Use unified wallet auth (Thirdweb)
  const { walletAddress, viemWalletClient, isAuthenticated, displayName } = useWalletAuth();
  const {
    sessionAccount,
    balance: sessionBalance,
    isLoading: sessionLoading,
    canSpend,
    recordSpend,
    dailyLimit,
    dailySpent
  } = useSessionWallet();
  const { recordPayment } = useAgentHistory();
  const walletAddr = walletAddress;

  const [messages, setMessages] = useState<UIMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Hi! I'm Ava. Connect Core wallet, then say: 'Show AVAX 30d chart'.",
      ts: Date.now(),
      kind: "text",
    },
  ]);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);

  const [pendingAction, setPendingAction] = useState<NextAction>(null);
  const [pending402, setPending402] = useState<PaymentRequirements | null>(null);
  const [lastSettlement, setLastSettlement] = useState<string | null>(null);
  const [pendingSwap, setPendingSwap] = useState<{
    quote: any;
    needsApproval: boolean;
    approveTx: any;
    swapArgs: any;
    chainId: number;
  } | null>(null);
  const [pendingYield, setPendingYield] = useState<{
    strategy: any;
    amount: string;
    estimatedApy: number;
    estimatedYieldYear: string;
    steps: any[];
    chainId: number;
  } | null>(null);
  const voiceFinalRef = useRef<string>("");
  const [voiceCommit, setVoiceCommit] = useState<string | null>(null);

  // Registry modal state
  const [showAgentChoice, setShowAgentChoice] = useState(false);
  const [agentChoiceCategory, setAgentChoiceCategory] = useState<"swap" | "yield" | "analytics">("swap");
  const [pendingUserQuery, setPendingUserQuery] = useState("");

  // TTS mute state (persisted in localStorage)
  // Initialize to false to avoid hydration mismatch, then sync from localStorage
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("vox402-muted");
    if (stored === "true") setIsMuted(true);
  }, []);

  const toggleMute = () => {
    setIsMuted(prev => {
      const newVal = !prev;
      localStorage.setItem("vox402-muted", String(newVal));
      if (newVal) stopSpeaking();
      return newVal;
    });
  };

  // Smart speak - cleans up text and respects mute
  const smartSpeak = (text: string) => {
    if (isMuted) return;
    // Clean up the text for TTS
    const cleaned = text
      .replace(/0x[a-fA-F0-9]{6,}/g, (addr) => addr.slice(0, 6) + '...' + addr.slice(-4)) // Shorten addresses
      .replace(/\d+\.\d{6,}/g, (num) => parseFloat(num).toFixed(2)) // Shorten decimals
      .replace(/https?:\/\/[^\s]+/g, "link") // Replace URLs
      .replace(/\n+/g, ". ") // Replace newlines
      .slice(0, 200); // Max 200 chars for speech
    speak(cleaned);
  };

  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const autoRunKeyRef = useRef<string | null>(null);



  useEffect(() => {
    if (!supportsSR) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      console.log("[Speech] Recognition started");
      setListening(true);
      voiceFinalRef.current = "";
    };

    rec.onresult = (event: any) => {
      let transcript = "";
      let finalText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript ?? "";
        transcript += chunk;
        if (event.results[i].isFinal) finalText += chunk;
      }

      console.log("[Speech] Got result:", { transcript, finalText });

      const trimmed = transcript.trim();
      if (trimmed) setInput(trimmed);

      const finalTrimmed = finalText.trim();
      if (finalTrimmed) voiceFinalRef.current = finalTrimmed;
    };

    rec.onerror = (event: any) => {
      setListening(false);
      const code = event?.error ?? "unknown";

      // Silently ignore no-speech and aborted - these are normal
      if (code === "no-speech" || code === "aborted") {
        return;
      }

      pushMessage({
        role: "assistant",
        kind: "text",
        text:
          code === "not-allowed"
            ? "Mic permission blocked. Allow microphone access and try again."
            : `Speech recognition error: ${code}`,
      });
    };

    rec.onend = () => {
      setListening(false);
      const final = voiceFinalRef.current.trim();
      voiceFinalRef.current = "";
      if (final) setVoiceCommit(final);
    };

    recognitionRef.current = rec;

    return () => {
      try {
        rec.onstart = null;
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        rec.stop?.();
      } catch { }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportsSR]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending402, busy, lastSettlement]);

  useEffect(() => {
    if (!voiceCommit) return;
    if (busy) return;
    void send(voiceCommit);
    setVoiceCommit(null);
  }, [voiceCommit, busy]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pay effect
  useEffect(() => {
    if (pending402 && sessionAccount && pendingAction && !busy && !sessionLoading) {
      const request = pending402;
      const option = request.accepts[0];

      // Check if allowance is sufficient (approx check, assumes 6 decimals for USDC)
      const requiredUSDC = Number(option.maxAmountRequired) / 1000000;
      const available = Number(sessionBalance);

      // Check balance
      if (available < requiredUSDC) {
        return; // Skip auto-pay, let manual UI show
      }

      // Check daily spending limit
      if (!canSpend(requiredUSDC)) {
        pushMessage({ role: "assistant", kind: "text", text: `⚠️ Daily limit reached ($${dailySpent.toFixed(2)}/$${dailyLimit}). Increase limit in Dashboard.` });
        return;
      }

      (async () => {
        try {
          pushMessage({ role: "assistant", kind: "text", text: "🤖 Paying with allowance..." });

          const client = createWalletClient({
            account: sessionAccount,
            chain: avalancheFuji,
            transport: http()
          });

          const now = Math.floor(Date.now() / 1000);
          const authorization = {
            from: sessionAccount.address,
            to: option.payTo,
            value: BigInt(option.maxAmountRequired),
            validAfter: BigInt(0),
            validBefore: BigInt(now + 3600),
            nonce: randomBytes32Hex(),
          } as const;

          const signature = await client.signTypedData({
            account: sessionAccount,
            domain: { name: "USD Coin", version: "2", chainId: 43113, verifyingContract: option.asset },
            types: {
              TransferWithAuthorization: [
                { name: "from", type: "address" },
                { name: "to", type: "address" },
                { name: "value", type: "uint256" },
                { name: "validAfter", type: "uint256" },
                { name: "validBefore", type: "uint256" },
                { name: "nonce", type: "bytes32" },
              ],
            },
            primaryType: "TransferWithAuthorization",
            message: authorization,
          });

          const paymentPayload = {
            x402Version: 1,
            scheme: option.scheme,
            network: option.network,
            payload: {
              signature,
              authorization: {
                from: authorization.from,
                to: authorization.to,
                value: authorization.value.toString(),
                validAfter: authorization.validAfter.toString(),
                validBefore: authorization.validBefore.toString(),
                nonce: authorization.nonce,
              },
            },
          };

          const xPayment = b64encodeUtf8(JSON.stringify(paymentPayload));

          // Record the spend for daily limit tracking
          recordSpend(requiredUSDC);

          // Record payment in history
          const agentName = pendingAction.kind === "swap" ? "SwapAgent" :
            pendingAction.kind === "bridge" ? "BridgeAgent" :
              pendingAction.kind === "yield" ? "YieldAgent" : "Agent";
          recordPayment({
            agentName,
            action: pendingAction.kind,
            amount: requiredUSDC.toFixed(2),
            token: "USDC",
            status: "success",
          });

          // Invoke action again with payment
          setPending402(null);
          await runActionInternal(pendingAction, xPayment);
        } catch (e) {
          console.error("Auto-pay effect failed", e);
          pushMessage({ role: "assistant", kind: "text", text: "⚠️ Auto-pay failed." });
        }
      })();
    }
  }, [pending402, sessionAccount, pendingAction, busy, sessionBalance, sessionLoading, canSpend, recordSpend, dailyLimit, dailySpent]); // eslint-disable-line react-hooks/exhaustive-deps

  type NewUIMessage =
    | Omit<Extract<UIMessage, { kind: "text" }>, "id" | "ts">
    | Omit<Extract<UIMessage, { kind: "chart" }>, "id" | "ts">;

  const pushMessage = (msg: NewUIMessage) => {
    const next: UIMessage = { ...msg, id: crypto.randomUUID(), ts: Date.now() } as UIMessage;
    setMessages((prev) => [...prev, next]);
  };

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;


    pushMessage({ role: "user", text: trimmed, kind: "text" });
    setInput("");
    setBusy(true);
    setPending402(null);
    setLastSettlement(null);

    try {
      const payload = walletAddr ? { text: trimmed, walletAddr } : { text: trimmed };
      const res = await fetch(`/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      const answer = typeof json?.reply === "string" ? json.reply : "No reply returned.";
      pushMessage({ role: "assistant", text: answer, kind: "text" });

      // Check if this is a FREE execution that can be auto-run
      const action = json?.nextAction;
      if (action) {
        const agentType = action.kind || action.agent; // API uses 'kind', some places use 'agent'
        if (["chart", "portfolio", "tx_analyzer", "contract_inspector"].includes(agentType)) {
          // For free agents, DON'T speak initial reply - agent result will speak
          void runActionInternal(action, null);
          setPendingAction(null);
        } else if (["swap", "yield"].includes(agentType)) {
          // Show agent choice modal for swap/yield
          smartSpeak(answer); // Speak the payment prompt
          setPendingAction(action);
          setPendingUserQuery(trimmed);
          setAgentChoiceCategory(agentType as "swap" | "yield");
          setShowAgentChoice(true);
        } else {
          // Other paid agents (bridge, etc.) - use existing flow
          smartSpeak(answer);
          setPendingAction(action);
        }
      } else {
        // No action, just a conversational response
        smartSpeak(answer);
        setPendingAction(null);
      }
    } catch (e: any) {
      pushMessage({ role: "assistant", text: `Network error: ${e?.message ?? String(e)}`, kind: "text" });
    } finally {
      setBusy(false);
    }
  }

  // Internal function to execute actions (extracted for reuse)
  async function runActionInternal(action: any, xPayment: string | null) {
    setBusy(true);
    setPending402(null);
    setLastSettlement(null);

    try {
      const res = await fetch(`/api/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(xPayment ? { "X-PAYMENT": xPayment } : {}),
        },
        body: JSON.stringify({ action }),
      });

      // Handle x-payment-response headers
      const xpr = res.headers.get("x-payment-response") || res.headers.get("X-PAYMENT-RESPONSE");
      if (xpr) {
        try {
          const settlement = JSON.parse(b64decodeUtf8(xpr));
          setLastSettlement(settlement?.transaction ?? null);
        } catch { }
      }

      // Handle 402 Payment Required
      if (res.status === 402) {
        const header = res.headers.get("www-authenticate") || "";

        if (header.includes("x402")) {
          const request = parseX402Request(header);
          if (request) {
            setPending402(request);
            setPendingAction(action); // Ensure pending action is set for retry
            return; // Wait for payment
          }
        }
      }

      const json = await res.json();

      // Handle agent specific responses
      if (action.agent === "chart" && json.result?.data) {
        pushMessage({
          role: "assistant",
          kind: "chart",
          text: "Loading chart...",
          chart: { title: "Loading...", series: [] },
          data: json.result.data,
          coinId: action.args.coinId
        });
      }

      if (typeof json.reply === "string") {
        pushMessage({ role: "assistant", text: json.reply, kind: "text" });
        smartSpeak(json.reply);
      }

      // Ensure we handle Next Action Payment requirement from JSON body if present (legacy)
      if (res.status === 402) {
        setPending402(json as PaymentRequirements);
        pushMessage({ role: "assistant", text: `Payment required. ${json?.error ?? ""}`.trim(), kind: "text" });
        return;
      }

      if (json?.xPaymentResponse) {
        try {
          const settlement = JSON.parse(b64decodeUtf8(json.xPaymentResponse));
          setLastSettlement(settlement?.transaction ?? null);
        } catch { }
      }

      if (json?.status === "ok") {
        if (action.kind === "chart" || action.agent === "chart") {
          const series: SeriesPoint[] = json?.result?.series ?? [];
          pushMessage({
            role: "assistant",
            text: `Here’s AVAX (${action.args.days}d).`,
            kind: "chart",
            chart: { title: "AVAX", series },
          });
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        if (action.kind === "wallet" || action.agent === "wallet") {
          const addr = json?.result?.address ?? action.args.address;
          const nativeWei = json?.result?.native?.wei ?? "0";
          const tokens = Array.isArray(json?.result?.tokens) ? json.result.tokens : [];
          const usdc = tokens.find((t: any) => (t?.symbol ?? "").toUpperCase() === "USDC");
          const usdcBase = usdc?.balance ?? "0";
          const usdcDec = Number(usdc?.decimals ?? 6);

          const usdcFloat = Number(usdcBase) / Math.pow(10, usdcDec);

          pushMessage({
            role: "assistant",
            kind: "text",
            text: `Balances for ${addr}\n- AVAX (wei): ${nativeWei}\n- USDC: ${usdcFloat.toFixed(4)} (baseunits: ${usdcBase})`,
          });

          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        if (action.kind === "swap" || action.agent === "swap") {
          const result = json?.result;
          const summary = result?.summary;
          const quote = result?.quote;
          const needsApproval = result?.needsApproval;
          const approveTx = result?.approveTx;
          const swapArgs = result?.swapArgs;
          const chainId = result?.chainId || 43113;

          // If we have swap args, show execution panel
          if (quote && swapArgs) {
            setPendingSwap({
              quote,
              needsApproval,
              approveTx,
              swapArgs,
              chainId,
            });
            pushMessage({ role: "assistant", kind: "text", text: summary || "Ready to swap! Click the buttons below to execute." });
            speak(needsApproval ? "You need to approve first, then swap." : "Ready to swap! Click the button to execute.");
          } else {
            pushMessage({ role: "assistant", kind: "text", text: summary || `Swap quote: ${JSON.stringify(result).slice(0, 500)}` });
            smartSpeak("Got your swap quote.");
          }

          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Portfolio agent result
        if (action.kind === "portfolio" || action.agent === "portfolio") {
          const result = json?.result;
          const summary = result?.summary || `Portfolio for ${result?.address}:\nAVAX: ${result?.native?.formatted || "0"} AVAX`;
          pushMessage({ role: "assistant", kind: "text", text: summary });
          // Read summary aloud
          const avaxBal = result?.native?.formatted || "0";
          const tokens = result?.tokens || [];
          let spokenText = `Portfolio analysis complete. You have ${avaxBal} AVAX.`;
          if (tokens.length > 0) {
            tokens.forEach((t: any) => {
              spokenText += ` ${t.formatted} ${t.symbol}.`;
            });
          }
          smartSpeak(spokenText);
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Transaction analyzer result
        if (action.kind === "tx_analyzer" || action.agent === "tx_analyzer") {
          const result = json?.result;
          // Handle both single tx analysis (summary is string) and address history (summary.humanReadable)
          const summary = typeof result?.summary === 'string'
            ? result.summary
            : result?.summary?.humanReadable || `Analyzed ${result?.transactions?.length || 0} transactions.`;
          pushMessage({ role: "assistant", kind: "text", text: summary });
          smartSpeak("Transaction analysis ready.");
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Bridge agent result
        if (action.kind === "bridge" || action.agent === "bridge") {
          const summary = json?.result?.summary || "Bridge quote received.";
          pushMessage({ role: "assistant", kind: "text", text: summary });
          smartSpeak("Bridge quote ready.");
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Contract inspector result
        if (action.kind === "contract_inspector" || action.agent === "contract_inspector") {
          const result = json?.result;
          const summary = result?.summary || `Contract: ${result?.contractType || "Unknown"}\nVerified: ${result?.isVerified ? "Yes" : "No"}`;
          pushMessage({ role: "assistant", kind: "text", text: summary });
          smartSpeak("Contract analysis complete.");
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Yield agent result
        if (action.kind === "yield" || action.agent === "yield") {
          const result = json?.result;
          const summary = result?.summary;
          const steps = result?.steps;

          if (result?.strategy && steps?.length) {
            setPendingYield({
              strategy: result.strategy,
              amount: result.amount,
              estimatedApy: result.estimatedApy,
              estimatedYieldYear: result.estimatedYieldYear,
              steps,
              chainId: result.chainId || 43113,
            });
            pushMessage({ role: "assistant", kind: "text", text: summary || "Ready to invest! Follow the steps below." });
            speak(`Investment plan ready. ${result.hasEnoughBalance ? "Click to execute." : "But you need more tokens first."}`);
          } else {
            pushMessage({ role: "assistant", kind: "text", text: summary || `Yield result: ${JSON.stringify(result).slice(0, 500)}` });
            smartSpeak("Investment plan ready.");
          }
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }
      }

      pushMessage({ role: "assistant", text: `Run result: ${JSON.stringify(json).slice(0, 400)}`, kind: "text" });

    } catch (e: any) {
      pushMessage({ role: "assistant", text: `Execution error: ${e?.message}`, kind: "text" });
    } finally {
      setBusy(false);
    }
  }

  // Public wrapper for runAction (called by UI)
  async function runAction(xPayment?: string) {
    if (!pendingAction) return;
    await runActionInternal(pendingAction, xPayment || null);
  }



  async function signAndPay() {
    if (!pending402) return;
    if (!walletAddr) return pushMessage({ role: "assistant", text: "Connect a wallet first.", kind: "text" });

    if (!viemWalletClient) return pushMessage({ role: "assistant", text: "Wallet not ready. Refresh + reconnect.", kind: "text" });

    setSigning(true);
    try {
      const option = pending402.accepts[0];
      const client = viemWalletClient;

      const now = Math.floor(Date.now() / 1000);
      const authorization = {
        from: walletAddr,
        to: option.payTo,
        value: BigInt(option.maxAmountRequired),
        validAfter: BigInt(0), // Set to 0 to be valid immediately
        validBefore: BigInt(now + 3600), // Valid for 1 hour
        nonce: randomBytes32Hex(),
      } as const;

      const signature = await client.signTypedData({
        account: walletAddr,
        domain: { name: "USD Coin", version: "2", chainId: 43113, verifyingContract: option.asset },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: authorization,
      });

      const paymentPayload = {
        x402Version: 1,
        scheme: option.scheme,
        network: option.network,
        payload: {
          signature,
          authorization: {
            from: authorization.from,
            to: authorization.to,
            value: authorization.value.toString(),
            validAfter: authorization.validAfter.toString(),
            validBefore: authorization.validBefore.toString(),
            nonce: authorization.nonce,
          },
        },
      };

      const xPayment = b64encodeUtf8(JSON.stringify(paymentPayload));
      pushMessage({ role: "assistant", text: "Signed USDC authorization. Retrying with X-PAYMENT…", kind: "text" });
      await runAction(xPayment);
    } catch (e: any) {
      pushMessage({ role: "assistant", text: `Signing failed: ${e?.message ?? String(e)}`, kind: "text" });
    } finally {
      setSigning(false);
    }
  }

  const handleVoiceToggle = async () => {
    const rec = recognitionRef.current;
    if (!rec) {
      pushMessage({ role: "assistant", text: "Speech recognition not supported in this browser.", kind: "text" });
      return;
    }
    if (busy) return;

    if (listening) {
      try {
        rec.stop();
      } catch { }
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      pushMessage({
        role: "assistant",
        kind: "text",
        text: "Microphone permission denied. Enable it for localhost:3000 and try again.",
      });
      return;
    }

    try {
      rec.start();
    } catch (e: any) {
      pushMessage({ role: "assistant", kind: "text", text: `Couldn’t start voice: ${e?.message ?? String(e)}` });
    }
  };

  // Handle agent selection from registry modal
  const handleAgentSelect = (agent: { id: string; name: string; url: string; registry: string; priceUsd: number }) => {
    setShowAgentChoice(false);

    if (agent.registry === "native") {
      // Use native agent - continue with existing flow
      pushMessage({ role: "assistant", kind: "text", text: `🏠 Using ${agent.name}...` });
      // Trigger the auto-pay flow by keeping pendingAction set
      // The auto-pay useEffect will pick it up
    } else {
      // External agent selected
      pushMessage({
        role: "assistant",
        kind: "text",
        text: `🌐 External agent "${agent.name}" selected!\n\n⚠️ External agents are simulated in demo mode.\nIn production, this would call: ${agent.url}\n\nPrice: ${agent.priceUsd === 0 ? "FREE" : `$${agent.priceUsd.toFixed(3)}`}`
      });
      speak(`Selected ${agent.name} from the registry.`);
      setPendingAction(null); // Clear pending since we're showing info only
    }
  };

  useEffect(() => {
    if (!pendingAction) return;

    let key = "";
    let ready = false;

    if (pendingAction.kind === "chart") {
      const a = pendingAction.args;
      ready = !!a?.coinId && !!a?.days && !!a?.vs;
      key = `${pendingAction.kind}:${a.coinId}:${a.days}:${a.vs}`;
    } else if (pendingAction.kind === "wallet") {
      const a = pendingAction.args;
      ready = !!a?.address;
      key = `${pendingAction.kind}:${a.address}`;
    } else if (pendingAction.kind === "swap") {
      const a = pendingAction.args;
      ready = !!a?.tokenIn && !!a?.tokenOut && !!a?.amountIn && !!a?.recipient;
      key = `${pendingAction.kind}:${a.tokenIn}:${a.tokenOut}:${a.amountIn}:${a.recipient}:${a.slippageBps ?? 50}`;
    } else if (pendingAction.kind === "portfolio") {
      const a = pendingAction.args;
      ready = !!a?.address;
      key = `${pendingAction.kind}:${a.address}`;
    } else if (pendingAction.kind === "tx_analyzer") {
      const a = pendingAction.args;
      // Ready if we have either an address OR a txHash
      ready = !!a?.address || !!a?.txHash;
      key = `${pendingAction.kind}:${a.address || ''}:${a.txHash || ''}:${a.limit}`;
    } else if (pendingAction.kind === "bridge") {
      const a = pendingAction.args;
      ready = !!a?.token && !!a?.amount && !!a?.fromChain && !!a?.toChain && !!a?.recipient;
      key = `${pendingAction.kind}:${a.token}:${a.amount}:${a.fromChain}:${a.toChain}:${a.recipient}`;
    } else if (pendingAction.kind === "contract_inspector") {
      const a = pendingAction.args;
      ready = !!a?.contractAddress;
      key = `${pendingAction.kind}:${a.contractAddress}`;
    } else if (pendingAction.kind === "yield") {
      const a = pendingAction.args;
      ready = !!a?.amount && !!a?.userAddress;
      key = `${pendingAction.kind}:${a.amount}:${a.token}:${a.strategy}:${a.userAddress}`;
    }

    if (!ready || pending402 || lastSettlement || busy) return;
    if (autoRunKeyRef.current === key) return;

    autoRunKeyRef.current = key;
    void runAction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, pending402, lastSettlement, busy]);

  const actionStatus: "idle" | "running" | "402_payment_required" | "signing" | "completed" = lastSettlement
    ? "completed"
    : signing
      ? "signing"
      : pending402
        ? "402_payment_required"
        : pendingAction && busy
          ? "running"
          : "idle";

  const rawAmount = pending402?.accepts?.[0]?.maxAmountRequired;
  // Keep showing the amount even after settlement using a ref to avoid render issues
  const lastPaymentAmountRef = useRef<string | null>(null);

  // Update ref when we get a new 402 requirement
  if (rawAmount && rawAmount !== lastPaymentAmountRef.current) {
    lastPaymentAmountRef.current = rawAmount;
  }

  const displayAmount = rawAmount || lastPaymentAmountRef.current;
  const amountLabel = displayAmount ? (Number(displayAmount) / 1_000_000).toFixed(2) : "0.01";

  const payToAddr = pending402?.accepts?.[0]?.payTo;
  const recipientLabel = payToAddr
    ? `${payToAddr.slice(0, 6)}...${payToAddr.slice(-4)}`
    : "Agent";

  return (
    <div className="flex flex-col min-h-screen h-screen w-full bg-zinc-950 text-white overflow-x-hidden relative font-sans selection:bg-avax-red/30">
      {/* Agent Choice Modal */}
      <AgentChoiceModal
        isOpen={showAgentChoice}
        onClose={() => setShowAgentChoice(false)}
        category={agentChoiceCategory}
        onSelectAgent={handleAgentSelect}
        userQuery={pendingUserQuery}
      />

      <div className="absolute inset-0 z-0 bg-noise opacity-30 pointer-events-none" />
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-avax-red/10 rounded-full blur-[120px] pointer-events-none" />

      <header className="fixed top-0 inset-x-0 z-20 border-b border-white/5 bg-zinc-950/85 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 text-xs font-mono text-gray-400 hover:text-white transition"
              aria-label="Back to home"
            >
              <ChevronLeft className="w-4 h-4 opacity-70 group-hover:opacity-100" />
              <span className="hidden sm:inline">Home</span>
            </Link>

            <div className="h-5 w-px bg-white/10" />

            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 group">
                <Activity className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:text-red-400 transition-colors" />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
              <div className="h-5 w-px bg-white/10" />
            </div>

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-avax-red to-red-900 rounded-lg flex items-center justify-center shadow-[0_0_15px_-3px_rgba(232,65,66,0.4)]">
                <Hexagon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight leading-none">
                  VOX<span className="text-avax-red">402</span>
                </h1>
                <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
                  {walletAddr ? "Connected" : "Connect wallet to start"}
                </p>
              </div>
            </div>
          </div>

          <AuthButton />
        </div>
      </header>

      <main className="flex-1 relative z-10 flex flex-col max-w-5xl mx-auto w-full pt-32 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-8 pb-6 scroll-smooth">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {actionStatus !== "idle" && (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <ActionPanel
                status={actionStatus}
                amountLabel={amountLabel}
                tokenLabel="USDC"
                recipientLabel={recipientLabel}
                txHash={lastSettlement}
                onSign={signAndPay}
              />
            </div>
          )}

          {pendingSwap && walletAddr && viemWalletClient && (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <SwapExecutionPanel
                quote={pendingSwap.quote}
                needsApproval={pendingSwap.needsApproval}
                approveTx={pendingSwap.approveTx}
                swapArgs={pendingSwap.swapArgs}
                chainId={pendingSwap.chainId}
                viemWalletClient={viemWalletClient}
                walletAddr={walletAddr}
                onComplete={(txHash) => {
                  pushMessage({
                    role: "assistant",
                    kind: "text",
                    text: `✅ Swap executed successfully! Tx: ${txHash.slice(0, 10)}...`,
                  });
                  speak("Swap complete!");
                  setPendingSwap(null);
                }}
                onError={(error) => {
                  pushMessage({ role: "assistant", kind: "text", text: `❌ ${error}` });
                  speak("Swap failed. Please try again.");
                }}
              />
            </div>
          )}

          {pendingYield && walletAddr && viemWalletClient && (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <MultiStepPanel
                strategy={pendingYield.strategy}
                amount={pendingYield.amount}
                estimatedApy={pendingYield.estimatedApy}
                estimatedYieldYear={pendingYield.estimatedYieldYear}
                steps={pendingYield.steps}
                chainId={pendingYield.chainId}
                viemWalletClient={viemWalletClient}
                walletAddr={walletAddr}
                onComplete={(txHash) => {
                  pushMessage({
                    role: "assistant",
                    kind: "text",
                    text: `🎉 Investment complete! You're now earning ${pendingYield.estimatedApy}% APY. Tx: ${txHash.slice(0, 10)}...`,
                  });
                  speak("Investment complete! You're now earning yield.");
                  setPendingYield(null);
                }}
                onError={(error) => {
                  pushMessage({ role: "assistant", kind: "text", text: `❌ ${error}` });
                  speak("Investment failed. Please try again.");
                }}
              />
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        <div className="w-full bg-gradient-to-t from-zinc-950 via-zinc-950 to-transparent pb-4 pt-6">
          <InputArea
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            isLoading={busy}
            onVoiceToggle={handleVoiceToggle}
            isListening={listening}
            isSpeaking={isSpeaking}
            onStopSpeaking={stopSpeaking}
            isMuted={isMuted}
            onToggleMute={toggleMute}
          />

          <div className="text-center mt-2 pb-2">
            <div className="flex items-center justify-center gap-2 opacity-70 text-[10px] uppercase tracking-widest font-mono text-gray-500">
              <Activity className="w-3 h-3" />
              <span>Systems Nominal</span>
              <span>•</span>
              <span>v0.4.2-beta</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


function parseX402Request(header: string): PaymentRequirements | null {
  const match = header.match(/^x402\s+(.*)$/);
  if (!match) return null;
  try {
    const json = JSON.parse(b64decodeUtf8(match[1]));
    return json as PaymentRequirements;
  } catch {
    return null;
  }
}

