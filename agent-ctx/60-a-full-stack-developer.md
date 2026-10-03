# Task 60-a — full-stack-developer : PWA installable + cache offline réel

Contexte lu : worklog.md (t. 55-59 — conventions tokens/AA, cibles ≥ 40px, tutoiement FR, Lightning CSS strip backdrop-filter, backlog t. 59 item 1 « PWA non installable »).

## Fichiers créés
- `public/manifest.json` — name/short_name/description (reprise layout), start_url/scope "/", display standalone, orientation portrait, background #FAF7F2, theme #C8951E, lang fr, categories beauty/health/lifestyle/shopping, icônes 192 any + 512 any + maskable-512 (purpose "maskable").
- `public/sw.js` — SW JS pur, `VERSION = "kene-sw-v1"` :
  - install : precache individuel (catch par ressource) de "/" + 4 icônes, PAS de skipWaiting (contrôle par message).
  - activate : purge des caches hors KEEP_CACHES + clients.claim().
  - message "SKIP_WAITING" → self.skipWaiting().
  - fetch (GET + même origine uniquement) : (a) API données (diagnoses/shop/institutes/profile/notifications) network-first, clone JSON en `kene-data-v1` ; offline → Response recréée (corps + headers d'origine + `x-kene-offline: 1`, content-type application/json garanti) ; pas de cache → rejet propre. (b) images (/hero/ /products/ /instituts/ /skin/ + destination "image" + extensions) cache-first `kene-img-v1` fallback réseau. (c) navigations network-first → fallback "/" précaché. (d) reste (POST, autres /api/, /_next/, cross-origin) → réseau direct jamais caché. WS socket.io (mode websocket, pathname hors préfixes) → non intercepté.
- `src/components/kene/pwa/use-install.ts` — hook partagé `useInstallPrompt()` : { canInstall, promptInstall, isStandalone, isIOS }. Capture `beforeinstallprompt` dans un singleton module-level (survit aux montages/démontages, l'événement ne se perd pas), exposé via `useSyncExternalStore` (prompt / media-query standalone / userAgent iOS avec iPad masqué en Macintosh+touch). Purge sur `appinstalled` et sur acceptation. Aucun setState-in-effect (règle react-hooks v7).
- `src/components/kene/pwa/PwaProvider.tsx` — 'use client', rend null : register("/sw.js", { scope: "/" }) en try/catch silencieux (console.debug). updatefound → si `installing.state === "installed"` ET `navigator.serviceWorker.controller` → toast.info("Mise à jour de Kènè disponible", action "Recharger" → postMessage("SKIP_WAITING") + controllerchange(once) → reload, filet 1 500 ms, duration 8000). statechange écouté, cleanups complets (listeners retirés au démontage).
- `src/components/kene/pwa/InstallBanner.tsx` — bannière carte rounded-2xl border bg-card : KeneLogo 40px, « Installe Kènè sur ton téléphone » / « Accès en un tap, même hors-ligne », Button shadcn size sm + min-h-10 (bg-primary), croix X aria-label "Masquer" min-h-10 min-w-10. Fermeture → localStorage `kene-install-dismissed=1` (via useSyncExternalStore + storage event, jamais réaffichée). Installer → prompt natif ; accepté → toast.success "Kènè installée sur ton écran d'accueil 💛" + masque. `appinstalled` → masque. iOS (userAgent + 3 s de grâce sans prompt natif) → bouton déplie l'encart « Sur iPhone : bouton Partager ⬆️ puis « Sur l'écran d'accueil » » (icône Share lucide, height animé). Masquée si standalone. Animation framer-motion discrète (layout, y:10→0, 0,28 s — MotionConfig reducedMotion global respecté).

## Fichiers modifiés (chirurgicaux)
- `src/app/layout.tsx` — metadata : + `manifest: "/manifest.json"`, + `appleWebApp { capable: true, statusBarStyle: "default", title: "Kènè" }`, icons → { icon: "/kene-logo.svg", apple: "/icons/apple-touch-icon.png" }. Existant préservé. (Next 16 émet `mobile-web-app-capable` — équivalent moderne d'`apple-mobile-web-app-capable` — vérifié dans le HTML rendu.)
- `src/app/page.tsx` — montage `<PwaProvider />` dans le div racine, après `</main>` (aucun rendu, effets seuls).
- `src/components/kene/client/HomeScreen.tsx` — import + `<InstallBanner />` inséré entre le header de salutation et la section stories (5 lignes, rien d'autre touché).
- `src/components/kene/client/ProfileScreen.tsx` — carte « Application » (icône Smartphone, bouton « Installer Kènè » Download h-11 bg-primary → même hook ; iOS → toast.info instructions Partager ; navigateur sans prompt → toast.info installation manuelle ; standalone → pastille « déjà installée ») insérée entre la section RGPD et le bloc Espace pro. Imports : + Smartphone, + useInstallPrompt.

## Vérifications
- `bun run lint` → 0 problème (1re passe a fait remonter `react-hooks/set-state-in-effect` sur le pattern mounted/setState → refactor complet en useSyncExternalStore).
- `npx tsc --noEmit` → 0 erreur src/ (3 préexistantes hors périmètre : examples/, skills/).
- `node --check public/sw.js` → OK ; soft-hyphens parasites nettoyés.
- curl :3000 → `/manifest.json` 200 application/json, `/sw.js` 200 application/javascript, `/icons/*` 200, HTML head avec `<link rel="manifest">` + apple-touch-icon + apple-mobile-web-app-{title,status-bar-style} + mobile-web-app-capable.
- dev.log : GET / 200 compile saine, 0 erreur. Serveur :3000/:81 non touché, agent-browser non utilisé.

## Limites constatées
- Precache de "/" en dev = HTML de dev (coquille de secours offline tant que pas de build) ; en prod ce serait le HTML final.
- beforeinstallprompt/manifest installabilité : dépend du navigateur (Chrome/Edge/Android oui ; iOS → instructions manuelles ; Firefox desktop → toast manuel).
- Le cache `kene-data-v1` réplique les GET de données (y compris /api/profile/export RGPD) sur l'appareil — cohérent avec l'usage « mes données hors-ligne » du même appareil.
