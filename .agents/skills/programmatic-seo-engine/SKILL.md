---
name: programmatic-seo-engine
description: Génération et optimisation de pages de contenu géolocalisées et thématiques pour le référencement naturel (SEO) sur les soins dermo-cosmétiques, les instituts de beauté et les routines pour peaux noires.
---

# Programmatic SEO Engine

Ce skill structure le référencement naturel haute performance pour acquérir du trafic organique qualifié.

## 1. Modèles de Pages Géolocalisées & Thématiques
- **Structure URL** : `/soins/[ville]/[quartier]/[specialite]` ou `/routine/[probleme-cutane]/[phototype]`
  - *Exemples* :
    - `/instituts/abidjan/cocody/soin-anti-hyperpigmentation`
    - `/dermo/taches-brunes/phototype-vi`

## 2. Balisage Schema.org JSON-LD Obligatoire
Chaque page générée doit inclure le micro-format Google pour être éligible aux Rich Snippets :
```json
{
  "@context": "https://schema.org",
  "@type": "BeautySalon",
  "name": "Nom du Salon Partenaire Kènè",
  "image": "https://kene-beaute.com/images/salon.jpg",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Abidjan",
    "addressRegion": "Cocody",
    "addressCountry": "CI"
  },
  "priceRange": "$$"
}
```

## 3. Optimisation Core Web Vitals
- Score PageSpeed mobile > 90.
- `priority` sur la première image LCP au-dessus de la ligne de flottaison.
