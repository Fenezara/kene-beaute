# Task 60-b — full-stack-developer : interface multilingue (fr + dy + bq + bt)

Mission : i18n du parcours cliente à haute visibilité (tab-bar, rail, titres,
accueil, onboarding écran 1, profil + sélecteur), 4 langues, persistance,
zéro régression des tâches concurrentes (60-a PWA, 60-d rate-limit).

## Fichiers créés
- `src/lib/kene/i18n.ts` — lib PURE : `Lang = "fr"|"dy"|"bq"|"bt"`, `LANGS`
  (label + pastille FR/DY/BQ/BT + note sobre : Ivoire du Nord / Centre /
  Sud-Ouest), `DICTS` (fr 61 clés — libellés EXACTS du code ; dy 48 clés ;
  bq/bt : salutations attestées uniquement), `translate()` repli
  langue → fr → clé brute. Extension future = pure donnée.
- `src/store/lang.ts` — zustand persist « kene-lang », `{ lang, setLang }`,
  **skipHydration** : SSR + hydratation en fr (état initial), relecture du
  localStorage APRÈS montage → zéro mismatch d'hydratation (pattern
  introState). Store séparé, kene.ts NON touché.
- `src/lib/kene/use-t.ts` — `useT(): { t, lang, setLang }`, rehydratation
  paresseuse idempotente dans un effet de montage.

## Modifiés (chirurgicaux — ajout 60-a/60-d préservés)
- `ClientApp.tsx` : NAV_MOBILE/NAV_DESKTOP en `labelKey` + t() (fr inchangé :
  Boutik/RDV mobile), TITLES → clés, greeting desktop, bandeau offline,
  Espace Pro/Console Admin, aria-labels (tab-bar, scan CTA, chat), rail droit
  « Voir mon profil ». <InstallBanner /> (Home) et carte « Application »
  (Profile) intouchés.
- `HomeScreen.tsx` : salutation, titre carte score + jauge, CTA scanner
  (titre/sous-ligne/aria), story Scanner, 4 titres de sections, « Voir la
  boutique », états vides. Wallet/récents/Route de l'Or non traduits
  (risque/périmètre), stories zones restent fr.
- `Onboarding.tsx` : écran 1 uniquement (h1, sous-titre, label, CTA, légal).
  Placeholder, badge POC et lien « Démo — Entrer comme Mariam » en fr FIXE
  (repère + format téléphonique), écrans 2-3 intouchés.
- `ProfileScreen.tsx` : retour Accueil (texte + aria) + carte « Langue de
  l'interface » (grille 2×2, min-h-12, aria-pressed, actif border-primary
  bg-primary/10 + Check, toast « Interface en X ») placée après « Mon profil
  peau », visuellement distincte de la langue TTS (indépendants).

## Méthode de traduction (traçable)
1. Script temporaire z-ai-web-dev-sdk (prompt calqué /api/tts) ×2 passes :
   le LLM recopiait le français → inutilisable tel quel.
2. Triangulation web : targumi.com (dioula attesté : I ni ce, Abaraka, Ani
   kènè…), « mo ho » baoulé ×2 sources, lexique bété de Gagnoa « yaho »,
   glosbe « nzue ». Glossaire LLM ancré sur ces formes : confirme les ancres,
   répond « ? » sur le reste → choix conservateur bq/bt = salutation seule.
3. dy écrit à la main sur ce socle (code-switching naturel : Scanner, RDV,
   wallet empruntés). Scripts temporaires supprimés après récolte.

## Vérifications
- `bun run lint` : 0 problème. `npx tsc --noEmit` : 0 erreur src/ (3
  préexistantes examples/skills).
- GET / 200 (curl) ; dev.log compiles propres, 0 erreur ; serveur :3000
  non touché ; agent-browser non utilisé.
- Simulation bun du store : initial « fr » → rehydrate() → « dy » ;
  setLang persiste {"state":{"lang":"bq"}} ; translate() fallbacks OK ;
  toutes les clés câblées présentes dans le dict fr.

## Limites
- Écrans non couverts restent fr : diagnostic, boutique, RDV, chat,
  notifications (clés déjà réservées dans DICTS), écrans 2-3 onboarding,
  Route de l'Or (marque), blocs wallet/stories non-scan.
- bq/bt : salutation uniquement — vocabulaire UI baoulé/bété non attestable
  sans relecture native ; ne rien inventer est un choix délibéré.
- Premier rendu toujours fr (skipHydration) : bascule ~immédiate post-montage
  pour les utilisatrices non-fr (compromis zéro-warning hydratation).
