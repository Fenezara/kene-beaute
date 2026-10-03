"use client";
// Kènè — La Boussole Dermo-Botanique d'Afrique:
// Explorateur interactif des terroirs et trésors de la pharmacopée africaine.
// Permet aux clientes de comprendre les actifs millénaires formulés dans leurs soins
// (Karité de Korhogo, Bissap du Sine-Saloum, Baobab de Casamance, Moringa d'Assinie, Cacao de Soubré).

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  MapPin,
  CheckCircle2,
  ChevronRight,
  X,
  Droplets,
  Shield,
  Sun,
  Flame,
  ShoppingBag,
} from "lucide-react";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import {
  BissapFlowerIcon,
  CacaoPodIcon,
  CauriIcon,
  KariteIcon,
  BaobabIcon,
  MoringaIcon,
  DuafeIcon,
} from "@/components/kene/icons";
import { useKene } from "@/store/kene";
import { cn } from "@/lib/utils";

export interface BotanicalPlant {
  id: string;
  name: string;
  scientificName: string;
  terroir: string;
  country: string;
  virtue: string;
  action: string;
  activeCompounds: string;
  ancestralSecret: string;
  skinTypes: string[];
  color: string;
  accentColor: string;
  Icon: React.ComponentType<{ className?: string; size?: number }>;
}

export const SACRED_BOTANICALS: BotanicalPlant[] = [
  {
    id: "karite",
    name: "Karité Sauvage",
    scientificName: "Vitellaria paradoxa",
    terroir: "Savanes de Korhogo",
    country: "Côte d'Ivoire",
    virtue: "Barrière Lipidique & Nutrition",
    action: "Répare et scelle l'hydratation des peaux mélanodermes sans effet occlusif lourd.",
    activeCompounds: "Acides stéarique & oléique, alcools triterpéniques anti-inflammatoires.",
    ancestralSecret: "Récolté par les femmes au lever de l'aurore, le beurre est baraté à la main pour préserver son insaponifiable actif intact.",
    skinTypes: ["Peaux sèches", "Sensibles", "Harmattan"],
    color: "#C8951E",
    accentColor: "rgba(200,149,30,0.15)",
    Icon: KariteIcon,
  },
  {
    id: "bissap",
    name: "Bissap Royal",
    scientificName: "Hibiscus sabdariffa",
    terroir: "Terres rouges du Sine-Saloum",
    country: "Sénégal",
    virtue: "Éclat Royal & Peeling Doux",
    action: "Révèle la luminosité naturelle et unifie les zones hyperpigmentées grâce à ses AHA végétaux.",
    activeCompounds: "Acides hibiscique & citrique, anthocyanes antioxydantes puissantes.",
    ancestralSecret: "Infusé à froid dans les rituels de mariage pour donner un éclat pourpre et radiant au teint des futures mariées.",
    skinTypes: ["Teint terne", "Taches pigmentaires", "Mixtes"],
    color: "#8B1A3B",
    accentColor: "rgba(139,26,59,0.15)",
    Icon: BissapFlowerIcon,
  },
  {
    id: "baobab",
    name: "Gousse de Baobab",
    scientificName: "Adansonia digitata",
    terroir: "Forêts sacrées de Casamance",
    country: "Sénégal",
    virtue: "Fermeté & Énergie Cellulaire",
    action: "Stimule la synthèse de collagène et protège des radicaux libres urbains.",
    activeCompounds: "Vitamine C pure (6x plus que l'orange), calcium, acides aminés.",
    ancestralSecret: "Surnommé l'Arbre de Vie, son fruit appelé 'pain de singe' est un élixir de longévité utilisé en masque tenseur par les aïeules.",
    skinTypes: ["Tous phototypes", "Perte d'élasticité", "Fatigue"],
    color: "#A0522D",
    accentColor: "rgba(160,82,45,0.15)",
    Icon: BaobabIcon,
  },
  {
    id: "moringa",
    name: "Moringa Pur",
    scientificName: "Moringa oleifera",
    terroir: "Bordures lagunaires d'Assinie",
    country: "Côte d'Ivoire",
    virtue: "Détoxification & Pureté",
    action: "Désincruste les microparticules et régule l'excès de sébum sous climat tropical.",
    activeCompounds: "Chlorophylle naturelle, zéatine réparatrice, 46 antioxydants.",
    ancestralSecret: "Les feuilles pilées avec un soupçon de kaolin servaient de cataplasme purifiant pour assainir les imperfections sans assécher.",
    skinTypes: ["Peaux grasses", "Imperfections", "Pores visibles"],
    color: "#3F7D3F",
    accentColor: "rgba(63,125,63,0.15)",
    Icon: MoringaIcon,
  },
  {
    id: "cacao",
    name: "Cacao d'Or de Soubré",
    scientificName: "Theobroma cacao",
    terroir: "Boucle du Cacao de Soubré",
    country: "Côte d'Ivoire",
    virtue: "Élasticité & Velouté",
    action: "Offre un bouclier lipidique souple et velouté qui sublime les reflets des carnations sombres.",
    activeCompounds: "Polyphénols nobles, théobromine raffermissante, vitamine E naturelle.",
    ancestralSecret: "La fève pressée à chaud libère une liqueur d'or brun appliquée en massage ancestral pour préserver l'élasticité ventrale.",
    skinTypes: ["Peaux déshydratées", "Vergetures", "Corps & Visage"],
    color: "#DCA838",
    accentColor: "rgba(220,168,56,0.15)",
    Icon: CacaoPodIcon,
  },
];

export function BotanicalCompass({ className = "" }: { className?: string }) {
  const [selected, setSelected] = useState<BotanicalPlant | null>(null);
  const setClientTab = useKene((s) => s.setClientTab);

  function openPlant(p: BotanicalPlant) {
    haptic(HAPTIC.tap);
    setSelected(p);
  }

  function closePlant() {
    haptic(HAPTIC.light);
    setSelected(null);
  }

  function goToShop() {
    haptic(HAPTIC.success);
    setSelected(null);
    setClientTab("boutique");
  }

  return (
    <section aria-label="Boussole Dermo-Botanique d'Afrique" className={cn("relative w-full", className)}>
      {/* En-tête de la section */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="grid place-items-center h-7 w-7 rounded-lg bg-primary/15 text-primary">
            <CauriIcon size={16} />
          </span>
          <div>
            <h3 className="font-heading font-black text-sm tracking-tight text-foreground">
              Boussole Dermo-Botanique
            </h3>
            <p className="text-[10.5px] text-muted-foreground">
              Les trésors d&apos;Afrique formulés pour ta peau
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#C8951E] bg-[#C8951E]/10 px-2 py-0.5 rounded-full">
          Terroirs Nobles
        </span>
      </div>

      {/* Carrousel des plantes sacrées */}
      <div className="flex gap-3 overflow-x-auto pretty-scroll pb-2 pt-1 -mx-3 px-3 sm:mx-0 sm:px-0">
        {SACRED_BOTANICALS.map((p) => {
          const Icon = p.Icon;
          return (
            <motion.button
              key={p.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => openPlant(p)}
              className="shrink-0 w-[155px] sm:w-[170px] text-left rounded-[22px] k-card k-card-hover p-3.5 relative overflow-hidden flex flex-col justify-between group focus-visible:outline-2 focus-visible:outline-primary border border-border/80"
              style={{ minHeight: "150px" }}
            >
              {/* Filigrane d'accent coloré */}
              <div
                className="absolute -right-4 -bottom-4 size-20 rounded-full blur-xl pointer-events-none opacity-40 transition-opacity group-hover:opacity-70"
                style={{ backgroundColor: p.color }}
              />

              {/* Icône & Terroir */}
              <div className="flex items-start justify-between">
                <span
                  className="grid place-items-center size-10 rounded-2xl transition-transform group-hover:scale-105 shadow-sm"
                  style={{ backgroundColor: p.accentColor, color: p.color }}
                >
                  <Icon size={20} />
                </span>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-0.5">
                  <MapPin size={9} /> {p.country.slice(0, 7)}
                </span>
              </div>

              {/* Titre & Vertu */}
              <div className="mt-2.5">
                <p className="font-heading font-black text-[13.5px] leading-tight text-foreground">
                  {p.name}
                </p>
                <p className="text-[10px] font-semibold text-primary mt-0.5 line-clamp-1">
                  {p.virtue}
                </p>
                <p className="text-[9.5px] text-muted-foreground mt-1 line-clamp-2 leading-snug">
                  {p.action}
                </p>
              </div>

              {/* Micro-CTA d'ouverture */}
              <span className="mt-2 text-[9px] font-bold text-muted-foreground group-hover:text-foreground flex items-center gap-0.5 transition-colors">
                Explorer le secret <ChevronRight size={10} />
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Fiche Rituelle & Popover Modal (Secret Ancestral) */}
      <AnimatePresence>
        {selected && (
          <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-[#120E0A]/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              transition={{ type: "spring", stiffness: 350, damping: 26 }}
              className="relative w-full max-w-md rounded-[28px] k-card kaolin-card p-5 sm:p-6 shadow-2xl overflow-hidden text-left"
            >
              {/* Bouton de fermeture */}
              <button
                onClick={closePlant}
                className="absolute top-4 right-4 size-9 rounded-full bg-muted/60 hover:bg-muted text-foreground grid place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-primary"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>

              {/* En-tête de la plante */}
              <div className="flex items-center gap-3.5 pr-8">
                <span
                  className="grid place-items-center size-14 rounded-2xl shrink-0 shadow-md"
                  style={{ backgroundColor: selected.accentColor, color: selected.color }}
                >
                  <selected.Icon size={28} />
                </span>
                <div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                    <MapPin size={10} /> {selected.terroir} ({selected.country})
                  </span>
                  <h4 className="font-heading font-black text-xl text-foreground leading-tight">
                    {selected.name}
                  </h4>
                  <p className="text-xs italic text-muted-foreground">{selected.scientificName}</p>
                </div>
              </div>

              {/* Vertu & Action Cutanée */}
              <div className="mt-4 p-3.5 rounded-2xl bg-primary/10 border border-primary/20">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Sparkles size={13} className="text-primary" /> {selected.virtue}
                </p>
                <p className="text-[11.5px] text-muted-foreground mt-1 leading-relaxed">
                  {selected.action}
                </p>
              </div>

              {/* Le Secret des Grandes-Mères (Héritage Oral) */}
              <div className="mt-3.5 space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#C8951E] flex items-center gap-1">
                  <DuafeIcon size={12} /> Le Secret des Grandes-Mères
                </p>
                <p className="text-[11.5px] leading-relaxed text-foreground/85 italic bg-[#C8951E]/5 p-3 rounded-xl border border-[#C8951E]/20">
                  « {selected.ancestralSecret} »
                </p>
              </div>

              {/* Molécules Clés & Types de Peau */}
              <div className="mt-3.5 flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] font-bold text-muted-foreground mr-1">Idéal pour :</span>
                {selected.skinTypes.map((st) => (
                  <span
                    key={st}
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground"
                  >
                    {st}
                  </span>
                ))}
              </div>

              {/* Bouton vers la boutique */}
              <div className="mt-5 flex items-center gap-2 pt-3 border-t border-border/60">
                <button
                  onClick={goToShop}
                  className="flex-1 h-11 rounded-2xl k-btn-gold text-primary-foreground font-bold text-xs flex items-center justify-center gap-2 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <ShoppingBag size={14} /> Découvrir les soins formulés
                </button>
                <button
                  onClick={closePlant}
                  className="h-11 px-4 rounded-2xl border border-border text-foreground font-semibold text-xs hover:bg-muted/50 transition-colors"
                >
                  Compris
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
