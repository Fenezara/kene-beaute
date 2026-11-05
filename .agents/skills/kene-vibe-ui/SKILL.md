---
name: kene-vibe-ui
description: Design System et standards d'ingénierie Frontend Luxe pour Kènè. Utiliser pour toute création de composant, page d'atterrissage, animation Framer Motion, micro-interactions tactiles et palette or Akan/Obsidian mélanoderme.
---

# Kènè Vibe-UI — Design System Luxe & Micro-Interactions

Ce skill fournit les directives strictes d'esthétique, d'animation et de design d'interaction pour le développement "vibecoding" sur **Kènè (Beauté Mélanoderme)**.

## 1. Direction Artistique & Palette Chromatique

Toute interface créée pour Kènè doit respirer le prestige, la science dermo-cosmétique et l'héritage d'Afrique de l'Ouest :

* **Obsidian & Deep Night** : `#0A0908`, `#121110`, `#1C1917` (fonds sombres, cartes contrastées, immersion).
* **Akan Gold Royal** :
  - Dégradé or impérial : `linear-gradient(135deg, #BF953F 0%, #FCF6BA 25%, #B38728 50%, #FBF5B7 75%, #AA771C 100%)`.
  - Bordures subtiles : `border-amber-500/20` ou `border-amber-400/30`.
  - Accents lumineux : `text-amber-300`, `shadow-[0_0_20px_rgba(191,149,63,0.25)]`.
* **Émeraude Botanique & Karité** : `#064E3B` (forêt tropicale), `#FDFBF7` (crème veloutée de karité, arrière-plans clairs haut de gamme).
* **Verre Fumé & Néomorphisme Tactile** :
  - `backdrop-blur-xl bg-stone-900/70 border border-stone-800/80 shadow-2xl`.

---

## 2. Principes d'Animation & Fluidité (Framer Motion / Tailwind)

1. **Staggered Reveals** :
   Toujours animer les éléments d'une grille ou d'une liste de manière décalée (staggerChildren: 0.08s).
   ```tsx
   const containerVariants = {
     hidden: { opacity: 0 },
     visible: {
       opacity: 1,
       transition: { staggerChildren: 0.08, delayChildren: 0.1 }
     }
   };
   const itemVariants = {
     hidden: { opacity: 0, y: 15 },
     visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }
   };
   ```

2. **Micro-interactions Tactiles** :
   - Boutons : `whileHover={{ scale: 1.02, filter: "brightness(1.08)" }} whileTap={{ scale: 0.98 }}`.
   - Haptic Feedback visuel : léger halo doré ou onde subtile à la pression.

3. **Parallaxe & Profondeur** :
   Privilégier les superpositions douces (photographies haute résolution, textures botaniques de fond floutées, glow diffus) au détriment de mesh 3D filaires ou low-poly bruts non texturés.

---

## 3. Composants Types à Privilégier

* **Bento Grid Dermo-Cosmétique** : Grandes cartes asymétriques avec coins très arrondis (`rounded-3xl` ou `rounded-2xl`), badges en pilule avec icones micro-dorées.
* **Before / After Tactile Slider** : Curseur fluide avec ligne dorée séparatrice et labels flottants "Avant" / "Après".
* **KPI Numbers** : Compteurs animés avec typography serif élégante (Playfair Display / Cinzel) combinée à une typographie sans-serif ultra-propre (Plus Jakarta Sans / Inter).
