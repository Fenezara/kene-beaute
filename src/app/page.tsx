"use client";
// Kènè — racine : chaque espace gère son propre shell applicatif plein écran
// (Cliente = app immersive type réseaux sociaux 2026, Pro = console de gestion,
// Admin = pilotage plateforme). Aucun header/footer racine : les mentions
// légales vivent au fil des espaces (fin de feed / sidebar / console).
// MotionConfig reducedMotion="user" : toutes les animations framer-motion
// respectent automatiquement prefers-reduced-motion (WCAG 2.2.4).
//
// Code splitting (t. 63-a) : les espaces Pro (~12 600 lignes + socket.io) et
// Admin (recharts ~100 ko gz) sont chargés via next/dynamic ssr:false — ils
// rejoignent le bundle client UNIQUEMENT quand on y entre. Le gating `space`
// reste identique, seul le chargement change. BootSkeleton pendant l'attente.

import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { useKene } from "@/store/kene";
import { ClientApp } from "@/components/kene/client/ClientApp";
import { BootSkeleton } from "@/components/kene/client/BootSkeleton";
import { SessionKeeper } from "@/components/kene/SessionKeeper";
import { PwaProvider } from "@/components/kene/pwa/PwaProvider";
import { Toaster } from "@/components/ui/sonner";

// Espaces Pro / Admin : chunks séparés, chargés à l'entrée de l'espace
// (exports nommés → default attendu par next/dynamic).
const ProApp = dynamic(() => import("@/components/kene/pro/ProApp").then((m) => ({ default: m.ProApp })), {
  ssr: false,
  loading: () => <BootSkeleton />,
});
const AdminApp = dynamic(() => import("@/components/kene/admin/AdminApp").then((m) => ({ default: m.AdminApp })), {
  ssr: false,
  loading: () => <BootSkeleton />,
});

export default function Page() {
  const space = useKene((s) => s.space);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-dvh bg-background text-foreground">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
        >
          Aller au contenu
        </a>

        <main id="contenu" className="w-full">
          {space === "client" && <ClientApp />}
          {space === "pro" && <ProApp />}
          {space === "admin" && <AdminApp />}
        </main>

        {/* Validation de session au boot — TOUS espaces (voir SessionKeeper) */}
        <SessionKeeper />

        {/* PWA : enregistrement du service worker + mise à jour offline (aucun rendu) */}
        <PwaProvider />

        <Toaster position="top-center" richColors closeButton />
      </div>
    </MotionConfig>
  );
}
