---
name: dmz-bastion-hardening
description: Audit de sécurité réseau, configuration pare-feu UFW, durcissement fail2ban, isolation DMZ et protection contre les attaques par force brute ou injection pour serveurs Linux de production. À utiliser lors des audits d'infrastructure et revues de sécurité.
---

# DMZ Bastion Hardening & Network Shield

Ce skill définit la posture défensive et les règles de sécurité périmétrique du serveur Kènè.

## 1. Règles Pare-Feu UFW (Least Privilege)
- Bloquer tout le trafic entrant par défaut : `ufw default deny incoming`.
- N'autoriser que les ports indispensables :
  - `Port 22` (SSH) — restreint ou protégé par clé SSH sans mot de passe.
  - `Port 80` (HTTP) — redirection immédiate vers HTTPS 443.
  - `Port 443` (HTTPS / TLS 1.3).
- Tous les ports de bases de données internes (ex: 5432, 3306, 6379, 3000) doivent être cantonnés à l'interface `127.0.0.1` ou au réseau Docker privé, jamais exposés au WAN.

## 2. Détection d'Intrusion & Fail2ban
- Activer la prison `sshd` pour bannir automatiquement toute IP effectuant plus de 3 tentatives infructueuses.
- Activer la surveillance des logs Nginx/Caddy pour bloquer les scanners de failles automatisés (WordPress scanners, phpmyadmin bots).
- Audit hebdomadaire des règles et des IP bannies.
