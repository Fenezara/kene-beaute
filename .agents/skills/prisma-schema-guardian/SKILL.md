---
name: prisma-schema-guardian
description: Gestion, optimisation et migration des schémas de base de données relationnels (SQLite, PostgreSQL, MySQL) avec Prisma ORM. À utiliser pour concevoir des schémas robustes, indexer les requêtes lentes, et gérer les migrations sans perte de données.
---

# Prisma Schema Guardian & Database Optimization

Ce skill garantit la solidité, la rapidité et la cohérence des modèles relationnels gérés avec Prisma.

## 1. Règles de Conception des Schémas
- **Clés primaires & Indexation** : Tout champ utilisé dans un `WHERE`, `ORDER BY` ou dans des relations fréquentes (`clientId`, `salonId`, `status`, `createdAt`) DOIT être indexé avec `@@index([monChamp])`.
- **Enums & Statuts explicites** : Toujours utiliser des Enums stricts pour les états finis (ex: `TransactionStatus: PENDING, COMPLETED, FAILED, REFUNDED`).
- **Dates d'Audit automatiques** : Toute table métier doit comporter :
  ```prisma
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ```

## 2. Prévention des Concurrences & SQLite Locks
- Sous SQLite, les écritures concurrentes peuvent déclencher `database is locked`.
- **Règles** :
  1. Activer le mode WAL (`PRAGMA journal_mode=WAL;`).
  2. Encapsuler les transactions critiques dans des `prisma.$transaction(..., { timeout: 10000 })`.
  3. Ne jamais effectuer d'appels réseau lents (ex: appel API externe ou envoi d'email) à l'intérieur d'un bloc de transaction DB.
