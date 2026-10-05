"use client";
// Kènè — la barre du Pouce d'Or: les actions primaires de l'écran
// ramenées dans la zone du pouce, collées au-dessus de la nav mobile.
// • Accueil → « Scanner ma peau » (or) + « Dr Kènè »
// • Profil → « Mon passeport de peau » + « Herbier »
// Boutique: sa propre barre panier collante — aucune barre ici, on
// ne double pas le chrome. Diagnostic / RDV / Dr Kènè: CTAs déjà en bas
// d'écran. Réglage: Paramètres → Pouce d'Or (défaut: téléphone = activé).
// Sticky dans le flux de scroll (même pattern que la barre panier): rien
// n'est jamais recouvert en fin de page.
import { useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Leaf, MessageCircle, QrCode } from "lucide-react";
import { openHerbier } from "@/components/kene/herbier/Herbier";
import { NeaOnnimIcon } from "@/components/kene/icons";
import { getThumbMode, subscribeThumbMode } from "@/lib/kene/thumb-mode";
import { HAPTIC, haptic } from "@/lib/kene/ux";
import { useKene } from "@/store/kene";

function useThumbMode(): boolean {
  return useSyncExternalStore(subscribeThumbMode, getThumbMode, () => false);
}

/** La barre — rendue par ClientApp juste sous le contenu de l'onglet. */
export function ThumbBar({ tab }: { tab: string }) {
  const enabled = useThumbMode();
  const setClientTab = useKene((s) => s.setClientTab);
  // Pour le MVP épuré : désactivé afin de ne pas masquer le contenu ni entrer en conflit avec la barre de navigation du bas
  const visible = false;

  const goScan = () => {
    haptic(HAPTIC.light);
    setClientTab("diagnostic");
  };
  const goChat = () => {
    haptic(HAPTIC.tap);
    setClientTab("chat");
  };
  const goPassport = () => {
    haptic(HAPTIC.tap);
    document.getElementById("kene-passport")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const goHerbier = () => {
    haptic(HAPTIC.tap);
    openHerbier();
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ y: 84, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 84, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="sticky bottom-[calc(88px+env(safe-area-inset-bottom,0px))] z-30 mt-3 md:hidden"
        >
          <div
            role="group"
            aria-label="Pouce d'Or — actions de l'écran à portée de pouce"
            className="k-chrome flex items-center gap-2 rounded-[24px] p-2 shadow-lg"
          >
            {tab === "accueil" ? (
              <>
                <button
                  type="button"
                  onClick={goScan}
                  className="k-cta flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] px-3 text-[13px] font-bold text-[#FFF9EC] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <NeaOnnimIcon size={18} />
                  <span className="truncate">Scanner ma peau</span>
                </button>
                <button
                  type="button"
                  onClick={goChat}
                  aria-label="Discuter avec Dermo Kènè"
                  className="k-chip flex h-12 shrink-0 items-center gap-1.5 rounded-[18px] px-3.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <MessageCircle size={16} className="text-primary" aria-hidden="true" />
                  <span className="truncate">Dermo Kènè</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={goPassport}
                  className="k-chip flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] px-3 text-[12.5px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <QrCode size={16} className="text-primary" aria-hidden="true" />
                  <span className="truncate">Mon passeport de peau</span>
                </button>
                <button
                  type="button"
                  onClick={goHerbier}
                  aria-label="Ouvrir l'Herbier des Grandes-Mères"
                  className="k-chip flex h-12 shrink-0 items-center gap-1.5 rounded-[18px] px-3.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <Leaf size={16} className="text-primary" aria-hidden="true" />
                  <span className="truncate">Herbier</span>
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
