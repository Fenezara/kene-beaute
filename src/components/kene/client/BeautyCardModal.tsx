"use client";
// Kènè — Carte Beauté & Routine pour Statut / Story WhatsApp & Instagram
// Permet d'exporter et partager visuellement son diagnostic cutané avec code de parrainage.
import { useRef, useState } from "react";
import { Check, Download, MessageCircle, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { formatDate, scoreColor } from "@/lib/kene/format";
import { buildWhatsAppDiagnosisShareMessage, openWhatsApp } from "@/lib/kene/whatsapp-relay";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { ScoreGauge } from "./bits";

interface BeautyCardModalProps {
  score: number;
  zoneLabel: string;
  fitzpatrick?: string;
  botanicals: string[];
  referralCode?: string;
  userName?: string;
  onClose: () => void;
}

export function BeautyCardModal({
  score,
  zoneLabel,
  fitzpatrick,
  botanicals,
  referralCode = "KENE2026",
  userName = "Moi",
  onClose,
}: BeautyCardModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  function handleShareWhatsApp() {
    haptic(HAPTIC.success);
    const msg = buildWhatsAppDiagnosisShareMessage({
      clientName: userName,
      zoneLabel,
      score,
      fitzpatrick,
      botanicals,
      referralCode,
      appUrl: typeof window !== "undefined" ? window.location.origin : "https://kene.app",
    });
    // Ouvre le sélecteur de contact/statut WhatsApp
    openWhatsApp("", msg);
    toast.success("Ouverture de WhatsApp pour partager ta carte 📲");
  }

  async function handleDownloadImage() {
    haptic(HAPTIC.light);
    setDownloading(true);

    try {
      // Génération Canvas native pour rendu net sans dépendance externe lourde
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920; // format 9:16 Story
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas inaccessible");

      // 1. Fond sombre noble Kènè
      const grad = ctx.createLinearGradient(0, 0, 0, 1920);
      grad.addColorStop(0, "#1F1712");
      grad.addColorStop(0.5, "#150F0C");
      grad.addColorStop(1, "#0A0807");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1920);

      // 2. Bordure et filets or / bogolan
      ctx.strokeStyle = "#C8951E";
      ctx.lineWidth = 12;
      ctx.strokeRect(40, 40, 1000, 1840);

      ctx.strokeStyle = "rgba(200, 149, 30, 0.4)";
      ctx.lineWidth = 2;
      ctx.strokeRect(60, 60, 960, 1800);

      // Bande Kente en haut
      const colors = ["#8B1A3B", "#346834", "#C8951E", "#E07A2B", "#A0522D"];
      const blockW = 1000 / colors.length;
      colors.forEach((c, idx) => {
        ctx.fillStyle = c;
        ctx.fillRect(40 + idx * blockW, 40, blockW, 20);
      });

      // 3. Logo Kènè & Titre
      ctx.fillStyle = "#F8F1E4";
      ctx.font = "bold 72px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("K È N È", 540, 260);

      ctx.fillStyle = "#C8951E";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText("LA BEAUTÉ MÉLANODERME", 540, 320);

      // 4. Cercle Score Central
      const centerX = 540;
      const centerY = 680;
      const radius = 220;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(200, 149, 30, 0.08)";
      ctx.fill();
      ctx.strokeStyle = "#C8951E";
      ctx.lineWidth = 16;
      ctx.stroke();

      // Score
      ctx.fillStyle = "#F8F1E4";
      ctx.font = "bold 150px sans-serif";
      ctx.fillText(String(score), centerX, centerY + 40);

      ctx.fillStyle = "#C8951E";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("/ 100", centerX, centerY + 110);

      // 5. Zone et Phototype
      ctx.fillStyle = "#F8F1E4";
      ctx.font = "bold 48px sans-serif";
      ctx.fillText(`Diagnostic : ${zoneLabel.toUpperCase()}`, 540, 1020);

      if (fitzpatrick) {
        ctx.fillStyle = "rgba(248, 241, 228, 0.75)";
        ctx.font = "34px sans-serif";
        ctx.fillText(`Phototype estimé : Fitzpatrick ${fitzpatrick}`, 540, 1080);
      }

      // 6. Actifs Botaniques
      ctx.fillStyle = "#C8951E";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("ACTIFS BOTANIQUES PRESCRITS", 540, 1220);

      const botText = botanicals.length > 0 ? botanicals.slice(0, 3).join("  •  ") : "Karité  •  Balanites  •  Moringa";
      ctx.fillStyle = "#F8F1E4";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText(botText, 540, 1285);

      // 7. Bannière Parrainage & Cadeau
      ctx.fillStyle = "rgba(200, 149, 30, 0.15)";
      ctx.fillRect(140, 1420, 800, 220);
      ctx.strokeStyle = "#C8951E";
      ctx.lineWidth = 3;
      ctx.strokeRect(140, 1420, 800, 220);

      ctx.fillStyle = "#C8951E";
      ctx.font = "bold 36px sans-serif";
      ctx.fillText("CADEAU DE BIENVENUE : 1 000 FCFA", 540, 1490);

      ctx.fillStyle = "#F8F1E4";
      ctx.font = "30px sans-serif";
      ctx.fillText("Fais ton diagnostic gratuit avec mon code parrain :", 540, 1545);

      ctx.fillStyle = "#C8951E";
      ctx.font = "bold 44px monospace";
      ctx.fillText(referralCode, 540, 1605);

      // 8. Footer
      ctx.fillStyle = "rgba(248, 241, 228, 0.5)";
      ctx.font = "28px sans-serif";
      ctx.fillText("kene.app  •  Soins dermo-botaniques d'Afrique", 540, 1780);

      // Export Blob & Téléchargement
      canvas.toBlob((blob) => {
        if (!blob) throw new Error("Erreur de rendu");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `carte-beaute-kene-${score}.png`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Carte Story enregistrée dans ta galerie ! 📸");
        setDownloading(false);
      }, "image/png");
    } catch (e) {
      toast.error("Impossible de générer l'image");
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-sm rounded-[28px] border border-[#C8951E]/40 bg-[#17120E] text-[#F8F1E4] p-5 shadow-2xl overflow-hidden">
        {/* Fermeture */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 h-9 w-9 grid place-items-center rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition text-white z-10"
          aria-label="Fermer"
        >
          <X size={18} />
        </button>

        {/* Aperçu de la carte */}
        <div
          ref={cardRef}
          className="relative rounded-[22px] border border-[#C8951E]/30 bg-gradient-to-b from-[#221A14] to-[#120E0C] p-5 text-center shadow-lg"
        >
          {/* Liseré Kente en haut */}
          <div
            className="h-1.5 w-full rounded-full mb-4"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg,#8B1A3B 0 12px,#346834 12px 20px,#C8951E 20px 28px,#E07A2B 28px 36px,#A0522D 36px 46px)",
            }}
          />

          <p className="font-heading font-black text-xl tracking-wider text-primary">K È N È</p>
          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest mt-0.5">
            Carte Beauté & Routine
          </p>

          {/* Jauge */}
          <div className="my-4 flex justify-center">
            <ScoreGauge score={score} label="Santé" size={110} />
          </div>

          <p className="font-heading font-black text-base leading-tight">{zoneLabel}</p>
          {fitzpatrick && (
            <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-[#C8951E]/20 text-[#C8951E] font-bold text-[10px]">
              Fitzpatrick {fitzpatrick}
            </span>
          )}

          {/* Botaniques */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Botaniques recommandées
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {(botanicals.length > 0 ? botanicals.slice(0, 3) : ["Karité", "Balanites", "Moringa"]).map((b, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-semibold">
                  {b}
                </span>
              ))}
            </div>
          </div>

          {/* Code Parrainage */}
          <div className="mt-4 rounded-xl border border-dashed border-[#C8951E]/50 bg-[#C8951E]/10 p-2.5">
            <p className="text-[10px] font-bold text-[#C8951E]">🎁 1 000 FCFA offerts pour tes amies</p>
            <p className="font-mono font-black text-sm tracking-wider text-white mt-0.5">{referralCode}</p>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={handleShareWhatsApp}
            className="h-12 w-full rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white text-xs font-black flex items-center justify-center gap-2 active:scale-95 transition shadow-lg"
          >
            <MessageCircle size={17} /> Partager sur WhatsApp & Statut
          </button>

          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={downloading}
            className="h-11 w-full rounded-2xl border border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-bold flex items-center justify-center gap-2 active:scale-95 transition disabled:opacity-50"
          >
            <Download size={15} /> {downloading ? "Création du visuel…" : "Télécharger l'image Story (HD)"}
          </button>
        </div>
      </div>
    </div>
  );
}
