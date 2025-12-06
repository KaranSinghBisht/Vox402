import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Load root .env file
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
    NEXT_PUBLIC_ORCHESTRATOR_URL: process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:4000",
    NEXT_PUBLIC_ELEVENLABS_API_KEY: process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
  },
  // Transpile thirdweb packages
  transpilePackages: ["thirdweb"],
  // Turbopack config to handle problematic SSR packages
  turbopack: {
    resolveAlias: {
      // Stub out pino and thread-stream which have SSR issues
      'pino': { browser: './node_modules/pino/browser.js' },
    },
  },
  // Exclude packages from server components bundling
  serverExternalPackages: ["pino", "thread-stream", "why-is-node-running"],
};

export default nextConfig;



