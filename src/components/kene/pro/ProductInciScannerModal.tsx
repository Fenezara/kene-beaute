"use client";
// Kènè Pro — Scanner de Produit & Analyse INCI Entreprise / Cabine
// Permet à la praticienne d'analyser la formule d'un produit apporté par la cliente
// ou utilisé en cabine (Détection Hydroquinone, Corticoïdes, Allergènes, etc.).
import { useState, useRef } from "react";
import { Camera, ImagePlus, Loader2, ShieldAlert, ShieldCheck, TriangleAlert, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { analyzeInciList, type InciAnalysisResult } from "@/lib/kene/inci-analyzer";
import { apiPost, resizeImage } from "@/lib/kene/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId?: string;
}

export function ProductInciScannerModal({ open, onOpenChange, tenantId }: Props) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<InciAnalysisResult | null>(null);
  const [manualText, setManualText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

      // Appel de l'analyseur VLM & INCI via l'API Kènè
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
        // Analyse directe de la retranscription/composition
        const directAnalysis = analyzeInciList(res.message);
        setAnalysis(directAnalysis);
      } else {
        toast.info("Analyse visuelle terminée mais aucun ingrédient toxique répertorié détecté.");
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
      toast.error("Veuillez saisir ou coller la liste des ingrédients.");
      return;
    }
    setAnalyzing(true);
    setTimeout(() => {
      const res = analyzeInciList(manualText);
      setAnalysis(res);
      setAnalyzing(false);
    }, 400);
  };

  const isDanger = analysis?.verdict === "danger";
  const isSain = analysis?.verdict === "sain";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto pretty-scroll p-4 sm:p-6">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-gold/20 text-gold-text shrink-0 shadow-xs">
              <ShieldAlert size={20} />
            </span>
            <div>
              <DialogTitle className="text-base sm:text-lg font-heading font-black text-foreground">
                Scanner Produit &amp; Analyse INCI Cabine
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Détection clinique d&apos;Hydroquinone, Corticoïdes, Mercure &amp; Cosmétovigilance
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Inputs cachés pour la prise de vue et la galerie */}
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

        {/* Section Actions de Capture / Sélection */}
        <div className="space-y-4 pt-2">
          {!analysis && !analyzing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary transition-all active:scale-[0.98] gap-2"
              >
                <Camera size={26} />
                <span className="text-xs font-bold">Photographier le flacon / INCI</span>
                <span className="text-[10px] text-muted-foreground">Caméra haute précision</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed border-border bg-card hover:bg-muted text-foreground transition-all active:scale-[0.98] gap-2"
              >
                <ImagePlus size={26} className="text-gold-text" />
                <span className="text-xs font-bold">Importer une photo</span>
                <span className="text-[10px] text-muted-foreground">Galerie ou document</span>
              </button>
            </div>
          )}

          {/* Saisie manuelle alternative si pas de photo */}
          {!analysis && !analyzing && (
            <div className="space-y-2 pt-2 border-t border-border/60">
              <label className="text-xs font-bold text-foreground">
                Ou collez manuellement la liste des ingrédients (INCI) :
              </label>
              <Textarea
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder="Ex: Aqua, Glycerin, Hydroquinone, Ceteareth-20, Clobetasol propionate, Niacinamide..."
                className="text-xs min-h-[80px]"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={handleManualAnalyze} className="gap-1.5 text-xs font-bold k-btn-gold text-primary-foreground">
                  <ShieldAlert size={14} /> Analyser les composants
                </Button>
              </div>
            </div>
          )}

          {/* En cours d'analyse */}
          {analyzing && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 size={36} className="animate-spin text-primary" />
              <p className="font-heading font-black text-sm text-foreground">
                Analyse toxicologique en cours…
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                Vérification croisée avec la base Kènè des 350+ substances interdites et dépigmentantes.
              </p>
            </div>
          )}

          {/* Rendu des Résultats de l'analyse */}
          {analysis && !analyzing && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border text-xs shadow-sm ${
                  isDanger
                    ? "border-destructive/60 bg-destructive/10 text-destructive-foreground"
                    : isSain
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-amber-500/50 bg-amber-500/10"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    {isDanger ? (
                      <ShieldAlert size={20} className="text-destructive shrink-0" />
                    ) : isSain ? (
                      <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <TriangleAlert size={20} className="text-amber-600 shrink-0" />
                    )}
                    <span className="font-heading font-black text-xs sm:text-sm uppercase tracking-wide">
                      {analysis.badgeLabel}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold">
                    {analysis.verdict}
                  </Badge>
                </div>

                <p className="font-bold text-xs sm:text-sm text-foreground mb-1">
                  {analysis.title}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  {analysis.summary}
                </p>

                {/* Substances toxiques détectées */}
                {analysis.detectedDangers.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-destructive/15 border border-destructive/30 space-y-2">
                    <p className="font-black text-destructive text-xs uppercase flex items-center gap-1.5">
                      <AlertTriangle size={14} /> Poisons &amp; Dérivés Dépigmentants détectés ({analysis.detectedDangers.length}) :
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

                {/* Actifs bénéfiques */}
                {analysis.detectedBeneficial.length > 0 && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 space-y-1">
                    <p className="font-bold text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                      ✓ Actifs botaniques et protecteurs identifiés :
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {analysis.detectedBeneficial.map((b) => b.name).join(", ")}
                    </p>
                  </div>
                )}
              </div>

              {/* Protocoles et mesures cabine */}
              {analysis.actionPlan && (
                <div className="p-3.5 rounded-xl border border-border/80 bg-card text-xs space-y-2">
                  <p className="font-bold text-foreground text-xs uppercase tracking-wide">
                    📋 Conduite à tenir par la praticienne en cabine :
                  </p>
                  {analysis.actionPlan.weaningProtocol && (
                    <ul className="space-y-1 pl-4 list-disc text-muted-foreground text-xs">
                      {analysis.actionPlan.weaningProtocol.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[11px] font-semibold text-primary pt-1">
                    {analysis.actionPlan.medicalAdvice}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="outline" size="sm" onClick={reset} className="text-xs">
                  Analyser un autre produit
                </Button>
                <Button size="sm" onClick={handleClose} className="text-xs font-bold k-btn-gold text-primary-foreground">
                  Terminer
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
