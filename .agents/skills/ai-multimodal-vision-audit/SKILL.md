---
name: ai-multimodal-vision-audit
description: Audit et optimisation des pipelines d'analyse visuelle et d'IA multimodale (Gemini 1.5/Flash, GPT-4o Vision, Claude 3.5 Sonnet) pour l'analyse dermatologique sur peaux noires et métissées (phototypes IV à VI).
---

# AI Multimodal Vision Audit — Standard Mondial 2026

Ce skill fournit les directives et les garde-fous pour auditer, concevoir et optimiser les flux de vision par intelligence artificielle multimodale appliqués au diagnostic cosmétique et dermo-cutané.

## 🎯 Piliers Fondamentaux

1. **Qualité et Étalonnage Colorimétrique des Peaux Mélanodermes** :
   - Éviter la surexposition ou la sous-exposition qui fausse l'analyse de l'hyperpigmentation.
   - Normalisation RGB / CIE Lab pour détecter fidèlement l'érythème et les taches post-inflammatoires.
   - Rejet automatique des photos floues ou sous-éclairées avant envoi à l'API LLM pour économiser les tokens.

2. **Garde-fous Cliniques & Déontologiques (Prompt Engineering Strict)** :
   - Strictement cantonner l'analyse aux allégations cosmétiques : uniformité du teint, éclat, texture, déshydratation de surface.
   - Interdiction absolue de poser un diagnostic médical de dermatose (mélanome, eczéma atopique sévère, kératose).
   - Recommandation systématique de consultation d'un médecin dermatologue en cas d'anomalie structurelle.

3. **Protection des Données Personnelles et Biométriques** :
   - Les photos ne doivent jamais être stockées en clair sans hachage ou chiffrement AES-256.
   - Consentement explicite conforme à la loi ivoirienne n°2013-450 et au RGPD avant toute prise de vue.
   - Purge automatique des flux temporaires en mémoire RAM.
