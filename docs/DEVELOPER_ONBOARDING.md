# 🚀 Guide d'Onboarding Développeur & Conventions d'Ingénierie — KÈNÈ

**Version :** 2.0 (Octobre 2026)  
**Public cible :** Nouveaux Développeurs (Frontend, Backend, Fullstack, DevOps)  
**Objectif :** Cloner le dépôt et être 100 % opérationnel en moins de 20 minutes.

---

## 1. Démarrage Rapide en 3 Étapes

### Étape 1 : Prérequis Système
- **Node.js** (>= 20.x LTS) ou **Bun** (>= 1.1.x)
- **Git**
- **Docker & Docker Compose** (pour l'environnement de production local)

### Étape 2 : Installation & Base de Données
Clonez le projet et installez les dépendances :
```bash
git clone https://github.com/Fenezara/kene-beaute.git
cd kene-beaute
npm install   # ou bun install
```

Configurez vos variables d'environnement locales :
```bash
cp .env.example .env
```

Initialisez la base de données relationnelle locale (SQLite) :
```bash
npx prisma db push
npx prisma generate
```

*(Optionnel) Remplir la base avec des données de test cohérentes :*
```bash
npx tsx prisma/seed.ts
```

### Étape 3 : Lancer les Services de Développement
Ouvrez deux terminaux :
- **Terminal 1 (Application Next.js principale) :**
  ```bash
  npm run dev   # tourne sur http://localhost:3000
  ```
- **Terminal 2 (Microservice Temps Réel Socket.IO) :**
  ```bash
  cd mini-services/notify-service
  npm run dev   # écoute sur le port 3004
  ```

L'application est immédiatement accessible sur **`http://localhost:3000`**.

---

## 2. Conventions de Code & Standards d'Ingénierie

### 2.1 Règle Monétaire Absolue (`xof()`)
En Afrique de l'Ouest, les montants en FCFA n'ont pas de centimes et s'écrivent avec des séparateurs d'espaces :
- **INTERDIT :** Formater manuellement `price + " FCFA"` ou utiliser des nombres à virgule pour les devises locales.
- **OBLIGATOIRE :** Utiliser systématiquement l'utilitaire `xof(amount)` importé depuis `@/lib/kene/format` :
  ```typescript
  import { xof } from "@/lib/kene/format";
  console.log(xof(15000)); // Sortie : "15 000 F CFA"
  ```

### 2.2 Règle Terminologique : Dermo-Cosmétique
- **INTERDIT :** Le terme « dermo-botanique » est banni de l'ensemble du projet.
- **RÈGLE :** 
  - La science et l'application s'appellent **« Dermo-Cosmétique »**.
  - Le mot **« Botanique »** est réservé exclusivement aux ingrédients végétaux purs (*actifs botaniques, beurre de karité, huile de baobab*).

### 2.3 Gestion Uniforme des Erreurs d'API
Dans toute route API Next.js (`src/app/api/...`) :
- Toujours utiliser `jsonError(message, status, code)` pour les erreurs métier attendues (400, 401, 404).
- Toujours envelopper le code d'un `try/catch` avec `serverError(endpointName, error)` pour capturer et logger proprement les exceptions serveur (500).

---

## 3. Suite de Tests Automatisés & Vérification Clinique

Le dossier `scripts/` contient une suite de **tests de validation end-to-end** exécutables directement avec `npx tsx` :

| Script de Test | Ce qu'il valide | Commande d'exécution |
| :--- | :--- | :--- |
| `test-end-to-end-journey.ts` | **Parcours complet de A à Z** : Scan IA → Diagnostic → Ordonnance PDF → Prise de RDV en salon → Encaissement caisse | `npx tsx scripts/test-end-to-end-journey.ts` |
| `test-security-hardening.ts` | **Audit de sécurité** : Blocage des routes Pro/Admin sans session, validation du step-up MFA, isolation des salons | `npx tsx scripts/test-security-hardening.ts` |
| `test-complete-platform-pillars.ts` | **Validation des 4 piliers** : Moteur VLM, caisse SYSCOHADA, paie e-CNPS et conformité dermo-cosmétique | `npx tsx scripts/test-complete-platform-pillars.ts` |
| `test-pdf-spectral-report.ts` | **Génération vectorielle** : Création du PDF natif de l'ordonnance avec graphique spectral et QR Pass Cabine | `npx tsx scripts/test-pdf-spectral-report.ts` |

Pour valider l'ensemble des types TypeScript avant tout commit :
```bash
npx tsc --noEmit
```

---

## 4. Workflow Git & Déploiement en Production

### 4.1 Conventions de Commit (Conventional Commits)
- `feat(...)` : Nouvelle fonctionnalité.
- `fix(...)` : Correction de bug.
- `perf(...)` : Optimisation de performance.
- `refactor(...)` : Remaniement de code sans changement fonctionnel.
- `docs(...)` : Mise à jour de la documentation technique.

### 4.2 Déploiement Continu sur le Serveur VPS
Une fois vos modifications poussées sur la branche `main` :
```bash
ssh -i "~/.ssh/kene_vps" root@2.29.53.176 "cd /opt/kene && git pull origin main && docker compose build app && docker compose up -d app"
```
Le conteneur se reconstruit en tâche de fond et redémarre avec zéro interruption perçue pour les utilisatrices.
