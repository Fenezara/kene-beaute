import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Le badge/dev-tools flottant Next.js couvre la tab-bar mobile en préview — on le retire
  devIndicators: false,
};

export default nextConfig;
