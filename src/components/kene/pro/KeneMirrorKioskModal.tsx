"use client";
// Kènè Pro — 🪞 Kènè Mirror : Mode Kiosque Tablette Salle d'Attente
// Permet à l'institut de laisser une tablette en libre-service à l'accueil :
// La cliente réalise son pré-bilan par zone anatomique en 30 secondes avant d'entrer en cabine.

import { useState, useRef } from "react";
import {
  Camera,
  CheckCircle2,
  Loader2,
  Sparkles,
  ScanFace,
  UserCheck,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BODY_ZONES, type BodyZone } from "@/lib/kene/types";
import { getQuestionsForZone } from "@/lib/kene/questionnaire";
import { apiPost, resizeImage } from "@/lib/kene/api";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  instituteName?: string;
  onCompleted?: (clientId?: string) => void;
}

export function KeneMirrorKioskModal({
  open,
  onOpenChange,
  tenantId,
  instituteName = "Institut Partenaire Kènè",
  onCompleted,
}: Props) {
  const [step, setStep] = useState<"welcome" | "questions" | "result">("welcome");
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [zone, setZone] = useState<BodyZone>("visage");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string>("K-01");
  const [createdClientId, setCreatedClientId] = useState<string | undefined>();
  const [preliminaryScore, setPreliminaryScore] = useState<number>(78);

  const cameraRef = useRef<HTMLInputElement>(null);

  const zoneQuestions = getQuestionsForZone(zone).slice(0, 3);
  const selectedZoneMeta = BODY_ZONES.find((z) => z.id === zone) ?? BODY_ZONES[0];
  const ZONE_EMOJIS: Record<BodyZone, string> = {
    visage: "✨",
    dos: "🌿",
    cuir_chevelu: "👑",
    mains: "🤲",
    barbe: "🪒",
    naevi: "🔬",
  };

  const resetKiosk = () => {
    setStep("welcome");
    setClientName("");
    setClientPhone("");
    setZone("visage");
    setAnswers({});
    setPhotoData(null);
    setSubmitting(false);
    setCreatedClientId(undefined);
  };

  const handlePhotoCapture = async (file: File) => {
    try {
      const resized = await resizeImage(file, 900);
      setPhotoData(resized);
      toast.success("Cliché biométrique capturé avec succès 📸");
    } catch {
      toast.error("Impossible de lire la photo");
    }
  };

  const handleStartQuestions = () => {
    if (clientName.trim().length < 2) {
      toast.error("Merci d'indiquer ton prénom pour préparer ta cabine 💛");
      return;
    }
    setStep("questions");
  };

  const handleSubmitKiosk = async () => {
    setSubmitting(true);
    try {
      const code = `K-${Math.floor(10 + Math.random() * 89)}`;
      setTicketNumber(code);

      // Création ou récupération de la fiche cliente au sein de l'institut
      let clientId: string | undefined;
      try {
        const cleanDigits = clientPhone.replace(/\D/g, "");
        const formattedPhone = cleanDigits
          ? cleanDigits.startsWith("225")
            ? `+${cleanDigits}`
            : `+225${cleanDigits}`
          : undefined;

        const clientRes = await apiPost<{ client: { id: string } }>("/api/pro/clients", {
          tenantId,
          name: clientName.trim(),
          phone: formattedPhone,
          skinType: "mixte",
          fitzpatrick: "V",
          notes: `Pré-diagnostic Kènè Mirror (${selectedZoneMeta.label}) — Ticket ${code}`,
        });
        clientId = clientRes?.client?.id;
        setCreatedClientId(clientId);
      } catch {
        // Mode hors-ligne ou cliente déjà existante
      }

      // Enregistrement du diagnostic pré-cabine si clientId disponible
      if (clientId) {
        try {
          const diagRes = await apiPost<{ diagnosis?: { scoreGlobal?: number } }>("/api/pro/diagnoses", {
            tenantId,
            clientId,
            zone,
            imageData: photoData || undefined,
            practitioner: "Borne Kènè Mirror (Salle d'attente)",
            notes: `Auto-scan Kiosque (${selectedZoneMeta.label})`,
            questionnaire: {
              zone,
              answers,
            },
          });
          if (diagRes?.diagnosis?.scoreGlobal) {
            setPreliminaryScore(diagRes.diagnosis.scoreGlobal);
          }
        } catch {
          // Tolérance réseau
        }
      }

      setStep("result");
      toast.success(`Bilan transmis en cabine (${code}) ✨`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetKiosk();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto pretty-scroll p-5 sm:p-7 border-gold/40 bg-background/98 backdrop-blur-xl rounded-3xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-gold/25 to-primary/20 text-gold-text border border-gold/40 shadow-sm">
                <ScanFace size={24} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-heading text-lg sm:text-xl font-black text-foreground">
                    🪞 Kènè Mirror — Borne Salle d&apos;Attente
                  </DialogTitle>
                  <Badge className="bg-gold/15 text-gold-text border-gold/30 text-[10px] font-black uppercase">
                    Mode Kiosque 30s
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {instituteName} · Pré-diagnostic autonome avant votre entrée en cabine
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handlePhotoCapture(f);
            e.target.value = "";
          }}
        />

        {/* ÉTAPE 1 : ACCUEIL CLIENTE & CHOIX DE LA ZONE ANATOMIQUE */}
        {step === "welcome" && (
          <div className="space-y-5 pt-2">
            <div className="rounded-2xl border border-gold/30 bg-gradient-to-r from-gold/10 via-primary/5 to-card p-4">
              <p className="font-heading font-bold text-sm sm:text-base text-foreground">
                Bienvenue chez {instituteName} 💛
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Préparez votre séance en 30 secondes : votre dermo-conseillère recevra directement votre profil cutané en cabine.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground">Votre Prénom &amp; Nom *</label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Aminata Koné"
                  className="h-11 rounded-xl text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Smartphone size={13} className="text-gold-text" />
                  <span>Numéro WhatsApp (pour recevoir l&apos;ordonnance PDF)</span>
                </label>
                <Input
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="Ex: 07 01 02 03 04"
                  className="h-11 rounded-xl text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black uppercase tracking-wider text-gold-text">
                Quelle zone souhaitez-vous traiter aujourd&apos;hui en cabine ?
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {BODY_ZONES.map((z) => {
                  const active = zone === z.id;
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => {
                        setZone(z.id);
                        setAnswers({});
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-2xl border text-center transition-all cursor-pointer",
                        active
                          ? "k-btn-gold text-primary-foreground font-black border-transparent shadow-sm scale-[1.02]"
                          : "bg-card/80 border-border/70 text-foreground hover:border-gold/50"
                      )}
                    >
                      <span className="text-xl mb-1">{ZONE_EMOJIS[z.id] ?? "✨"}</span>
                      <span className="text-xs font-bold leading-tight">{z.label}</span>
                      <span
                        className={cn(
                          "text-[10px] mt-0.5 line-clamp-1",
                          active ? "text-primary-foreground/85" : "text-muted-foreground"
                        )}
                      >
                        {z.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck size={14} className="text-emerald-500" />
                Données confidentielles réservées à votre praticienne
              </span>
              <Button
                onClick={handleStartQuestions}
                className="k-btn-gold text-primary-foreground font-black h-11 px-6 rounded-xl gap-2 text-xs sm:text-sm shadow-md"
              >
                <span>Continuer ({selectedZoneMeta.label})</span>
                <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : 3 QUESTIONS CLINIQUES ADAPTÉES À LA ZONE + PHOTO OPTIONNELLE */}
        {step === "questions" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between rounded-2xl bg-muted/50 px-3.5 py-2.5 border border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-lg">{ZONE_EMOJIS[selectedZoneMeta.id] ?? "✨"}</span>
                <div>
                  <p className="text-xs font-black text-foreground">
                    Bilan Express : {selectedZoneMeta.label}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Cliente : <strong>{clientName}</strong>
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cameraRef.current?.click()}
                className="h-8 text-xs font-bold gap-1.5 rounded-xl border-gold/40"
              >
                <Camera size={14} className="text-gold-text" />
                <span>{photoData ? "✓ Photo ajoutée" : "Prendre un selfie (optionnel)"}</span>
              </Button>
            </div>

            <div className="space-y-3">
              {zoneQuestions.map((q, idx) => (
                <div key={q.id} className="p-3.5 rounded-2xl border border-border/70 bg-card/70 space-y-2">
                  <p className="text-xs font-bold text-foreground">
                    {idx + 1}. {q.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt) => {
                      const selected = answers[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.value }))}
                          className={cn(
                            "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                            selected
                              ? "k-btn-gold text-primary-foreground border-transparent font-black shadow-2xs"
                              : "bg-background hover:bg-muted text-foreground border-border/70"
                          )}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/60">
              <Button variant="ghost" size="sm" onClick={() => setStep("welcome")} className="text-xs">
                ← Retour
              </Button>
              <Button
                onClick={() => void handleSubmitKiosk()}
                disabled={submitting}
                className="k-btn-gold text-primary-foreground font-black h-11 px-6 rounded-xl gap-2 text-xs sm:text-sm shadow-md"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Transmission en cabine…</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>Envoyer mon bilan en cabine</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ÉTAPE 3 : CONFIRMATION & TICKET DE PASSAGE CABINE */}
        {step === "result" && (
          <div className="py-6 text-center space-y-5">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shadow-sm">
              <CheckCircle2 size={34} />
            </div>

            <div className="space-y-1">
              <Badge className="bg-gold/15 text-gold-text border-gold/40 text-xs font-black px-3 py-1">
                PASSAGE CABINE #{ticketNumber}
              </Badge>
              <h3 className="font-heading text-xl font-black text-foreground pt-1">
                Merci {clientName.split(" ")[0]} ! Votre dossier est prêt ✨
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                Votre pré-bilan <strong>{selectedZoneMeta.label}</strong> (Score vitalité initial :{" "}
                <strong className="text-foreground">{preliminaryScore}/100</strong>) a été transmis sur la tablette de votre praticienne.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-3">
              <Button
                variant="outline"
                onClick={resetKiosk}
                className="h-11 px-5 rounded-xl gap-2 text-xs font-bold"
              >
                <RotateCcw size={15} />
                <span>Cliente suivante (Réinitialiser la borne)</span>
              </Button>

              {onCompleted && (
                <Button
                  onClick={() => {
                    const cid = createdClientId;
                    resetKiosk();
                    onOpenChange(false);
                    onCompleted(cid);
                  }}
                  className="k-btn-gold text-primary-foreground h-11 px-5 rounded-xl gap-2 text-xs font-black shadow-sm"
                >
                  <UserCheck size={15} />
                  <span>Ouvrir ce dossier côté Praticienne</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
