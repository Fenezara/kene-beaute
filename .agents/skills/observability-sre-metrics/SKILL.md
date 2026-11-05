---
name: observability-sre-metrics
description: Observabilité et ingénierie de fiabilité de site (SRE) 2026. OpenTelemetry, logs structurés JSON, traçabilité distribuée des requêtes, alertes proactives Sentry et dashboards de santé en direct.
---

# Observability, Telemetry & SRE Metrics (2026 Edition)

Ce skill garantit une visibilité totale et en temps réel sur la santé, les erreurs et les goulets d'étranglement de l'application en production.

## 1. Les 3 Piliers de l'Observabilité

1. **Logs Structurés JSON (Structured Logging)** :
   - Fini les `console.log("error", e)` non exploitables.
   - Utilisation de logs JSON contenant : `timestamp`, `level` (INFO, WARN, ERROR), `correlationId` (identifiant unique transmis à travers toutes les requêtes d'une session), `userId`, `route`, `latencyMs`.
2. **Métriques Temps Réel (Prometheus / Grafana)** :
   - Taux d'erreur HTTP 5xx (SLO : < 0.05%).
   - Temps de réponse p95 et p99 des Server Actions et requêtes Prisma.
   - Utilisation mémoire et charge CPU du conteneur Docker.
3. **Traçage Distribué (Distributed Tracing avec OpenTelemetry)** :
   - Mesurer le temps exact passé dans chaque étape d'un paiement : [Client Web] -> [Next.js API] -> [Prisma DB] -> [Wave Gateway].

---

## 2. Détection & Gestion Proactive des Incidents

- **Circuit Breaker Pattern** :
  - Si une API externe (ex: service SMS ou gateway de paiement) commence à échouer à plus de 50%, le circuit s'ouvre pour protéger le serveur et bascule automatiquement sur un mode dégradé gracieux (ex: notification par email en secours ou message d'attente convivial).
- **Rapport d'Erreur Enrichi (Sentry / Bugsnag)** :
  - Toute exception non rattrapée est logguée avec la pile d'exécution, l'état de l'utilisateur (anonymisé) et le contexte de navigation.
