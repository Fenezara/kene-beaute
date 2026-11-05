---
name: stripe-ledger-reconciler
description: Automatisation de la réconciliation comptable, calcul des commissions marketplace (ex: 85% salon / 15% plateforme) et génération d'écritures comptables traçables. À utiliser pour les audits financiers, exports de bilan et gestion des commissions.
---

# Stripe & Marketplace Ledger Reconciler

Ce skill fournit les règles de calcul et de ventilation comptable pour les transactions de la plateforme Kènè.

## 1. Ventilation des Commissions (Split Payments)
- Pour chaque paiement client reçu (ex: 10 000 FCFA) :
  - **Frais Gateway** (ex: 1.5% Wave/CinetPay) : déduits en amont ou pris en charge selon la règle commerciale.
  - **Commission Plateforme Kènè** (ex: 15%) = 1 500 FCFA.
  - **Net à reverser au Salon / Institut Partenaire** (ex: 85%) = 8 500 FCFA.

## 2. Table d'Audit Immuable (Journal de bord comptable)
- Toute écriture de crédit ou débit salon doit être consignée avec :
  - `ledgerId` unique
  - `transactionId` parent
  - `salonId`
  - `amountGross` (montant brut payé par le client)
  - `platformFee` (commission Kènè)
  - `payoutNet` (montant dû au salon)
  - `status` (`HELD`, `CLEARED`, `PAID_OUT`)
- Ne jamais effacer ou écraser une ligne comptable : utiliser des lignes compensatoires (contrepassation) en cas d'erreur.
