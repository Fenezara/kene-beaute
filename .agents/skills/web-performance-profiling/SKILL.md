---
name: web-performance-profiling
description: Optimisation de performance web extrême 2026. Core Web Vitals (INP, LCP, CLS), analyse du heap mémoire, tree-shaking, streaming SSR, Edge caching Redis et réduction du TTFB à moins de 80ms.
---

# Extreme Web Performance & Profiling (2026 Edition)

Ce skill pousse les métriques de rapidité de chargement et de réactivité d'interface aux limites physiques du web.

## 1. Objectifs Core Web Vitals 2026

- **INP (Interaction to Next Paint)** : < 100ms (fluidité absolue lors du clic, du tap ou de la saisie).
- **LCP (Largest Contentful Paint)** : < 1.2s sur réseau 4G mobile.
- **CLS (Cumulative Layout Shift)** : 0.00 (zéro saut d'interface au chargement des images ou polices).
- **TTFB (Time to First Byte)** : < 80ms via Edge caching et SSR optimisé.

---

## 2. Techniques d'Ingénierie Frontend & Bundle Splitting

1. **Next.js Server Components & Islands** :
   - Garder 90% des pages en Server Components statiques ou streamés.
   - N'utiliser `"use client"` que pour les composants interactifs stricts (sliders, boutons tactiles, modals).
2. **Polices & Images Ultra-Compressées** :
   - Polices auto-hébergées avec format variable WOFF2 et `font-display: swap`.
   - Images servies en AVIF / WebP de dernière génération avec `priority` sur le héros et `sizes` adaptatif.
3. **Prévention des Fuites Mémoire (Memory Leaks)** :
   - Nettoyage rigoureux des `eventListeners`, des `setInterval` et des abonnements d'état dans le callback retour de `useEffect`.

---

## 3. Caching Multi-Niveaux

- **Niveau 1 (Browser)** : Cache-Control immuable (`max-age=31536000, immutable`) pour tous les assets hashés.
- **Niveau 2 (Edge CDN / Reverse Proxy)** : Mise en cache des pages de salons et routines publiques avec invalidation par tag (`revalidateTag`).
- **Niveau 3 (Database Query Cache)** : Caching en mémoire Redis des requêtes répétitives (ex: liste des catégories de soins, taux de conversion de devises).
