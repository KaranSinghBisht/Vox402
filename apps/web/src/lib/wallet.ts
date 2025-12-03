// apps/web/src/lib/wallet.ts
export type EIP1193Provider = {
  request: (args: { method: string; params?: any[] | object }) => Promise<any>;
};

type EIP6963Detail = {
  info: { name: string; uuid: string; icon?: string; rdns?: string };
  provider: EIP1193Provider;
};

function pickBestProvider(providers: EIP1193Provider[]) {
  if (!providers.length) return null;

  const isCoreLike = (p: any) =>
    p?.isAvalanche === true ||
    p?.isCore === true ||
    p?.isCoreWallet === true ||
    p?.providerInfo?.name?.toLowerCase?.().includes?.("core");

  return (providers.find(isCoreLike) ?? providers[0]) as EIP1193Provider;
}

export async function detectProvider(): Promise<EIP1193Provider | null> {
  const w = window as any;

  const candidates: EIP1193Provider[] = [];
  const avalancheEth = w.avalanche?.ethereum;
  if (avalancheEth?.request) candidates.push(avalancheEth);
  if (w.avalanche?.request) candidates.push(w.avalanche);
  if (w.core?.request) candidates.push(w.core);

  if (w.ethereum?.providers && Array.isArray(w.ethereum.providers)) {
    for (const p of w.ethereum.providers) if (p?.request) candidates.push(p);
  } else if (w.ethereum?.request) {
    candidates.push(w.ethereum);
  }

  const picked = pickBestProvider(candidates);
  if (picked) return picked;

  // EIP-6963 discovery
  const discovered: EIP6963Detail[] = [];
  const handler = (event: any) => {
    if (event?.detail?.provider?.request) discovered.push(event.detail as EIP6963Detail);
  };

  window.addEventListener("eip6963:announceProvider", handler as any);
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  await new Promise((r) => setTimeout(r, 250));
  window.removeEventListener("eip6963:announceProvider", handler as any);

  return pickBestProvider(discovered.map((d) => d.provider));
}

export async function ensureFuji(provider: EIP1193Provider) {
  const chainId = await provider.request({ method: "eth_chainId" });
  if (chainId === "0xa869") return;

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa869" }] });
  } catch (e: any) {
    if (e?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xa869",
            chainName: "Avalanche Fuji C-Chain",
            nativeCurrency: { name: "AVAX", symbol: "AVAX", decimals: 18 },
            rpcUrls: ["https://api.avax-test.network/ext/bc/C/rpc"],
            blockExplorerUrls: ["https://testnet.snowscan.xyz"],
          },
        ],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa869" }] });
      return;
    }
    throw e;
  }
}
