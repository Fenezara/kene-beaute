# 🚀 GUIDE OFFICIEL DE DÉPLOIEMENT EN PRODUCTION — KÈNÈ

Ce guide vous accompagne pas à pas pour déployer et exploiter l'écosystème **Kènè (Kènè Client, Kènè Pro Institut, Caisse POS, Diagnostic 3D & Notifications temps réel)** sur votre infrastructure de production.

---

## 1. Architecture de Production

L'architecture Kènè est conteneurisée, ultra-légère et résiliente :

```mermaid
flowchart TD
    Internet["🌐 Navigateurs & Mobiles (HTTPS :443 / :80)"] --> Caddy["🔒 Caddy Reverse-Proxy (SSL Auto Let's Encrypt)"]
    Caddy -->|"/ /api/*"| NextApp["⚡ Kènè Next.js Standalone (:3000)"]
    Caddy -->|"/socket.io/* ou XTransformPort=3004"| NotifyService["🔔 Microservice Notify Socket.IO (:3004)"]
    NextApp -->|Push émetteur| NotifyService
    NextApp -->|Données & Audit| Postgres["🗄️ PostgreSQL (Managé ou Conteneur)"]
```

---

## 2. Déploiement en 1 Clic sur Serveur / VPS (Recommandé)

Cette méthode convient pour n'importe quel VPS Linux (Ubuntu 22.04 / 24.04 LTS, Debian, OVH, Hetzner, DigitalOcean, AWS EC2).

### Étape A : Prérequis sur le serveur
Installez Docker et Docker Compose :
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

### Étape B : Cloner le dépôt et configurer `.env`
```bash
git clone https://github.com/votre-compte/kene.git /opt/kene
cd /opt/kene
cp .env.example .env
nano .env
```

Renseignez dans votre `.env` :
1. `APP_URL="https://votre-domaine.com"`
2. `KENE_SESSION_SECRET="..."` (la clé de 64 caractères déjà générée)
3. Vos clés VAPID (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`)
4. Vos clés marchands réelles (`WAVE_API_KEY`, `ORANGE_MONEY_...`, `TERMII_API_KEY`, `GEMINI_API_KEY`)
5. Votre URL de base de données PostgreSQL :
   ```bash
   DATABASE_URL="postgresql://kene_user:MotDePasseFort@votre-serveur-db:5432/kene_prod?schema=public"
   ```

### Étape C : Configurer votre nom de domaine dans `Caddyfile.prod`
Ouvrez `Caddyfile.prod` et remplacez `:80` par votre nom de domaine réel :
```caddy
kene.app, www.kene.app {
    encode gzip zstd
    ...
}
```
*Note : Caddy négocie et renouvelle automatiquement vos certificats SSL gratuits auprès de Let's Encrypt dès que vos DNS pointent vers l'IP du serveur.*

### Étape D : Lancer la pile de production en 1 commande
Vous pouvez lancer le déploiement automatisé :
```bash
bash scripts/deploy-production.sh
```
Ou manuellement avec Docker Compose :
```bash
docker compose up -d --build
```

Pour auditer la conformité de votre environnement à tout moment :
```bash
npx tsx scripts/production-readiness-check.ts
```

Pour vérifier le bon fonctionnement :
```bash
docker compose ps
docker compose logs -f app
```

---

## 3. Bascule et Migration vers PostgreSQL

### A. Si vous utilisez PostgreSQL managé (Supabase, Neon, AWS RDS)
1. Créez un projet PostgreSQL sur votre hébergeur.
2. Copiez la chaîne de connexion (`DATABASE_URL`).
3. Appliquez le schéma Kènè directement :
   ```bash
   npx prisma db push --schema=prisma/schema.postgresql.prisma
   ```

### B. Transférer vos données locales (SQLite -> PostgreSQL)
Si vous souhaitez réimporter les comptes clients, produits ou salons déjà créés :
1. Exportez vos données :
   ```bash
   npx tsx scripts/migrate-sqlite-to-postgres.ts --export
   ```
2. Un fichier horodaté est créé dans `backups/kene-dump-*.json`.

---

## 4. Personnalisation de votre Établissement (`src/config/salon-identity.ts`)

Pour adapter instantanément les tickets thermiques, coordonnées légales et commissions de votre institut, ouvrez `src/config/salon-identity.ts` et ajustez :

* **Coordonnées légales** : Nom de l'institut, NIF, RCCM, adresse physique (ex. Cocody, Almadies).
* **Numéro WhatsApp officiel** : Utilisé pour l'envoi en 1 clic des reçus dématérialisés et ordres de livraison.
* **Équipe** : Taux de commission personnalisé sur les soins et les ventes boutique pour chaque praticienne.

---

## 5. Sauvegardes & Maintenance Automatisée

### Sauvegarde quotidienne automatique de la base
Ajoutez une tâche Cron sur votre serveur pour créer un dump journalier :
```bash
# Ouvrir l'éditeur crontab
crontab -e

# Exécuter un export tous les soirs à 23h30
30 23 * * * cd /opt/kene && docker compose exec -T app npx tsx scripts/migrate-sqlite-to-postgres.ts --export
```

### Mettre à jour l'application sans interruption
```bash
cd /opt/kene
git pull
docker compose up -d --build app
```

---

## 6. Checklist de Mise en Service en Institut (Jour J)

- [ ] **Tablette / iPad de consultation** : Ouvrir l'application en plein écran (Bouton « Ajouter à l'écran d'accueil » pour activer le mode PWA).
- [ ] **Imprimante thermique de caisse** : Appairer en USB ou Bluetooth (80mm ou 58mm). Effectuer un ticket test depuis le POS.
- [ ] **Test paiement réel** : Réaliser un paiement test de 100 FCFA avec Wave et Orange Money pour valider les webhooks de notification.
- [ ] **Test SMS / WhatsApp** : Vérifier la bonne réception des tickets sur le smartphone d'une cliente de test.
