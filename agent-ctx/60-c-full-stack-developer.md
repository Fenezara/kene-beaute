# Task ID: 60-c — full-stack-developer : favoris produits (wishlist) côté cliente

Contexte lu : worklog.md (t. 55 → 60-a — conventions tokens or/terre (jamais bleu/indigo), cibles ≥ 40 px, toasts sonner tutoiement FR, MotionConfig reducedMotion="user" global dans page.tsx, Lightning CSS strip backdrop-filter des custom rules → toujours doubler d'un utilitaire Tailwind backdrop-blur-*, périmètres des agents parallèles).

## Fichiers créés
- `src/store/favorites.ts` — store zustand + persist (localStorage **"kene-favorites"**), même pattern que kene-store (partialize explicite). API : `favs: string[]` (ids produits réels), `toggleFav(id): boolean` (retourne le NOUVEL état), `isFav(id): boolean` (lecture ponctuelle ; doc inline : rendu réactif → sélecteur dérivé `useFavorites((s) => s.favs.includes(id))`). Fichier séparé — `src/store/kene.ts` NON touché.
- `src/components/kene/client/FavButton.tsx` — composant 'use client' réutilisable :
  - **variant "card"** : pastille cœur absolue top-2 right-2 z-10, h-10 w-10 (≥ 40 px), verre bg-background/80 + **utilitaire Tailwind backdrop-blur-md** (règle t. 57) + rounded-full + shadow-sm, Heart lucide text-primary (or, zéro rouge), fill=currentColor si actif.
  - **variant "inline"** : h-12 w-full bordé, libellé « Ajouter aux favoris » / « Retirer des favoris ».
  - a11y : `aria-pressed` + `aria-label` dynamique (« Ajouter X aux favoris » / « Retirer X des favoris »), focus-visible outline-primary.
  - framer-motion : micro-bounce au toggle (remount `key` + spring 420/16 sur l'icône, whileTap) — automatiquement neutralisé sous prefers-reduced-motion (MotionConfig global page.tsx).
  - `stopPropagation` + `preventDefault` sur le clic (le cœur n'ouvre ni la fiche ni le double-tap panier) + `haptic(HAPTIC.light)`.
  - Toasts sonner : ajout → `toast.success("Ajouté à tes favoris 💛")` ; retrait → `toast("Retiré de tes favoris")` (discret).

## Fichiers modifiés (chirurgical — ShopScreen.tsx uniquement, aucun autre écran)
1. **Cœur sur chaque carte produit** : wrapper `div.relative` (key déplacée) autour du bouton-carte → FavButton **frère** du bouton (jamais de `<button>` imbriqué : HTML valide, focus/a11y propres) ; `block w-full` ajouté au bouton-carte pour le remplissage de colonne ; burst double-tap z-20 reste au-dessus du cœur z-10 ; cœur posé sur l'image carrée → ne déborde ni sur le prix ni sur le nom.
2. **Chip « ♥ Favoris »** dans la rangée de filtres : conteneur `role="tablist"` → `role="group" aria-label="Filtres de la boutique"`, chips catégories `role="tab" aria-selected` → `aria-pressed` (filtres cumulables : deux aria-selected simultanés = mensonger pour lecteurs d'écran ; l'ancien pattern n'avait ni tabpanel ni navigation clavier flèches). Badge count « Favoris · N » si ≥ 1, cœur rempli si actif, min-h-10, haptic(tap).
3. **Filtrage cumulable** : `filtered` = catégorie && favoris && recherche (deps + favOnly/favs) ; légende du Fil de Kente suffixée « · favoris ».
4. **États vides dédiés** (EmptyBlock) : 0 favori → « Aucun favori pour l'instant — Touche le cœur sur un soin pour le retrouver ici. » ; favoris existants mais sélection vide → « Aucun favori dans cette sélection » + CTA h-11 « Voir tous mes favoris » (reset cat + q). État vide standard inchangé.
5. **Fiche produit (Sheet)** : FavButton "inline" sous le bouton « Ajouter au panier » (primaire doré puis secondaire).

## Vérifications
- `bun run lint` → **0 problème**.
- `npx tsc --noEmit` → **0 erreur src/** (3 préexistantes hors périmètre examples/ + skills/, inchangées — connues des tâches 60-a/60-d).
- curl :3000 → 200 ; dev.log : compilations Turbopack propres (✓ Compiled), aucune erreur.
- Serveur :3000 non touché (ni dev, ni build, ni restart) ; agent-browser non utilisé ; pas de test ; pas de doc .md hors worklog/agent-ctx.
- Périmètre respecté : ShopScreen.tsx + 2 nouveaux fichiers — Onboarding/ClientApp/HomeScreen/ProfileScreen/api.ts NON touchés (agents i18n/PWA/rate-limit parallèles).

## Limites
- Favoris **par appareil** (POC localStorage, pas d'API ni DB — évolution naturelle : modèle Prisma Wishlist + route API, puis partage multi-appareils).
- Libellé retrait « Retirer des favoris » : correction volontaire de la coquille « Retiré » du brief (parallèle avec « Ajouter aux favoris ») ; l'aria-label reste « Retirer X des favoris » et le toast « Retiré de tes favoris » comme spécifiés.
