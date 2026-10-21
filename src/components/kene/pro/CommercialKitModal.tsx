"use client";
// Kènè Pro — Kit Commercial & Chevalet de Cabine
// Outil d'aide à la vente pour les gérantes et praticiennes d'instituts partenaires.
// Inclut le chevalet de cabine imprimable avec QR Code personnalisé vers l'institut,
// les scripts d'accueil au fauteuil et les réponses aux objections courantes des clientes.

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
  ExternalLink,
  Crown,
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

  useEffect(() => {
    if (typeof window === "undefined" || !open) return;
    const origin = window.location.origin;
    const link = `${origin}/?ref=${tenantId}`;
    setSalonLink(link);

    QRCode.toDataURL(link, {
      margin: 2,
      width: 480,
      errorCorrectionLevel: "M",
      color: { dark: "#1A1410", light: "#FFF9EC" },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("Erreur génération QR code kit:", err));
  }, [open, tenantId]);

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

  function handleShareWhatsApp() {
    const text = encodeURIComponent(
      `Bonjour ! Découvrez notre espace de soins et réalisez votre bilan dermo-biométrique offert chez ${tenantName} : ${salonLink}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 rounded-[24px]">
        <DialogHeader className="no-print">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-gold/15 text-gold-text">
              <Sparkles size={18} />
            </span>
            <div>
              <DialogTitle className="text-base font-bold font-heading">
                Kit Commercial &amp; Chevalet de Cabine
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Supports de persuasion et outils d&apos;accueil pour vos clientes chez {tenantName}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="chevalet" className="mt-3 no-print">
          <TabsList className="grid grid-cols-3 h-10 rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="chevalet" className="text-xs font-semibold gap-1.5 rounded-lg">
              <QrCode size={13} /> Chevalet A5
            </TabsTrigger>
            <TabsTrigger value="scripts" className="text-xs font-semibold gap-1.5 rounded-lg">
              <MessageSquare size={13} /> Scripts Cabine
            </TabsTrigger>
            <TabsTrigger value="objections" className="text-xs font-semibold gap-1.5 rounded-lg">
              <ShieldCheck size={13} /> Objections
            </TabsTrigger>
          </TabsList>

          {/* ─── TAB 1 : CHEVALET DE CABINE IMPRIMABLE ─── */}
          <TabsContent value="chevalet" className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gold/10 border border-gold/30">
              <p className="text-xs text-muted-foreground">
                Disposez cette affichette sur votre comptoir d&apos;accueil ou en cabine face au miroir.
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
                  onClick={handleShareWhatsApp}
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

            {/* Affichette / Chevalet de Cabine (Zone imprimable) */}
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

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center py-1">
                <div className="p-3 rounded-2xl bg-[#FFF9EC] border-2 border-gold/40 shadow-md">
                  {qrCodeUrl ? (
                    <img
                      src={qrCodeUrl}
                      alt={`QR Code d'accès client pour ${tenantName}`}
                      className="size-48 sm:size-52 object-contain"
                    />
                  ) : (
                    <div className="size-48 flex items-center justify-center text-xs text-muted-foreground">
                      Chargement du QR Code...
                    </div>
                  )}
                </div>
                <p className="text-[11px] font-bold text-gold-text mt-2 font-mono uppercase tracking-widest">
                  Scannez avec l&apos;appareil photo
                </p>
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

          {/* ─── TAB 2 : SCRIPTS CABINE PRATICIENNES ─── */}
          <TabsContent value="scripts" className="space-y-4 pt-2">
            <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  1
                </span>
                <p className="text-xs font-bold text-foreground">
                  Installation au fauteuil (Accroche bienveillante)
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed pl-9">
                « Bonjour Madame [Prénom], avant de commencer votre rituel de soin aujourd&apos;hui, nous allons réaliser un diagnostic de peau en 10 secondes sur notre tablette. Vous allez voir exactement l&apos;état d&apos;hydratation et les cellules sous votre peau. À la fin de la séance, nous referons le scan pour que vous puissiez constater vous-même la différence d&apos;éclat Avant / Après. »
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  2
                </span>
                <p className="text-xs font-bold text-foreground">
                  Présentation du résultat du scan (La Preuve Visuelle)
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed pl-9">
                « Regardez ici sur l&apos;écran : votre indice d&apos;hydratation est à [X]% et nous observons quelques taches pigmentaires naissantes sur les pommettes. Le soin régénérant que nous allons appliquer à base de Karité et de Baobab va directement cibler cette zone pour restaurer la barrière cutanée. Vous recevrez le compte-rendu complet sur votre WhatsApp. »
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-card border border-border/80 space-y-3">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  3
                </span>
                <p className="text-xs font-bold text-foreground">
                  Clôture et recommandation routine (Vente naturelle)
                </p>
              </div>
              <p className="text-xs text-muted-foreground italic leading-relaxed pl-9">
                « Regardez le comparatif Avant / Après : votre grain de peau est visiblement unifié (+18 % d&apos;éclat immédiat). Pour maintenir ce résultat à la maison, je vous conseille d&apos;appliquer ce sérum botanique chaque soir. Votre Pass Kènè+ vous permet de suivre l&apos;évolution de vos taches gratuitement depuis votre salon. »
              </p>
            </div>
          </TabsContent>

          {/* ─── TAB 3 : TRAITEMENT DES OBJECTIONS CLIENTES ─── */}
          <TabsContent value="objections" className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-gold-text">❓</span> « Est-ce que ce diagnostic de peau est payant ? »
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Réponse :</strong> « Non, le bilan dermo-biométrique en cabine est totalement offert dans le cadre de votre venue chez {tenantName}. Vous repartez avec votre fiche d&apos;analyse complète sur votre téléphone sans frais. »
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-gold-text">❓</span> « Que faites-vous de mes photos de visage ? »
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Réponse :</strong> « Vos photographies sont strictement médicales et confidentielles. Elles ne sont jamais publiées ni partagées. Elles vous appartiennent exclusivement dans votre Passeport de Peau sécurisé. »
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-1.5">
              <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span className="text-gold-text">❓</span> « Pourquoi utiliser l&apos;application Kènè chez moi ? »
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <strong>Réponse :</strong> « Vos soins en cabine sont l&apos;accélérateur, mais 80 % du résultat se joue dans votre routine quotidienne. L&apos;application analyse vos progrès chaque semaine, vous rappelle vos gestes de soin et vous alerte si un cosmétique bouche vos pores. Vos 30 premiers jours de Pass VIP sont 100 % gratuits ! »
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
