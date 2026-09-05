# Task 60-e — Web Push VAPID (notifications même app fermée)

Agent : full-stack-developer
Statut : TERMINÉ — lint 0, tsc src/ 0, node --check sw.js OK, pipeline prouvé par curls.

## Contexte lu avant intervention
- `worklog.md` (t. 57-60-d) : conventions (toasts sonner tutoyés, tokens Tailwind or/terre, pas de bleu/indigo, cibles ≥ 40 px, Lightning CSS strip backdrop-filter → classes Tailwind natives, pas de restart du dev server).
- `public/sw.js` (kene-sw-v1, stratégies cache par type de requête), `src/components/kene/client/NotificationCenter.tsx`, `src/lib/kene/api.ts`, `src/lib/kene/rate-limit.ts`, `mini-services/notify-service/index.ts` (poll + diff cache), `.env`.

## Fichiers créés
| Fichier | Rôle |
|---|---|
| `src/app/api/push/public-key/route.ts` | GET → { publicKey } ou { publicKey: null } (toujours 200) |
| `src/app/api/push/subscribe/route.ts` | POST { userId, subscription } → upsert par endpoint, 20/min |
| `src/app/api/push/unsubscribe/route.ts` | POST { endpoint } → deleteMany idempotent |
| `src/app/api/push/dispatch/route.ts` | POST { secret, userId } → web-push vers toutes les subs du user, purge 404/410/ENOTFOUND, 60/min, route INTERNE |
| `src/lib/kene/push-client.ts` | isPushSupported, getPushStatus, getActivePushSubscription, urlBase64ToUint8Array, subscribeToPush, pushKeyToBase64 |

## Fichiers modifiés (éditions chirurgicales)
- `prisma/schema.prisma` : + modèle `PushSubscription` (endpoint @unique) → `bun run db:push` (serveur vivant avant/après).
- `.env` : + VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT / PUSH_SECRET (DATABASE_URL intact).
- `public/sw.js` : + `push` (payload { title, body, url }, fallbacks sûrs, showNotification try/catch) et `notificationclick` (close → focus première fenêtre sinon openWindow(data.url)).
- `src/components/kene/client/NotificationCenter.tsx` : carte « Rappels sur mon téléphone » pinnée en bas du Sheet (Smartphone/Loader2, Switch shadcn h-10 w-14 pouce size-7, aria-label), état réel au montage (permission + abonnement), activation/désactivation avec toasts exacts du brief, guard navigateur non supporté.
- `mini-services/notify-service/index.ts` : dans `poll()`, après diff cache (fil FRAIS) → fetch fire-and-forget `POST ${APP}/api/push/dispatch` { secret, userId } `.catch(() => {})`, timeout 8 s, jamais bloquant.

## Preuves (curl, user réel cmtjda…f1j3l)
- GET /api/push/public-key → 200 `{"publicKey":"BFOiKWo…"}`
- POST subscribe fausse sub (https://example.test/push/abc123) → `{"ok":true}`
- POST dispatch (bon secret) → `{"sent":0,"failed":1}` + purge auto (count 0, dev.log ENOTFOUND + DELETE FROM PushSubscription)
- dispatch #2 → `{"sent":0,"failed":0}` · secret erroné → 403 · endpoint http → 400 · user inconnu → 404
- LIVE : socket join → notify-service « feed émis (join) » → POST /api/push/dispatch 200 dans dev.log + purge liveproof.

## Statut des services
- Next :3000 : vivant en continu (jamais relancé, jamais build). db:push autorisé → fait + vérifié.
- notify-service :3004 : `bun --hot` a rechargé mon édition (log « en écoute » ×2) — je ne l'ai PAS redémarré, il répond 200.

## Limites connues
- Sandbox sans push service navigateur réel → notification système non visualisable ici ; envoi prouvé serveur→web-push (échec ENOTFOUND purgé).
- Dispatch déclenché uniquement sur poll d'une utilisatrice CONNECTÉE (architecture actuelle du service) : pour du vrai « app fermée », ajouter un cron dédié itérant les userIds avec PushSubscription.
