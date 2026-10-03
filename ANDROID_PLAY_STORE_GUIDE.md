# 📱 GUIDE DE PUBLICATION GOOGLE PLAY STORE — KÈNÈ (TWA)

Ce guide décrit la méthode officielle de Google pour packager l'application **Kènè** au format **Android App Bundle (.aab)** et **APK** pour la publier sur le **Google Play Store**.

Grâce à l'architecture **TWA (Trusted Web Activity)**, l'application s'exécute sur Android avec les performances d'une application native :
- **Plein écran immersif** (zéro barre d'URL ou boutons de navigateur).
- **Raccourcis natifs Android** (appui long sur l'icône : *Scan IA*, *Prendre RDV*, *Boutique*, *Fils d'Or*).
- **Notifications Push Android** directes.
- **Mises à jour instantanées** : chaque amélioration déployée sur le serveur est immédiatement visible sur les téléphones des clientes sans attendre de nouvelle validation sur le Store.

---

## 1. Prérequis

1. **Node.js (>= 18)** et **Java JDK (>= 17)** installés sur la machine.
2. Votre nom de domaine officiel HTTPS déployé (ex: `https://kene-beaute.ci` ou `https://kene.africa`).
3. Un compte développeur Google Play Console (frais unique de 25 $).

---

## 2. Génération du Package en 3 Commandes (Bubblewrap)

L'outil officiel recommandé par Google pour créer des packages TWA est **Bubblewrap CLI**.

### Étape A : Installer Bubblewrap CLI
```bash
npm install -g @bubblewrap/cli
```

### Étape B : Initialiser le projet Android Kènè
Créez un dossier dédié (ex: `kene-android/`) et lancez l'initialisation :
```bash
mkdir kene-android && cd kene-android
bubblewrap init --manifest https://votre-domaine.com/manifest.json
```

L'outil lira automatiquement votre fichier `manifest.json` déjà enrichi et vous demandera :
- **Package name** : `com.kene.app`
- **App name** : `Kènè`
- **Short name** : `Kènè`
- **Display mode** : `standalone`
- **Key store** : Choisissez de générer une nouvelle clé de signature sécurisée (`kene-release-key.keystore`) et notez bien vos mots de passe.

### Étape C : Construire l'App Bundle (.aab) pour Google Play
```bash
bubblewrap build
```

Le fichier `app-release-signed.aab` est généré dans le dossier. **C'est ce fichier qui est téléversé directement sur la Google Play Console.**

---

## 3. Lier l'Application au Domaine (Digital Asset Links)

Pour que Google certifie que l'application Android appartient bien à votre domaine et supprime toute barre de navigation :

1. Récupérez l'empreinte SHA-256 de votre clé générée :
   ```bash
   bubblewrap fingerprint
   ```
2. Ouvrez le fichier [`public/.well-known/assetlinks.json`](file:///d:/Projet%20Tic/Projet_Antigravity/K%C3%A8n%C3%A8/public/.well-known/assetlinks.json) dans le projet Kènè.
3. Remplacez l'empreinte par votre véritable empreinte SHA-256 :
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.kene.app",
         "sha256_cert_fingerprints": [
           "VOTRE_EMPREINTE_SHA256_ICI"
         ]
       }
     }
   ]
   ```
4. Déployez le fichier sur votre serveur web. L'URL `https://votre-domaine.com/.well-known/assetlinks.json` doit être accessible publiquement en HTTPS sans authentification.

---

## 4. Téléversement sur la Google Play Console

1. Rendez-vous sur [Google Play Console](https://play.google.com/console).
2. Cliquez sur **Créer une application** :
   - Nom : **Kènè — Beauté mélanoderme & Bien-être**
   - Langue par défaut : **Français**
   - Type : **Application** / **Gratuite**
3. Dans **Production** > **Créer une version**, téléversez votre fichier `app-release-signed.aab`.
4. Renseignez la fiche Play Store (description, captures d'écran, catégorie *Beauté & Soins personnels*).
5. **Section Sécurité des données (Data Safety) & Suppression de compte (Exigence Google Play 2026)** :
   - Indiquer que l'application collecte : données d'identification (téléphone, nom), données de santé/photos (analyse cutanée), et données financières (transactions).
   - Cocher l'option : **« L'application permet aux utilisateurs de demander la suppression de leur compte et des données associées »**.
   - URL de suppression de compte à renseigner dans la console : `https://kene-beaute.com/` (accessible in-app via *Profil > Réglages > Supprimer mon compte*).
   - Les données de santé et photos sont immédiatement et physiquement purgées. Les archives comptables sont conservées sous forme anonymisée conformément à la réglementation fiscale (SYSCOHADA).
6. Soumettez l'application à l'examen de Google. La validation prend généralement de 24 à 48 heures.

---

## 5. Raccourcis Android Disponibles Immédiatement

Les clientes et praticiennes bénéficient déjà des raccourcis intégrés dans le système Android :
- 📸 **Scanner ma peau (IA)** : Ouvre directement l'analyseur cutané.
- 📍 **Prendre RDV en Salon** : Ouvre la géolocalisation des instituts partenaires.
- 🛍️ **Boutique Botanique** : Ouvre le catalogue de produits aux actifs africains.
- 👑 **Mon Profil & Fils d'Or** : Affiche les privilèges Kente et le parrainage.
