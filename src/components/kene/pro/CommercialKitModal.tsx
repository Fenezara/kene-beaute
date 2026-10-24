"use client";
// Kènè Pro — Kit Commercial & Chevalet de Cabine Intégral
// Outil d'aide à la vente pour les gérantes et praticiennes d'instituts partenaires.
// Inclut le chevalet de cabine A5, la carte pass format poche A6, le générateur de messages WhatsApp,
// la convention officielle de partenariat, les scripts d'accueil et les réponses aux objections.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Printer,
  Sparkles,
  QrCode,
  MessageSquare,
  ShieldCheck,
  Check,
  Share2,
  Copy,
  CreditCard,
  FileCheck2,
  Send,
  Heart,
  Calendar,
  Sparkle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DuafeIcon } from "@/components/kene/icons";

interface CommercialKitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  tenantName: string;
  tenantCity?: string;
}

export function CommercialKitModal({
  open,
  onOpenChange,
  tenantId,
  tenantName,
  tenantCity,
}: CommercialKitModalProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [salonLink, setSalonLink] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("chevalet");

  useEffect(() => {
    if (typeof window === "undefined" || !open) return;
    const host = window.location.host;
    const isLocal =
      host.includes("localhost") ||
      host.includes("127.0.0.1") ||
      host.startsWith("192.168.") ||
      host.startsWith("10.");
    // Si testé en local, forcer l'URL publique de production pour que le scan depuis smartphone fonctionne toujours
    const origin = isLocal ? "https://kene-beaute.com" : window.location.origin;
    const link = `${origin}/?ref=${encodeURIComponent(tenantId)}&salon=${encodeURIComponent(tenantName)}`;
    setSalonLink(link);

    QRCode.toDataURL(link, {
      margin: 2,
      width: 480,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#FFFFFF" },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("Erreur génération QR code kit:", err));
  }, [open, tenantId, tenantName]);

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  function handleCopyLink() {
    if (!salonLink) return;
    navigator.clipboard.writeText(salonLink);
    toast.success("Lien de votre institut copié dans le presse-papier !");
  }

  function handleShareWhatsApp(customText?: string) {
    const defaultText = `Bonjour ! Découvrez notre espace de soins et réalisez votre bilan dermo-biométrique offert chez ${tenantName} : ${salonLink}`;
    const text = encodeURIComponent(customText || defaultText);
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  function handleCopyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copié dans le presse-papier !`);
  }

  // Textes WhatsApp pré-rédigés
  const waInvitation = `Bonjour ! Chez ${tenantName}, nous vous offrons votre bilan de santé de peau complet en 10 secondes grâce à notre scanner dermo-biométrique. Découvrez la routine botanique idéale pour votre épiderme et activez vos 30 jours offerts Kènè+ : ${salonLink}`;
  const waPostCare = `Bonjour ! Toute l'équipe de ${tenantName} vous remercie pour votre visite. Votre soin en cabine a restauré l'éclat de votre peau. Retrouvez votre compte-rendu personnalisé et vos conseils botaniques sur votre espace sécurisé : ${salonLink}`;
  const waRelance = `Bonjour ! Voilà 3 semaines depuis votre dernier rituel chez ${tenantName}. Votre cycle de régénération cellulaire arrive à maturité : c'est le moment idéal pour faire votre bilan de suivi cabine et consolider votre éclat. Réservez votre créneau ici : ${salonLink}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-4 sm:p-6 rounded-[24px]">
        <DialogHeader className="no-print">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text">
              <Sparkles size={18} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold font-heading">
                Kit Commercial &amp; Persuasion Salon
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Outils d&apos;accueil, supports imprimables et scripts de persuasion pour {tenantName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto p-1 rounded-xl bg-muted/50 gap-1 no-print">
            <TabsTrigger value="chevalet" className="text-[11px] font-semibold gap-1 py-1.5 rounded-lg">
              <QrCode size={12} /> Chevalet A5
            </TabsTrigger>
            <TabsTrigger value="poche" className="text-[11px] font-semibold gap-1 py-1.5 rounded-lg">
              <CreditCard size={12} /> Carte A6
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-[11px] font-semibold gap-1 py-1.5 rounded-lg">
              <Send size={12} /> WhatsApp
            </TabsTrigger>
            <TabsTrigger value="scripts" className="text-[11px] font-semibold gap-1 py-1.5 rounded-lg">
              <MessageSquare size={12} /> Scripts
            </TabsTrigger>
            <TabsTrigger value="objections" className="text-[11px] font-semibold gap-1 py-1.5 rounded-lg">
              <ShieldCheck size={12} /> Objections
            </TabsTrigger>
            <TabsTrigger value="convention" className="text-[11px] font-semibold gap-1 py-1.5 rounded-lg">
              <FileCheck2 size={12} /> Convention
            </TabsTrigger>
          </TabsList>

          {/* ─── TAB 1 : CHEVALET DE CABINE IMPRIMABLE A5 ─── */}
          <TabsContent value="chevalet" className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gold/10 border border-gold/30 no-print">
              <p className="text-xs text-muted-foreground">
                Disposez ce chevalet A5 sur votre comptoir d&apos;accueil ou face au miroir de chaque cabine.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="h-8 px-3 rounded-lg border border-border bg-background text-xs font-bold inline-flex items-center gap-1.5 hover:bg-muted active:scale-95 transition-all"
                >
                  <Copy size={13} /> Copier lien
                </button>
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp()}
                  className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                >
                  <Share2 size={13} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="h-8 px-3 rounded-lg k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
                >
                  <Printer size={13} /> Imprimer A5
                </button>
              </div>
            </div>

            {/* Zone imprimable Chevalet A5 */}
            <div className="print-area rounded-2xl border-2 border-gold/40 bg-gradient-to-b from-[#FFFDF9] via-[#FAF6ED] to-[#F5ECE0] dark:from-[#1D1714] dark:to-[#120E0C] p-6 text-center space-y-4 shadow-sm text-foreground">
              <div className="flex flex-col items-center justify-center space-y-1">
                <span className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-gold to-terre text-white shadow-xs">
                  <DuafeIcon size={24} />
                </span>
                <p className="font-heading font-black text-xl tracking-wide uppercase pt-1 text-gold-text">
                  KÈNÈ BEAUTÉ &amp; BIEN-ÊTRE
                </p>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Institut Partenaire Certifié · {tenantName} {tenantCity ? `(${tenantCity})` : ""}
                </p>
              </div>

              <div className="space-y-1 border-y border-gold/30 py-3">
                <h3 className="font-heading font-black text-lg text-foreground uppercase">
                  Votre peau mérite la vérité
                </h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Découvrez la santé profonde de votre épiderme en 10 secondes grâce à notre scanner dermo-biométrique haute précision.
                </p>
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center justify-center py-1">
                <div className="p-3.5 rounded-2xl bg-white border-2 border-gold/40 shadow-md">
                  {qrCodeUrl ? (
                    <img
                      src={qrCodeUrl}
                      alt={`QR Code d'accès client pour ${tenantName}`}
                      className="size-48 sm:size-52 object-contain"
                    />
                  ) : (
                    <div className="size-48 flex items-center justify-center text-xs text-muted-foreground">
                      Génération du QR Code...
                    </div>
                  )}
                </div>
                <p className="text-[11px] font-bold text-gold-text mt-2 font-mono uppercase tracking-widest">
                  Scannez avec l&apos;appareil photo
                </p>
                {salonLink && (
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5 max-w-xs truncate">
                    {salonLink.replace(/^https?:\/\//, "")}
                  </p>
                )}
              </div>

              {/* Points forts */}
              <div className="grid grid-cols-3 gap-2 text-left pt-1">
                <div className="p-2.5 rounded-xl bg-background/80 border border-gold/20 space-y-1">
                  <p className="text-[11px] font-bold text-foreground">🔬 Bilan Précision</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Analyse des taches, hydratation et excès de sébum.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-background/80 border border-gold/20 space-y-1">
                  <p className="text-[11px] font-bold text-foreground">🌿 Botanique Pure</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Formulations au Karité brut, Baobab &amp; Moringa.
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-background/80 border border-gold/20 space-y-1">
                  <p className="text-[11px] font-bold text-foreground">✨ 30 Jours Offerts</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Pass VIP Kènè+ offert à l&apos;inscription, zéro engagement.
                  </p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground pt-1 italic">
                🌸 Demandez votre bilan cabine instantané à votre praticienne dès maintenant.
              </p>
            </div>
          </TabsContent>

          {/* ─── TAB 2 : CARTE PASS VIP FORMAT POCHE A6 ─── */}
          <TabsContent value="poche" className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gold/10 border border-gold/30 no-print">
              <p className="text-xs text-muted-foreground">
                Format carte de sortie A6 à remettre en main propre à la cliente en caisse avec ses notes de soin.
              </p>
              <button
                type="button"
                onClick={handlePrint}
                className="h-8 px-3 rounded-lg k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <Printer size={13} /> Imprimer Carte A6
              </button>
            </div>

            {/* Zone imprimable Carte A6 */}
            <div className="print-area rounded-2xl border-2 border-gold/50 bg-[#FFFCF6] dark:bg-[#1A1410] p-5 space-y-3 max-w-lg mx-auto shadow-sm text-foreground">
              <div className="flex items-center justify-between border-b border-gold/30 pb-2">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-full bg-gold text-white">
                    <DuafeIcon size={16} />
                  </span>
                  <div>
                    <p className="font-heading font-black text-sm text-gold-text uppercase leading-none">
                      KÈNÈ VIP PASS
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground mt-0.5">
                      {tenantName} {tenantCity ? `· ${tenantCity}` : ""}
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-gold/15 text-gold-text text-[9px] font-bold uppercase tracking-wider">
                  30 Jours Offerts
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 items-center py-1">
                {/* QR Code miniature */}
                <div className="flex flex-col items-center">
                  <div className="p-1.5 rounded-xl bg-white border border-gold/40 shadow-xs">
                    {qrCodeUrl ? (
                      <img src={qrCodeUrl} alt="QR Code" className="size-24 object-contain" />
                    ) : (
                      <div className="size-24 bg-muted animate-pulse" />
                    )}
                  </div>
                  <span className="text-[8px] font-bold text-muted-foreground mt-1 text-center leading-none">
                    Scannez pour votre suivi
                  </span>
                </div>

                {/* Données manuscrites praticienne */}
                <div className="col-span-2 space-y-2 text-xs">
                  <div className="flex items-center justify-between border-b border-border/80 pb-1">
                    <span className="text-[11px] text-muted-foreground">Cliente :</span>
                    <span className="font-bold text-[11px]">_____________________</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/80 pb-1">
                    <span className="text-[11px] text-muted-foreground">Score Éclat / Eau :</span>
                    <span className="font-bold text-[11px] text-gold-text">[ &nbsp; &nbsp; &nbsp; &nbsp; % ]</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/80 pb-1">
                    <span className="text-[11px] text-muted-foreground">Praticienne :</span>
                    <span className="font-bold text-[11px]">_____________________</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-border/80 pb-1">
                    <span className="text-[11px] text-muted-foreground">Prochain RDV :</span>
                    <span className="font-bold text-[11px]">____ / ____ / 2026</span>
                  </div>
                </div>
              </div>

              <div className="p-2 rounded-xl bg-gold/10 border border-gold/20 text-[10px] text-muted-foreground leading-snug">
                🌿 <strong>Avantage Fidélité :</strong> Présentez ce pass lors de votre prochaine visite chez {tenantName} pour bénéficier de votre diagnostic comparatif offert et de conseils botaniques sur-mesure.
              </div>
            </div>
          </TabsContent>

          {/* ─── TAB 3 : GÉNÉRATEUR WHATSAPP 1-CLIC ─── */}
          <TabsContent value="messages" className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold text-xs">● Étape 1</span>
                  <p className="text-xs font-bold text-foreground">Invitation VIP &amp; Bilan Offert</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText(waInvitation, "Message d'invitation")}
                    className="h-7 px-2.5 rounded-lg border border-border text-[11px] font-semibold hover:bg-muted inline-flex items-center gap-1"
                  >
                    <Copy size={11} /> Copier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareWhatsApp(waInvitation)}
                    className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Send size={11} /> Envoyer WhatsApp
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg italic leading-relaxed">
                « {waInvitation} »
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold text-xs">● Étape 2</span>
                  <p className="text-xs font-bold text-foreground">Compte-rendu Post-Soin Immédiat</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText(waPostCare, "Message post-soin")}
                    className="h-7 px-2.5 rounded-lg border border-border text-[11px] font-semibold hover:bg-muted inline-flex items-center gap-1"
                  >
                    <Copy size={11} /> Copier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareWhatsApp(waPostCare)}
                    className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Send size={11} /> Envoyer WhatsApp
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg italic leading-relaxed">
                « {waPostCare} »
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-600 font-bold text-xs">● Étape 3</span>
                  <p className="text-xs font-bold text-foreground">Relance Bienveillante à J+21</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText(waRelance, "Message de relance J+21")}
                    className="h-7 px-2.5 rounded-lg border border-border text-[11px] font-semibold hover:bg-muted inline-flex items-center gap-1"
                  >
                    <Copy size={11} /> Copier
                  </button>
                  <button
                    type="button"
                    onClick={() => handleShareWhatsApp(waRelance)}
                    className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1"
                  >
                    <Send size={11} /> Envoyer WhatsApp
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg italic leading-relaxed">
                « {waRelance} »
              </p>
            </div>
          </TabsContent>

          {/* ─── TAB 4 : SCRIPTS CABINE PRATICIENNES ─── */}
          <TabsContent value="scripts" className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-gold-text font-bold text-xs">
                  1
                </span>
                <p className="text-xs font-bold text-foreground">
                  Installation au fauteuil (Accroche bienveillante)
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed pl-8">
                « Bonjour Madame [Prénom], avant de débuter votre rituel aujourd&apos;hui, nous allons réaliser votre diagnostic en 10 secondes sur notre tablette. Vous verrez l&apos;état exact d&apos;hydratation de votre épiderme. À la fin du soin, nous referons le scan pour constater ensemble la différence d&apos;éclat Avant / Après. »
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-gold-text font-bold text-xs">
                  2
                </span>
                <p className="text-xs font-bold text-foreground">
                  Présentation du résultat du scan (La Preuve Visuelle)
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed pl-8">
                « Regardez sur l&apos;écran : votre taux d&apos;hydratation est à [X]% et nous observons quelques taches pigmentaires naissantes sur les pommettes. Le soin régénérant à base de Karité et Baobab va directement réparer cette barrière. Vous recevrez le compte-rendu complet sur votre WhatsApp. »
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-gold/15 text-gold-text font-bold text-xs">
                  3
                </span>
                <p className="text-xs font-bold text-foreground">
                  Clôture et recommandation routine (Vente naturelle)
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed pl-8">
                « Regardez le comparatif Avant / Après : votre teint est unifié (+18 % d&apos;éclat immédiat). Pour pérenniser ce résultat à la maison, voici votre carte Pass VIP avec votre sérum recommandé noté dessus. Vos 30 premiers jours d&apos;application sont offerts ! »
              </p>
            </div>
          </TabsContent>

          {/* ─── TAB 5 : TRAITEMENT DES OBJECTIONS ─── */}
          <TabsContent value="objections" className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-gold-text font-bold">Q :</span> « Est-ce que ce diagnostic de peau est payant ? »
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Réponse :</strong> « Non, le bilan dermo-biométrique en cabine est totalement offert dans le cadre de votre rituel chez {tenantName}. Vous repartez avec votre fiche d&apos;analyse complète sur votre téléphone sans débourser un centime. »
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-gold-text font-bold">Q :</span> « Que faites-vous de mes photos de visage ? »
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Réponse :</strong> « Vos photographies sont strictement médicales et confidentielles. Elles ne sont jamais publiées ni vendues à des tiers. Elles restent votre propriété exclusive dans votre Passeport de Peau sécurisé. »
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-gold-text font-bold">Q :</span> « Pourquoi utiliser l&apos;application chez moi ? »
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Réponse :</strong> « Les soins en cabine sont l&apos;accélérateur, mais 80 % du résultat dépend de votre routine quotidienne. L&apos;application vous guide chaque semaine, suit la disparition de vos taches et vous protège contre les faux cosmétiques. Vos 30 premiers jours sont 100 % gratuits ! »
              </p>
            </div>
          </TabsContent>

          {/* ─── TAB 6 : CONVENTION OFFICIELLE DE PARTENARIAT ─── */}
          <TabsContent value="convention" className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gold/10 border border-gold/30 no-print">
              <p className="text-xs text-muted-foreground">
                Attestation officielle d&apos;agrément Kènè Pro et engagement déontologique pour {tenantName}.
              </p>
              <button
                type="button"
                onClick={handlePrint}
                className="h-8 px-3 rounded-lg k-btn-gold text-primary-foreground text-xs font-bold inline-flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <Printer size={13} /> Imprimer l&apos;Attestation
              </button>
            </div>

            {/* Zone imprimable Attestation / Convention */}
            <div className="print-area rounded-2xl border-2 border-gold/40 bg-gradient-to-b from-[#FFFDF9] via-[#FAF6ED] to-[#F5ECE0] dark:from-[#1D1714] dark:to-[#120E0C] p-6 space-y-4 text-foreground shadow-sm">
              <div className="flex items-center justify-between border-b border-gold/30 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-10 place-items-center rounded-xl bg-gold text-white">
                    <DuafeIcon size={20} />
                  </span>
                  <div>
                    <h4 className="font-heading font-black text-sm text-gold-text uppercase tracking-wide">
                      ATTESTATION D&apos;AGRÉMENT INSTITUT PARTENAIRE
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Écosystème Dermo-Botanique Kènè Technologies · Réf: KENE-CERT-{tenantId.substring(0, 8).toUpperCase()}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
                  Certifié Conforme
                </span>
              </div>

              <div className="space-y-2 text-xs leading-relaxed">
                <p>
                  Par la présente, la direction de <strong>KÈNÈ TECHNOLOGIES SAS</strong> certifie que l&apos;établissement :
                </p>
                <div className="p-3 rounded-xl bg-background/80 border border-gold/20 font-medium">
                  <p className="text-sm font-bold text-foreground">🌸 {tenantName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Localisation : {tenantCity || "Abidjan"} · Statut : Institut Partenaire Officiel
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Est officiellement agréé pour la délivrance des bilans dermo-biométriques Kènè et s&apos;engage sur les 4 engagements fondamentaux :
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-background/60 border border-border space-y-1">
                    <p className="font-bold text-emerald-700 dark:text-emerald-400">✓ Zéro Dépigmentant</p>
                    <p className="text-muted-foreground text-[10px]">
                      Interdiction stricte d&apos;Hydroquinone, corticoïdes et mercure.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background/60 border border-border space-y-1">
                    <p className="font-bold text-foreground">✓ Caisse SYSCOHADA</p>
                    <p className="text-muted-foreground text-[10px]">
                      Traçabilité comptable et tickets de caisse aux normes régionales.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background/60 border border-border space-y-1">
                    <p className="font-bold text-foreground">✓ Propriété des Données</p>
                    <p className="text-muted-foreground text-[10px]">
                      Votre clientèle et votre chiffre d&apos;affaires restent 100% vôtres.
                    </p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background/60 border border-border space-y-1">
                    <p className="font-bold text-gold-text">✓ Avantage Salariées Kènè+</p>
                    <p className="text-muted-foreground text-[10px]">
                      Pass VIP offert pour l&apos;ensemble de vos employées déclarées.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gold/30 text-[10px] text-muted-foreground">
                <div>
                  <p className="font-bold">Pour KÈNÈ TECHNOLOGIES</p>
                  <p className="italic">Direction Dermo-Scientifique</p>
                  <div className="mt-1 font-mono text-[9px] text-gold-text">CERT-SHA256-OK</div>
                </div>
                <div className="text-right">
                  <p className="font-bold">Pour l&apos;Institut Partenaire</p>
                  <p className="italic">La Direction / Gérante</p>
                  <div className="mt-1 font-mono text-[9px] text-muted-foreground">Cachet &amp; Signature</div>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
