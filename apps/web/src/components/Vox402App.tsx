// apps/web/src/components/Vox402App.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createWalletClient, custom, getAddress } from "viem";
import { avalancheFuji } from "viem/chains";
import { Hexagon, Activity, ChevronLeft } from "lucide-react";
import { b64decodeUtf8, b64encodeUtf8 } from "@/lib/base64";
import { randomBytes32Hex } from "@/lib/random";
import { detectProvider, ensureFuji, type EIP1193Provider } from "@/lib/wallet";
import { useWalletAuth } from "@/hooks/useWalletAuth";
import { AuthButton } from "@/components/wallet/AuthButton";
import { MessageBubble, type UIMessage } from "@/components/chat/MessageBubble";
import { InputArea } from "@/components/chat/InputArea";
import { ActionPanel } from "@/components/chat/ActionPanel";
import { SwapExecutionPanel } from "@/components/chat/SwapExecutionPanel";
import { MultiStepPanel } from "@/components/chat/MultiStepPanel";
import { type SeriesPoint } from "@/components/chart/MiniLineChart";

type NextAction =
  | { kind: "chart"; args: { coinId: string; days: number; vs: string } }
  | { kind: "wallet"; args: { address: string } }
  | { kind: "portfolio"; args: { address: string } }
  | { kind: "tx_analyzer"; args: { address: string; limit: number } }
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

function pickAvaVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const preferred =
    voices.find((v) => /female|woman|zira|susan|victoria|samantha|tessa|karen|moira|amelie/i.test(v.name)) ?? null;
  const en = voices.find((v) => /^en(-|_)/i.test(v.lang)) ?? voices[0];
  return preferred ?? en ?? null;
}

function useTTS() {
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      voiceRef.current = pickAvaVoice();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const speak = (text: string) => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voiceRef.current ?? null;
    u.rate = 1.0;
    u.pitch = 1.1;
    u.onstart = () => setIsSpeaking(true);
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const stopSpeaking = () => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  return { speak, stopSpeaking, isSpeaking };
}

export function Vox402App() {
  const orchestratorUrl = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL ?? "http://localhost:4000";
  const supportsSR = useMemo(canUseSpeechRecognition, []);
  const { speak, stopSpeaking, isSpeaking } = useTTS();

  // Use unified wallet auth (Privy + Core)
  const { walletAddress, provider, isAuthenticated, displayName } = useWalletAuth();
  const walletAddr = walletAddress;

  const [messages, setMessages] = useState<UIMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Hi! I’m Ava. Connect Core wallet, then say: “Show AVAX 30d chart”.",
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

      const trimmed = transcript.trim();
      if (trimmed) setInput(trimmed);

      const finalTrimmed = finalText.trim();
      if (finalTrimmed) voiceFinalRef.current = finalTrimmed;
    };

    rec.onerror = (event: any) => {
      setListening(false);
      const code = event?.error ?? "unknown";
      pushMessage({
        role: "assistant",
        kind: "text",
        text:
          code === "not-allowed"
            ? "Mic permission blocked. Allow microphone access for localhost:3000 and try again."
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
      const res = await fetch(`${orchestratorUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      const answer = typeof json?.reply === "string" ? json.reply : "No reply returned.";
      pushMessage({ role: "assistant", text: answer, kind: "text" });
      speak(answer);
      setPendingAction(json?.nextAction ?? null);
    } catch (e: any) {
      pushMessage({ role: "assistant", text: `Network error: ${e?.message ?? String(e)}`, kind: "text" });
    } finally {
      setBusy(false);
    }
  }

  async function runAction(xPayment?: string) {
    if (!pendingAction) return;
    setBusy(true);
    setPending402(null);
    setLastSettlement(null);

    try {
      const res = await fetch(`${orchestratorUrl}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(xPayment ? { "X-PAYMENT": xPayment } : {}),
        },
        body: JSON.stringify({ action: pendingAction }),
      });

      const xpr = res.headers.get("x-payment-response") || res.headers.get("X-PAYMENT-RESPONSE");
      if (xpr) {
        try {
          const settlement = JSON.parse(b64decodeUtf8(xpr));
          setLastSettlement(settlement?.transaction ?? null);
        } catch { }
      }

      const json = await res.json().catch(() => ({}));

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
        if (pendingAction.kind === "chart") {
          const series: SeriesPoint[] = json?.result?.series ?? [];
          pushMessage({
            role: "assistant",
            text: `Here’s AVAX (${pendingAction.args.days}d).`,
            kind: "chart",
            chart: { title: "AVAX", series },
          });
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        if (pendingAction.kind === "wallet") {
          const addr = json?.result?.address ?? pendingAction.args.address;
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

        if (pendingAction.kind === "swap") {
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
            speak("Got the swap quote.");
          }

          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Portfolio agent result
        if (pendingAction.kind === "portfolio") {
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
          speak(spokenText);
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Transaction analyzer result
        if (pendingAction.kind === "tx_analyzer") {
          const result = json?.result;
          const summary = result?.summary?.humanReadable || `Analyzed ${result?.transactions?.length || 0} transactions.`;
          pushMessage({ role: "assistant", kind: "text", text: summary });
          speak("Here's the transaction analysis.");
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Bridge agent result
        if (pendingAction.kind === "bridge") {
          const summary = json?.result?.summary || "Bridge quote received.";
          pushMessage({ role: "assistant", kind: "text", text: summary });
          speak("Here's the bridge quote.");
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Contract inspector result
        if (pendingAction.kind === "contract_inspector") {
          const result = json?.result;
          const summary = result?.summary || `Contract: ${result?.contractType || "Unknown"}\nVerified: ${result?.isVerified ? "Yes" : "No"}`;
          pushMessage({ role: "assistant", kind: "text", text: summary });
          speak("Here's the contract analysis.");
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }

        // Yield agent result
        if (pendingAction.kind === "yield") {
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
            speak("Here's the investment plan.");
          }
          setPendingAction(null);
          autoRunKeyRef.current = null;
          setPending402(null);
          return;
        }
      }

      pushMessage({ role: "assistant", text: `Run result: ${JSON.stringify(json).slice(0, 400)}`, kind: "text" });
    } catch (e: any) {
      pushMessage({ role: "assistant", text: `Run failed: ${e?.message ?? String(e)}`, kind: "text" });
    } finally {
      setBusy(false);
    }
  }

  async function signAndPay() {
    if (!pending402) return;
    if (!walletAddr) return pushMessage({ role: "assistant", text: "Connect a wallet first.", kind: "text" });

    const p = provider ?? (await detectProvider());
    if (!p) return pushMessage({ role: "assistant", text: "Provider missing. Refresh + reconnect.", kind: "text" });

    setSigning(true);
    try {
      await ensureFuji(p);

      const option = pending402.accepts[0];
      const client = createWalletClient({ chain: avalancheFuji, transport: custom(p as any) });

      const now = Math.floor(Date.now() / 1000);
      const authorization = {
        from: walletAddr,
        to: option.payTo,
        value: BigInt(option.maxAmountRequired),
        validAfter: BigInt(now),
        validBefore: BigInt(now + 55),
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
      ready = !!a?.address;
      key = `${pendingAction.kind}:${a.address}:${a.limit}`;
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

          {pendingSwap && walletAddr && provider && (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <SwapExecutionPanel
                quote={pendingSwap.quote}
                needsApproval={pendingSwap.needsApproval}
                approveTx={pendingSwap.approveTx}
                swapArgs={pendingSwap.swapArgs}
                chainId={pendingSwap.chainId}
                provider={provider}
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

          {pendingYield && walletAddr && provider && (
            <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <MultiStepPanel
                strategy={pendingYield.strategy}
                amount={pendingYield.amount}
                estimatedApy={pendingYield.estimatedApy}
                estimatedYieldYear={pendingYield.estimatedYieldYear}
                steps={pendingYield.steps}
                chainId={pendingYield.chainId}
                provider={provider}
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

export default Vox402App;
