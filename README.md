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

- **Cliente** (mobile-first, ≤ 430 px) : accueil, chatbot de triage (photo → VLM), diagnostic IA, jumeau 3D, route de l'or, historique/évolution, boutique + checkout Wave / Orange Money / Wallet Kènè (cashback), profil & wallet, prise de RDV avec acompte.
- **Pro** (institut) : dashboard KPI, agenda multi-praticiennes, CRM 360° avec fiche cliente (jumeau de peau agrégé, score RFM), catalogue soins/produits, POS (ticket SYSCOHADA), stock, paie CNPS CI / IPM SN, comptabilité (grand livre, OD, bilan).
- **Admin** : multi-instituts, santé de la plateforme.

## Stack technique

- **Next.js 16** (App Router, TypeScript strict) — tout dans `src/app`
- **Tailwind CSS 4 + shadcn/ui** (New York) + Framer Motion ; polices Ojuju / Questrial / IBM Plex Mono
- **Prisma + SQLite** (`prisma/schema.prisma`, client via `@/lib/db`)
- **Zustand** (persist) pour l'état client, sonner pour les toasts
- **3D** : @react-three/fiber + drei — rendu éprouvé en mode logiciel (DPR plafonné, `IntersectionObserver` → frameloop, refs mutables zéro re-render)
- **IA** : VLM du SDK `z-ai-web-dev-sdk` (backend uniquement, via `src/lib/ai/vlm.ts`) pour le diagnostic photo et le triage chat

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
├─ stores/ (zustand) · prisma/ · db/
```

**Règles maison** (issues des phases précédentes) :
1. Toute monnaie passe par `xof()` (mono + séparateurs fr-FR).
2. Le taux de cashback vient de la wallet cliente (`CASHBACK_RATE` en fallback) ; l'acompte RDV (30 % = `DEPOSIT_RATE`) est **revalidé côté serveur**.
3. Les scènes 3D ne mutent rien qui dérive de props : état interne possédé, props lues et comparées ; couleurs d'instances re-uploadées seulement pendant les transitions.
4. Chaque scène WebGL a un fallback (`#twin-static`, `#weave-static`, reduced-motion, WebGL absent).
5. Perf en rendu logiciel : Lambert + normales plates, pas d'opacité, pas de MSAA, DPR ≤ 1,5, budget ~60 fps.

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
