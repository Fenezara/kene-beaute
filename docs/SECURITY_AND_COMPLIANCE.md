# 🛡️ Architecture de Sécurité & Conformités Réglementaires — KÈNÈ

**Version :** 2.0 (Octobre 2026)  
**Normes de Référence :** NIST SP 800-63B-4, OWASP ASVS 4.0 (V2.7), Droit Comptable SYSCOHADA, Norme CNPS / IPM, RGPD / Lois APDP  
**Portée :** Données Médicales/Cutanées, Flux Financiers, Gestion Sociale, Console d'Administration

---

## 1. Posture de Sécurité Applicative & Cryptographie

L'architecture de Kènè applique le principe du **moindre privilège** et de la **défense en profondeur**.

### 1.1 Matrice d'Authentification & Sessions

| Espace | Durée de Session | Mécanisme d'Authentification | Politiques de Sécurité |
| :--- | :--- | :--- | :--- |
| **Cliente** | 90 jours glissants | OTP SMS / Reconnexion Express / PIN 4 chiffres | Cookie HTTPOnly, `SameSite=Lax`, signé HMAC-SHA256. |
| **Pro (Institut)** | 30 jours | Numéro Pro + PIN ou OTP SMS | Isolation stricte des données par `tenantId`. Session requise sur toutes les routes `/api/pro/*`. |
| **Console Admin** | **8 heures max** | **WebAuthn Passkeys (FIDO2)** ou OTP 6 chiffres | Séparation stricte de l'URL (`/console`). **Step-up obligatoire** avant toute action d'administration. |

### 1.2 Le Protocole Step-up (OWASP ASVS V2.7)
Pour prévenir les prises de contrôle de session administrative ou les actions malveillantes :
- Toute action destructrice ou financière (suspension d'un institut, modification d'une commission, octroi de mois d'abonnement offerts, promotion d'un utilisateur) requiert une **élévation de privilège fraîche (< 5 minutes)**.
- Si le délai de 5 minutes est dépassé, l'API renvoie le code d'erreur standard :
  ```json
  { "error": "Authentification renforcée requise", "code": "elevation_required" }
  ```
- L'interface ouvre automatiquement un dialogue de validation biométrique (Passkey) ou de code de sécurité, puis rejoue immédiatement l'action sans friction pour l'administrateur.

---

## 2. Conformité Légale & Comptable Ouest-Africaine (SYSCOHADA)

Kènè Pro intègre un moteur de caisse et de comptabilité conforme au **Système Comptable Ouest-Africain (SYSCOHADA Révisé)** applicable dans les 17 États membres de l'OHADA :

### 2.1 Immuabilité du Grand Livre & Écritures
1. **Zéro Écrasement** : Une écriture comptable validée en caisse (POS) ou lors d'une commande ne peut être ni modifiée ni supprimée.
2. **Correction par Contre-Passation** : Toute annulation ou remboursement donne lieu à une nouvelle écriture d'ajustement en sens inverse.
3. **Plan de Comptes Intégré (Classes 1 à 7)** :
   - `571100` : Caisse Principale (Espèces / Mobile Money).
   - `701100` : Ventes de produits dermo-cosmétiques.
   - `706100` : Prestations de soins en cabine.
   - `602000` : Achats de matières premières (actifs botaniques).
   - `443100` : État, TVA facturée sur ventes (18 %).

---

## 3. Conformité Sociale & Déclarations de Paie (e-CNPS / IPM)

Le module de paie de Kènè Pro calcule automatiquement les cotisations patronales et salariales selon les barèmes en vigueur :

### 3.1 Côte d'Ivoire (Barèmes CNPS & Impôts sur Salaires)
- **Régime Général CNPS** : Retraite (salarié 6,3 %, employeur 7,7 %), Prestations familiales (5,75 %), Accidents du travail (2 à 5 %).
- **Fiscalité Locale** : Impôt Général sur le Revenu (IGR), Contribution Nationale (CN), Impôt sur Salaire (IS 1,2 %).
- **Fichier Déclaration e-CNPS** : Génération en 1 clic du fichier **XML normalisé** prêt pour le téléversement sur le portail de télédéclaration de la CNPS de Côte d'Ivoire.

### 3.2 Sénégal (Barèmes IPRES & IPM)
- **IPRES** : Régime général (salarié 5,6 %, employeur 8,4 %) et Régime cadres.
- **IPM (Institution de Prévoyance Maladie)** : Taux légal de 3 % partagé employeur/salarié.

---

## 4. Protection des Données de Santé & Respect du RGPD / Lois APDP

Kènè respecte les réglementations sur les données à caractère personnel (Loi ivoirienne n° 2013-450 sur la protection des données personnelles, loi sénégalaise 2008-12 et RGPD européen) :

### 4.1 Double Consentement Explicite Préalable
Avant toute analyse de peau par l'IA ou en cabine :
1. **Case 1 (Données Cutanées)** : Accord explicite pour le traitement algorithmique des indicateurs de peau et antécédents.
2. **Case 2 (Conservation des Photos)** : Accord distinct pour le stockage sécurisé des photographies de visage à des fins de suivi comparatif.
*Ces consentements sont horodatés et archivés numériquement en base de données.*

### 4.2 Portabilité des Données (Droit d'Accès Art. 20)
Chaque cliente dispose dans son profil d'un bouton **« Exporter mes données »** :
- Génère en 1 clic un fichier JSON standardisé et lisible contenant l'intégralité de ses diagnostics, scores, commandes, rendez-vous et consentements.

### 4.3 Droit à l'Effacement & Purge Légale (Droit à l'Oubli)
Lorsqu'un utilisateur demande la suppression définitive de son compte :
1. **Purge Immédiate des Données de Santé** : Les photos du visage, les résultats d'analyses VLM et les fiches cutanées sont immédiatement détruits de manière irréversible.
2. **Conservation Légale Anonymisée** : Conformément aux obligations fiscales et comptables (SYSCOHADA exigeant 10 ans de conservation des écritures), les factures et transactions sont conservées sous forme strictement anonymisée (remplacement du nom par *"Compte Utilisateur Supprimé"* et numéro de téléphone masqué).
