"use client";
// Kènè — Constellation Adinkra (t. 83-e, vague 3) : pendant que l'IA analyse,
// le ciel nocturne de Kènè assemble sa constellation rituelle. Chaque étape
// franchie allume une étoile ; un fil d'or se tend entre les étoiles ; quand
// le protocole est constitué, l'emblème Nea Onnim se révèle au centre — le
// rituel s'achève sur la signature de la maison.
// Panneau DÉCORATIF (aria-hidden) : la liste des étapes en dessous reste le
// contrat d'accessibilité. Zéro 3D (pas de canvas en concurrence avec le
// scanline de la photo) — SVG + framer-motion, offline-friendly.
import { motion, useReducedMotion } from "framer-motion";
import { NeaOnnimIcon } from "@/components/kene/icons";

export interface AdinkraSkyProps {
  /** nombre d'étapes franchies (0 → total) */
  checked: number;
  /** nombre total d'étapes */
  total: number;
}

/** Étoiles des étapes — arc composé (bas gauche → sommet → bas droite). */
const STEP_STARS = [
  { x: 58, y: 118 },
  { x: 150, y: 50 },
  { x: 242, y: 106 },
];

/** Micro-étoiles de fond — positions fixes : rendu déterministe, zéro
 *  divergence d'hydratation, scintillement lent (transform/opacity GPU). */
const BG_STARS: { x: number; y: number; r: number }[] = [
  { x: 24, y: 22, r: 1.1 },
  { x: 71, y: 44, r: 0.8 },
  { x: 118, y: 18, r: 1.3 },
  { x: 178, y: 92, r: 0.9 },
  { x: 205, y: 26, r: 1.0 },
  { x: 262, y: 58, r: 1.2 },
  { x: 284, y: 132, r: 0.8 },
  { x: 96, y: 140, r: 1.0 },
  { x: 38, y: 88, r: 0.9 },
  { x: 136, y: 128, r: 0.7 },
  { x: 232, y: 148, r: 1.1 },
  { x: 12, y: 132, r: 0.8 },
  { x: 168, y: 62, r: 0.7 },
  { x: 252, y: 20, r: 0.9 },
];

/** Étoile à 4 branches — éclat de diamant (fill hérité du <g> parent). */
function starD(x: number, y: number, s: number): string {
  const k = s * 0.28;
  return `M${x},${y - s}L${x + k},${y - k}L${x + s},${y}L${x + k},${y + k}L${x},${y + s}L${x - k},${y + k}L${x - s},${y}L${x - k},${y - k}Z`;
}

export function AdinkraSky({ checked, total }: AdinkraSkyProps) {
  const reduce = useReducedMotion();
  const complete = total > 0 && checked >= total;
  const gold = "#C8951E";
  const bright = "#E3B04B";

  return (
    <div
      aria-hidden="true"
      className="relative h-[168px] w-full select-none overflow-hidden rounded-[22px] ring-1 ring-[#C8951E]/25"
    >
      {/* Ciel de nuit Kènè */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#241A10_0%,#1A1410_58%,#150F0B_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(70%_90%_at_50%_108%,rgba(200,149,30,0.16),transparent_70%)]" />
      {/* Halo central quand la constellation s'assemble */}
      <motion.div
        initial={false}
        animate={{ opacity: complete ? 1 : 0 }}
        transition={{ duration: 0.9 }}
        className="absolute inset-0 bg-[radial-gradient(45%_60%_at_50%_50%,rgba(200,149,30,0.22),transparent_75%)]"
      />

      <svg viewBox="0 0 300 170" className="absolute inset-0 h-full w-full">
        {/* Micro-étoiles scintillantes */}
        {BG_STARS.map((s, i) => (
          <motion.circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="#F8F1E4"
            initial={{ opacity: 0.3 }}
            animate={reduce ? { opacity: 0.5 } : { opacity: [0.22, 0.85, 0.22] }}
            transition={
              reduce
                ? { duration: 0.3 }
                : { duration: 2.6 + (i % 5) * 0.55, repeat: Infinity, ease: "easeInOut", delay: (i % 7) * 0.35 }
            }
          />
        ))}

        {/* Fils d'or entre les étoiles — se tendent au fil des étapes franchies */}
        {STEP_STARS.slice(0, -1).map((a, i) => {
          const b = STEP_STARS[i + 1];
          const tied = i < checked;
          return (
            <motion.line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={gold}
              strokeWidth={0.9}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: tied ? 1 : 0, opacity: tied ? 0.85 : 0 }}
              transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}

        {/* Les étoiles des étapes : éteinte → palpitante (active) → allumée */}
        {STEP_STARS.map((st, i) => {
          const done = i < checked;
          const active = i === checked && !complete;
          const fill = done ? bright : active ? gold : "#6B5B41";
          return (
            <g key={i} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
              <motion.circle
                cx={st.x}
                cy={st.y}
                r={done ? 11 : active ? 13 : 8}
                fill={done || active ? gold : "#8D7A5A"}
                initial={{ opacity: 0.1 }}
                animate={
                  active && !reduce
                    ? { opacity: [0.14, 0.4, 0.14], scale: [1, 1.22, 1] }
                    : { opacity: done ? 0.3 : 0.1, scale: 1 }
                }
                transition={
                  active && !reduce
                    ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.5 }
                }
              />
              <motion.g
                fill={fill}
                initial={{ opacity: 0.45, scale: 1 }}
                animate={
                  active && !reduce
                    ? { scale: [1, 1.22, 1], opacity: [0.75, 1, 0.75] }
                    : { scale: 1, opacity: done ? 1 : active ? 0.9 : 0.45 }
                }
                transition={
                  active && !reduce
                    ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.5 }
                }
              >
                <path d={starD(st.x, st.y, done || active ? 7.5 : 5.5)} />
              </motion.g>
              {/* Rayon de lumière pour l'étoile active */}
              {active && !reduce && (
                <motion.line
                  x1={st.x}
                  y1={st.y - 22}
                  x2={st.x}
                  y2={st.y - 12}
                  stroke={gold}
                  strokeWidth={0.8}
                  strokeLinecap="round"
                  animate={{ opacity: [0, 0.8, 0] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* L'emblème Nea Onnim se révèle quand le rituel s'assemble */}
      <motion.div
        initial={false}
        animate={{ opacity: complete ? 0.3 : 0, scale: complete ? 1 : 0.94 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        className="absolute inset-0 grid place-items-center"
      >
        <NeaOnnimIcon size={86} className="text-[#C8951E] drop-shadow-[0_0_14px_rgba(227,176,75,0.45)]" />
      </motion.div>

      {/* Légende du ciel */}
      <div className="absolute inset-x-0 bottom-1.5 flex justify-center">
        <motion.p
          key={complete ? "done" : "pending"}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-full bg-[#1A1410]/70 px-3 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[#F8F1E4]/60 backdrop-blur-[2px]"
        >
          {complete ? "La constellation de Kènè s'est assemblée" : "Le rituel s'écrit dans le ciel"}
        </motion.p>
      </div>
    </div>
  );
}
