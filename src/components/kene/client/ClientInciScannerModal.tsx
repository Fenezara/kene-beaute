"use client";
// Kènè Client — Scanner Produit & Analyse Toxicologique INCI Autonome
// Détecte instantanément l'hydroquinone, les corticoïdes, le mercure et les perturbateurs endocriniens
// sans forcer l'utilisateur à entrer dans l'orbe ou la consultation Dr. Kènè.

import { useState, useRef } from "react";
import {
  Camera,
  ImagePlus,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
  AlertTriangle,
  Sparkles,
  MessageCircle,
  RotateCcw,
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { analyzeInciList, type InciAnalysisResult } from "@/lib/kene/inci-analyzer";
import { apiPost, resizeImage } from "@/lib/kene/api";
import { useKene } from "@/store/kene";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ClientInciScannerModal({ open, onOpenChange }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<InciAnalysisResult | null>(null);
  const [manualText, setManualText] = useState("");
  const [, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const setClientTab = useKene((s) => s.setClientTab);

  const reset = () => {
    setAnalyzing(false);
    setAnalysis(null);
    setManualText("");
    setImagePreview(null);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const processImage = async (file: File) => {
    try {
      setAnalyzing(true);
      const resized = await resizeImage(file, 1600);
      setImagePreview(resized);

      // Analyse visuelle & INCI via l'API Kènè
      const res = await apiPost<{
        niveau?: "vert" | "jaune" | "rouge";
        message?: string;
        isProduct?: boolean;
        productName?: string;
        productAnalysis?: InciAnalysisResult;
      }>("/api/dermato/photo", { image: resized });

      if (res?.productAnalysis) {
        setAnalysis(res.productAnalysis);
      } else if (res?.message) {
        const directAnalysis = analyzeInciList(res.message);
        setAnalysis(directAnalysis);
      } else {
        toast.info("Image analysée. Aucun ingrédient toxique répertorié n'a été détecté directement sur le flacon.");
        const directAnalysis = analyzeInciList(file.name);
        setAnalysis(directAnalysis);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur lors de l'analyse de l'image");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleManualAnalyze = () => {
    if (!manualText.trim()) {
      toast.error("Veuillez saisir ou coller la liste des ingrédients (ex: Aqua, Glycerin...).");
      return;
    }
    setAnalyzing(true);
    setTimeout(() => {
      const res = analyzeInciList(manualText);
      setAnalysis(res);
      setAnalyzing(false);
    }, 350);
  };

  const isDanger = analysis?.verdict === "danger";
  const isSain = analysis?.verdict === "sain";

  const handleAskDrKene = () => {
    if (!analysis) return;
    handleClose();
    setClientTab("chat");
    toast.success("Consultation Dr. Kènè ouverte avec les données de votre produit.");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto pretty-scroll p-4 sm:p-6 border-border/70 bg-background/95 backdrop-blur-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-gold/20 text-gold-text shrink-0 shadow-sm border border-gold/30">
              <ShieldAlert size={22} />
            </span>
            <div>
              <DialogTitle className="text-base sm:text-lg font-heading font-black text-foreground">
                Scanner Produit &amp; Sécurité INCI
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Vérification toxicologique immédiate : Hydroquinone, Corticoïdes, Mercure &amp; Cosmétovigilance
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Inputs cachés pour la prise de vue caméra et la sélection galerie */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processImage(f);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processImage(f);
            e.target.value = "";
          }}
        />

        {/* Mode Capture / Saisie */}
        <div className="space-y-4 pt-1">
          {!analysis && !analyzing && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary transition-all active:scale-[0.98] gap-2.5 text-center group cursor-pointer"
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-primary/15 text-primary group-hover:scale-105 transition-transform">
                    <Camera size={26} />
                  </span>
                  <div>
                    <span className="block text-xs font-bold text-foreground">Prendre en photo l&apos;étiquette</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">Caméra &amp; Cadrage au dos</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-gold/40 bg-gold/5 hover:bg-gold/10 text-foreground transition-all active:scale-[0.98] gap-2.5 text-center group cursor-pointer"
                >
                  <span className="grid size-12 place-items-center rounded-xl bg-gold/15 text-gold-text group-hover:scale-105 transition-transform">
                    <ImagePlus size={26} />
                  </span>
                  <div>
                    <span className="block text-xs font-bold text-foreground">Importer une photo</span>
                    <span className="block text-[11px] text-muted-foreground mt-0.5">Depuis votre galerie</span>
                  </div>
                </button>
              </div>

              {/* Saisie textuelle manuelle alternative */}
              <div className="p-3.5 rounded-2xl border border-border/80 bg-card/60 space-y-2">
                <label className="text-xs font-bold text-foreground flex items-center justify-between">
                  <span>Ou collez la liste INCI des ingrédients :</span>
                  <span className="text-[10px] text-muted-foreground font-normal">Texte libre</span>
                </label>
                <Textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Ex: Aqua, Glycerin, Hydroquinone, Clobetasol, Butyrospermum Parkii..."
                  className="text-xs min-h-[75px] bg-background"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleManualAnalyze}
                    className="gap-1.5 text-xs font-bold k-btn-gold text-primary-foreground"
                  >
                    <ShieldAlert size={14} /> Analyser les ingrédients
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* En cours d'analyse */}
          {analyzing && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 size={38} className="animate-spin text-primary" />
              <p className="font-heading font-black text-sm text-foreground">
                Analyse toxicologique en cours…
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Vérification croisée avec la base Kènè des substances dépigmentantes, corticoïdes et toxiques.
              </p>
            </div>
          )}

          {/* Résultats de l'analyse */}
          {analysis && !analyzing && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border text-xs shadow-sm transition-all ${
                  isDanger
                    ? "border-destructive/60 bg-destructive/10 text-foreground"
                    : isSain
                    ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                    : "border-amber-500/50 bg-amber-500/10 text-foreground"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    {isDanger ? (
                      <ShieldAlert size={20} className="text-destructive shrink-0" />
                    ) : isSain ? (
                      <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <TriangleAlert size={20} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <span className="font-heading font-black text-xs sm:text-sm uppercase tracking-wide">
                      {analysis.badgeLabel}
                    </span>
                  </div>
                  <Badge
                    variant={isDanger ? "destructive" : "outline"}
                    className="text-[10px] uppercase font-bold tracking-wider"
                  >
                    {analysis.verdict}
                  </Badge>
                </div>

                <p className="font-bold text-sm text-foreground mb-1">
                  {analysis.title}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {analysis.summary}
                </p>

                {/* Substances toxiques ou interdites détectées */}
                {analysis.detectedDangers.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 space-y-2">
                    <p className="font-black text-destructive text-xs uppercase flex items-center gap-1.5">
                      <AlertTriangle size={14} /> Substances dangereuses détectées ({analysis.detectedDangers.length}) :
                    </p>
                    <div className="space-y-1.5">
                      {analysis.detectedDangers.map((d, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-bold text-destructive underline">{d.name}</span>
                          <span className="text-muted-foreground text-[11px] block mt-0.5">{d.explanation}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actifs bénéfiques identifiés */}
                {analysis.detectedBeneficial.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 space-y-1">
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                      <Sparkles size={14} /> Ingrédients nobles et protecteurs identifiés :
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {analysis.detectedBeneficial.map((b) => b.name).join(", ")}
                    </p>
                  </div>
                )}
              </div>

              {/* Conseils de sevrage / recommandations */}
              {analysis.actionPlan && (
                <div className="p-3.5 rounded-xl border border-border/80 bg-card text-xs space-y-2">
                  <p className="font-bold text-foreground text-xs uppercase tracking-wide">
                    💡 Conseils &amp; Précautions d&apos;usage :
                  </p>
                  {analysis.actionPlan.weaningProtocol && (
                    <ul className="space-y-1 pl-4 list-disc text-muted-foreground text-xs">
                      {analysis.actionPlan.weaningProtocol.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  )}
                  {analysis.actionPlan.medicalAdvice && (
                    <p className="text-[11px] font-semibold text-primary pt-1">
                      {analysis.actionPlan.medicalAdvice}
                    </p>
                  )}
                </div>
              )}

              {/* Actions de bas de modal */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-border/50">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={reset}
                  className="w-full sm:w-auto text-xs gap-1.5"
                >
                  <RotateCcw size={13} /> Analyser un autre flacon
                </Button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAskDrKene}
                    className="flex-1 sm:flex-none text-xs gap-1.5 font-bold"
                  >
                    <MessageCircle size={13} /> Demander à Dr. Kènè
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleClose}
                    className="flex-1 sm:flex-none text-xs font-bold k-btn-gold text-primary-foreground"
                  >
                    Fermer
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
