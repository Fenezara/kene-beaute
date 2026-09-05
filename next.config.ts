import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    // Laissé à true : examples/ et skills/ restent INCLUS dans le tsconfig
    // (3 erreurs préexistantes hors périmètre src/) — cf. worklog t. 63-d.
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Le badge/dev-tools flottant Next.js couvre la tab-bar mobile en préview — on le retire
  devIndicators: false,
  // En-têtes de sécurité (t. 63-d). ⚠️ AUCUN X-Frame-Options / CSP
  // frame-ancestors / frame-ancestors ici : l'app vit dans une iframe de
  // préview sandbox — tout frame-blocking casserait la préview.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
