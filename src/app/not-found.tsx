// Kènè — 404 brandée (t. 86) : même une page perdue porte le Sceau et la
// voix de la marque. Server component volontairement sobre : aucun hook,
// aucune donnée — l'emblème raster (double livraison claire/sombre) et le
// filet kente suffisent à garder l'identité sur tous les écrans.
import Link from "next/link";
import { KeneEmblem } from "@/components/kene/icons";

export const metadata = { title: "Page introuvable — Kènè" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      {/* Filet kente — signature de la marque */}
      <span
        aria-hidden="true"
        className="block h-[3px] w-24 rounded-full bg-gradient-to-r from-[#C8951E] via-[#A0522D] to-[#3F7D3F] opacity-80"
      />
      {/* Sceau 2026 — le Médaillon Kènè veille même sur les pages perdues */}
      <span aria-hidden="true" className="mt-7 select-none">
        <KeneEmblem size={72} className="drop-shadow-[0_4px_18px_rgba(200,149,30,0.25)]" />
      </span>
      <h1 className="mt-6 font-heading font-black text-2xl tracking-tight sm:text-3xl">
        Cette page s&apos;est égarée dans le tissage
      </h1>
      <p className="mt-3 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
        Le fil d&apos;or t&apos;attend ailleurs — retourne à l&apos;accueil,
        ta peau mélanoderme n&apos;est jamais perdue.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex h-12 items-center rounded-full k-btn-gold px-7 font-heading font-bold text-sm text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 active:scale-95 focus-visible:outline-2 focus-visible:outline-primary"
      >
        Retour à l&apos;accueil
      </Link>
      <p className="mt-8 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-muted-foreground/60">
        Kènè — beauté mélanoderme
      </p>
    </div>
  );
}
