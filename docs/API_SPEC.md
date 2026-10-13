# 📡 Spécification Formelle des Contrats d'API — KÈNÈ

**Version :** 2.0 (Octobre 2026)  
**Standard :** REST JSON, Validation Zod, Authentification par Cookie Signé HMAC-SHA256 & Passkeys  
**Portée :** 89 Endpoints d'API répartis en 7 Domaines Métier

---

## 1. Conventions Générales & Standards HTTP

### 1.1 Formats de Réponse Standardisés

#### Réponse de Succès (HTTP 200, 201, 202)
Les réponses encapsulent toujours les données dans un objet JSON typé :
```json
{
  "ok": true,
  "data": { ... }
}
```

#### Réponse d'Erreur Standard (HTTP 400, 401, 403, 404, 500)
Générée via `jsonError(message, status, code)` :
```json
{
  "error": "Message explicite rédigé en français",
  "code": "CODE_MACHINE_OPTIONNEL"
}
```

#### Réponse de Dépassement de Quota (HTTP 429 Too Many Requests)
Générée via `rateLimitResponse(retryAfterSec, message)` :
```json
{
  "error": "Trop de requêtes rapides — réessaie dans un instant",
  "retryAfterSec": 45
}
```
*En-tête HTTP associé :* `Retry-After: 45`

---

## 2. Domaine 1 : Authentification & Sécurité (`/api/auth/*`)

### `GET /api/auth/express`
Connexion découverte instantanée en 1 clic sans saisie de numéro.
- **Query Params** : `role=client|pro|admin` (le rôle `client` est le défaut public ; `pro` et `admin` requièrent une session active).
- **Fonctionnement** :
  - Génère un compte invité unique et dédié avec numéro virtuel dynamique (évite toute collision d'historique ou de panier entre utilisatrices).
  - Émet le cookie HTTPOnly de session signé.
- **Réponse HTTP 200** :
  ```json
  {
    "user": {
      "id": "cuid...",
      "phone": "+2250012345678",
      "name": "Nouvelle invitée",
      "role": "client"
    },
    "tenant": null
  }
  ```

### `POST /api/auth/otp/request`
Demande d'envoi de code de vérification par SMS.
- **Body JSON** : `{ "phone": "+2250701020304" }`
- **Validation** : Format E.164 (numéros de Côte d'Ivoire, Sénégal, etc.).
- **Rate Limit** : 3 requêtes / 10 minutes par numéro.
- **Réponse HTTP 200** : `{ "ok": true, "message": "Code envoyé" }`

### `POST /api/auth/otp/verify`
Validation du code OTP et création/connexion de session.
- **Body JSON** : `{ "phone": "+2250701020304", "code": "123456" }`
- **Réponse HTTP 200** : Retourne le profil utilisateur et pose le cookie de session `kene_session`.

### `POST /api/auth/pin`
Configuration ou vérification du code PIN de sécurité (style Mobile Banking).
- **Body JSON** : `{ "action": "set" | "verify", "pin": "1234" }` (4 chiffres obligatoires).

---

## 3. Domaine 2 : Diagnostic Cutané & IA (`/api/diagnoses/*`)

### `POST /api/diagnoses`
Lancement d'une analyse cutanée multi-zones par le modèle de vision (VLM).
- **Body JSON** :
  ```json
  {
    "userId": "cuid...",
    "zone": "visage",
    "image": "data:image/webp;base64,...",
    "fitzpatrick": "V",
    "allergies": "aucune"
  }
  ```
- **Validation** : Zone anatomique valide parmi les 23 zones (`visage`, `dos`, `cuir_chevelu`, `mains`, etc.).
- **Réponse HTTP 202 Accepted** (Temps de réponse < 800 ms) :
  ```json
  {
    "id": "diag_cuid...",
    "status": "pending",
    "message": "Analyse VLM en cours dans le worker de fond"
  }
  ```

### `GET /api/diagnoses/:id`
Polling du statut d'analyse par le front (exécuté toutes les 1,8 s).
- **Réponse HTTP 200 (En cours)** : `{ "diagnosis": { "id": "...", "status": "pending" } }`
- **Réponse HTTP 200 (Terminé)** :
  ```json
  {
    "diagnosis": {
      "id": "...",
      "status": "done",
      "scoreGlobal": 78,
      "resultJson": "{\"indicateurs\":[...],\"recommandations\":{...}}",
      "createdAt": "2026-10-13T18:00:00Z"
    }
  }
  ```

### `GET /api/diagnoses?userId=...&full=0`
Récupération de l'historique des scans pour l'écran d'accueil ou le profil.
- **Paramètre d'optimisation** : `full=1` (facultatif). Par défaut, la requête exclut les chaînes Base64 `imageData` pour un transfert ultraléger de quelques kilo-octets.
- **Réponse HTTP 200** : Tableau borné aux 20 derniers diagnostics (auto-scans et bilans en cabine combinés).

---

## 4. Domaine 3 : Conseils Virtuels & IA Dr. Kènè (`/api/dermato/*`)

### `POST /api/dermato/chat`
Assistant conversationnel dermo-cosmétique bienveillant.
- **Body JSON** :
  ```json
  {
    "messages": [
      { "role": "user", "content": "J'ai des taches foncées après mes boutons sur les joues" }
    ],
    "skinProfile": { "fitzpatrick": "V", "skinType": "mixte" }
  }
  ```
- **Réponse HTTP 200** :
  ```json
  {
    "reply": "Bonjour ! Ce sont des marques d'hyperpigmentation post-inflammatoire (HPI)...",
    "triageLevel": "vert",
    "suggestedActives": ["Niacinamide", "Huile de Baobab", "Karité brut"],
    "requiresCabine": false
  }
  ```
- **Niveaux de Triage Médical** :
  - `vert` : Conseil d'hygiène et routine dermo-cosmétique à domicile.
  - `jaune` : Proposition d'un rendez-vous soin cabine auprès d'un institut partenaire.
  - `rouge` : Alerte d'urgence médicale (orientation vers un dermatologue hospitalier).

---

## 5. Domaine 4 : Instituts & Réservations (`/api/institutes/*`, `/api/appointments/*`)

### `GET /api/institutes`
Annuaire des instituts partenaires agréés.
- **Query Params** : `city=abidjan&q=cocody&lat=5.35&lng=-3.98`
- **En-têtes de Cache** : `Cache-Control: public, max-age=60, stale-while-revalidate=300`
- **Réponse HTTP 200** : Liste des établissements avec tri par distance orthodromique (Haversine), note moyenne et visuels.

### `POST /api/appointments`
Réservation de soin en cabine avec acompte de garantie.
- **Body JSON** :
  ```json
  {
    "userId": "cuid...",
    "tenantId": "tenant_cuid...",
    "serviceId": "serv_cuid...",
    "resourceId": "res_cuid...",
    "startAt": "2026-10-15T14:00:00Z",
    "clientName": "Mariam Diallo",
    "clientPhone": "+2250701020304"
  }
  ```
- **Règle Métier** : Calcul automatique de l'acompte de 30 % (`DEPOSIT_RATE`) revalidé côté serveur pour prévenir les faux rendez-vous.

---

## 6. Domaine 5 : Boutique Marketplace & Paiements (`/api/shop/*`, `/api/orders/*`)

### `GET /api/shop/products`
Catalogue dermo-cosmétique marketplace regroupé par institut vendeur.
- **En-têtes de Cache** : `Cache-Control: public, max-age=60, stale-while-revalidate=300`
- **Filtrage** : Par catégorie (`serum`, `creme`, `huile`, `gommage`, `masque`, `savon`) ou recherche textuelle.

### `POST /api/orders`
Validation de commande avec panier multi-produits.
- **Body JSON** :
  ```json
  {
    "userId": "cuid...",
    "tenantId": "tenant_cuid...",
    "items": [{ "productId": "prod_1", "quantity": 2 }],
    "couponCode": "BIENVENUE",
    "paymentMethod": "wave" | "orange_money" | "wallet"
  }
  ```
- **Traitement** : Déduction de stock transactionnelle, calcul du cashback crédité sur le wallet (5 %) et émission du reçu.

---

## 7. Domaine 6 : Système de Gestion Kènè Pro (`/api/pro/*`)

*Toutes les routes `/api/pro/*` exigent une session active liée à un institut (`tenantId`).*

| Méthode & Route | Description Métier | Spécificités & Sécurité |
| :--- | :--- | :--- |
| `GET /api/pro/overview` | Dashboard gérante (KPIs du jour, CA, RDV, stock bas) | Rafraîchissement direct via WebSockets |
| `GET /api/pro/pos/sales` | Caisse enregistreuse tactile | Tickets de caisse conformes SYSCOHADA |
| `POST /api/pro/caisse/expense` | Sorties de caisse courantes (achats locaux, taxi) | Justificatif et classe comptable 6 |
| `GET /api/pro/payroll` | Calcul des bulletins de salaire | Conformité CNPS, IGR, CN (CI) / IPM, IPRES (SN) |
| `GET /api/pro/payroll/ecnps` | Export télédéclaration sociale | Génération du flux XML normé e-CNPS |
| `GET /api/pro/accounting/export` | Liasse fiscale et grand livre | Formats CSV et PDF vectoriel haute définition |

---

## 8. Domaine 7 : Console Administration Réseau (`/api/admin/*`)

*Toutes les routes `/api/admin/*` exigent un rôle `admin` strict et une session courte de 8 heures.*

- `POST /api/admin/elevate` : Déclenchement du challenge **Step-up MFA** (empreinte biométrique WebAuthn ou code administrateur) valable 5 minutes.
- `PATCH /api/admin/tenants/:id` : Suspension immédiate d'un institut ou modification de sa commission de plateforme (action sous Step-up obligatoire).
- `PATCH /api/admin/subscriptions/:id` : Annulation à motif obligatoire ou octroi de 30 jours offerts selon la norme IFRS 15 (aucun écrasement de période dans l'historique).
