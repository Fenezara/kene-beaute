"use client";
// Kènè — racine : chaque espace gère son propre shell applicatif plein écran
// (Cliente = app immersive type réseaux sociaux 2026, Pro = console de gestion,
// Admin = pilotage plateforme). Aucun header/footer racine : les mentions
// légales vivent au fil des espaces (fin de feed / sidebar / console).

import { useKene } from "@/store/kene";
import { ClientApp } from "@/components/kene/client/ClientApp";
import { ProApp } from "@/components/kene/pro/ProApp";
import { AdminApp } from "@/components/kene/admin/AdminApp";
import { Toaster } from "@/components/ui/sonner";

export default function Page() {
  const space = useKene((s) => s.space);

  return (
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

      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
