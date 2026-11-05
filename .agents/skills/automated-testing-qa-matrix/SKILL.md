---
name: automated-testing-qa-matrix
description: Stratégie de tests logiciels automatisés 2026. Vitest, Playwright E2E, TDD systématique, Contract Testing, mocking d'API et mutation testing pour zéro régression.
---

# Automated Testing & QA Matrix (2026 Edition)

Ce skill implémente la pyramide de tests moderne pour garantir qu'aucune mise à jour de code ne casse les fonctionnalités existantes.

## 1. La Pyramide de Tests 2026

1. **Tests Unitaires Ultra-Rapides (Vitest)** — *70% du volume* :
   - Tester toutes les fonctions pures : calcul de commissions, validation d'ingrédients INCI, formats de numéros de téléphone (+225, +221), fonctions de scoring.
   - Temps d'exécution ciblé : < 2 secondes pour l'intégralité de la suite.

2. **Tests d'Intégration & Server Actions** — *20% du volume* :
   - Tester les routes d'API et les Server Actions avec une base de données isolée en mémoire ou conteneurisée.
   - Vérifier la validation Zod, la gestion des erreurs 400/404/500 et les rollbacks en cas d'échec SQL.

3. **Tests End-to-End (E2E Playwright)** — *10% du volume* :
   - Tester les flux critiques utilisateur de bout en bout en simulant un vrai navigateur :
     - Parcours 1 : Visiteur anonyme -> Diagnostic de peau Dermo Kènè -> Recommandation de routine.
     - Parcours 2 : Client connecté -> Réservation salon -> Redirection paiement.
     - Parcours 3 : Déconnexion complète -> Vérification de la purge de session (DMZ / Zéro fuite de données).

---

## 2. Règle TDD du Vibecoder (Test-Driven Development)

Quand une fonctionnalité complexe ou sensible est demandée :
1. **Red** : Écrire un test unitaire qui échoue décrivant le comportement attendu.
2. **Green** : Écrire le code minimal pour faire passer le test au vert.
3. **Refactor** : Optimiser l'architecture et la propreté du code sous la protection du test.
