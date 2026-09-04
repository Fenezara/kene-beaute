"use client";
// Kènè Cliente — Briques UI partagées (mobile-first)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, Star } from "lucide-react";
import { scoreColor, scoreVar, readableTextColor } from "@/lib/kene/format";
import { xof } from "@/lib/kene/format";

/**
 * Rangée horizontale scrollable avec signal d'affordance :
 * dégradé droit tant qu'il reste du contenu caché, retiré en fin de scroll.
 * (Sinon les dernières stories / produits « n'existent pas » pour l'utilisatrice.)
 */
export function ScrollFadeRow({
  children,
  className = "",
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ can: boolean; done: boolean }>({ can: false, done: false });
  const check = () => {
    const el = ref.current;
    if (!el) return;
    const can = el.scrollWidth - el.clientWidth > 8;
    const done = el.scrollLeft + el.clientWidth >= el.scrollWidth - 8;
    setState({ can, done });
  };
  useEffect(() => {
    check();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="relative min-w-0">
      <div
        ref={ref}
        onScroll={check}
        data-scroll-row=""
        className={className}
        {...(label ? { role: "group", "aria-label": label } : {})}
      >
        {children}
      </div>
      {state.can && !state.done && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background via-background/70 to-transparent"
        />
      )}
    </div>
  );
}

/** Jauge circulaire SVG du score santé peau — couleurs thème-adaptées (AA) */
export function ScoreGauge({ score, size = 130, stroke = 11, label = "Score peau" }: { score: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const color = scoreVar(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${label} ${score} sur 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ stroke: color }}
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
    <span role="img" className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Note ${rating.toFixed(1)} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} aria-hidden="true" className={i <= Math.round(rating) ? "fill-[#C8951E] text-[#C8951E]" : "text-muted-foreground/50"} />
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

/** Wallet inline compact — cible tactile 44 px, dégradé terre→bissap (AA) */
export function WalletPill({ balance, onClick }: { balance: number; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#A0522D] to-[#8B1A3B] min-h-11 px-4 text-[#FFF9EC] shadow active:scale-95 transition-transform focus-visible:outline-2 focus-visible:outline-[#A0522D]" aria-label={`Wallet ${xof(balance)} — ouvrir`}>
      <span className="font-mono text-xs font-bold">{xof(balance, { compact: true })}</span>
      <span className="w-1.5 h-1.5 rounded-full bg-[#FFF9EC]/80" aria-hidden="true" />
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

/** Confirmation animée façon Wave — coche dessinée + confettis kente.
 * Décorative (aria-hidden) : le libellé texte adjacent porte l'information. */
export function SuccessBurst({ size = 84 }: { size?: number }) {
  const angles = [0, 60, 120, 180, 240, 300].map((a) => (a * Math.PI) / 180);
  const colors = ["#C8951E", "#A0522D", "#4C9050", "#8B1A3B", "#E07A2B", "#F8F1E4"];
  return (
    <div className="relative" aria-hidden="true">
      {angles.map((a, i) => (
        <motion.span
          key={i}
          className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
          style={{ backgroundColor: colors[i] }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(a) * (size * 0.72), y: Math.sin(a) * (size * 0.72), opacity: 0, scale: 0.35 }}
          transition={{ duration: 0.8, delay: 0.25, ease: "easeOut" }}
        />
      ))}
      <motion.span
        initial={{ scale: 0.3 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 16 }}
        className="relative block"
      >
        <svg width={size} height={size} viewBox="0 0 52 52" className="drop-shadow-xl">
          <circle cx="26" cy="26" r="24" fill="#4C9050" />
          <motion.path
            d="M15 27.5l7.5 7.5L37 19.5"
            fill="none"
            stroke="#FFF9EC"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 0.45, ease: "easeOut" }}
          />
        </svg>
      </motion.span>
    </div>
  );
}
