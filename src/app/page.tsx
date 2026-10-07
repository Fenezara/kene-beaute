"use client";
// Kènè — racine: chaque espace gère son propre shell applicatif plein écran
// (Cliente = app immersive type réseaux sociaux 2026, Pro = console de gestion,
// Admin = pilotage plateforme). Aucun header/footer racine: les mentions
// légales vivent au fil des espaces (fin de feed / sidebar / console).
// MotionConfig reducedMotion="user": toutes les animations framer-motion
// respectent automatiquement prefers-reduced-motion (WCAG 2.2.4).
//
// Code splitting: les espaces Pro (~12 600 lignes + socket.io) et
// Admin (recharts ~100 ko gz) sont chargés via next/dynamic ssr:false — ils
// rejoignent le bundle client UNIQUEMENT quand on y entre. Le gating `space`
// reste identique, seul le chargement change. BootSkeleton pendant l'attente.

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import { useKene } from "@/store/kene";
import { ClientApp } from "@/components/kene/client/ClientApp";
import { BootSkeleton } from "@/components/kene/client/BootSkeleton";
import { ScreenBoundary } from "@/components/kene/client/ScreenBoundary";
import { PassportGate } from "@/components/kene/client/PassportView";
import { HerbierGate } from "@/components/kene/herbier/Herbier";
import { SessionKeeper } from "@/components/kene/SessionKeeper";
import { TransportProbe } from "@/components/kene/TransportProbe";
import { PwaProvider } from "@/components/kene/pwa/PwaProvider";
import { ConsoleEntry, ConsoleRedirect, useEntryKind } from "@/components/kene/admin/ConsoleEntry";
import { Toaster } from "@/components/ui/sonner";

// Espaces Pro / Admin / Pin: chunks séparés, chargés à l'entrée de l'espace
import { ProApp } from "@/components/kene/pro/ProApp";
import { PinEntry } from "@/components/kene/auth/PinEntry";

// Console Admin: uniquement derrière /console (recharts ~100 ko gz)
const AdminApp = dynamic(() => import("@/components/kene/admin/AdminApp").then((m) => ({ default: m.AdminApp })), {
  ssr: false,
  loading: () => <BootSkeleton />,
});

export default function Page() {
  const space = useKene((s) => s.space);
  const user = useKene((s) => s.user);
  const hydrated = useKene((s) => s._keneHydrated);
  // t. 130 — porte dédiée: « /console » (rewrite middleware) monte l'écran
  // de connexion console; « /pin » monte l'écran dédié de code secret;
  // null → BootSkeleton le temps de la résolution client (zéro flash).
  const entry = useEntryKind();

  // Déclenchement immédiat de la réhydratation du store dès le premier montage React
  useEffect(() => {
    if (!useKene.persist.hasHydrated()) {
      void useKene.persist.rehydrate();
    }
  }, []);

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
          {(!hydrated || entry === null) && <BootSkeleton />}

          {/* RÈGLE ABSOLUE : Pour l'administrateur connecté, le choix d'interface (space) prime TOUJOURS */}
          {hydrated && entry !== null && user?.role === "admin" && (
            <>
              {space === "client" && <ScreenBoundary name="Espace Beauté"><ClientApp /></ScreenBoundary>}
              {space === "pro" && <ScreenBoundary name="Espace Entreprise"><ProApp /></ScreenBoundary>}
              {space === "admin" && <ScreenBoundary name="Console Administrateur"><AdminApp /></ScreenBoundary>}
            </>
          )}

          {/* Utilisateurs Pro connectés : le choix d'interface (space) prime (Espace Beauté personnel vs Espace Institut) */}
          {hydrated && entry !== null && user?.role === "pro" && (
            <>
              {entry === "pin" && <PinEntry />}
              {entry !== "pin" && (
                <>
                  {space === "client" && <ScreenBoundary name="Espace Beauté"><ClientApp /></ScreenBoundary>}
                  {space === "pro" && <ScreenBoundary name="Espace Entreprise"><ProApp /></ScreenBoundary>}
                </>
              )}
            </>
          )}

          {/* Utilisateurs non-administrateurs et non-pro (clientes grand public, déconnectés ou mode cabine hors-ligne) */}
          {hydrated && entry !== null && user?.role !== "admin" && user?.role !== "pro" && (
            <>
              {entry === "console" && <ConsoleEntry />}
              {entry === "pin" && <PinEntry />}
              {entry === "pro" && <ScreenBoundary name="Espace Entreprise"><ProApp /></ScreenBoundary>}
              {entry === "app" && (
                <>
                  {space === "client" && <ScreenBoundary name="Espace Beauté"><ClientApp /></ScreenBoundary>}
                  {space === "pro" && <ScreenBoundary name="Espace Entreprise"><ProApp /></ScreenBoundary>}
                  {space === "admin" && <ConsoleEntry />}
                </>
              )}
            </>
          )}
        </main>

        {/* Passeport de Peau — vue publique quand l'URL porte?passport=<jeton> (QR scanné en institut). Au-dessus de TOUT:
 même le Seuil s'efface derrière lui. */}
        <PassportGate />

        {/* Herbier des Grandes-Mères — jardin des plantes quand
 l'URL porte #herbier (liens profonds + ouverture depuis le
 glossaire). Frère du PassportGate: hash dédié, aucune collision
 avec `?passport=…` ni #moonlight; fermeture = replaceState. */}
        <HerbierGate />

        {/* Validation de session au boot — TOUS espaces (voir SessionKeeper) */}
        <SessionKeeper />

        {/* Sonde de transport : adapte les appels écrits (pont GET) aux
            capacités réelles du navigateur hôte. Aucun rendu. */}
        <TransportProbe />

        {/* PWA: enregistrement du service worker + mise à jour offline (aucun rendu) */}
        <PwaProvider />

        <Toaster position="top-center" richColors closeButton />
      </div>
    </MotionConfig>
  );
}
