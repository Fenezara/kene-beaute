# Task 60-d — Rate limiting API (429) + gestion front 429 + toast hors-ligne

Mission : limiter les routes API sensibles de Kènè (fenêtre glissante mémoire,
429 + Retry-After), gérer le 429 côté front (toast sonner avec délai formaté) et
signaler le mode hors-ligne posé par le service worker (header `x-kene-offline`).

## Lib créée
**src/lib/kene/rate-limit.ts** (importable par les route handlers uniquement) :
- `rateLimit(key, { limit, windowMs })` → `{ ok, remaining, retryAfterSec }` —
  fenêtre glissante : Map buckets `{ hits: number[], windowMs }` de timestamps ;
  un slot se libère à l'expiration du hit le plus ancien (`retryAfterSec` réel).
- Purge paresseuse des buckets inertes toutes les 5 min **au call** (`now - lastPurgeMs`),
  aucun `setInterval` → aucun timer qui fuit.
- État sur `globalThis.__keneRateLimitStore` → singleton qui survit au HMR Turbopack.
- `rlKey(req, scope)` → IP via `x-forwarded-for` (1re IP de la chaîne, derrière
  gateway Caddy) sinon `x-real-ip`, sinon `"local"` → `${scope}:${ip}`.
- `rateLimitResponse(retryAfterSec, message)` → 429 JSON `{ error, retryAfterSec }`
  + header `Retry-After`.
- Presets : `OTP_REQUEST 10/15min` (spéc 5, relevé à 10 pour le flux démo
  « Entrer comme Mariam »), `OTP_VERIFY 12/15min`, `DERMATO 30/min`,
  `PAYMENTS 12/min`, `REFERRAL_REDEEM 5/1h`, `TTS 12/min`, `AUTH_MUTATION 20/min`.

## Routes protégées (insertion chirurgicale en tête de handler, AVANT le try)
| Route | Preset | Message 429 |
|---|---|---|
| POST /api/auth/otp/request | 10/15min | « Trop de demandes de code — réessaie dans X min » |
| POST /api/auth/otp/verify | 12/15min | « Trop de tentatives de code — réessaie dans X min » |
| POST /api/dermato/chat | 30/min | « Dr. Kènè est très sollicitée — reprends dans quelques secondes » |
| POST /api/dermato/photo | 30/min | idem |
| POST /api/payments/initiate | 12/min | « Trop de requêtes de paiement — patiente quelques secondes » |
| POST /api/payments/confirm | 12/min | idem |
| POST /api/referral/redeem | 5/1h | « Trop de tentatives de code parrain — réessaie dans X min » |
| POST /api/tts | 12/min | « Synthèse vocale très sollicitée — reprends dans quelques secondes » |
| POST /api/auth/consent | 20/min | « Trop de mises à jour d'affilée — réessaie dans quelques secondes » |
| PATCH /api/auth/profile | 20/min | idem |

Pas de GET sur /api/dermato/* ni /api/payments/* (seuls POST existent → seuls
POST protégés). Scopes distincts par endpoint (`dermato:chat` ≠ `dermato:photo`)
pour ne pas pénaliser un diagnostic (photo + coach dans le même flux).

## Front (src/lib/kene/api.ts — helper central `handle()`)
- **429** : `retryAfterSec` lu du body JSON, fallback header `Retry-After` →
  `toast.error(body.error || "Trop de tentatives", { description: "Réessaie dans 45 s / 1 min 30 s / 15 min" })`
  (formatDelay : secondes < 60, sinon « X min Y s ») → puis **throw ApiError
  existant** (comportements locaux des écrans inchangés).
- **`x-kene-offline: "1"`** (posé par public/sw.js d'une autre tâche) :
  `toast.info("Mode hors-ligne", { description: "Données affichées depuis le cache" })`
  **throtté 1/30 s** (variable module-level `lastOfflineToastAt`) → les données
  sont ensuite retournées NORMALEMENT (flux jamais cassé). Sonner importé sans
  souci : la lib n'est utilisée que par des composants clients, `<Toaster>` monté
  dans page.tsx.
- ttsAudio.ts (fetch blob direct, pas JSON) : le message serveur 429 remonte déjà
  via son propre catch → non touché.

## Vérifications
- curl : otp/verify 12×400 puis 13e → **429** `{"error":"...","retryAfterSec":900}` +
  `Retry-After: 900` ; tts 12×400 puis 13e → **429 retryAfterSec 60** ; otp/request
  10×200 puis 11e → **429 « réessaie dans 15 min »** ; IP différente non bloquée
  (buckets isolés par IP) ; flux normaux 200/201/404 inchangés.
- `npx tsc --noEmit` : 0 erreur src/ (3 préexistantes hors périmètre).
- `bun run lint` : **0 problème**.
- dev.log : compilations propres, aucune erreur.

## Note pour l'agent principal — fichiers PWA touchés (hors périmètre initial)
`bun run lint` échouait sur `react-hooks/set-state-in-effect` dans
**src/components/kene/pwa/use-install.ts** et **InstallBanner.tsx** (fichiers de
la tâche PWA concurrente) → corrigés au pattern React recommandé sans changer
le comportement ni l'API publique (`useInstallPrompt`, bannière) :
- use-install.ts : 3 useState+useEffect → `useSyncExternalStore` (subscribe sur
  le singleton listeners + matchMedia, snapshots = deferredPrompt /
  detectStandalone / detectIOS, server snapshot false/null). Singleton
  module-level et rattrapage beforeinstallprompt conservés.
- InstallBanner.tsx : `mounted` → useSyncExternalStore isClient ; `dismissed`
  → initialiseur lazy useState (localStorage lu avec garde window + try/catch,
  hydratation safe car mounted=false pendant l'hydratation). Timer 3 s et
  appinstalled inchangés (setters en callbacks, conformes).
