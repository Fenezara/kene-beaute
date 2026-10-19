---
name: kene-crm-institute
description: Guide et procédures opérationnelles pour la gestion des instituts partenaires Kènè (onboarding de salons, affiliation, pilotage des commissions, relances WhatsApp et conformité cosmétique). À utiliser lors de l'ajout d'un institut, de la modification des paramètres gérante/salon, de l'audit CRM ou du paramétrage des taux de commission.
---

# 🌺 Guide Opérationnel — Kènè Pro CRM & Instituts Partenaires

Cette compétence encapsule l'ensemble des règles de gestion, procédures administratives et bonnes pratiques techniques pour gérer les instituts partenaires de l'écosystème **Kènè**.

---

## 1. Processus d'Onboarding d'un Nouvel Institut Partenaire

L'intégration d'un nouvel établissement s'effectue selon une procédure en 5 étapes garantissant la conformité juridique, la traçabilité financière et la rigueur dermo-cosmétique.

### Étape 1 : Dossier d'Identification Juridique & Sanitaire
Chaque institut affilié doit fournir :
- **Raison sociale & Enseigne commerciale** : (ex: *Cabinet LA DERMO*).
- **Identifiants légaux** : Numéro NIF / RCCM officiel.
- **Localisation précise** : Pays, Ville, Commune/Quartier, Coordonnées GPS pour le calcul de proximité.
- **Contact Gérante** : Nom complet et numéro de téléphone mobile au format international E.164 (ex: `+2250701020304`).
- **Capacité d'accueil** : Nombre de cabines, nombre de praticiennes actives, horaires d'ouverture et de fermeture.

### Étape 2 : Création en Base de Données
L'institut est enregistré dans la table `Tenant` :
```typescript
const newTenant = await db.tenant.create({
  data: {
    name: "Nom de l'institut",
    city: "Abidjan — Cocody",
    country: "CI",
    address: "Rue des Jardins, Immeuble Horizon",
    phone: "+2250701020304",
    ownerName: "Nom de la Gérante",
    ownerPhone: "+2250701020304",
    plan: "pro", // trial | pro | business
    commissionRate: 10.0, // Commission plateforme par défaut (10 %)
    openingHour: 9,
    closingHour: 19,
    active: true,
  },
});
```

### Étape 3 : Attribution du Compte Gérante Pro
- Créer ou associer le compte `User` avec le rôle `pro` et le numéro `ownerPhone`.
- La gérante accède à son espace via `/pro` ou via le basculeur d'espace.

### Étape 4 : Configuration du Catalogue Initial
1. **Création des Praticiennes (`Resource`)** :
   - Définir le nom, le rôle (`estheticienne`, `dermo_conseillere`, `caissiere`) et la couleur d'agenda.
2. **Prestations de Soins Cabine (`Service`)** :
   - Associer la catégorie (`soin`, `gommage`, `massage`, `diagnostic`, `consultation`).
   - Fixer la durée en minutes (défaut : 60 min) et le tarif en Francs CFA (XOF).
   - Renseigner la commission praticienne (ex: 15 %).
3. **Produits Boutique (`Product`)** :
   - Stock initial, seuil d'alerte de réapprovisionnement (`stockAlert`).
   - Actifs botaniques mis en avant (Karité, Baobab, Moringa, etc.).

---

## 2. Pilotage des Commissions & Forfaits (Console Admin)

Le pilotage central s'effectue depuis la **Console Admin (`/console`)** avec des garanties de sécurité strictes :

### Règle d'Élévation de Privilège (Step-up ASVS V2.7)
Toute modification de commission ou de statut d'institut exige une **authentification forte fraîche (< 5 minutes)** :
- Validation par empreinte biométrique (WebAuthn Passkey) ou code administrateur.
- La console rejoue l'action automatiquement après validation.

### Grille des Commissions Plateforme
- **Taux par défaut** : 10 % sur les réservations et commandes marketplace.
- **Taux négocié** : Ajustable entre **0 % et 30 %** selon le volume d'affaires de l'institut.
- **Audit obligatoire** : Chaque modification génère un événement horodaté dans `SecurityEvent` avec l'adresse IP et l'identité de l'administrateur.

### Procédure de Suspension / Réactivation
En cas de manquement déontologique (ex: utilisation suspecte de produits éclaircissants interdits) ou de litige :
1. L'administrateur clique sur **« Suspendre l'institut »** dans l'onglet *Instituts*.
2. Un **motif écrit explicite** est obligatoirement requis.
3. Conséquences immédiates :
   - Retrait instantané de la vitrine publique cliente.
   - Blocage des nouvelles prises de rendez-vous en ligne.
   - Envoi d'une notification explicite sur l'espace Pro de la gérante avec le motif.
   - Les sessions en cours sont invalidées.
4. La réactivation est possible à tout moment après régularisation.

---

## 3. Déontologie Dermo-Cosmétique & Cosmétovigilance

Tous les instituts affiliés au réseau Kènè s'engagent à respecter la **Charte Déontologique Mélanoderme** :

### 1. Refus Catégorique des Dépigmentants
- Interdiction formelle de toute formulation contenant :
  - **Hydroquinone** (quel que soit le dosage).
  - **Dermocorticoïdes** (clobétasol, bétaméthasone).
  - **Sels de mercure**.
- Tout signalement avéré entraîne la suspension conservatoire immédiate du salon.

### 2. Protocole de Cosmétovigilance en Cabine
Lors du bilan cutané en institut (`/api/pro/diagnoses`) :
- Renseignement obligatoire de la **routine quotidienne déclarée** (`cosmeticsUsed`).
- Consignation des **observations de formulation** (`productObservations`) par la praticienne.
- Dépistage bienveillant des signes de sensibilisation ou d'ochronose débutante.

### 3. Respect du Secret Médical & Confidentialité (RGPD / ARTCI)
- **Verrou de Partage des Self-Scans** : Un institut ne peut **jamais** voir les analyses de peau personnelles qu'une cliente a réalisées chez elle depuis son smartphone, **sauf si la cliente a coché expressément la case de partage** pour cet institut spécifique.
- Le recueil de consentement est tracé et horodaté dans la table `UserShareConsent`.
- La cliente peut révoquer cet accès en 1 clic depuis son écran de profil.

---

## 4. Stratégie de Fidélisation : Relances WhatsApp « Le Fil du Retour »

Le module de relance automatisée permet à chaque salon de garder un lien bienveillant avec sa patientèle :

### Canaux & Idempotence
- Les relances utilisent l'API universelle WhatsApp (`https://wa.me/{phone}?text={message}`).
- La table `FollowUpMark` (`dedupKey: "appt:<id>" | "diag:<id>"`) empêche tout harcèlement en interdisant les relances en doublon.

### Calendrier des Relances Types
1. **J-1 (Rappel de Soin Cabine)** :
   > *« Bonjour [Prénom], toute l'équipe de [Institut] vous attend demain à [Heure] pour votre [Nom du Soin]. En cas d'imprévu, prévenez-nous au plus tôt. Prenez soin de vous ! ✨ »*
2. **S+3 (Suivi de Tolérance Post-Soin)** :
   > *« Bonjour [Prénom], comment réagit votre peau suite à votre séance de [Nom du Soin] il y a 3 jours ? N'hésitez pas à nous poser vos questions ou à partager vos sensations. 🌿 »*
3. **S+8 (Renouvellement Routine & Botaniques)** :
   > *« Bonjour [Prénom], votre sérum au Baobab arrive bientôt à mi-parcours. Souhaitez-vous planifier votre bilan d'évolution cutanée ce mois-ci ? 🌺 »*

---

## 5. Caisse POS & Respect du Droit Comptable SYSCOHADA

L'écran de caisse en institut (`/pro` onglet Caisse) doit appliquer les règles suivantes :
- **Tickets thermiques 80 mm ou A4** : Mention obligatoire de la TVA (18 % en UEMOA), du numéro d'ordre unique chronologique, et du détail des prestations/produits.
- **Cliente Express** : Possibilité d'encaisser des clientes sans smartphone ou de passage via leur nom et numéro de téléphone, sans création de mot de passe obligatoire.
- **Clôture Journalière (Z de Caisse)** : Contrôle du tiroir-caisse physique vs totaux Mobile Money (Wave, Orange, MTN).
