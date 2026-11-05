---
name: docker-vps-autopilot
description: Déploiement automatisé multi-conteneurs, orchestration Docker Compose, configuration reverse proxy et gestion sans coupure de service pour les VPS de production Kènè. À utiliser pour configurer les conteneurs, surveiller les builds et orchestrer la production.
---

# Docker VPS Autopilot & Zero-Downtime Deployment

Ce skill formalise les procédures de déploiement sécurisé sur le serveur de production de Kènè.

## 1. Principes de Déploiement Non-Root
- Les conteneurs Next.js doivent toujours s'exécuter sous un utilisateur non privilégié (`nextjs:nodejs`, `uid=1001`).
- Ne jamais monter l'intégralité du système de fichiers de l'hôte dans un conteneur.
- Monter la base de données SQLite ou les dossiers de persistance avec des permissions strictes (`chown -R 1001:1001 /opt/kene/db` et `chmod 750 /opt/kene/db`).

## 2. Procédure de Rebuild Sans Downtime
1. Pull de la branche `main` sur le VPS.
2. Build de la nouvelle image Docker en tâche de fond.
3. Switch du conteneur avec `--no-deps -d --build`.
4. Healthcheck automatique HTTP 200 sur `http://localhost:3000/api/health`.
5. Nettoyage des anciennes images orphelines : `docker image prune -f`.
