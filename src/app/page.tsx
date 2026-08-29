"use client";

import { useEffect } from "react";
import { useKene } from "@/store/kene";
import { ClientApp } from "@/components/kene/client/ClientApp";
import { ProApp } from "@/components/kene/pro/ProApp";
import { AdminApp } from "@/components/kene/admin/AdminApp";
import { KeneLogo } from "@/components/kene/icons";
import { ThemeToggle } from "@/components/kene/ThemeToggle";
import { SpaceSwitcher } from "@/components/kene/SpaceSwitcher";
import { Toaster } from "@/components/ui/sonner";

export default function Page() {
  const space = useKene((s) => s.space);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Aller au contenu
      </a>

      <header className="sticky top-0 z-40 glass-kene border-b border-border/70">
        <div className="mx-auto max-w-7xl px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <button
            onClick={() => useKene.getState().setSpace("client")}
            className="shrink-0 active:scale-95 transition-transform"
            aria-label="Kènè — retour accueil cliente"
          >
            <KeneLogo size={36} withText />
          </button>
          <div className="flex items-center gap-2">
            <SpaceSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div aria-hidden="true" className="kente-band-soft h-[3px] w-full" />
      </header>

      <main id="contenu" className="flex-1 w-full">
        {space === "client" && <ClientApp />}
        {space === "pro" && <ProApp />}
        {space === "admin" && <AdminApp />}
      </main>

      <footer className="mt-auto border-t border-border/70 bg-card/60">
        <div aria-hidden="true" className="kente-band-soft h-[3px] w-full" />
        <div className="mx-auto max-w-7xl px-4 py-4 pb-24 sm:pb-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            © {new Date().getFullYear()} Kènè — <span className="font-heading text-[11px] text-primary">« La beauté mélanoderme, de A à Z. »</span>
          </p>
          <p className="text-center sm:text-right">
            POC — Paiements Wave / Orange Money simulés · Estimations IA non médicales · Conforme CNPS CI / IPM SN / SYSCOHADA
          </p>
        </div>
      </footer>

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
