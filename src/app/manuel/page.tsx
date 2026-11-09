import Link from "next/link";
import Image from "next/image";
import { Download, ArrowLeft, BookOpen, ShieldCheck, Sparkles, Building2, Smartphone } from "lucide-react";
import { KeneEmblem } from "@/components/kene/icons";

export const metadata = {
  title: "Manuel d'Utilisation Officiel — Kènè Pro 2026",
  description: "Guide complet, formation cabine, caisse Mobile Money et pilotage SYSCOHADA pour les instituts et salons de beauté partenaires Kènè.",
};

export default function ManuelPage() {
  return (
    <div className="min-h-screen bg-[#FFFDF9] dark:bg-[#120E0A] text-foreground">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-background/80 border-b border-border/40 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="size-9 rounded-full bg-secondary/80 flex items-center justify-center hover:bg-secondary transition active:scale-95"
            title="Retour à l'accueil"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <KeneEmblem size={28} />
            <div>
              <h1 className="font-heading font-black text-sm tracking-tight text-foreground">
                Manuel d&apos;Utilisation Officiel
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
                Kènè Pro · Édition 2026
              </p>
            </div>
          </div>
        </div>

        <a
          href="/api/pro/marketing/pdf?type=manuel-pro"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full k-btn-gold text-xs font-bold text-primary-foreground shadow-sm hover:brightness-105 active:scale-95 transition"
        >
          <Download size={14} />
          <span className="hidden sm:inline">Télécharger</span> PDF A4
        </a>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12 space-y-10">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold-text text-xs font-bold uppercase tracking-wider">
            <Sparkles size={13} />
            Guide Opérationnel Salons & Instituts
          </span>
          <h2 className="font-heading font-black text-2xl sm:text-4xl tracking-tight max-w-2xl mx-auto">
            Maîtrisez l&apos;Intelligence Dermo-Cosmétique et le Pilotage de Votre Salon
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto leading-relaxed">
            Consultez en ligne ou téléchargez le manuel complet regroupant les protocoles cabine,
            le diagnostic pour peaux noires et métissées, la caisse Mobile Money et la gestion SYSCOHADA.
          </p>
        </div>

        {/* Action Card PDF */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-gold/15 via-gold/5 to-transparent border border-gold/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="size-12 rounded-xl bg-gold/20 flex items-center justify-center text-gold-text shrink-0">
              <BookOpen size={24} />
            </div>
            <div>
              <h3 className="font-heading font-bold text-base text-foreground">
                Manuel Officiel Kènè Pro (Format Vectoriel A4)
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prêt pour impression physique ou archivage numérique d&apos;équipe.
              </p>
            </div>
          </div>
          <a
            href="/api/pro/marketing/pdf?type=manuel-pro"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl k-btn-gold text-sm font-bold text-primary-foreground shadow-md hover:brightness-110 active:scale-95 transition shrink-0"
          >
            <Download size={16} />
            Télécharger le Manuel PDF (A4)
          </a>
        </div>

        {/* Modules détaillés */}
        <section className="space-y-6">
          <h3 className="font-heading font-black text-lg sm:text-xl border-b border-border/40 pb-3 flex items-center gap-2">
            <Building2 size={20} className="text-gold-text" />
            Les 3 Piliers du Manuel Kènè Pro
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Volume 1 */}
            <div className="p-5 rounded-2xl bg-card border border-border/60 space-y-3 shadow-xs">
              <span className="text-xs font-black uppercase tracking-wider text-gold-text">
                Volume 1
              </span>
              <h4 className="font-heading font-bold text-base">Cabinets, Consultation &amp; Cabine</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pointage d&apos;équipe, entretien d&apos;anamnèse, édition de la Fiche de Consultation officielle, protocole de diagnostic Dermo Kènè pour peaux mélanodermes (phototypes IV à VI), ordonnance d&apos;actifs purs et suivi à J+30.
              </p>
            </div>

            {/* Volume 2 */}
            <div className="p-5 rounded-2xl bg-card border border-border/60 space-y-3 shadow-xs">
              <span className="text-xs font-black uppercase tracking-wider text-gold-text">
                Volume 2
              </span>
              <h4 className="font-heading font-bold text-base">Caisse, Reçus &amp; Pilotage SYSCOHADA</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Classement caisse des consultations (badge violet) et soins cabine, encaissements Mobile Money (Wave, Orange Money, MTN), reçus WhatsApp / SMS instantanés, clôture de caisse quotidienne et conformité SYSCOHADA.
              </p>
            </div>

            {/* Volume 3 */}
            <div className="p-5 rounded-2xl bg-card border border-border/60 space-y-3 shadow-xs">
              <span className="text-xs font-black uppercase tracking-wider text-gold-text">
                Volume 3
              </span>
              <h4 className="font-heading font-bold text-base">Relations & Objections</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Accueil des clientes, consentement aux données (Loi ivoirienne n°2013-450 / RGPD), gestion des objections prix et programme de parrainage Kènè+.
              </p>
            </div>
          </div>
        </section>

        {/* Section Écrans & Visuels */}
        <section className="space-y-6 pt-4">
          <h3 className="font-heading font-black text-lg sm:text-xl border-b border-border/40 pb-3 flex items-center gap-2">
            <Smartphone size={20} className="text-gold-text" />
            Parcours Illustré de l&apos;Application
          </h3>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border/60 overflow-hidden bg-card shadow-xs">
              <div className="p-4 border-b border-border/40">
                <span className="text-[11px] font-bold text-gold-text uppercase tracking-wider">Écran 1</span>
                <h4 className="font-heading font-bold text-sm">Tableau de bord Entreprise & Pilotage d&apos;Activité</h4>
              </div>
              <div className="relative aspect-[16/10] w-full bg-secondary/30">
                <Image
                  src="/docs/manual-screens/07-tableau-de-bord-pro.png"
                  alt="Tableau de bord Kènè Pro"
                  fill
                  className="object-cover object-top"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-border/60 overflow-hidden bg-card shadow-xs">
              <div className="p-4 border-b border-border/40">
                <span className="text-[11px] font-bold text-gold-text uppercase tracking-wider">Écran 2</span>
                <h4 className="font-heading font-bold text-sm">Portail d&apos;Accueil et Espace Institut</h4>
              </div>
              <div className="relative aspect-[16/10] w-full bg-secondary/30">
                <Image
                  src="/docs/manual-screens/01-accueil-client.png"
                  alt="Accueil Kènè"
                  fill
                  className="object-cover object-top"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Footer Support */}
        <footer className="pt-8 border-t border-border/40 text-center space-y-2 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">
            Besoin d&apos;une session de formation personnalisée pour votre salon ?
          </p>
          <p>
            Contactez la direction Kènè directement par courriel à{" "}
            <a href="mailto:contact@kene-beaute.com" className="font-bold text-gold-text underline underline-offset-4">
              contact@kene-beaute.com
            </a>.
          </p>
          <p className="text-[10px] text-muted-foreground/60 pt-2">
            © 2026 Kènè Technologies — Tous droits réservés.
          </p>
        </footer>
      </main>
    </div>
  );
}
