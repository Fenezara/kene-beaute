# Task 63-a — full-stack-developer — Résilience de rendu + code splitting

Contexte lisible par les agents suivants : worklog.md section « Task ID: 63-a » (détail complet).
Scope respecté : MES fichiers exclusifs uniquement (src/app/page.tsx, src/app/error.tsx,
src/components/kene/client/{ClientApp,ScreenBoundary,BootSkeleton}.tsx) — ChatScreen, ShopScreen,
BookingScreen, ProfileScreen, DiagnosticScreen, HomeScreen, NotificationCenter, Onboarding,
kene.ts, api.ts, routes API jamais édités (agents parallèles).

## Fichiers créés
- `src/app/error.tsx` — Error Boundary racine App Router ('use client', {error, reset}) :
  fallback brandé (KeneLogo, HeartHandshake, tokens bg-background/text-foreground), message
  « Oups — une erreur inattendue est survenue », boutons h-12 « Réessayer » (reset, autoFocus)
  et « Recharger la page » (location.reload), console.error dans useEffect, role="alert" +
  h1 sr-only. Zéro fiche technique dans l'UI.
- `src/components/kene/client/ScreenBoundary.tsx` — class component (getDerivedStateFromError +
  componentDidCatch, log `[kene:screen:{name}]`) : fallback carte inline (bg-card border
  rounded-2xl p-6, AlertTriangle, « La section {name} a rencontré un souci »), boutons h-11
  Réessayer (setState reset + clé `attempt` → enfant remonté NEUF) / Recharger la page.
  Attrape AUSSI les rejets d'import lazy (chunk introuvable) : la frontière est au-dessus du Suspense.
- `src/components/kene/client/BootSkeleton.tsx` — plein écran min-h-dvh bg-background,
  wordmark « Kènè » font-heading (Ojuju) text-primary, Loader2 spin, sr-only « Kènè démarre… »,
  role="status" aria-busy. Réutilisé comme loading de next/dynamic (Pro/Admin).

## Fichiers édités
- `src/components/kene/client/ClientApp.tsx` :
  - lazy() pour DiagnosticScreen / ShopScreen / BookingScreen / ChatScreen / NotificationCenter
    (exports nommés → `.then(m => ({ default: m.X }))`) ; HomeScreen + Onboarding restent eager.
    Suspense DANS le motion.div key={tab} (fallback TabLoading : Loader2 + sr-only « Chargement… »,
    role="status" aria-busy) ; cloche du header : Suspense dédié BellLoading (h-11 w-11 = même
    empreinte que le bouton, zéro décalage).
  - Chaque écran d'onglet (Accueil, Diagnostic, Boutique, Rendez-vous, Chat, Profil) enveloppé
    dans <ScreenBoundary name="…"> ; la Sheet NotificationCenter laissée telle quelle.
  - Badge chat honnête : useState(false) + écouteur window « kene:chat:new » (CustomEvent,
    détail { at }) → setChatUnread(true) SEULEMENT si onglet ≠ chat (lecture fraîche via
    useKene.getState()) ; goTab("chat") éteint ; cleanup au démontage.
  - Gate d'hydratation : `hydrated = useKene((s) => (s as { _keneHydrated?: boolean })._keneHydrated ?? true)`
    + `useEffect(() => void useKene.persist.rehydrate(), [])` (une fois, idempotent) ;
    !hydrated → <BootSkeleton/> avant tout (plus de flash d'onboarding). 63-b ÉTAIT déjà atterri
    quand j'ai édité : le sélecteur lit le vrai flag (SSR rend BootSkeleton, rehydrate → app).
- `src/app/page.tsx` : ProApp + AdminApp passés en `next/dynamic` (ssr: false, loading:
  BootSkeleton, exports nommés adaptés via .then()) — recharts + ~12 600 lignes Pro/Admin
  sortent du first-load client. Gating `space` inchangé, seul le chargement change.

## Vérifications live (agent-browser, 390×844)
- BootSkeleton → KenteIntro → démo « Mariam » → shell complet ; reload propre : session + onglet
  persisté restaurés (Boutique) SANS flash d'onboarding ; console 0 erreur après reload propre.
- Chunks séparés observés dans le Network tab : src_components_kene_client_ChatScreen_tsx_*.js,
  ShopScreen_tsx_*.js, DiagnosticScreen_tsx_*.js (chargés et rendus via la frontière lazy).
- Événement kene:chat:new dispatché en console → aria-label « Dr. Kènè — chat — 1 nouveau message » ;
  clic chat → badge éteint + ChatScreen rendu.

## Limites / incidents
- Injection d'erreur runtime (Intl.NumberFormat patché) pour tester ScreenBoundary en live :
  page figée + OOM noyau (next-server 4211, 4e occurrence) → test interrompu VOLONTAIREMENT
  (machine contrainte mémoire, chrome aussi OOM-killed) ; la frontière est vérifiée structurellement
  (compile + câblage + API React standard), pas par crash réel.
- Après OOM : relance manuelle + auto-recovery de l'environnement se sont_course (EADDRINUSE
  transitoires) ; stabilisé en laissant le superviseur faire seul (12×200 consécutifs en veille
  passive). Leçon : après OOM, attendre ~2 min l'auto-recovery avant toute relance manuelle.
- Dev Turbopack précharge les chunks lazy juste après le premier rendu (comportement dev) ;
  le chargement à la demande au premier clic est le comportement PROD (next build interdit ici).
