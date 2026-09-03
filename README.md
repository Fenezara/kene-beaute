# Kènè — La beauté mélanoderme, de A à Z.

Plateforme beauté et bien-être panafricaine : diagnostic de peau par IA calibrée peaux mélanodermes, instituts partenaires, boutique cosmétique aux botaniques africains — et gestion complète d'institut (agenda, CRM, caisse, paie CNPS/IPM, comptabilité SYSCOHADA).

> Kènè signifie « la peau, le corps » en moré. Le produit est traversé par un même récit : **le fil de Kente** — une navette d'or qui tisse l'accueil, le diagnostic, la routine, le temps et la boutique.

---

## Le récit du fil — 5 phases immersives

| Phase | Espace | Ce que vit la cliente |
|---|---|---|
| **A — Le Fil de Kente** | Accueil | Introduction 3D immersive (WebGL, six chapitres au fil d'or) ; fallback CSS statique et `prefers-reduced-motion` |
| **B — Ton Jumeau de Peau** | Diagnostic | Buste 3D procédural portant les marqueurs du diagnostic VLM par zone anatomique (23 pastilles, rotation interactive, orbite du Fil d'Or) ; jumeau agrégé côté Pro (CRM 360°) |
| **C — La Route de l'Or** | Résultats | Parcours narratif en 7 étapes : 4 stations (Purifier / Soigner / Nourrir / Protéger) matchant les produits aux indicateurs du diagnostic → institut (Sankofa) → **kente de soin tissé procéduralement** (canvas 2D, navette visible, signature, PNG téléchargeable) → panier en un geste |
| **D — Le Fil du Temps** | Historique | Skin Twin prospectif : curseur tissé S+0 → S+12, marqueurs qui guérissent en continu (modèle hybride), adhérence à la routine ; courbes d'évolution rétrospectives par indicateur (fusion floue des libellés VLM, projection pointillée dès le premier scan) |
| **E — Le Fil de la Boutique** | Boutique | Bande de kente tissée en WebGL dans le catalogue : chaque catégorie a SON fil (bissap / karité / or / sunset / baobab / mélanine) qui s'illumine et saute vers l'avant quand on filtre |

## Les trois espaces

- **Cliente** (mobile-first, ≤ 430 px) : accueil, chatbot de triage (photo → VLM), diagnostic IA, jumeau 3D, route de l'or, historique/évolution, **lecture vocale TTS du diagnostic** (« Écouter le résumé » + mode lent), **glossaire 1 tap** (définitions simples lues à voix haute), boutique + checkout Wave / Orange Money / Wallet Kènè (cashback), « Mes commandes », profil & wallet, prise de RDV avec acompte, cloche de notifications temps réel.
- **Pro** (institut) : dashboard KPI, agenda multi-praticiennes, CRM 360° avec fiche cliente (jumeau de peau agrégé, score RFM), catalogue soins/produits, POS (ticket SYSCOHADA) avec **cliente express** (2 champs depuis la caisse, anti-doublon multi-formats), stock, paie CNPS CI / IPM SN, comptabilité (grand livre, OD, bilan, exports CSV) et **liasse comptable PDF en 1 clic** (dossier complet 7 sections, période au choix — prête pour le comptable/DGI) — badge & flux « En direct » (RDV, ventes, commandes) via socket.io.
- **Admin** : multi-instituts, santé de la plateforme.

## Stack technique

- **Next.js 16** (App Router, TypeScript strict) — tout dans `src/app`
- **Tailwind CSS 4 + shadcn/ui** (New York) + Framer Motion ; polices Ojuju / Questrial / IBM Plex Mono
- **Prisma + SQLite** (`prisma/schema.prisma`, client via `@/lib/db`)
- **Zustand** (persist) pour l'état client, sonner pour les toasts
- **3D** : @react-three/fiber + drei — rendu éprouvé en mode logiciel (DPR plafonné, `IntersectionObserver` → frameloop, refs mutables zéro re-render)
- **IA** : VLM du SDK `z-ai-web-dev-sdk` (backend uniquement, via `src/lib/ai/vlm.ts`) pour le diagnostic photo et le triage chat ; TTS du même SDK via `POST /api/tts` (narration française du diagnostic, `src/lib/kene/narration.ts`, cache mémoire 32 Mo + cache blob client)
- **Temps réel** : mini-service socket.io `mini-services/notify-service` (port 3004, relais sans logique métier) — cloche cliente `user:{id}` + badge institut `tenant:{id}` ; poussé par `notify()` et les API, poll 8 s + push, heartbeat anti-zombie ; le front passe par la gateway (`io('/?XTransformPort=3004')`)
- **PDF zéro-dépendance** : moteur PDF minimal maison (`src/lib/accounting/pdf.ts`) — pages A4, polices standard Helvetica (WinAnsi, accents FR), métriques AFM pour l'alignement à droite des montants, pagination & pieds de page — alimente la liasse comptable (`GET /api/pro/accounting/export?format=pdf`, ~80 Ko/7 pages en <200 ms)

## Palette & design tokens

Palette panafricaine en variables CSS (light + dark) : or `#C8951E`, bissap `#8B1A3B`, vert baobab `#3F7D3F`, sunset `#E07A2B`, terre bogolan `#A0522D`, mélanine `#1A1410`, crème karité `#F8F1E4`. Variantes `--gold-text` / `--sunset-text` garantissent un contraste WCAG AA dans les deux thèmes. Bandes kente en `repeating-linear-gradient`, filigranes bogolan en `radial-gradient`.

## Architecture

```
src/
├─ app/                    # route unique / + API routes
│  └─ api/                 # admin, appointments, auth, dermato, diagnoses
│                          # (+ /evolution), institutes, orders, payments,
│                          # pro, shop, wallet
├─ components/kene/
│  ├─ client/              # écrans cliente (mobile-first)
│  ├─ pro/                 # back-office institut
│  ├─ admin/               # supervision
│  ├─ intro/               # Phase A — intro 3D (chapters.ts, Intro3D…)
│  ├─ skintwin/            # Phases B & D — jumeau 3D + projection S+12
│  ├─ route/               # Phase C — Route de l'Or (ritual.ts, WovenBand…)
│  ├─ evolution/           # Phase D — courbes d'évolution (SVG pur)
│  ├─ weave/               # Phase E — bande kente WebGL réutilisable
│  ├─ icons.tsx / ThemeToggle / SpaceSwitcher
├─ lib/kene/               # lib PURES (aucune dépendance React) :
│  │  ├─ format.ts         # xof(), dates, scoreColor(), readableTextColor(),
│  │  │                    # CASHBACK_RATE, DEPOSIT_RATE, SEVERITY_STYLES
│  │  ├─ evolution.ts      # agrégation historique + projection S+12
│  │  ├─ rfm.ts / server.ts / api.ts / types.ts
└─ stores/ (zustand) · prisma/ · db/
```

À côté de `src/` : `mini-services/notify-service/` — relais socket.io :3004 (temps réel cloche cliente + badge institut), consommé par le front via la gateway (`io('/?XTransformPort=3004')`).

**Règles maison** (issues des phases précédentes) :
1. Toute monnaie passe par `xof()` (mono + séparateurs fr-FR).
2. Le taux de cashback vient de la wallet cliente (`CASHBACK_RATE` en fallback) ; l'acompte RDV (30 % = `DEPOSIT_RATE`) est **revalidé côté serveur**.
3. Les scènes 3D ne mutent rien qui dérive de props : état interne possédé, props lues et comparées ; couleurs d'instances re-uploadées seulement pendant les transitions.
4. Chaque scène WebGL a un fallback (`#twin-static`, `#weave-static`, reduced-motion, WebGL absent).
5. Perf en rendu logiciel : Lambert + normales plates, pas d'opacité, pas de MSAA, DPR ≤ 1,5, budget ~60 fps.

## Utilisateurs & littératie — repères 2026

Cœur de cible : femmes 20-45 peaux mélanodermes (Abidjan pilote, expansion UEMOA), prescriptrices jeunes, et côté B les instituts. En Côte d'Ivoire, l'alphabétisation des adultes reste partielle (~56 %, femmes ~47 %) et le français n'est la première langue de presque personne : **la lecture ne peut pas être le seul canal**.

| Segment | Poids | Barrière principale | Garde produit Kènè |
|---|---|---|---|
| Digitale lettrée (18-35) | fort | Exigence d'expérience, churn silencieux | Intro skippable, vitesse, design soigné, cashback |
| Semi-lettrée numérique (25-45) | le plus fort | Parcours multi-étapes, jargon, formulaires | Diagnostic photo d'abord (VLM, zéro saisie), libellés Léger/Moyen/Fort, glossaire 1 tap ✅, checkout wallet en 1 geste |
| Non-lectrice / illettrée | ~40 % des femmes selon zones | Tout texte = exclusion | Photo + lecture vocale TTS (normal **ou lente**) + glossaire 1 tap ✅, pictogrammes (suite) |
| Rurale / petite data | fort hors villes | Coût data, téléphones d'entrée de gamme | Fallbacks 3D statiques (`#twin-static`, `#weave-static`), compression photo 820px + toast « léger pour ta connexion » ✅ |
| WhatsApp-first | dominant | Ne quitte pas WhatsApp | WhatsApp déjà canal (relances, commande) |
| Méfiante (peur dépigmentation) | transverse | IA « qui juge la peau » = boîte noire | Résultats par indicateur explicites, aucune promesse d'éclaircissement, orientation dermato |
| Gérante d'institut organisée | cœur B | — | CRM/caisse/compta complets |
| Praticienne peu administrative | fréquent B | Saisie = friction → CRM vide | Cliente express 2 champs depuis la caisse ✅, données auto (diagnostic client, ventes POS, commandes) |

Risques d'échec classés : 1) non-lectrices → funnel vide silencieux ; 2) pro non-saisissante → promesse 360° non tenue ; 3) méfiance → bad buzz possible ; 4) semi-lettrées → abandon en milieu de parcours ; 5) petites data → poids de l'app ; 6) digitales exigeantes → déception comparative.

## Limites assumées (démo) & priorités

- Paiements **simulés** (wallet interne + transactions) — intégration Wave Business / Orange Money à venir.
- Connexion par sélecteur de démo — OTP réel prévu (modèle `OtpCode` déjà dans le schéma Prisma).
- SQLite mono-fichier — passage Postgres prévu à l'échelle.
- Backlog priorisé : ~~lecture vocale TTS~~ ✅ (t. 39) → ~~glossaire 1 tap~~ ✅ (t. 40) → ~~compression photo~~ ✅ (t. 41) → ~~cliente express~~ ✅ (t. 42) → ~~lecture lente FLN~~ ✅ (t. 43) → ~~liasse PDF comptable~~ ✅ (t. 44) → restent côté pro : OTP réel (`OtpCode` prêt, nécessite une passerelle SMS), paiements réels Wave/OM (nécessite des identifiants marchands), portabilité données RGPD ; côté cliente : langues locales réelles (voix dioula/baoulé custom — indisponibles dans le moteur TTS actuel), pictogrammes purs.

## Comptes de démonstration

Seeded dans `prisma/seed.ts` (SQLite) — p. ex. **Mariam** (cliente, 7 diagnostics historiques pour les courbes), **Awa** (cliente neuve, projection pointillée dès le 1er scan), comptes Pro (institut Palmensiel Abidjan) et Admin.

## Scripts

```bash
bun run dev        # dev server (port 3000, log dans dev.log)
bun run lint       # eslint
bun run db:push    # pousse le schéma Prisma
bun run db:reset   # reset + seed
```

QA rapide : suffixer l'URL de `#twin-static` ou `#weave-static` (puis recharger) force les fallbacks non-WebGL.
