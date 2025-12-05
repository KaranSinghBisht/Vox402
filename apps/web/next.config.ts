import type { NextConfig } from "next";
import { config } from "dotenv";
import { resolve } from "path";

// Load root .env file
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID || "",
    NEXT_PUBLIC_ORCHESTRATOR_URL: process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:4000",
  },
};

export default nextConfig;
