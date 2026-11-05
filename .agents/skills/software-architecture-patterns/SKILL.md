---
name: software-architecture-patterns
description: Architecture logicielle d'élite 2026. Clean Architecture, Domain-Driven Design (DDD), architecture hexagonale, Event-Driven, découplage strict et patrons de conception pour systèmes scalables et résilients.
---

# Modern Software Architecture & System Design (2026 Edition)

Ce skill formalise les principes d'architecture logicielle de classe mondiale pour concevoir des applications modulaires, pérennes et testables sans friction.

## 1. Principes Fondamentaux & Clean Architecture

L'application est découpée en couches concentriques où les dépendances pointent toujours vers l'intérieur :

1. **Domain Entities & Value Objects (Le Cœur Métier)** :
   - Indépendant de toute base de données, framework ou UI.
   - Exemple : la logique de calcul de compatibilité d'un ingrédient INCI ou de calcul d'une commission est une fonction pure, sans dépendance externe.
2. **Use Cases / Application Services (Orchestration)** :
   - Contient les flux métier (ex: `BookSalonAppointmentUseCase`, `ProcessMobileMoneyPaymentUseCase`).
   - Reçoit des ports d'entrée (DTOs) et interagit avec l'extérieur via des ports de sortie (Interfaces/Repositories).
3. **Interface Adapters (Contrôleurs, Gateways, Presenters)** :
   - Traduit les requêtes HTTP / Server Actions / Webhooks en commandes métier compréhensibles par les Use Cases.
4. **Frameworks & Drivers (Infrastructure)** :
   - Prisma ORM, Next.js, Stripe SDK, Wave API, Redis, etc.
   - L'infrastructure est remplaçable sans toucher au cœur métier.

---

## 2. Domain-Driven Design (DDD) & Bounded Contexts

- **Bounded Contexts de Kènè** :
  - *Context Diagnostic & Dermo* : Analyse cutanée, fiches INCI, routines dermo-cosmétiques.
  - *Context Marketplace & Réservation* : Salons partenaires, prestations, agendas, créneaux.
  - *Context Fintech & Réconciliation* : Transactions Wave/Orange Money, commissions, factures.
  - *Context Auth & Privacy* : Sessions, chiffrement des données de santé, conformité DMZ.
- **Règle absolue** : Les contextes ne partagent pas leurs tables brutes directement en écriture ; ils communiquent par contrats stricts (DTOs) ou événements de domaine.

---

## 3. Event-Driven Architecture & Outbox Pattern (2026)

Pour garantir la cohérence des données sans distributed transaction locks :
- **Transactional Outbox Pattern** : Quand un événement métier survient (ex: `PaymentReceivedEvent`), il est écrit dans la même transaction SQL que la mise à jour métier (`OutboxTable`), puis un worker le propage vers les tiers (SMS WhatsApp, Webhook, Analytics) sans risque d'incohérence en cas de crash réseau.
