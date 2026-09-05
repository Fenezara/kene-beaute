# Task 63-b — full-stack-developer : persistance chat + stores robustes + contrat paiement front

Contexte lu : worklog.md (t. 55-60, notamment 60-a PWA, 60-b skipHydration/lang.ts, 60-c favorites),
src/store/lang.ts + use-t.ts (patterns rehydrate), les 5 écrans + types.ts + api.ts, ClientApp (lecture
seule — fichier 63-a). Contrat 63-c (backend paiement) figé : `ApiPayment.confirmToken?`, POST
/api/payments/confirm exige `{ paymentId, confirmToken }`.

## Fichiers créés
- `src/store/chat.ts` — store zustand persist « kene-chat », `skipHydration: true` (pattern lang.ts
  EXACT : serveur + hydratation sur l'état initial, relecture au montage de ChatScreen → zéro
  mismatch). State `messages: ChatMsg[]` ; `add(msg)` re-seed WELCOME si fil vide + cap mémoire 60
  (glisse les plus vieux) ; `reset()` vide et re-sème. `partialize` map `m => ({...m, photo:
  undefined})` → jamais un octet de base64 dans localStorage (quota 5 Mo), photos en mémoire de
  session. WELCOME (accueil Dr. Kènè) déplacée DANS le store (`welcomeMsg()`, horodatage au seed,
  id stable « w1 » persisté). Hook `useChat` exporté.

## Fichiers modifiés (chirurgicaux)
- `src/store/kene.ts` — robustesse persistance : `skipHydration: true`, `version: 1`,
  `migrate` + `merge` assainis par `sanitizePersisted()` (validation champ par champ : space/tab
  énumérés, user shape, proTenantId string ; cart → `isSaneCartLine` filtre qty/price non finis,
  null, id vide ; shape invalide → champ absent → valeur initiale). **Découverte clé** : zustand
  n'appelle `migrate` QUE si le storage porte un numéro de version ≠ 1 — les vieilles sessions
  SANS champ version (écrites avant t. 63-b) passent brutes dans `merge` → l'assainissement vit
  donc dans le `merge` aussi (merge minimal `{...current, ...sanitize(persisted)}`) + `migrate`
  pour les futures versions numérotées. `_keneHydrated: boolean` (false initial → true via
  `onRehydrateStorage` onFinish, même en erreur ; jamais persisté, liste blanche du partialize).
  `clearCart()` confirmé isolé (cart seul, user/space intacts). Filet de relecture module-level :
  événement « load » (après l'hydratation React, garde `hasHydrated()`), plus le rehydrate()
  au montage du shell (63-a) — idempotent, les deux cohabitent.
- `src/components/kene/client/types.ts` — `ApiPayment.confirmToken?: string` (contrat 63-c,
  doc inline : absent sur un pending → ne PAS confirmer).
- `src/components/kene/client/ChatScreen.tsx` — `useState<ChatMsg[]>` remplacé par le store
  (`useChat((s) => s.messages)` + `add`). Chaque envoi/réception/erreur-fallback → `add(...)` ;
  rehydrate paresseux au montage (garde `hasHydrated()` → les remontages suivants ne relisent
  PAS, photos de session préservées). Assistant arrive → `window.dispatchEvent(new
  CustomEvent("kene:chat:new", { detail: { at: Date.now() } }))` (contrat figé 63-a, seul point
  de couplage). Ids uniques inter-sessions (`m${Date.now().toString(36)}${seq}`) — un compteur
  simple serait entré en collision avec les ids persistés. Auto-scroll, /api/dermato/chat,
  fallback « Reformule ta question », photos, dictée : STRICTEMENT inchangés.
- `src/components/kene/client/ShopScreen.tsx` — fetch wallet `.catch(()=>{})` → `walletError`
  + `loadWallet()` re-fonctionnalisée ; encart discret role=alert « Solde indisponible —
  réessaie » + bouton « Réessayer » (h-11) dans le checkout ; bouton Wallet affiche
  « indisponible » et reste désactivé si solde inconnu. pay() : capture
  `r.payment.confirmToken` → passe `{ paymentId, confirmToken }` au confirm ; token absent sur
  un pending → PAS de confirm, `setCheckout(false)` + toast « Paiement impossible — réessaie
  dans quelques instants », rollback comme un échec (panier intact, aucun overlay).
- `src/components/kene/client/BookingScreen.tsx` — même traitement wallet (encart + Réessayer
  sous les modes de paiement du récap, bouton Wallet « (indisponible) ») ; book() : confirmToken
  exigé sur l'acompte wave pending → sinon rollback (payOverlay null + toast, récap intact).
- `src/components/kene/client/ProfileScreen.tsx` — déconnexion appelle AUSSI `clearCart()` avant
  `setUser(null)` (le panier ne survit jamais à une déconnexion — la prochaine utilisatrice
  n'hérite de rien) ; topup : réponse `{ payment: { id, confirmToken } }`, token absent → retour
  au formulaire + toast (aucun crédit fantôme), sinon confirm avec token.
- `src/components/kene/client/DiagnosticScreen.tsx` — produits `.catch(()=>{})` → `productsError`
  + `loadProducts()` ; encart « Boutique indisponible — réessaie » + Réessayer (h-11) en tête
  de la section « Produits recommandés » du ResultView (props productsError/onRetryProducts).

## Vérifications
- `bun run lint` : 0 problème. `npx tsc --noEmit` : 0 erreur src/ (3 préexistantes examples/
  + skills/ hors périmètre, inchangées).
- Simulation zustand en bun (script temporaire `sim-kene-tmp.ts`, SUPPRIMÉ après exécution) :
  23/23 contrôles OK — chat : état initial vide (skipHydration), seed WELCOME, localStorage
  écrit SANS photo (aucune clé photo, aucun base64), photo en mémoire, cap 60 (66 ajouts → 60,
  x3 en tête), persist suit le cap, rehydrate → 60 messages intacts sans photos, reset → w1
  seul ; kene : migrate/merge → session+onglet restaurés, 4 lignes panier → 1 saine (prix/qty
  null filtrés), _keneHydrated → true, clearCart isole le panier, shape invalide → initial,
  version 2 → migrate assaini.
- E2E agent-browser (390×844 puis fenêtre par défaut, :3000) : intro → Passer → Démo Mariam →
  accueil (wallet, score, 11 notifs) ; chat : seed WELCOME + question karité + réponse Dr.
  Kènè + localStorage « kene-chat » conforme ; onglet Boutik → retour chat → fil conservé ;
  RELOAD complet → session restaurée (Mariam, onglet chat conservé) + messages restaurés —
  le skipHydration + kick « load » + rehydrate du shell (63-a, arrivé en parallèle) composent ;
  console 0 erreur (seuls warnings THREE.Clock préexistants), 0 page error, aucun mismatch
  d'hydratation. WalletError : fetch /api/wallet patché pour rejeter → checkout affiche « Wallet
  Kènè indisponible » (désactivé) + encart role=alert + Réessayer → fetch restauré + Réessayer
  → solde 10 925 FCFA affiché, encart disparu. Navigateur fermé ensuite (mémoire).
- curl GET / → 200 ; dev.log propre (200, prisma, 0 erreur). Incident en cours de route :
  next-server OOM-tué + double relance (init-script et/ou agent parallèle, EADDRINUSE) →
  `bun run dev` relancé en arrière-plan, stabilisé 200. `bun run build` jamais lancé.

## Contrats respectés (inter-agents)
- 63-a (ClientApp, landed) : lit `(s as {...})._keneHydrated ?? true` (tolérant), rehydrate au
  montage, écoute « kene:chat:new » (n'allume le badge QUE hors onglet chat — je dispatch donc
  sur TOUT message assistant, y compris le fallback d'erreur).
- 63-c (backend, parallèle) : front prêt — `confirmToken` capturé sur orders/appointments/topup
  et transmis au confirm ; absence de token sur un pending → pas d'appel, toast + rollback.
- Fichiers interdits NON touchés : ClientApp.tsx, page.tsx, error.tsx, routes API, prisma.

## Limites
- Conversation PAR APPAREIL (localStorage) — pas de compte multi-appareils ; photos non
  persistées (rechargement → bulle texte conservée, image perdue) ; cap 60 messages.
- La relecture kene-store post-« load » implique un squelette de démarrage bref pour une
  utilisatrice déjà connectée (couvert par le BootSkeleton 63-a) — compromis zéro-mismatch
  assumé, identique à t. 60-b.
- WalletError/produitsError : couverts E2E côté Shop (pattern unique dupliqué à l'identique
  dans Booking/Diagnostic — non rejoués en navigateur pour économiser la mémoire du sandbox) ;
  l'interception réseau native d'agent-browser n'a pas mordu sur localhost (mock via patch
  window.fetch, SW désenregistré au passage puis re-registré par PwaProvider au reload).
- Chat multi-utilisatrices d'un même appareil : fil partagé (pas de reset à la déconnexion —
  le périmètre 63-b figeait la conversation comme donnée d'appareil, cf. mission).
