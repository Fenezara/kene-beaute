import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  reactStrictMode: false,
  devIndicators: false,
};

export default nextConfig;
