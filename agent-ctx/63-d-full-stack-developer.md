# Task 63-d — full-stack-developer — Robustesse IA + validation + hygiène backend

Contexte lisible par les agents suivants : worklog.md section « Task ID: 63-d » (détail complet).
Scope respecté : aucun fichier front (src/components/**, src/store/**), pas api.ts, ni les
réservations 63-c (schema.prisma, payments/*, orders, wallet/topup, appointments, api/route.ts,
server.ts — lus, jamais édités).

## Fichiers créés
- `src/lib/kene/with-timeout.ts` — `withTimeout<T>(p, ms, label)` (Promise.race + `TimeoutError`
  typée, timer nettoyé au finally). Réutilisable partout.

## Fichiers édités
- `src/lib/ai/vlm.ts` — createVision (vision + triage) sous withTimeout 45 s → fallback EXISTANT
  (fallbackResult / triage jaune). 5 casts `Record<string, any>` → `unknown` + `isRecord()`.
- `src/app/api/dermato/chat/route.ts` — withTimeout 30 s → 502 « Assistant momentanément indisponible ».
- `src/app/api/tts/route.ts` — zod (text ≤1200 [garde SDK 1000 conservée, message existant],
  lang enum, speed 0.5-2, voice tolérée) + withTimeout 45 s traduction & synthèse → 502 FR.
- `src/lib/kene/rate-limit.ts` — presets DIAGNOSES_CREATE 6/min, PRO_DIAGNOSES 10/min,
  COUPONS_DIFFUSE 4/min, ADMIN_STATS 30/min (ajoutés APRÈS les presets 63-c posés en parallèle —
  cohabitation vérifiée, pas de conflit).
- `src/app/api/diagnoses/route.ts` — rate-limit POST (avant parse) + GET take 20 (imageData gardé).
- `src/app/api/pro/diagnoses/route.ts`, `src/app/api/pro/coupons/diffuse/route.ts` — rate-limits POST.
- `src/app/api/admin/stats/route.ts` — rate-limit 30/min + cache globalThis `__keneAdminStatsCache`
  TTL 60 s (payload identique, aucun champ ajouté).
- `src/app/api/notifications/route.ts` — take 30 (sent + scheduled) ; backfill/due-runner intacts.
- `src/app/api/wallet/route.ts` — transactions take 20.
- `src/app/api/institutes/route.ts` + `[id]/route.ts` — select explicite (retiré : ownerName,
  ownerPhone, phone, address, plan, commissionRate, active, type, createdAt, commissionPct services).
- `src/app/api/pro/clients/route.ts` — POST : cast manuel → zod, messages FR inchangés.
- `src/app/api/auth/otp/request/route.ts` — purge deleteMany expiresAt < now avant création.
- `next.config.ts` — headers nosniff + Referrer-Policy (AUCUN frame-blocking : iframe preview).

## Preuves (curl / bun)
- Timeout : promesse hangée → TimeoutError 402 ms ; vainqueur → valeur, process sorti net.
- 6 POST vides /api/diagnoses → 400, 7e → 429 (rate-limit avant parse).
- OtpCode : AVANT 43/43 expirés → otp/request → APRÈS 1/0.
- institutes + [id] : jq leaks tous null, services sans commissionPct.
- tts : lang "zz" → 400 « Langue invalide (fr, dy, bq ou bt) » ; text 1500 → 400 « max 1200 ».
- dermato/chat : POST live → 200 en 6,3 s.
- headers :3000 et :81 : nosniff + Referrer-Policy présents.
- lint 0 ; tsc = 3 préexistantes examples/skills uniquement ; dev.log propre ; GET / 200.

## Incidents environnement (à connaître)
- next-server OOM-killé (5e fois) → relance selon précédent ; instances successives reapingées
  entre invocations (63-c redémarre aussi le serveur → un EADDRINUSE observé). Instance finale
  setsid détachée : GET / 200 en fin de session.
- notify-service :3004 DOWN en fin de session (process vivant, plus en écoute) — non redémarré
  conformément aux règles. Un cron de dispatch push dédié reste à faire (cf. worklog 60-e).
