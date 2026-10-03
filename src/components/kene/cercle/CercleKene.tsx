"use client";
// Kènè — Le Cercle Kènè (, vague 3): le cercle des témoignages.
// Les utilisatrices entendent les voix de celles qui ont marché avant elles.
// Autour d'une braise dorée (halo radial CSS, zéro animation lourde), les
// sœurs du cercle forment un rond: chaque médaillon est une voix, la carte
// au premier plan porte sa parole. Version « auto-focus séquentiel » choisie
// pour la lisibilité mobile (le cercle de parole avance de sœur en sœur —
// pause au survol, au tap et à la navigation clavier).
// Clair de Lune / prefers-reduced-motion: pile statique des mêmes contenus,
// zéro animation — la section n'est JAMAIS vide (repli embarqué réseau).
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { apiGet } from "@/lib/kene/api";
import { readableTextColor } from "@/lib/kene/format";
import { seedOf } from "@/lib/kene/gold-threads";
import { useLoomMode } from "@/components/kene/loom/useLoomMode";
import { Eyebrow, GlassCard, Shimmer } from "@/components/kene/ui2026";
import { cn } from "@/lib/utils";

/* ───────────────────────── Types & données embarquées ───────────────────────── */

export interface TestimonialItem {
  id: string;
  author: string;
  city: string;
  zone?: string | null;
  text: string;
  months: number;
  rating: number;
  threads?: number | null;
}

/** Repli réseau (mêmes données que le seed serveur) — jamais de section vide. */
const FALLBACK_TESTIMONIALS: TestimonialItem[] = [
  {
    id: "fallback-aminata",
    author: "Aminata K.",
    city: "Cocody",
    zone: "visage",
    text: "Mes boutons laissaient des taches brunes à chaque fois. Avec le rituel du soir et l'écran solaire chaque matin, mes taches s'atténuent semaine après semaine. Le scanner me montre le chemin, je ne change plus rien.",
    months: 6,
    rating: 5,
    threads: 12,
  },
  {
    id: "fallback-fatou",
    author: "Fatou B.",
    city: "Bouaké",
    zone: "cuir chevelu",
    text: "Le diagnostic a vu mes débuts d'alopécie de traction avant moi — mes nattes trop serrées. J'ai changé mes habitudes à temps, les repousses sont là. Sans ce scan, j'aurais continué à casser mes cheveux.",
    months: 3,
    rating: 5,
    threads: 6,
  },
  {
    id: "fallback-esther",
    author: "Esther N.",
    city: "San-Pédro",
    zone: "dos",
    text: "Mon dos se couvrait de boutons avant chaque saison des robes. Le rituel gommage puis sérum a assaini tout ça en un trimestre. Cet été, j'ai porté mes robes dos nu sans complexe.",
    months: 4,
    rating: 5,
    threads: 8,
  },
];

/** Palette des médaillons — fils du métier Kènè (jamais bleu/indigo). */
const MEDAL_COLORS = ["#C8951E", "#8B1A3B", "#3F7D3F", "#A0522D", "#E07A2B", "#241A10"];

/** Couleur du médaillon d'une sœur — dérivée de seedOf (graine FNV-1a stable,
 * même couleur pour toujours, cohérence avec le kente identitaire). */
function medalOf(author: string): { bg: string; fg: string } {
  const bg = MEDAL_COLORS[seedOf(author) % MEDAL_COLORS.length];
  return { bg, fg: readableTextColor(bg) };
}

/** Initiales lisibles: « Aminata K. » → « AK ». */
function initialsOf(author: string): string {
  const parts = author.split(/[\s.]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
}

/* ───────────────────────── Petites briques ───────────────────────── */

function StarsRow({ rating, size = 11 }: { rating: number; size?: number }) {
  return (
    <span role="img" aria-label={`Note ${rating} sur 5`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          aria-hidden="true"
          className={i <= rating ? "fill-[#C8951E] text-[#C8951E]" : "text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}

/** La braise du tison — halo radial CSS au centre du cercle (statique).
 * Racine de taille nulle: les halos s'ancrent au centre du conteneur
 * relatif (le rond des sœurs) — aucun calcul de layout. */
function Ember() {
  return (
    <div aria-hidden="true" className="pointer-events-none h-0 w-0">
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-32 w-32 rounded-full"
        style={{ backgroundImage: "radial-gradient(closest-side, rgba(224,122,43,0.30), rgba(200,149,30,0.16) 55%, transparent 76%)" }}
      />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full"
        style={{ backgroundImage: "radial-gradient(closest-side, rgba(200,149,30,0.38), transparent 78%)" }}
      />
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[#E3B04B] shadow-[0_0_18px_rgba(227,176,75,0.9)]" />
    </div>
  );
}

/* ───────────────────────── Composant principal ───────────────────────── */

const AUTO_ADVANCE_MS = 7000;

export function CercleKene() {
  const mode = useLoomMode();
  const reduce = useReducedMotion();
  const animated = mode === "full" && !reduce;

  const [items, setItems] = useState<TestimonialItem[] | null>(null);
  const [focus, setFocus] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [inView, setInView] = useState(false);
  const [touched, setTouched] = useState(false); // tout tap/choix manuel fige le cercle
  const stageRef = useRef<HTMLDivElement>(null);

 /* Fetch non bloquant — la section vit SA vie, le fil d'accueil n'attend jamais. */
  useEffect(() => {
    let alive = true;
    apiGet<{ testimonials: TestimonialItem[] }>("/api/testimonials")
      .then((r) => {
        if (!alive) return;
        const list = r.testimonials ?? [];
        // Liste vide inattendue → repli embarqué (jamais de section vide).
        setItems(list.length > 0 ? list : FALLBACK_TESTIMONIALS);
      })
      .catch(() => {
        if (alive) setItems(FALLBACK_TESTIMONIALS); // hors-ligne / 5xx: le cercle chuchote quand même
      });
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(() => (items ?? []).slice(0, 6), [items]);
  const extra = Math.max(0, (items?.length ?? 0) - 6);
  const focused = shown[Math.min(focus, Math.max(shown.length - 1, 0))];

 /* Le cercle ne tourne que sous les yeux (budget + pertinence). */
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => setInView(es[0]?.isIntersecting ?? false), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, [items]);

 /* Rotation douce = auto-focus séquentiel: la parole passe de sœur en sœur.
 PAUSE au survol, après un tap (choix manuel) et hors écran. */
  useEffect(() => {
    if (!animated || touched || hovering || !inView || shown.length < 2) return;
    const id = window.setInterval(() => setFocus((f) => (f + 1) % shown.length), AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [animated, touched, hovering, inView, shown]);

  const focusAt = (i: number) => {
    setTouched(true); // un choix manuel fige le cercle
    setFocus(((i % shown.length) + shown.length) % shown.length);
  };
  const step = (dir: 1 | -1) => focusAt(focus + dir);

 /* ── Chargement: squelettes (le fil continue de défiler pendant ce temps) ── */
  if (!items) {
    return (
      <section aria-label="Cercle Kènè — les voix de celles qui tissent avant toi" className="relative">
        <header className="text-center">
          <Eyebrow>Le cercle chuchote</Eyebrow>
          <h2 className="mt-1.5 font-heading font-black text-[22px] leading-tight">Cercle Kènè</h2>
          <p className="mt-1 text-xs text-muted-foreground">Les voix de celles qui tissent avant toi</p>
        </header>
        <div className="relative mx-auto mt-4 h-[280px] max-w-[420px]" aria-hidden="true">
          <Ember />
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const a = ((-90 + i * 60) * Math.PI) / 180;
            return (
              <span
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${50 + 36 * Math.cos(a)}%`, top: `${50 + 34 * Math.sin(a)}%` }}
              >
                <Shimmer className="h-[50px] w-[50px] rounded-full" />
              </span>
            );
          })}
        </div>
        <Shimmer className="mt-4 h-[168px] rounded-[24px]" />
      </section>
    );
  }

  const header = (
    <header className="text-center">
      <Eyebrow>Le cercle chuchote</Eyebrow>
      <h2 className="mt-1.5 font-heading font-black text-[22px] leading-tight">Cercle Kènè</h2>
      <p className="mt-1 text-xs text-muted-foreground">Les voix de celles qui tissent avant toi</p>
    </header>
  );

 /* ── Clair de Lune / reduced-motion: pile statique, mêmes contenus, zéro animation ── */
  if (!animated) {
    return (
      <section aria-label="Cercle Kènè — les voix de celles qui tissent avant toi" className="relative">
        {header}
        <div className="mt-4 space-y-3">
          {shown.map((t) => {
            const m = medalOf(t.author);
            return (
              <GlassCard key={t.id} className="rounded-[22px] p-4">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-heading text-sm font-black"
                    style={{ backgroundColor: m.bg, color: m.fg }}
                  >
                    {initialsOf(t.author)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-tight">{t.author}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.city} · {t.months} mois avec Kènè
                    </p>
                  </div>
                  <StarsRow rating={t.rating} size={10} />
                </div>
                <p className="mt-2.5 text-xs leading-relaxed text-foreground/90">{t.text}</p>
                {t.threads != null && t.threads > 0 && (
                  <p className="mt-2 text-[10px] font-semibold text-gold-text">{t.threads} fils d&apos;or tissés</p>
                )}
              </GlassCard>
            );
          })}
        </div>
        {extra > 0 && (
          <p className="mt-3 text-center text-[11px] font-semibold text-muted-foreground">+{extra} sœurs dans le cercle</p>
        )}
      </section>
    );
  }

 /* ── Cercle vivant: médaillons en rond + carte au premier plan ── */
  return (
    <section
      ref={stageRef}
      aria-roledescription="carrousel"
      aria-label="Cercle Kènè — témoignages des sœurs qui tissent avant toi"
      className="relative"
      onPointerEnter={() => setHovering(true)} /* pause au survol */
      onPointerLeave={() => setHovering(false)}
    >
      {header}

      {/* Le rond des sœurs autour de la braise */}
      <div className="relative mx-auto mt-4 h-[290px] max-w-[420px] sm:h-[330px]">
        <Ember />
        {/* Cercle tissé qui tourne lentement (décoratif, transform GPU seul) */}
        <motion.svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-auto h-[78%] w-[78%]"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        >
          <circle cx="50" cy="50" r="48" fill="none" stroke="#C8951E" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
          <circle cx="50" cy="2" r="1.6" fill="#E3B04B" opacity="0.9" />
        </motion.svg>

        {shown.map((t, i) => {
          const m = medalOf(t.author);
          const a = ((-90 + i * 60) * Math.PI) / 180;
          const isFocus = i === focus;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                if (!isFocus) focusAt(i); // tap sur la sœur déjà affichée = simple pause
              }}
              aria-label={`Lire le témoignage de ${t.author}, ${t.city}${t.zone ? ` — ${t.zone}` : ""}${isFocus ? " (affichée)" : ""}`}
              aria-current={isFocus ? "true" : undefined}
              className="absolute flex h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 rounded-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              style={{
                left: `${50 + 36 * Math.cos(a)}%`,
                top: `${50 + 34 * Math.sin(a)}%`,
                zIndex: isFocus ? 20 : 10 - Math.min(i, 9),
                opacity: isFocus ? 1 : 0.62,
                transform: `translate(-50%, -50%) scale(${isFocus ? 1.14 : 0.94})`,
                transition: "transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.45s",
              }}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-[50px] w-[50px] place-items-center rounded-full font-heading text-[15px] font-black shadow-md",
                  isFocus && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
                style={{ backgroundColor: m.bg, color: m.fg }}
              >
                {initialsOf(t.author)}
              </span>
              <span className={cn("max-w-[76px] truncate text-[9px] font-semibold", isFocus ? "text-foreground" : "text-muted-foreground")}>
                {t.author.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* La carte au premier plan: la parole de la sœur attentive */}
      {focused && (
        <div
          role="group"
          aria-roledescription="diapositive"
          aria-label={`${Math.min(focus + 1, shown.length)} sur ${shown.length}`}
          className="relative min-h-[176px]"
        >
          <GlassCard className="rounded-[24px] p-4">
            <motion.div
              key={focused.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full font-heading text-sm font-black shadow"
                  style={{ backgroundColor: medalOf(focused.author).bg, color: medalOf(focused.author).fg }}
                >
                  {initialsOf(focused.author)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold leading-tight">{focused.author}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {focused.city}
                    {focused.zone ? ` · ${focused.zone}` : ""} · <span className="font-semibold text-gold-text">{focused.months} mois avec Kènè</span>
                  </p>
                </div>
                <StarsRow rating={focused.rating} />
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-foreground/90">{focused.text}</p>
              {focused.threads != null && focused.threads > 0 && (
                <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-bold text-gold-text">
                  <Star size={10} className="fill-gold text-gold" aria-hidden="true" />
                  {focused.threads} fils d&apos;or tissés
                </p>
              )}
            </motion.div>
          </GlassCard>
        </div>
      )}

      {/* Contrôles clavier/tactiles + compteur des sœurs non affichées */}
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Témoignage précédent"
          className="grid h-11 w-11 place-items-center rounded-full k-chip text-foreground/80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p aria-live="off" className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          {Math.min(focus + 1, shown.length)} / {shown.length}
          {extra > 0 && <span className="ml-1.5 font-normal">· +{extra} sœurs dans le cercle</span>}
        </p>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Témoignage suivant"
          className="grid h-11 w-11 place-items-center rounded-full k-chip text-foreground/80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
