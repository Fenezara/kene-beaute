# Kènè — La beauté mélanoderme, de A à Z.

Plateforme beauté et bien-être panafricaine : diagnostic de peau par IA calibrée peaux mélanodermes, instituts partenaires, boutique cosmétique aux botaniques africains — et gestion complète d'institut (agenda, CRM, caisse, paie CNPS/IPM, comptabilité SYSCOHADA).

> Kènè signifie « la peau, le corps » en moré. Le produit est traversé par un même récit : **le fil de Kente** — une navette d'or qui tisse l'accueil, le diagnostic, la routine, le temps et la boutique.

---

## Le récit du fil — 5 phases immersives

| Phase | Espace | Ce que vit la cliente |
|---|---|---|
| **A — Le Seuil** | Accueil | Porte d'entrée **une seule page** (t. 116) : médaillon + wordmark, reconnexion express sur une ligne, portails Cliente / Entreprise côte à côte, bande tissée compacte « La Navette d'Or » (~92 px, identique en 3D et Clair de Lune), ligne légale en pied collant ; accès instantané « **Explorer Kènè — sans inscription** » (t. 117) |
| **B — Ton Jumeau de Peau** | Diagnostic | Buste 3D procédural portant les marqueurs du diagnostic VLM par zone anatomique (23 pastilles, rotation interactive, orbite du Fil d'Or) ; jumeau agrégé côté Pro (CRM 360°) |
| **C — La Route de l'Or** | Résultats | Parcours narratif en 7 étapes : 4 stations (Purifier / Soigner / Nourrir / Protéger) matchant les produits aux indicateurs du diagnostic → institut (Sankofa) → **kente de soin tissé procéduralement** (canvas 2D, navette visible, signature, PNG téléchargeable) → panier en un geste |
| **D — Le Fil du Temps** | Historique | Skin Twin prospectif : curseur tissé S+0 → S+12, marqueurs qui guérissent en continu (modèle hybride), adhérence à la routine ; courbes d'évolution rétrospectives par indicateur (fusion floue des libellés VLM, projection pointillée dès le premier scan) — aussi côté Pro (ProEvolutionCard dans le CRM) |
| **E — Le Fil de la Boutique** | Boutique | Bande de kente tissée en WebGL dans le catalogue : chaque catégorie a SON fil (bissap / karité / or / sunset / baobab / mélanine) qui s'illumine et saute vers l'avant quand on filtre |

## Les trois espaces

- **Cliente** (**shell applicatif plein écran type app 2026** — Instagram/TikTok/Facebook) : mobile = header glass (cloche live, chat, thème) + flux plein cadre + **tab-bar 5 onglets avec CTA « Scanner » central surélevé** ; tablette (≥ 768 px) = **rail d'icônes vertical façon TikTok iPad** (la tab-bar disparaît, l'écran large est exploité) ; desktop = **sidebar gauche façon Instagram web** (nav verticale + bascule Espace Pro/Admin) + feed centré 640 px + **rail droit** (mini-profil, actions rapides, légal). Feed d'accueil : **stories par zone** (re-scan 1 tap + scores en anneau, libellés 2 lignes, dégradé d'affordance au scroll), carte score multi-zones avec **lecture vocale TTS multilingue** (français complet, **résumé compact traduit en dioula / baoulé / bété**), **résumé en pictos tapables** (tuile = 1 icône + 1 mot, se lit à voix haute), glossaire 1 tap, diagnostic IA, jumeau 3D, route de l'or, boutique **marketplace par institut** (bande « Acheter selon l'institut », catalogue groupé par vendeur, badge vendeur sur chaque carte — t. 113) + **Mes commandes** + checkout avec **code promo** (remise + cashback sur le montant payé) Wave / Orange Money / Wallet Kènè, profil & wallet, **photo de profil** (avatar uploadée depuis le Profil, affichée accueil + fiche — servie par le service média t. 120), **parrainage** (« Le Fil du Parrainage » : cadeau filleule 2 000 F, bonus parraine 2 500 F à la 1re commande payée, idempotent), prise de RDV avec acompte + **bouton WhatsApp vers l'institut** (fiche institut, message pré-rempli — t. 120), **rappels automatiques** (S+3 protocole, J-1, carte « Ta prochaine étape » + suivi WhatsApp live), **export « Mes données » RGPD art. 20** (JSON complet en 1 tap depuis le Profil), chatbot Dr. Kènè (LLM + triage photo, **entrée vocale ASR**), **compte-rendu PDF imprimable** de chaque diagnostic (score, indicateurs, routine — t. 119), **consentements explicites à l'inscription** (données de peau + conservation des photos, deux cases obligatoires), **abonnement Kènè+** (2 500 F/mois : diagnostics illimités + suivi d'évolution — gratuit = 1 diagnostic/mois), **Passeport de Peau** (vue publique partageable), **Le Cercle** (témoignages en cercle de sœurs), notifications temps réel + **push web**. Scroll **interne au shell** (le document ne scrolle jamais — hors onboarding) — transitions d'onglets animées, zéro espace perdu sur PC/tablette/mobile.
- **Pro** (institut) : dashboard KPI, agenda multi-praticiennes, **Diagnostic en cabine** (l'institut réalise le diagnostic de peau au sein de sa structure : questionnaire dermatologique structuré — 4 sections, 21 questions dont dépigération/grossesse en questions sensibles — ± photo analysée par le VLM, fusion déclaratif 38 % / observation 62 %, résultat + protocole enregistré dans le CRM, cliente notifiée si elle est sur l'app) ; **consentements cabine obligatoires** (photos + données de peau, recueillis avant l'entretien, tracés et horodatés — t. 119) ; **fiche de consultation papier** (PDF pré-rempli par cliente ou vierge : identité, consentements à signer — *signature ou empreinte digitale*, lecture à voix haute prévue pour les clientes non-lettrées — t. 120, peau connue, questionnaire complet, observations, protocole, signatures) + **comptes-rendus PDF imprimables** (cabine et self-scan cliente), CRM 360° (fiche cliente : jumeau de peau agrégé, évolution, ventes/RDV/**commandes boutique**/**avis**/notes — onglets t. 122, **notes privées persistées en base** et imprimées sur la fiche papier, plus de localStorage — t. 122, **diagnostics en institut dépliables**, score RFM, **bouton WhatsApp direct** pré-rempli — t. 120), **Commandes boutique** (section dédiée t. 122 : ce que les clientes commandent depuis l'app — KPIs du jour/à encaisser/à livrer/CA articles 30 j, liste complète cliente-articles-statut-coupon, marquer livrée, annulation avec remboursement wallet automatique + retour en stock, toast temps réel à chaque commande), **avis clientes remontés au dashboard** (carte « Derniers avis » + toast « Nouvel avis » temps réel — t. 122), **miroir peau synchronisé à chaud** (le type de peau/phototype déclaré dans l'app se propage instantanément aux fiches CRM de tous les instituts — t. 122), **Relances « Le Fil du Retour »** (KPI, filtres, WhatsApp wa.me pré-rempli, traiter/ignorer/réactiver), **Équipe** (registre du personnel — t. 121 : fiches complètes poste/contrat/salaire/matricule CNPS/compte app, pointage du jour arrivée-départ, embauche avec compte app optionnel, édition de fiche, sortie datée + réactivation ; icône Nkonsonkonson ; la paie paie les seules employées actives et pointe vers l'Équipe), catalogue soins/produits **avec photos réelles** (vitrine de l'institut depuis les Réglages, photo produit + photo soin depuis le Catalogue — upload redimensionné côté app, servies par `/api/media`, prime sur les visuels studio — t. 120), POS (ticket SYSCOHADA) avec **cliente express** (2 champs depuis la caisse, anti-doublon multi-formats — clientes sans compte Kènè, sans smartphone ou non-lettrées : tout vit dans la fiche CRM + la fiche papier), **Promos** (coupons % ou montant fixe, création/diffusion push live), stock, paie CNPS CI / IPM SN (+ e-CNPS XML), comptabilité (grand livre, OD, bilan, exports CSV) et **liasse comptable PDF en 1 clic** (dossier complet 7 sections, période au choix — prête pour le comptable/DGI) — badge & flux « En direct » (RDV, ventes, commandes, avis) via socket.io. **Sécurité t. 122** : toutes les routes `/api/pro/*` exigent une session signée (fin du mode anonyme legacy — le port exposé ne livre plus ni prénoms ni montants) ; `/api/pro/live` (flux machine) protégé par secret de service `x-notify-secret` partagé avec le notify-service ; fiche CRM isolée par institut (une gérante ne peut lire ni modifier la fiche d'une cliente d'un autre institut) ; avis verrouillé au RDV de sa propriétaire (403 si emprunt d'appointmentId, 409 en doublon). Shell pleine largeur : mobile = chips + en-tête compact (institut + En direct) ; **tablette (≥ 768 px) = rail d'icônes 76 px** (libellés dès lg) ; desktop = sidebar 240 px libellée.
- **Admin** : multi-instituts, santé de la plateforme (console pleine largeur, KPI 6 cartes dont Parrainages, courbe diagnostics 14 j, top instituts).

## Stack technique

- **Next.js 16** (App Router, TypeScript strict) — tout dans `src/app`
- **Tailwind CSS 4 + shadcn/ui** (New York) + Framer Motion ; polices Ojuju / Questrial / IBM Plex Mono
- **Prisma + SQLite** (`prisma/schema.prisma`, client via `@/lib/db`)
- **Zustand** (persist, `src/store/kene.ts`) pour l'état client, sonner pour les toasts
- **3D** : @react-three/fiber — rendu éprouvé en mode logiciel (DPR plafonné, `IntersectionObserver` → frameloop, refs mutables zéro re-render)
- **IA** : VLM du SDK `z-ai-web-dev-sdk` (backend uniquement, via `src/lib/ai/vlm.ts`) pour le diagnostic photo et le triage photo du chat ; LLM du même SDK pour Dr. Kènè (`/api/dermato/chat`) et pour la **traduction des narrations vers dioula / baoulé / bété** ; TTS via `POST /api/tts` (WAV 24 kHz, cache mémoire serveur 32 Mo + cache blob client FIFO 8) — narration française complète (`src/lib/kene/narration.ts`), **résumé compact multilingue** (traduction LLM → synthèse), lecture lente 0.85×
- **Temps réel** : mini-service socket.io `mini-services/notify-service` (port 3004, relais sans logique métier) — cloche cliente `user:{id}` + badge institut `tenant:{id}` ; poussé par `notify()` et les API, poll 8 s + push, heartbeat anti-zombie ; le front passe par la gateway (`io('/?XTransformPort=3004')`)
- **PDF zéro-dépendance** : moteur PDF minimal maison (`src/lib/accounting/pdf.ts` — exporté et réutilisable : `PdfDoc`, primitives texte/rects/segments) — pages A4, polices standard Helvetica (WinAnsi, accents FR), métriques AFM, pagination & pieds de page — alimente la liasse comptable (`GET /api/pro/accounting/export?format=pdf`) ET les documents de consultation (`src/lib/kene/consultation-pdf.ts` : fiche de consultation 2-3 p., comptes-rendus cabine/self-scan 1-2 p. — t. 119)

## Palette & design tokens

Palette panafricaine en variables CSS (light + dark) : or `#C8951E` (aplats décoratifs), bissap `#8B1A3B`, vert baobab `#346834`, sunset `#B45309`, terre bogolan `#A0522D`, mélanine `#1A1410`, crème karité `#F8F1E4`. **Contrastes WCAG AA vérifiés dans les 2 thèmes (t. 55)** : `--primary` light = `#8F660D` (or profond, 4.6-4.9:1 en texte ET boutons), variantes `--gold-text` / `--sunset-text`, variables `--score-*` thème-adaptées via `scoreVar()`, dégradés CTA terre→bissap ≥ 5.6:1, pastilles score auto-contrastées (`readableTextColor`). `prefers-reduced-motion` respecté globalement (`MotionConfig reducedMotion="user"` + media query CSS). Bandes kente en `repeating-linear-gradient`, filigranes bogolan en `radial-gradient`.

## Architecture

```
src/
├─ app/
│  ├─ page.tsx             # route unique /
│  └─ api/                 # 72 routes :
│     ├─ auth/             #   otp/request · otp/verify · consent · profile
│     │                     #   (+ express — accès sans inscription ·
│     │                     #   logout · session · pro/register)
│     │                     #   (+ profile/export — portabilité RGPD)
│     ├─ diagnoses/        #   GET,POST (+ /evolution) (+ /report —
│     │                     #   compte-rendu PDF self-scan)
│     ├─ dermato/          #   photo (VLM) · chat (LLM Dr. Kènè)
│     ├─ appointments/     #   GET,POST (+ [id]/cancel · [id]/review)
│     ├─ institutes/       #   (+ [id] · [id]/availability)
│     ├─ shop/products (marketplace : maison + instituts actifs) ·
│     │                     #   orders · payments/confirm
│     ├─ media/[type]/[id] #   t. 120 — service d'images : vitrine institut ·
│     │                     #   photo produit · photo soin · avatar cliente
│     │                     #   (bytes cacheables, 404 net si pas de photo)
│     ├─ wallet/           #   (+ /topup)
│     ├─ coupons/          #   /validate (checkout)
│     ├─ referral/         #   (+ /redeem)
│     ├─ notifications/    #   (+ /read)
│     ├─ tts/ · asr/       #   synthèse vocale (fr|dy|bq|bt) · entrée vocale
│     ├─ passport/ · gold-threads/ · testimonials/ · subscriptions/ ·
│     │   push/            #   Passeport public · fils d'or · Cercle ·
│     │                     #   Kènè+ · web push
│     ├─ pro/              #   overview · live · appointments · clients
│     │                     #   (+ clients/[id] PATCH — notes privées
│     │                     #   persistées, t. 122)
│     │                     #   orders (GET — commandes boutique passées
│     │                     #   depuis l'app, t. 122) + orders/[id] (PATCH
│     │                     #   livrée/annulée — remboursement wallet auto
│     │                     #   + retour en stock, t. 122)
│     │                     #   catalog · coupons (+ diffuse)
│     │                     #   sales · stock · followups · employees
│     │                     #   (GET+POST+PATCH — fiche, compte app,
│     │                     #   sortie/réactivation · + attendance)
│     │                     #   payroll (+ run · ecnps)
│     │                     #   accounting (+ manual · export csv|pdf)
│     │                     #   · diagnoses (en cabine : questionnaire ± VLM
│     │                     #   + consentements, /report = compte-rendu PDF)
│     │                     #   · consultation-sheet (fiche papier PDF)
│     │                     #   · institute-photo (vitrine de l'institut)
│     └─ admin/stats · security
├─ components/kene/
│  ├─ client/              # ClientApp (shell) · HomeScreen (feed) ·
│  │                       # DiagnosticScreen · ShopScreen · BookingScreen ·
│  │                       # ChatScreen · ProfileScreen · NotificationCenter ·
│  │                       # VoiceNarration (+ langues) · PictoSummary ·
│  │                       # ParrainageCard · GlossaryDialog · SpeakButton ·
│  │                       # ttsAudio (cache blob) · bits · types
│  ├─ pro/                 # ProApp (shell) · Dashboard · Agenda ·
│  │                       # Diagnostics (cabine) · Pos · Crm · Relances ·
│  │                       # Catalog · Coupons · Stock ·
│  │                       # Payroll · Accounting · types · ui-bits · useApi
│  ├─ admin/AdminApp.tsx
│  ├─ intro/               # INERTE (retiré de la landing t. 116) —
│  │                       #   KenteIntro · Intro3D · chapters · introState
│  ├─ skintwin/            # Phases B & D — SkinTwinCard · SkinTwinScene ·
│  │                       # ProjectionSlider · twinMath · mode
│  ├─ route/               # Phase C — RitualJourney · WovenBand · ritual
│  ├─ evolution/           # EvolutionCard (cliente) · ProEvolutionCard (CRM)
│  ├─ weave/               # Phase E — KenteWeaveCard · KenteWeaveScene · threads
│  ├─ loom/                # LoomSection (bande Navette d'Or de la landing,
│  │                       #   t. 116) · KenteIdentity · WovenDivider ·
│  │                       #   useLoomMode (#moonlight) — GoldenLoom INERTE
│  ├─ market/              # INERTE (retiré de la boutique t. 115) —
│  │                       #   MarcheVivant · MarketScene
│  ├─ herbier/             # Herbier (jardin botanique) · Herbier3D · plants
│  ├─ descent/ · cercle/ · constellation/
│  │                       #   SkinDescent/Descent3D (descente du diagnostic)
│  │                       #   · CercleKene (témoignages) · AdinkraSky (ciel)
│  ├─ pwa/                 # PwaProvider (SW v6) · InstallBanner
│  └─ icons.tsx · ThemeToggle · SpaceSwitcher
├─ lib/
│  ├─ kene/                # lib PURES (aucune dépendance React) :
│  │   ├─ format.ts        #   xof(), dates, scoreColor(), contrastes…
│  │   ├─ narration.ts     #   narration FR + compacte multilingue + NARRATION_LANGS
│  │   ├─ questionnaire.ts #   diagnostic en institut : questions, scoring par
│  │   │                   #   indicateur, drapeaux (dépigération, grossesse…),
│  │   │                   #   recommandations, fusion questionnaire ± VLM
│  │   ├─ glossary.ts      #   28 définitions simples (≤300 chars, TTS-compatible)
│  │   ├─ evolution.ts · coupons.ts · followups.ts · referral.ts ·
│  │   ├─ reminders.ts · narration · live-socket.ts · realtime.ts
│  │   └─ rfm.ts · server.ts · api.ts · types.ts
│  ├─ accounting/          # syscohada · csv · pdf (moteur PDF maison)
│  └─ ai/vlm.ts            # prompts + parsing VLM (tri-tiers VLM→heuristique)
├─ store/kene.ts           # zustand (persist)
prisma/ (schéma + seed) · db/ (SQLite) · mini-services/notify-service/
```

À côté de `src/` : `mini-services/notify-service/` — relais socket.io :3004 (temps réel cloche cliente + badge institut), consommé par le front via la gateway (`io('/?XTransformPort=3004')`). Démarrage : `cd mini-services/notify-service && bun run dev` (bun --hot, port 3004).

**Règles maison** (issues des phases précédentes) :
1. Toute monnaie passe par `xof()` (mono + séparateurs fr-FR).
2. Le taux de cashback vient de la wallet cliente (`CASHBACK_RATE` en fallback) ; l'acompte RDV (30 % = `DEPOSIT_RATE`) est **revalidé côté serveur**.
3. Les scènes 3D ne mutent rien qui dérive de props : état interne possédé, props lues et comparées ; couleurs d'instances re-uploadées seulement pendant les transitions.
4. Chaque scène WebGL a un fallback (`#twin-static`, `#weave-static`, reduced-motion, WebGL absent).
5. Perf en rendu logiciel : Lambert + normales plates, pas d'opacité, DPR ≤ 1,5, budget ~60 fps.
6. Toute rangée horizontale scrollable porte un **signal d'affordance** (cercle partiel + dégradé `ScrollFadeRow`) : le contenu hors écran doit rester découvrrible.

## Utilisateurs & littératie — repères 2026

Cœur de cible : femmes 20-45 peaux mélanodermes (Abidjan pilote, expansion UEMOA), prescriptrices jeunes, et côté B les instituts. En Côte d'Ivoire, l'alphabétisation des adultes reste partielle (~56 %, femmes ~47 %) et le français n'est la première langue de presque personne : **la lecture ne peut pas être le seul canal**.

| Segment | Poids | Barrière principale | Garde produit Kènè |
|---|---|---|---|
| Digitale lettrée (18-35) | fort | Exigence d'expérience, churn silencieux | Intro skippable, vitesse, design soigné, cashback, **gestes 2026** (tirer-actualiser, swipe entre onglets, double-tap panier, haptique) ✅ |
| Semi-lettrée numérique (25-45) | le plus fort | Parcours multi-étapes, jargon, formulaires | Diagnostic photo d'abord (VLM, zéro saisie), libellés Léger/Moyen/Fort, glossaire 1 tap ✅, checkout wallet en 1 geste |
| Non-lectrice / illettrée | ~40 % des femmes selon zones | Tout texte = exclusion | Photo + lecture vocale TTS (normal **ou lente**) + **résumé en pictos tapables** ✅ + glossaire 1 tap ✅ |
| Langue première locale | dominant | Le français parlé exclut aussi | **Narration compacte traduite en dioula / baoulé / bété** ✅ (traduction IA indicative) |
| Rurale / petite data | fort hors villes | Coût data, téléphones d'entrée de gamme | Fallbacks 3D statiques (`#twin-static`, `#weave-static`), compression photo 820px + toast « léger pour ta connexion » ✅, **bandeau hors-ligne + données affichées** (façon Wave) ✅ |
| WhatsApp-first | dominant | Ne quitte pas WhatsApp | WhatsApp déjà canal (relances, commande, parrainage) |
| Méfiante (peur dépigmentation) | transverse | IA « qui juge la peau » = boîte noire | Résultats par indicateur explicites, aucune promesse d'éclaircissement, orientation dermato |
| Gérante d'institut organisée | cœur B | — | CRM/caisse/compta complets + liasse PDF |
| Praticienne peu administrative | fréquent B | Saisie = friction → CRM vide | Cliente express 2 champs depuis la caisse ✅, données auto (diagnostic client, ventes POS, commandes) |
| Droits sur ses données | transverse | Confiance + RGPD | **« Mes données » : export JSON complet en 1 tap** ✅ |

Risques d'échec classés : 1) non-lectrices → funnel vide silencieux ; 2) pro non-saisissante → promesse 360° non tenue ; 3) méfiance → bad buzz possible ; 4) semi-lettrées → abandon en milieu de parcours ; 5) petites data → poids de l'app ; 6) digitales exigeantes → déception comparative.

## Limites assumées (version d'essai) & priorités

- Paiements en **mode essai** (wallet interne + transactions, **aucun débit réel**) — intégration Wave Business / Orange Money à venir.
- Code de vérification **affiché à l'écran en mode essai** — envoi SMS réel à venir (modèle `OtpCode` déjà dans le schéma Prisma).
- Traductions dioula/baoulé/bété **IA indicatives** — voix natives locales indisponibles dans le moteur TTS actuel.
- SQLite mono-fichier — passage Postgres prévu à l'échelle.
- Backlog priorisé : ~~lecture vocale TTS~~ ✅ (t. 39) → ~~glossaire 1 tap~~ ✅ (t. 40) → ~~compression photo~~ ✅ (t. 41) → ~~cliente express~~ ✅ (t. 42) → ~~lecture lente FLN~~ ✅ (t. 43) → ~~liasse PDF comptable~~ ✅ (t. 44) → ~~refonte UX « app 2026 » plein écran~~ ✅ (t. 45) → ~~finitions tablette/libellés~~ ✅ (t. 46) → ~~audit mobile 360° (390/360, clair/sombre) + affordances scroll~~ ✅ (t. 47-48) → ~~portabilité RGPD « Mes données »~~ ✅ (t. 49) → ~~langues locales (dioula/baoulé/bété)~~ ✅ (t. 50) → ~~résumé en pictos non-lectrices~~ ✅ (t. 51) → ~~audit & réécriture README~~ ✅ (t. 52-53) → ~~diagnostic en institut + questionnaire (espace Pro)~~ ✅ (t. 54) → ~~audit normes WCAG AA + UX gestes apps 2026 (Instagram/TikTok/Wave)~~ ✅ (t. 55) → ~~boutique marketplace par institut~~ ✅ (t. 113) → ~~compaction boutique + retrait du Marché vivant~~ ✅ (t. 114-115) → ~~landing « une seule page » (tous modes/écrans)~~ ✅ (t. 116) → ~~vocabulaire produit « mode essai » — plus aucun mot de prototype à l'écran~~ ✅ (t. 117) → ~~photos réelles (vitrine institut, produits, soins, avatar cliente) + service média cacheable + WhatsApp dans les deux sens + empreinte digitale sur la fiche papier~~ ✅ (t. 120) → ~~gestion des employées (section Équipe : fiches, pointage, embauche, sortie/réactivation) + purge des traces de chantier dans le code servi + favicon.ico + icônes PWA régénérées + responsive 3 tailles revérifié~~ ✅ (t. 121) → **reste** : OTP réel (nécessite une passerelle SMS — `OtpCode` prêt), paiements réels Wave/OM (nécessite des identifiants marchands), voix TTS natives locales.

### Conformité & UX livrées (t. 55)

- **WCAG 2.1 AA** : contrastes light refondus (cause racine or corrigée ~80 % des défauts), cibles tactiles ≥ 44 px sur les parcours critiques (pills langues, chips, qty POS, dots intro, Sheet close 36 px + « Fermer »), h1 unique par vue à tout format, focus visible partout (chat réparé), dialogs modaux sur les overlays paiement, `aria-required`/labels OTP, hiérarchie h2/h3 dans les Sheets.
- **UX Instagram/TikTok/Wave** : pull-to-refresh (indicateur NeaOnnim + toast + haptique), swipe horizontal entre onglets avec transitions directionnelles, double-tap « ajout rapide » burst panier kente, succès paiement animé (coche dessinée + confettis kente + montant), haptique Android (patterns tap/light/medium/success), badge panier rebond, bandeau hors-ligne résilient.

## Comptes de test (seedés)

Seeded dans `prisma/seed.ts` (SQLite) — p. ex. **Mariam Diallo** (cliente riche : 3 diagnostics seedés + wallet, parraine Awa & Bintou), **Awa Traoré** (cliente filleule, projection pointillée dès le 1er scan), comptes Pro : **Éclat d'Abidjan** (CI, gérante Fatou Koné +225 070 908 0706) et **Institut Baobab** (SN, Dakar, Ndeye Sow), plus la **Console Kènè** (admin).

## Scripts

```bash
bun run dev        # dev server (port 3000, log dans dev.log)
bun run lint       # eslint
bun run db:push    # pousse le schéma Prisma (workflow de ce repo — pas de migrations)
bun run db:generate
# temps réel (à part) :
cd mini-services/notify-service && bun run dev   # socket.io :3004 (bun --hot)
```

Variables d'environnement (`.env`) : `DATABASE_URL` (requis) ; optionnelles avec défauts — `NOTIFY_SERVICE_URL`, `PUSH_SECRET`, `APP_URL`.

Logo partout : favicon navigateur (`/favicon.ico` + SVG), icônes PWA d'installation (`public/icons/` — badge Duafe doré régénéré par `bun scripts/gen-logo.ts`), splash PWA (manifest `background_color` crème + thème or), écran d'amorçage et en-têtes de TOUS les espaces (médaillon Kènè). QA rapide : suffixer l'URL de `#moonlight` (mode Clair de Lune sans WebGL), `#twin-static` ou `#weave-static` (puis recharger) force les fallbacks statiques. L'accès instantané « Explorer Kènè — sans inscription » (landing) ouvre le compte Mariam.
