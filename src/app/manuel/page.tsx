import Link from "next/link";
import Image from "next/image";
import {
  Download,
  ArrowLeft,
  BookOpen,
  Sparkles,
  Building2,
  ScanFace,
  CreditCard,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Printer,
  ChevronRight,
  HelpCircle,
  AlertTriangle,
  HeartHandshake
} from "lucide-react";
import { KeneEmblem } from "@/components/kene/icons";

export const metadata = {
  title: "Manuel d'Utilisation Officiel & Guide Pratique — Kènè Pro 2026",
  description: "Guide méthodologique et opérationnel pas-à-pas pour les praticiennes, directrices d'instituts et cabinets dermo-esthétiques partenaires Kènè.",
};

export default function ManuelPage() {
  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0F0C0A] text-foreground selection:bg-gold/20 selection:text-gold-text">
      {/* ─── BANDEAU SUPÉRIEUR LUXE STICKY ─── */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-background/85 border-b border-border/60 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/"
            className="size-9 rounded-full bg-secondary/80 flex items-center justify-center hover:bg-secondary text-muted-foreground hover:text-foreground transition active:scale-95"
            title="Retour à l'accueil"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="flex items-center gap-2.5">
            <KeneEmblem size={32} />
            <div>
              <h1 className="font-heading font-black text-sm sm:text-base tracking-tight text-foreground leading-tight">
                Manuel Opérationnel &amp; Clinique
              </h1>
              <p className="text-[10px] text-gold-text uppercase tracking-widest font-bold">
                Kènè Pro · Édition Officielle 2026
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/pro"
            className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border bg-card text-xs font-semibold text-foreground hover:bg-secondary transition"
          >
            <Building2 size={13} className="text-gold-text" />
            Espace Pro
          </Link>
          <a
            href="/api/pro/marketing/pdf?type=manuel-pro"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full k-btn-gold text-xs font-bold text-primary-foreground shadow-sm hover:brightness-105 active:scale-95 transition"
          >
            <Download size={14} />
            <span>Télécharger PDF (A4)</span>
          </a>
        </div>
      </header>

      {/* ─── SOMMAIRE FLOTTANT RAPIDE ─── */}
      <nav className="border-b border-border/40 bg-card/60 backdrop-blur-md px-4 sm:px-8 py-2.5 overflow-x-auto no-scrollbar text-xs">
        <div className="max-w-5xl mx-auto flex items-center gap-2 sm:gap-6 whitespace-nowrap font-medium text-muted-foreground">
          <span className="text-[11px] font-bold text-foreground flex items-center gap-1">
            <BookOpen size={13} className="text-gold-text" /> Sommaire :
          </span>
          <a href="#volume-1" className="hover:text-gold-text transition">Vol 1 : Cabine &amp; Consultation</a>
          <span>·</span>
          <a href="#volume-2" className="hover:text-gold-text transition">Vol 2 : Caisse &amp; Reçus</a>
          <span>·</span>
          <a href="#volume-3" className="hover:text-gold-text transition">Vol 3 : Objections &amp; Fidélité</a>
          <span>·</span>
          <a href="#support-officiel" className="hover:text-gold-text transition">Support Direction</a>
        </div>
      </nav>

      {/* ─── CONTENU PRINCIPAL ÉDITORIAL LUXE ─── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-14 space-y-16">

        {/* HERO BANNER */}
        <section className="text-center space-y-4 pt-2">
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gold/10 border border-gold/30 text-gold-text text-xs font-bold uppercase tracking-wider shadow-xs">
            <Sparkles size={13} />
            Guide Pratique Officiel · Instituts &amp; Cabinets Partenaires
          </span>
          <h2 className="font-heading font-black text-2xl sm:text-4xl md:text-5xl tracking-tight max-w-3xl mx-auto leading-tight">
            Le Guide Complet d&apos;Utilisation de Kènè Pro
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Chaque geste en cabine, chaque étape de consultation, chaque encaissement de caisse et chaque dialogue client illustré pas-à-pas avec les écrans réels de l&apos;application.
          </p>

          <div className="pt-2 flex flex-wrap justify-center items-center gap-3">
            <a
              href="/api/pro/marketing/pdf?type=manuel-pro"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 h-11 px-6 rounded-2xl k-btn-gold text-sm font-bold text-primary-foreground shadow-md hover:brightness-110 active:scale-95 transition"
            >
              <Download size={16} />
              Télécharger le Livret Imprimable (PDF A4)
            </a>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            VOLUME 1 : PRATICIENNE, CABINE & CONSULTATION
           ════════════════════════════════════════════════════════════════ */}
        <section id="volume-1" className="space-y-8 scroll-mt-24">
          <div className="border-b-2 border-gold/30 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-black text-gold-text uppercase tracking-widest">Volume 1</span>
              <h3 className="font-heading font-black text-xl sm:text-2xl text-foreground flex items-center gap-2.5 mt-0.5">
                <ScanFace className="size-6 text-gold-text" />
                Guide Praticienne : Cabine, Consultation &amp; Diagnostic Cutané
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">Destiné aux Esthéticiennes, Dermo-conseillères et Praticiennes</p>
          </div>

          {/* ÉTAPE 1.1 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center rounded-3xl bg-card border border-border/70 p-6 sm:p-8 shadow-xs">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gold/10 text-gold-text text-xs font-bold">
                Étape 1
              </div>
              <h4 className="font-heading font-bold text-lg text-foreground">
                Connexion sécurisée &amp; Pointage horodaté d&apos;équipe
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Dès votre arrivée à l&apos;institut, connectez-vous sur votre tablette ou smartphone professionnel via <strong>kene-beaute.com/pro</strong>.
              </p>
              <ul className="space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Accès simplifié :</strong> Entrez avec votre code PIN personnel ou identifiant cabine.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Pointage d&apos;arrivée :</strong> Cliquez sur <em>« Pointer mon arrivée »</em>. L&apos;heure exacte est horodatée sur le registre RH du salon.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Fin de service :</strong> Pointez votre sortie pour valider le calcul automatique de vos primes et commissions de la journée.</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 space-y-2">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-border/80 shadow-md bg-secondary/40">
                <Image
                  src="/docs/manual-screens/02-espace-pro-connexion.png"
                  alt="Écran de connexion Kènè Pro"
                  fill
                  className="object-cover"
                />
              </div>
              <p className="text-[11px] text-center text-muted-foreground italic">
                Figure 1.1 : Portail de connexion professionnel avec sélection du profil et validation PIN.
              </p>
            </div>
          </div>

          {/* ÉTAPE 1.2 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center rounded-3xl bg-card border border-border/70 p-6 sm:p-8 shadow-xs">
            <div className="lg:col-span-6 order-2 lg:order-1 space-y-2">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-border/80 shadow-md bg-secondary/40">
                <Image
                  src="/docs/manual-screens/04-dermo-kene-diagnostic.png"
                  alt="Diagnostic Dermo Kènè"
                  fill
                  className="object-cover"
                />
              </div>
              <p className="text-[11px] text-center text-muted-foreground italic">
                Figure 1.2 : Interface de bilan dermo-biométrique pour phototypes IV à VI.
              </p>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gold/10 text-gold-text text-xs font-bold">
                Étape 2
              </div>
              <h4 className="font-heading font-bold text-lg text-foreground">
                La Consultation d&apos;Anamnèse &amp; Bilan Cutané Cabine
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Pour les cabinets et spas spécialisés, la consultation est l&apos;acte d&apos;accueil fondateur. Installez la cliente confortablement sous un bon éclairage.
              </p>
              <ul className="space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Questionnaire dermatologique :</strong> Renseignez les habitudes cosmétiques de la cliente, ses antécédents, allergies et intolérances cutanées.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Scan des 3 clichés :</strong> Prenez 3 photos nettes sans filtre (Face, Profil Droit, Profil Gauche).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Scores d&apos;Intelligence Cutanée :</strong> L&apos;algorithme fusionne les données déclaratives et l&apos;analyse visuelle pour calculer le <em>Score Éclat /100</em>, l&apos;hydratation et le risque d&apos;hyperpigmentation post-inflammatoire (taches PIH).</span>
                </li>
              </ul>
            </div>
          </div>

          {/* ÉTAPE 1.3 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center rounded-3xl bg-card border border-border/70 p-6 sm:p-8 shadow-xs">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gold/10 text-gold-text text-xs font-bold">
                Étape 3
              </div>
              <h4 className="font-heading font-bold text-lg text-foreground">
                Édition de la Fiche de Consultation &amp; Ordonnance Botanique
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                À la suite de la consultation, formalisez les préconisations pour valoriser l&apos;expertise de votre institut.
              </p>
              <ul className="space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Fiche de Consultation officielle :</strong> Cliquez sur <em>« Imprimer Fiche »</em> pour obtenir le compte-rendu normalisé contenant les scores, la zone examinée et la signature.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Ordonnance Botanique Africaine :</strong> Prescrivez les actifs nobles adaptés (Karité brut de savane, Huile de Baobab, Moringa, Kinkeliba, Protection SPF50).</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Transmission WhatsApp directe :</strong> Transmettez l&apos;ordonnance chiffrée sur le smartphone de la cliente en 1 clic.</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 space-y-2">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-border/80 shadow-md bg-secondary/40">
                <Image
                  src="/docs/manual-screens/03-scanner-inci.png"
                  alt="Scanner INCI Kènè"
                  fill
                  className="object-cover"
                />
              </div>
              <p className="text-[11px] text-center text-muted-foreground italic">
                Figure 1.3 : Scanner INCI intégré pour détecter les actifs éclaircissants dangereux apportés par la cliente.
              </p>
            </div>
          </div>

          {/* RÈGLE DE CONFORMITÉ */}
          <div className="rounded-2xl border-2 border-gold/40 bg-gold/5 p-5 sm:p-6 flex items-start gap-4 shadow-xs">
            <ShieldCheck size={28} className="text-gold-text shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h5 className="font-heading font-bold text-sm text-foreground">
                Règle Déontologique &amp; Clinique Kènè (Non négociable)
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Les consultations et bilans Dermo Kènè constituent un <strong>acte d&apos;assistance cosmétique et de bien-être cutané</strong>. Ils ne se substituent en aucun cas à un acte médical de dermatologie. En cas de suspicion d&apos;affection cutanée sévère ou de lésion suspecte, la praticienne a pour devoir d&apos;orienter immédiatement la cliente vers un médecin dermatologue diplômé.
              </p>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            VOLUME 2 : GÉRANTE, CAISSE, REÇUS & SYSCOHADA
           ════════════════════════════════════════════════════════════════ */}
        <section id="volume-2" className="space-y-8 scroll-mt-24">
          <div className="border-b-2 border-gold/30 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-black text-gold-text uppercase tracking-widest">Volume 2</span>
              <h3 className="font-heading font-black text-xl sm:text-2xl text-foreground flex items-center gap-2.5 mt-0.5">
                <CreditCard className="size-6 text-gold-text" />
                Guide Gérante : Caisse POS, Facturation des Consultations &amp; SYSCOHADA
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">Destiné aux Directrices de salon, Responsables de caisse &amp; Comptables</p>
          </div>

          {/* ÉTAPE 2.1 : TABLEAU DE BORD PILOTAGE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center rounded-3xl bg-card border border-border/70 p-6 sm:p-8 shadow-xs">
            <div className="lg:col-span-6 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gold/10 text-gold-text text-xs font-bold">
                Pilotage 360°
              </div>
              <h4 className="font-heading font-bold text-lg text-foreground">
                Le Tableau de Bord en temps réel du salon
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                La directrice dispose d&apos;une vision claire et consolidée de son activité du jour sans avoir à calculer manuellement.
              </p>
              <ul className="space-y-2 text-xs text-foreground/90">
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Chiffre d&apos;Affaires direct :</strong> Total encaissé en FCFA actualisé à chaque vente.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Planning des Cabines :</strong> Taux d&apos;occupation des cabines et praticiennes assignées.</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={15} className="text-gold shrink-0 mt-0.5" />
                  <span><strong>Journal de bord &amp; Calendrier :</strong> Possibilité de rejouer et d&apos;auditer n&apos;importe quelle journée passée en 1 clic.</span>
                </li>
              </ul>
            </div>
            <div className="lg:col-span-6 space-y-2">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-border/80 shadow-md bg-secondary/40">
                <Image
                  src="/docs/manual-screens/screen-dashboard.jpg"
                  alt="Tableau de bord Kènè Pro"
                  fill
                  className="object-cover"
                />
              </div>
              <p className="text-[11px] text-center text-muted-foreground italic">
                Figure 2.1 : Vue synthétique de l&apos;Espace Entreprise (Chiffres clés, Caisse POS et Agenda).
              </p>
            </div>
          </div>

          {/* ÉTAPE 2.2 : CLASSEMENT CAISSE CONSULTATION */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center rounded-3xl bg-card border border-border/70 p-6 sm:p-8 shadow-xs">
            <div className="lg:col-span-6 order-2 lg:order-1 space-y-2">
              <div className="relative aspect-[16/10] w-full rounded-2xl overflow-hidden border border-border/80 shadow-md bg-secondary/40">
                <Image
                  src="/docs/manual-screens/05-prise-rdv-soin.png"
                  alt="Réservation et tarifs Kènè"
                  fill
                  className="object-cover"
                />
              </div>
              <p className="text-[11px] text-center text-muted-foreground italic">
                Figure 2.2 : Sélection des créneaux et encaissement sécurisé d&apos;acomptes Mobile Money.
              </p>
            </div>
            <div className="lg:col-span-6 order-1 lg:order-2 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-gold/10 text-gold-text text-xs font-bold">
                Caisse &amp; Reçus
              </div>
              <h4 className="font-heading font-bold text-lg text-foreground">
                Comment enregistrer et facturer une Consultation en Caisse ?
              </h4>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Les consultations doivent être correctement classées pour générer des reçus professionnels et des écritures comptables nettes.
              </p>
              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-xl bg-secondary/40 border border-border/60">
                  <p className="font-bold text-foreground">1. Sélection dans la catégorie « Consultations »</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    Dans la caisse tactile POS, filtrez par le badge violet <em>« Consultations »</em>. Ajoutez la prestation (ex : <em>Consultation Dermo-Conseil — 15 000 FCFA</em>).
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border border-border/60">
                  <p className="font-bold text-foreground">2. Règlement Multi-Flux Africain</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    Encaissez au choix par Wave (Scan QR), Orange Money, MTN MoMo, Carte bancaire ou Espèces. Les acomptes versés en ligne sont automatiquement déduits.
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-secondary/40 border border-border/60">
                  <p className="font-bold text-foreground">3. Reçu Client &amp; Ventilation SYSCOHADA</p>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    Le reçu thermique ou WhatsApp est émis avec la mention explicite de la consultation. En comptabilité, elle est ventilée au compte <strong>706 (Prestations de service)</strong>, distincte des crèmes au compte <strong>701 (Marchandises)</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            VOLUME 3 : RELATIONS CLIENTES, OBJECTIONS & PARRAINAGE
           ════════════════════════════════════════════════════════════════ */}
        <section id="volume-3" className="space-y-8 scroll-mt-24">
          <div className="border-b-2 border-gold/30 pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
            <div>
              <span className="text-xs font-black text-gold-text uppercase tracking-widest">Volume 3</span>
              <h3 className="font-heading font-black text-xl sm:text-2xl text-foreground flex items-center gap-2.5 mt-0.5">
                <HeartHandshake className="size-6 text-gold-text" />
                Guide Relations Clientes : Réponses aux Objections &amp; Parrainage
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">Destiné à l&apos;Accueil, à la Réception et aux Conseillères de vente</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* OBJECTION 1 */}
            <div className="p-6 rounded-3xl bg-card border border-border/70 space-y-3 shadow-xs">
              <span className="text-xs font-black text-gold-text uppercase tracking-wider">Objection n°1</span>
              <h4 className="font-heading font-bold text-sm text-foreground">
                « Le bilan de peau ou la consultation est-il payant ? »
              </h4>
              <div className="p-3.5 rounded-2xl bg-secondary/50 border border-border/50 text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Réponse recommandée :</strong><br />
                <em>« Madame, chez [Nom de l&apos;Institut], le diagnostic dermo-cutané vous est entièrement offert lors de votre soin. Il permet à notre praticienne de calibrer le soin exactement pour votre carnation et d&apos;éviter toute réaction indésirable. »</em>
              </div>
            </div>

            {/* OBJECTION 2 */}
            <div className="p-6 rounded-3xl bg-card border border-border/70 space-y-3 shadow-xs">
              <span className="text-xs font-black text-gold-text uppercase tracking-wider">Objection n°2</span>
              <h4 className="font-heading font-bold text-sm text-foreground">
                « Que faites-vous de mes photos de visage ? »
              </h4>
              <div className="p-3.5 rounded-2xl bg-secondary/50 border border-border/50 text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Réponse recommandée :</strong><br />
                <em>« Vos photographies sont strictement confidentielles et chiffrées selon les normes de la loi n°2013-450 et du RGPD. Elles ne sont visibles que par votre praticienne dans votre Passeport Beauté pour mesurer l&apos;évolution de vos taches et de votre éclat. »</em>
              </div>
            </div>

            {/* OBJECTION 3 */}
            <div className="p-6 rounded-3xl bg-card border border-border/70 space-y-3 shadow-xs">
              <span className="text-xs font-black text-gold-text uppercase tracking-wider">Objection n°3</span>
              <h4 className="font-heading font-bold text-sm text-foreground">
                « Pourquoi continuer d&apos;utiliser l&apos;application chez moi ? »
              </h4>
              <div className="p-3.5 rounded-2xl bg-secondary/50 border border-border/50 text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Réponse recommandée :</strong><br />
                <em>« Pour prolonger les bienfaits de votre soin en cabine, scanner les cosmétiques que vous achetez dans le commerce afin d&apos;éviter les contrefaçons, et inviter vos amies pour gagner des soins gratuits grâce au cercle VIP Kènè+. »</em>
              </div>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            ENCADRÉ UNIQUE DE CONTACT DIRECTION KÈNÈ
           ════════════════════════════════════════════════════════════════ */}
        <section id="support-officiel" className="rounded-3xl border-2 border-gold/40 bg-gradient-to-br from-gold/15 via-gold/5 to-transparent p-6 sm:p-10 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gold/25 pb-6">
            <div className="flex items-center gap-4">
              <KeneEmblem size={44} />
              <div>
                <h4 className="font-heading font-black text-lg text-foreground">
                  Direction &amp; Support Officiel Kènè Technologies
                </h4>
                <p className="text-xs text-muted-foreground">
                  Assistance technique, agrément de salon et formation des équipes
                </p>
              </div>
            </div>
            <a
              href="mailto:contact@kene-beaute.com?subject=Demande%20Institut%20Partenaire%20K%C3%A8n%C3%A8"
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl k-btn-gold text-xs font-bold text-primary-foreground shadow-sm hover:brightness-110 active:scale-95 transition shrink-0"
            >
              Écrire à la Direction
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-card/80 border border-border/60 space-y-1">
              <span className="text-[10px] uppercase font-bold text-gold-text">Canal Officiel Unique</span>
              <p className="font-mono text-sm font-bold text-foreground">contact@kene-beaute.com</p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Traitement prioritaire sous 24h ouvrées pour les directrices d&apos;établissements partenaires.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-card/80 border border-border/60 space-y-1">
              <span className="text-[10px] uppercase font-bold text-gold-text">Précision Salons &amp; Soins</span>
              <p className="font-semibold text-foreground">Relations Clientes &amp; Soins</p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Pour toute question sur vos diagnostics, rituels en cabine ou achats de produits, contactez directement votre institut partenaire.
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground space-y-2">
        <p className="font-semibold text-foreground">
          Kènè Pro · Plateforme d&apos;Intelligence Dermo-Cosmétique &amp; Gestion d&apos;Instituts
        </p>
        <p className="text-[10.5px]">
          Conforme aux normes comptables régionales SYSCOHADA et à la législation sur les données personnelles (Loi n°2013-450 / RGPD).
        </p>
        <p className="text-[10px] text-muted-foreground/60 pt-2">
          © 2026 Kènè Technologies SAS — Tous droits réservés.
        </p>
      </footer>
    </div>
  );
}
