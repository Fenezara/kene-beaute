---
name: wcag-accessibility-audit
description: Accessibilité universelle et conformité WCAG 2.1 AA/AAA 2026. Navigation clavier intégrale, sémantique ARIA irréprochable, contrastes adaptatifs et compatibilité lecteurs d'écran.
---

# Universal Accessibility (WCAG 2.1 AA/AAA) & Ergonomics

Ce skill garantit que l'application est accessible à tous les utilisateurs sans exception, y compris les personnes malvoyantes, daltoniennes ou naviguant exclusivement au clavier.

## 1. Standards Clés d'Accessibilité

1. **Navigation Clavier Complète & Focus Trap** :
   - Tout élément interactif (bouton, lien, slider, modal) doit être accessible avec la touche `Tab`.
   - L'indicateur de focus (`focus-visible`) doit être clairement visible (ex: anneau or discret `focus-visible:ring-2 focus-visible:ring-amber-400`).
   - Lorsqu'une modale (ex: diagnostic de peau) s'ouvre, le focus doit être piégé à l'intérieur et la touche `Escape` doit la fermer immédiatement.
2. **Contraste des Couleurs** :
   - Ratio de contraste minimal de **4.5:1** pour le texte normal et **3:1** pour les grands textes par rapport à la couleur d'arrière-plan (Obsidian ou Crème de karité).
3. **Sémantique & Rôles ARIA** :
   - Les boutons avec icones seules doivent impérativement comporter un `aria-label="Description de l'action"`.
   - Utiliser les balises HTML5 natives (`<main>`, `<nav>`, `<header>`, `<article>`, `<aside>`) plutôt que des `<div>` imbriquées.
   - Les messages d'erreur de formulaire doivent être associés via `aria-describedby` et annoncés vocalement via `role="alert"`.
