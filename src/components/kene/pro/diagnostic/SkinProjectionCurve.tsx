"use client";

import { useState } from "react";
import { TrendingUp, Calendar, Award } from "lucide-react";
import { BissapFlowerIcon } from "@/components/kene/icons";
import { scoreVar } from "@/lib/kene/format";

interface SkinProjectionCurveProps {
  initialScore: number;
  clientName?: string;
  onBookFollowUp?: () => void;
}

export function SkinProjectionCurve({
  initialScore,
  clientName,
  onBookFollowUp,
}: SkinProjectionCurveProps) {
  const [assiduite, setAssiduite] = useState<number>(100); // 70% à 100%

  // Modélisation dermo-botanique de l'évolution prévisionnelle
  const coef = assiduite / 100;
  const scoreJ0 = initialScore;
  const scoreJ14 = Math.min(96, Math.round(scoreJ0 + (10 * (100 - scoreJ0) / 45) * coef));
  const scoreJ30 = Math.min(97, Math.round(scoreJ0 + (20 * (100 - scoreJ0) / 45) * coef));
  const scoreJ60 = Math.min(98, Math.round(scoreJ0 + (28 * (100 - scoreJ0) / 45) * coef));

  const milestones = [
    {
      period: "Aujourd'hui",
      day: "J0",
      score: scoreJ0,
      phase: "Bilan initial en cabine",
      action: "Soin détox & amorce barrière",
      botanique: "Moringa & Argile blanche",
    },
    {
      period: "+2 semaines",
      day: "J14",
      score: scoreJ14,
      phase: "Régénération barrière",
      action: "Apaisement rougeurs & hydratation",
      botanique: "Beurre de Karité de Korhogo",
    },
    {
      period: "+1 mois",
      day: "J30",
      score: scoreJ30,
      phase: "Cycle épidermique complet",
      action: "Atténuation taches PIH & pores",
      botanique: "Huile pure de Baobab",
    },
    {
      period: "+2 mois",
      day: "J60",
      score: scoreJ60,
      phase: "Consolidation & Éclat Royal",
      action: "Teint uniforme & texture lissée",
      botanique: "Infusion de Kinkéliba",
    },
  ];

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center size-7 rounded-xl bg-gold/15 text-gold-text shrink-0">
            <TrendingUp className="size-4" />
          </span>
          <div>
            <h4 className="font-heading font-bold text-sm text-foreground">
              Projection d&apos;Évolution Cutanée {clientName ? `— ${clientName}` : ""}
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Simulation dermo-botanique prédictive sous réserve du suivi du protocole
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-muted/50 px-2.5 py-1 rounded-full border border-border self-start sm:self-auto">
          <Award className="size-3.5 text-gold" />
          <span className="text-[10.5px] font-semibold text-foreground">
            Gain estimé : +{scoreJ60 - scoreJ0} pts de santé
          </span>
        </div>
      </div>

      {/* Frise chronologique avec progression visuelle */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
        {milestones.map((m, idx) => {
          const color = scoreVar(m.score);
          const isJ0 = idx === 0;

          return (
            <div
              key={m.day}
              className={`rounded-xl border p-3 flex flex-col justify-between space-y-2 relative transition-all ${
                isJ0 ? "border-border/80 bg-muted/30" : "border-gold/30 bg-gold/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  {m.day} <span className="text-[10px] font-normal">({m.period})</span>
                </span>
                <span
                  className="font-mono text-sm font-black tabular-nums px-1.5 py-0.5 rounded-md"
                  style={{ color, backgroundColor: `${color}15` }}
                >
                  {m.score}/100
                </span>
              </div>

              <div>
                <p className="text-xs font-bold font-heading text-foreground leading-tight">
                  {m.phase}
                </p>
                <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5">
                  {m.action}
                </p>
              </div>

              <div className="pt-1 border-t border-border/40 flex items-center gap-1 text-[9.5px] text-gold-text font-medium">
                <BissapFlowerIcon className="size-3 shrink-0" />
                <span className="truncate">{m.botanique}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommandation de suivi en salon & relance */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-gold/10 border border-gold/20">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Conseil praticienne :</strong> Fixez le rendez-vous de consolidation à <strong>J+30</strong> pour mesurer les progrès au bilan spectral et ajuster les dosages.
        </p>
        {onBookFollowUp && (
          <button
            type="button"
            onClick={onBookFollowUp}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl k-btn-gold text-primary-foreground text-xs font-bold transition-all shadow-sm"
          >
            <Calendar className="size-3.5" />
            <span>Planifier le suivi J+30</span>
          </button>
        )}
      </div>
    </div>
  );
}
