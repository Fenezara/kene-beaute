# 63-c — full-stack-developer (backend, blindage flux paiement)

Contexte lu avant intervention : worklog t. 60-d (rate-limit lib + presets), 60-e (push VAPID, notify-service bun --hot), 61 (E2E vagues 60-a→60-f). Audit 62 fourni dans la mission.

## Périmètre (aucun fichier front touché)
- prisma/schema.prisma, src/app/api/payments/confirm, src/app/api/orders, src/app/api/wallet/topup, src/app/api/appointments (+ [id]/cancel), src/lib/kene/server.ts, src/lib/kene/coupons.ts (redeemCoupon tx), src/lib/kene/rate-limit.ts (presets), src/lib/kene/confirm-token.ts (NOUVEAU)
- SUPPRIMÉS : src/app/api/route.ts, src/app/api/payments/initiate/route.ts (grep preuve : zéro usage front)
- Non touchés : src/components/**, src/store/**, src/lib/kene/api.ts (63-b en parallèle)

## Contrat confirmToken (figé 63-b, respecté à la lettre)
- Routes créant un Payment pending (orders POST wave/orange, appointments POST acompte wave/orange, wallet/topup) : `crypto.randomBytes(24).toString("hex")` → sha256 hex stocké dans `payment.confirmTokenHash`, token BRUT renvoyé dans `payment.confirmToken` de la réponse (hash JAMAIS sérialisé — serializePayment/paymentWithConfirmToken de src/lib/kene/confirm-token.ts).
- Paiement wallet (succès instantané) : PAS de token (preuvé : payment.confirmTokenHash null + réponse payment null).
- POST /api/payments/confirm exige { paymentId, confirmToken } (zod, token absent/vide → 400 « Code de confirmation requis ») ; hash null → 400 « Paiement sans code de confirmation — recommence l'opération » ; mismatch → 400 « Code de confirmation invalide » (Buffer + crypto.timingSafeEqual sur les digests sha256).

## TOCTOU + atomicité
- Confirm : updateMany conditionnel `{ id, status: "pending" } → success` + TOUS les effets (cashback, topup wallet, order paid, acompte RDV, décrément stock + InventoryMovement, notifications, rewardReferrer) dans UN `prisma.$transaction` ; count 0 → « Paiement déjà confirmé » 400 (si success) sinon 404. Échec d'effet → rollback total, paiement reste pending, rejouable avec le même token.
- Orders POST : flux complet en $transaction (order.create, redeemCoupon (tx), payment.create + hash si pending, order.update paymentId, debitWallet/creditWallet, rewardReferrer, stock+InventoryMovement, notify) ; coupon race → throw dédié (OrderFlowError) → rollback + 400 message FR existant ; pushTenantFeed HORS transaction (après commit). GET : take: 20 (orderBy createdAt desc inchangé).
- Appointments POST : booking (appointment + payment) en $transaction ; wallet garde AVANT la tx ; notify + rappel J-1 après commit.
- Cancel : refund vers appointment.userId (VRAI propriétaire) ; `body.userId !== appointment.userId` → 403 « Ce rendez-vous ne t'appartient pas » ; refund + status cancelled en $transaction ; refund=0 si wallet impossible.
- Helpers (server.ts) : ensureWallet/creditWallet/debitWallet/notify/rewardReferrer + coupons.redeemCoupon acceptent `tx?: Prisma.TransactionClient` (défaut db) — tous les appelants historiques (referral/redeem, cancel, pro…) inchangés, vérifiés par grep + tsc 0.

## Rate-limits (presets nouveaux dans rate-limit.ts)
- payments/confirm 20/min, orders POST 12/min, wallet/topup 8/min, appointments POST 12/min, appointments cancel 12/min — 429 { error, retryAfterSec } + Retry-After, messages FR standard.

## Preuves curl (résumé — détails dans worklog 63-c)
- a) orders wave Mariam → 201 + payment.confirmToken (48 hex, hash absent de la réponse)
- b) confirm sans token → 400 ; mauvais token → 400 ; bon token → 200 + order paid + stock 25→24 + cashback unique 225 + wallet 10925→11150
- c) re-confirm → 400 « Paiement déjà confirmé » (aucun double effet)
- d) topup jetable → token → confirm → wallet 5000 (+ mauvais token → 400)
- e) appointment acompte wave → token → confirm → RDV confirmed + depositAmount 3000 ; cancel par tiers → 403 ; cancel par propriétaire → refund 2400 (80 %) sur SON wallet (5000→7400)
- Wallet path orders : paid instantané, payment null, balance 20000→15725, hash null
- Legacy payment sans hash → 400 dédié ; paymentId inconnu → 404
- 429 prouvés sur les 5 scopes (burst) avec messages FR
- DONNÉES DE TEST NETTOYÉES : stock 25, wallet Mariam 10925, orders 4, payments 5, notifs 19 (= état initial), users jetables supprimés

## Infra incident (pas causé par mes edits)
- next.config.ts modifié par un agent parallèle → restart Next en cascade → EADDRINUSE → serveur :3000 mort + notify-service zombie (SIGTERM handler bloqué sur httpServer.close) → :3004 muet. J'ai restauré :3000 relancé quand curl ≠ 200 (règle OOM), puis le notify-service relancé détaché (double-fork setsid, log → .zscripts/mini-service-notify-service.log) : handshake 200 + « socket app enregistrée ». AUCUN changement de code du service.
- Nettoyage : zombie 1189 tué (port déjà libéré), une seule instance bun --hot :3004 au final.

## Qualité finale
- `bun run lint` → 0 problème ; `npx tsc --noEmit` → 0 erreur src/ (3 préexistantes examples/skills hors périmètre)
- curl GET / → 200 ; notify :3004 → 200 ; dev.log tail : uniquement 200/201/400/404/429 attendus, 0 erreur compile
- Schéma poussé (`bun run db:push`, 22 ms) : Payment.confirmTokenHash + index chauds (Diagnosis/Order/Notification [userId, createdAt], Appointment [tenantId, startAt], Sale [tenantId, createdAt], WalletTransaction [walletId, createdAt], OtpCode [phone])
