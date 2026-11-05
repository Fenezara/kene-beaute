---
name: motion-physics-animator
description: Standards d'animation 60fps pour GSAP, Framer Motion, Lenis scroll, parallaxe et transitions de pages. À utiliser pour animer les interfaces sans saccade, créer du scroll inertiel et fluidifier les micro-interactions.
---

# Motion Physics & 60fps Animation

Guide d'ingénierie d'animation pour garantir des transitions soyeuses, sans jank (mouvements saccadés), respectant les contraintes des écrans mobiles à 120Hz et des navigateurs basse consommation.

## 1. Règles d'Or des Performances d'Animation
- **Animer UNIQUEMENT `transform` et `opacity`** : Ne jamais animer `top`, `left`, `width`, `height`, ni `margin` (déclenchent un reflow/repaint coûteux du CPU).
- Utiliser la propriété CSS `will-change: transform` sur les éléments animés au scroll avec parcimonie.
- Respecter les préférences utilisateur : toujours ajouter un check `prefers-reduced-motion`.

## 2. Courbes de Bézier "Luxury Vibe" (Easing)
Pour donner un aspect haut de gamme digne d'Apple ou de marques de luxe :
- **Entrée fluide & décélération douce** : `cubic-bezier(0.16, 1, 0.3, 1)` (ou `easeOutExpo`).
- **Ressort tactile (Spring)** : `stiffness: 300, damping: 25, mass: 0.8`.

## 3. Parallaxe Botanique & Scroll Inertiel
- Utiliser un facteur de parallaxe compris entre `0.1` et `0.3` pour garder la lisibilité du texte.
- Lier les calculs à `requestAnimationFrame` ou au hook `useScroll` de Framer Motion.
