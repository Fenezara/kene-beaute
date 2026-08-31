"use client";
// Kènè Cliente — Briques UI partagées (mobile-first)
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, Star } from "lucide-react";
import { scoreColor, readableTextColor } from "@/lib/kene/format";
import { xof } from "@/lib/kene/format";

/** Jauge circulaire SVG du score santé peau */
export function ScoreGauge({ score, size = 130, stroke = 11, label = "Score peau" }: { score: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} ${score} sur 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <div className="font-mono font-bold" style={{ fontSize: size * 0.28, color }}>{score}</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mt-1">{label}</div>
        </div>
      </div>
    </div>
  );
}

/** Pastille ronde mini score (listes) — texte lisible quel que soit le fond */
export function ScoreChip({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span className="inline-grid place-items-center rounded-full px-2.5 py-1 font-mono text-xs font-bold" style={{ backgroundColor: color, color: readableTextColor(color) }}>
      {score}
    </span>
  );
}

export function SectionTitle({ children, icon, action }: { children: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="font-heading font-bold text-base flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function EmptyBlock({ icon, title, text, cta }: { icon: ReactNode; title: string; text?: string; cta?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-8 text-center flex flex-col items-center gap-3">
      <div className="grid place-items-center w-14 h-14 rounded-full bg-muted text-primary">{icon}</div>
      <div>
        <p className="font-heading font-semibold text-sm">{title}</p>
        {text && <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">{text}</p>}
      </div>
      {cta}
    </div>
  );
}

export function Stars({ rating, size = 12, className = "" }: { rating: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Note ${rating.toFixed(1)} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={i <= Math.round(rating) ? "fill-[#C8951E] text-[#C8951E]" : "text-muted-foreground/50"} />
      ))}
    </span>
  );
}

export const APPT_STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  pending: { label: "En attente", cls: "bg-sunset/15 text-sunset-text" },
  confirmed: { label: "Confirmé", cls: "bg-success/15 text-success" },
  completed: { label: "Terminé", cls: "bg-gold/15 text-gold-text" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
  no_show: { label: "Absente", cls: "bg-bissap/15 text-destructive" },
};

export function ApptBadge({ status }: { status: string }) {
  const s = APPT_STATUS_STYLES[status] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>{s.label}</span>;
}

/** Wallet inline compact */
export function WalletPill({ balance, onClick }: { balance: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#C8951E] to-[#A0522D] px-3 py-1.5 text-white shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-primary" aria-label={`Wallet ${xof(balance)} — ouvrir`}>
      <span className="font-mono text-xs font-bold">{xof(balance, { compact: true })}</span>
      <span className="w-1.5 h-1.5 rounded-full bg-white/80" aria-hidden="true" />
    </button>
  );
}

/** Écran de paiement mobile money simulé plein cadre (dans conteneur 430px) */
export function MomoProcessing({ operator, color, amount, phone }: { operator: string; color: string; amount: number; phone: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-10 text-center">
      <div className="grid place-items-center w-20 h-20 rounded-3xl font-heading font-black text-2xl text-[#1A1410] shadow-lg" style={{ backgroundColor: color }}>
        {operator.charAt(0)}
      </div>
      <div>
        <p className="font-heading font-bold text-lg">{operator}</p>
        <p className="text-xs text-muted-foreground mt-1">Paiement sécurisé — simulation POC</p>
      </div>
      <p className="font-mono text-3xl font-black">{xof(amount)}</p>
      <p className="text-xs text-muted-foreground">Numéro {phone}</p>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        Traitement en cours…
      </div>
    </div>
  );
}
