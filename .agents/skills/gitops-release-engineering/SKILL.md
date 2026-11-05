---
name: gitops-release-engineering
description: Ingénierie de release, CI/CD avancée et GitOps 2026. Stratégies de déploiement Canary/Blue-Green, gestion sémantique des versions (SemVer), feature-flags, migrations de bases de données zéro-downtime et rollbacks instantanés.
---

# GitOps, CI/CD & Advanced Release Engineering (2026 Edition)

Ce skill formalise le pipeline d'intégration et de livraison continue pour expédier du code en production en toute sérénité.

## 1. Principes GitOps & Immutable Infrastructure

1. **Git comme Source Unique de Vérité (SSOT)** :
   - Tout changement d'infrastructure ou de configuration doit faire l'objet d'un commit Git traçable.
   - Les variables d'environnement de production sont injectées de manière sécurisée sans être stockées en clair dans le repository.

2. **Pipeline d'Intégration Continue (CI)** :
   - Chaque Pull Request / commit déclenche automatiquement :
     1. Lint & Format check (`next lint`, `prettier --check`).
     2. Type checking TypeScript strict (`tsc --noEmit`).
     3. Suite de tests unitaires et d'intégration (`vitest run`).
     4. Build de production de vérification (`next build`).

---

## 2. Déploiement Continu (CD) & Zéro Downtime

- **Stratégie Blue-Green / Zero-Downtime** :
  - Le nouveau conteneur est démarré et son healthcheck (`/api/health`) doit répondre `200 OK` avant que le reverse proxy ne lui route le trafic public.
  - L'ancien conteneur n'est arrêté qu'une fois les connexions en vol terminées (graceful shutdown de 30 secondes).
- **Rollback Instantané** :
  - En cas d'anomalie critique post-déploiement, la commande de rollback remet immédiatement en service la version précédente de l'image Docker en moins de 10 secondes.

## 3. Migrations de Schémas Base de Données Non-Bloquantes
- Appliquer le pattern **Expand and Contract** :
  - Phase 1 : Ajouter les nouvelles colonnes sans supprimer les anciennes.
  - Phase 2 : Déployer le code qui écrit dans les nouvelles colonnes.
  - Phase 3 : Nettoyer les anciennes colonnes lors d'une release ultérieure.
