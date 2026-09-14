"use client";
// Kènè Cliente — bouton favori (wishlist) réutilisable.
// variant "card": pastille cœur en verre, superposée en absolu sur la carte produit.
// variant "inline": bouton pleine largeur avec libellé, dans la fiche produit.
// Identité or (text-primary), jamais de rouge standard. MotionConfig global
// (page.tsx, reducedMotion="user") ⇒ le micro-bounce respecte prefers-reduced-motion.
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { toast } from "sonner";
import { useFavorites } from "@/store/favorites";
import { HAPTIC, haptic } from "@/lib/kene/ux";

interface FavButtonProps {
  productId: string;
  productName: string;
  variant?: "card" | "inline";
  className?: string;
}

export function FavButton({ productId, productName, variant = "card", className = "" }: FavButtonProps) {
  // Sélecteur dérivé (booléen): re-render de CE bouton uniquement à son tour.
  const active = useFavorites((s) => s.favs.includes(productId));
  const toggleFav = useFavorites((s) => s.toggleFav);

  const onToggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Le cœur ne doit ni ouvrir la fiche produit ni déclencher le panier.
    e.stopPropagation();
    e.preventDefault();
    const nowActive = toggleFav(productId); // retourne le nouvel état
    haptic(HAPTIC.light);
    if (nowActive) toast.success("Ajouté à tes favoris 💛");
    else toast("Retiré de tes favoris");
  };

  const ariaLabel = active ? `Retirer ${productName} des favoris` : `Ajouter ${productName} aux favoris`;

  if (variant === "inline") {
    return (
      <motion.button
        type="button"
        onClick={onToggle}
        aria-pressed={active}
        aria-label={ariaLabel}
        whileTap={{ scale: 0.97 }}
        className={`h-12 w-full rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          active ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
        } ${className}`}
      >
        <Heart size={17} fill={active ? "currentColor" : "none"} aria-hidden="true" />
        {active ? "Retirer des favoris" : "Ajouter aux favoris"}
      </motion.button>
    );
  }

  // Pastille « card » — verre + blur natif Tailwind (cf. worklog: Lightning CSS
  // retire backdrop-filter des règles custom, on utilise l'utilitaire backdrop-blur-md).
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={ariaLabel}
      whileTap={{ scale: 0.82 }}
      className={`absolute top-2 right-2 z-10 grid place-items-center h-10 w-10 min-h-10 min-w-10 rounded-full bg-background/80 backdrop-blur-md shadow-sm text-primary focus-visible:outline-2 focus-visible:outline-primary ${className}`}
    >
      {/* Micro-bounce au toggle: remount via key → ressort léger (désactivé
 automatiquement si prefers-reduced-motion, via MotionConfig global). */}
      <motion.span
        key={active ? "on" : "off"}
        initial={{ scale: 0.55 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 16 }}
        className="grid place-items-center"
        aria-hidden="true"
      >
        <Heart size={18} fill={active ? "currentColor" : "none"} />
      </motion.span>
    </motion.button>
  );
}
