"use client";
// Kènè — Rituel Botanique Parallaxe Cinématique & Ingrédients Sacrés
// Animation cinématique purement CSS & Framer-Motion (0 polygone, 100% textures réelles et fluides).

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Sparkles, Droplets, ShieldCheck, Heart } from "lucide-react";

interface BotanicalIngredient {
  name: string;
  botanical: string;
  origin: string;
  benefit: string;
  badge: string;
  image: string;
  tag: string;
}

const INGREDIENTS: BotanicalIngredient[] = [
  {
    name: "Karité Brut Sauvage",
    botanical: "Vitellaria paradoxa",
    origin: "Savanes de Korhogo · Côte d'Ivoire",
    benefit: "Répare et scelle la barrière lipidique sans obstruer les pores. Riche en acides stéarique et oléique.",
    badge: "Protection Solaire & Lipidique",
    image: "/products/baume-karite.webp",
    tag: "Or Blanc des Savanes",
  },
  {
    name: "Huile Pure de Balanites",
    botanical: "Balanites aegyptiaca",
    origin: "Sahel Ouest-Africain",
    benefit: "Régulation séborrhéique foudroyante et atténuation des taches cicatricielles post-acné (HPI).",
    badge: "Anti-Taches & Séborégulateur",
    image: "/products/huile-baobab.webp",
    tag: "Dattier du Désert",
  },
  {
    name: "Extrait Actif de Moringa",
    botanical: "Moringa oleifera",
    origin: "Vallée du Bandama",
    benefit: "Bouclier antioxydant surpuissant contre la pollution urbaine et l'inflammation cutanée.",
    badge: "Antioxydant 99% Actif",
    image: "/products/serum-moringa.webp",
    tag: "Arbre de Vie",
  },
  {
    name: "Nectar Pur de Bissap",
    botanical: "Hibiscus sabdariffa",
    origin: "Régions Soudano-Sahéliennes",
    benefit: "Micro-exfoliation enzymatique ultra-douce aux acides de fruits naturels, sans agresser la mélanine.",
    badge: "Éclat & Acides de Fruits Doux",
    image: "/products/gommage-bissap.webp",
    tag: "Fleur Royale",
  },
];

export function BotanicalParallaxShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const y1 = useTransform(scrollYProgress, [0, 1], [-20, 20]);
  const y2 = useTransform(scrollYProgress, [0, 1], [30, -30]);

  return (
    <div ref={containerRef} className="relative w-full py-6 sm:py-10">
      {/* En-tête éditorial cinématographique */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/45 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-gold-text">
            <Sparkles size={13} />
            <span>Pharmacopée Africaine &amp; Science Moderne</span>
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-black text-foreground mt-2 tracking-tight">
            Les Trésors Botaniques Purs au Cœur de Votre Ordonnance
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-2xl leading-relaxed">
            Chaque formule Kènè exclut radicalement les décapants chimiques pour nourrir, réparer et magnifier le film hydrolipidique des carnations riches en mélanine.
          </p>
        </div>
      </div>

      {/* Grille cinématique interactive 4 Ingrédients */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {INGREDIENTS.map((item, idx) => {
          const isEven = idx % 2 === 0;
          return (
            <motion.div
              key={item.name}
              style={{ y: isEven ? y1 : y2 }}
              whileHover={{ y: -6, transition: { duration: 0.25 } }}
              className="group relative flex flex-col justify-between overflow-hidden rounded-[26px] border border-gold/35 bg-gradient-to-b from-card/95 via-card/80 to-[#140E08]/15 p-5 shadow-lg transition-all duration-300 hover:border-gold/70 hover:shadow-2xl hover:shadow-gold/15"
            >
              {/* Image produit / flacon avec zoom cinématique doux au survol */}
              <div className="relative h-44 sm:h-48 w-full overflow-hidden rounded-2xl bg-gradient-to-t from-black/40 via-transparent to-transparent flex items-center justify-center p-3">
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-auto max-w-[85%] object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.4)] transition-transform duration-500 ease-out group-hover:scale-108"
                />
                <span className="absolute top-2.5 left-2.5 rounded-full bg-black/65 backdrop-blur-md px-2.5 py-0.5 text-[9.5px] font-bold text-gold-text border border-gold/30">
                  {item.tag}
                </span>
              </div>

              {/* Contenu textuel & bénéfices dermatologiques */}
              <div className="mt-4 flex-1 flex flex-col justify-between space-y-2">
                <div>
                  <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                    <span className="italic">{item.botanical}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">100% Pur</span>
                  </div>
                  <h3 className="font-heading text-base font-black text-foreground group-hover:text-gold-text transition-colors mt-0.5">
                    {item.name}
                  </h3>
                  <p className="text-[10px] font-medium text-gold-text flex items-center gap-1 mt-0.5">
                    📍 {item.origin}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {item.benefit}
                  </p>
                </div>

                {/* Badge d'action cutanée */}
                <div className="pt-2 border-t border-border/60">
                  <span className="inline-block rounded-xl bg-gold/15 border border-gold/30 px-2.5 py-1 text-[10px] font-bold text-foreground">
                    {item.badge}
                  </span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
