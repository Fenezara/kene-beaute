# Kènè — Worklog

Projet : plateforme beauté panafricaine (PRD v1.0) — Next.js 16, TS strict, Prisma/SQLite, VLM z-ai-web-dev-sdk, Tailwind 4 + shadcn/ui, single-page `/` avec 3 espaces (Cliente/Pro/Admin) commutés via Zustand.

Conventions :
- Palette : or #C8951E, terre #A0522D, mélanine #1A1410, baobab #3F7D3F, indigo finance #1B3A6B, karité #F8F1E4, bissap #8B1A3B, sunset #E07A2B. Fonts : Ojuju (titres), Questrial (corps), IBM Plex Mono (chiffres). Icônes Adinkra SVG dans `src/components/kene/icons.tsx`.
- Tout l'UI visible est dans `/` (src/app/page.tsx). APIs REST sous `/api/*`. SDK z-ai uniquement backend.
- DB : `import { db } from "@/lib/db"` (déprécier l'ancien log query ? non, ok).
- Utilitaires : `src/lib/kene/{types,rfm,format}.ts`, `src/lib/payroll/index.ts`, `src/lib/accounting/syscohada.ts`, `src/lib/ai/vlm.ts`.

---
Task ID: 1+2+3
Agent: main (Z.ai Code)
Task: Design system, schéma Prisma, libs métier, seed

Work Log:
- globals.css : palette panafricaine light/dark, patterns kente-band / bogolan-dots, heatmaps spectrales (pigment/inflammation/acne), filtres spectre-*, print .print-area
- layout.tsx : fonts Google Ojuju/Questrial/IBM Plex Mono via next/font, lang fr, ThemeProvider next-themes, metadata Kènè
- components/kene/icons.tsx : icônes Adinkra SVG (Duafe logo, Sankofa, Aban, NeaOnnim, Osram, Fihankra, Kente, Baoule, Karité, Baobab, Moringa) + KeneLogo + BogolanWatermark
- public/kene-logo.svg
- prisma/schema.prisma : 30 modèles multi-tenant (User, Tenant, Resource, Service, ClientProfile, Appointment, Diagnosis, Product, Sale, InventoryMovement, Wallet, Payment, Order, Review, Notification, Employee, Attendance, PayPeriod, Payslip, ChartAccount, JournalEntry, Consent, AuditLog, OtpCode…) — poussé en DB
- prisma/seed.ts exécuté : 2 tenants (Éclat d'Abidjan CI / Institut Baobab SN), 4 users (Mariam cliente démo +2250701020304, Ndeye pro, admin), 9 services, 13 produits (8 boutique + 5 POS), 11 clients CRM avec segments RFM, 15 RDV (passés/aujourd'hui/semaine), 29 ventes 30 jours avec écritures CA/BQ, plan SYSCOHADA + capitaux + achat + paie journalisée, 6 employés (4 CI, 2 SN), pointage 7j, 1 PayPeriod + 4 Payslips, wallet Mariam 12 500 FCFA, 3 diagnostics passés (visage×2, mains), avis, notifications SMS/WhatsApp simulées
- lib/payroll/index.ts : computePayrollCI (CNPS pension 6,3/7,7 % plafond 3 375 000 ; PF 5 %, maternité 0,75 %, AT 2 % plafond 70 000 ; congés 8 % ; IGR barème 5 tranches ; CN 1,5 %), computePayrollSN (IPM PF 7 % plafond 63 000 ; IPRES 5,6/8,4 % ou cadres 2,4/3,6 % plafond 432 000 ; IR SN 7 tranches), buildECnpsXml export e-CNPS
- lib/accounting/syscohada.ts : plan SYSCOHADA 30+ comptes, splitTVA 18 %, saleJournalLines/purchaseJournalLines/payrollJournalLines, computeBalance, buildStatements (bilan + résultat + TVA à payer)
- lib/kene/rfm.ts : rfmScore + segments, cancellationRefund (>72h 100 % / 24-72h 80 % / 2-24h 30 % / <2h 0), generateDaySlots, MOMO_OPERATORS
- lib/kene/types.ts : DiagnosisResult complet (14 indicateurs visage, zones_marquages bbox %, recommandations, ABCDE), BODY_ZONES pondérés (visage 40 %, nævi 20 %, dos 15 %…), SPECTRAL_VIEWS, RFM_SEGMENTS
- lib/kene/format.ts : xof(), formatDate/Time, severity/score colors, genRef
- lib/ai/vlm.ts : runDiagnosis (prompt VLM spécialisé Fitzpatrick IV-VI, JSON strict, normalisation, fallback déterministe) + triageLesion (vert/jaune/rouge)

Stage Summary:
- Fondations 100 % : design system + DB seedée + moteurs métier paie/compta/RFM/VLM
- Démo : cliente Mariam +2250701020304 (wallet 12 500, 3 diagnostics), tenant pro « Éclat d'Abidjan » CI avec 30 jours de données
- Prochaine étape : store Zustand + APIs REST + UI 3 espaces

---
Task ID: 8-c
Agent: subagent-C (Pro + Admin)

Task: APP PRO complète (Dashboard, Agenda, Caisse POS, CRM, Catalogue, Stock, Paie, Compta) + Console Admin

Work Log:
- src/components/kene/pro/types.ts : types de réponse du contrat API /api/pro/* & /api/admin/stats (re-export PayrollLine depuis lib/payroll)
- src/components/kene/pro/useApi.ts : hook local useApi(fn, deps) → { data, loading, error, refetch, setData } (pas de React Query)
- src/components/kene/pro/ui-bits.tsx : briques partagées (KpiCard+KenteTop, Money=font-mono+xof, ApptStatusBadge, JournalBadge, ClasseBadge, EmptyState, ErrorState, LoadingBlock, SectionHeader, InitialAvatar, dayLabel robuste « 16/08 » ou ISO)
- ProApp.tsx : shell desktop-first — sidebar 240px bg-sidebar (logo compact, sélecteur d'institut pattern multi-tenant, badge plan+ville+pays, nav 8 sections avec icônes Adinkra, user démo « Fatou Koné — Gérante »), chips horizontales <lg, motion par section, tenant par défaut mémorisé via useKene.setProTenantId
- DashboardSection : 6 KPI cards kente-band-soft, BarChart CA 14j (var(--chart-1), tooltip xof), PieChart paiements (Wave #1DC8FF / Orange #FF7900 / Espèces or / Carte vert) + légende %, top soins, timeline du jour (heure font-mono, statut), alertes stock bissap → nav Stock
- AgendaSection : vue semaine 7 col × créneaux 30 min (9h-20h, scroll 70vh, blocs RDV colorés resource.color avec color-mix), vue jour (chips L-D), nav ‹ Aujourd'hui › ; détail RDV en Dialog avec actions PATCH confirm/complete (toast « Vente encaissée + compta auto »)/cancel/no-show/reschedule (date+heure+praticienne) ; création RDV : combobox Command clientes (recherche nom/tél) ou nouvelle cliente, service, praticienne, date+heure 30 min, notes ; praticiennes déduites des RDV sur fenêtre large −30j/+45j (resourceId réel du champ top-level, fallback resource.id puis nom)
- PosSection : 2 panneaux — catalogue (Tabs Soins|Produits, cards +1 ticket) / ticket (steppers qty, remise, TOTAL or, cliente optionnelle, 4 boutons paiement brand colors), overlay succès animé (check spring), Sheet ticket thermique print-area w-[300px] font-mono noir/blanc (TVA 18% via splitTVA, n° ticket, window.print), ventes récentes ×5 avec re-print
- CrmSection : recherche debounced (q serveur), 3 stats (clientes, panier moyen, champions), chips filtres RFM (RFM_SEGMENTS + RFM_SEGMENT_STYLES), table (avatar initiale, tél, dernière visite, visites, total font-mono, badge segment) → Sheet fiche : RFM 3×5 dots calculés via rfmScore, diagnostics IA liés (imageData avec préfixe « file: » strippé), Tabs Ventes/RDV/Notes (localStorage kene-crm-note-{id})
- CatalogSection : Tabs Soins|Produits, cards (catégorie, durée, prix mono, commission %, botanicals, stock+alerte produits, visuel), Switch actif/inactif → PATCH, menu … (modifier/activer), Dialog création/édition avec aperçu visuel /products/*.webp
- StockSection : alertes bissap en tête, table inventaire (img 40px, stock mono + badge alerte, seuil, valeur), Dialog mouvement (Entrée/Sortie/Perte + motif) → POST, historique mouvements badges colorés (in success / out terre / loss bissap)
- PayrollSection : (a) cards employés (rôle, contrat, pays CI/SN, salaire mono, n° CNPS/IPRES) + pointage du jour (badge présent/retard/absent, Pointer arrivée/départ, heures mono) + Dialog embauche (cadres IPRES si SN) ; (b) exécution paie (input month → POST run, 400 si validée) + 5 KPI (masse brute, patronales, salariés, IGR/IR+CN, net) calculés depuis les payslips (robuste aux clés totalsJson) ; (c) périodes expandables avec table bulletins + vue bulletin A4 imprimable (print-area 720px : en-tête, régime depuis detailsJson, lignes PayrollLine base/taux/gains/retenues + part employeur, NET À PAYER, pied « Conforme CNPS CI / IPM SN ») + export e-CNPS XML (blob download ecnps-{period}.xml, périodes CI) + note IPRES si SN
- AccountingSection : sous-tabs Journal (entries expandables, JournalBadge CA/BQ/PA/OD, lignes D/C mono + check équilibre, saisie manuelle OD Dialog avec lignes dynamiques + équilibre live) / Grand livre (select compte → lignes chrono + solde progressif + solde final) / Balance (groupée par classe avec CLASSES_LABELS + ClasseBadge, TOTAUX + égalité D=C) / Liasse fiscale (print-area : TVA collectée/déductible/à payer finance, Bilan actif/passif + équilibre, Compte de résultat avec RÉSULTAT NET coloré, bouton Exporter → window.print)
- AdminApp : header « Console Kènè » + kente-band, 5 KPI (users, tenants, diagnostics, commandes, GMV mono + commissions), LineChart diagnostics 14j, table instituts avec barre proportion or→terre, note POC
- Robustesse inter-agents : ressources agenda via resourceId top-level (l'API n'expose pas resource.id imbriqué) ; dates chart acceptées « 16/08 » ou ISO ; totalsJson/payroll via calcul client ; sale.items reconstruits si absents du POST

Qualité:
- tsc --noEmit : 0 erreur sur src/components/kene/{pro,admin} ; eslint pro+admin : 0 error 0 warning
- POST /api/pro/appointments testé OK avec resourceId réel (201) ; GET overview/catalog/sales/payroll/accounting/admin/stats vérifiés
- Reste 1 erreur lint connue HORS périmètre : src/components/kene/ThemeToggle.tsx (react-hooks/set-state-in-effect) — fichier fondation main, à corriger par le propriétaire
- N.B. : icônes Adinkra ont une erreur TS latente HORS périmètre (icons.tsx TS1016 param requis après optionnel) invisible car @ts n'est pas bloquant en dev

Stage Summary:
- APP Pro 8 modules + Console Admin livrés et branchés sur le contrat API réel, desktop-first responsive, palette panafricaine, font-mono+xof sur tous les chiffres, toasts sonner, skeletons/empty states partout, prints (ticket 300px, bulletin A4, liasse)

---
Task ID: 4-a
Agent: subagent-A (APIs)
Task: Toutes les routes API REST Kènè (43 endpoints)

Work Log:
- src/lib/kene/server.ts : helpers serveur (jsonError/serverError loggés, resolveTenant mono-tenant démo, slugify/instituteImage, dates, overlaps, ensureWallet/credit/debit, notify, recomputeClientRfm, createJournalEntry résout SimpleLine→ChartAccount en sautant les comptes absents)
- Auth : POST otp/request (normalise espaces, devCode simulé 6 chiffres 5 min) ; otp/verify (user auto-créé, role pro si phone=ownerPhone, referralCode) ; PATCH profile (goals→JSON) ; POST consent (+records Consent, ip)
- IA : POST diagnoses (zod zone/image, pending→runDiagnosis→done, alerte whatsapp naevi+orientation_dermato, maxDuration 60, runtime nodejs) ; GET diagnoses ; POST dermato/chat (system prompt mélanoderme + LLM SDK) ; dermato/photo (triageLesion vert/jaune/rouge)
- Instituts/RDV cliente : institutes liste (image /instituts/{slug}.webp, _count, filtres slugify) ; détail (services/ressources/avis) ; availability (grille 30 min × ressources, dispo = durée service sans chevauchement, passé=indispo) ; appointments GET/POST (anti-chevauchement 409, acompte→Payment) ; cancel (cancellationRefund→crédit wallet, whatsapp) ; review (recalcul note institut)
- Boutique/Paiements/Wallet : shop/products (tenantId null) ; orders (cashback 5 %, wallet=payé immédiat sinon MoMo pending, stocks+mouvements) ; payments initiate/confirm (shop_order→paid+cashback+stock, wallet_topup→crédit, appointment_deposit→confirmed+deposit+rappel J-1) ; wallet GET (création à la volée KENE-{id[-6:]}) ; topup
- Pro : overview (7 KPIs dont occupancyPct, chart 14 j, paymentSplit, topServices, agenda du jour, stockAlerts) ; appointments GET/POST(CRM auto par téléphone)/PATCH(confirm|complete→Sale+écriture CA/BQ+CRM/RFM|cancel|no_show|reschedule 409) ; clients liste+fiche 360°(rfm à la volée) ; catalog GET/POST/PATCH(stock→movement adjust) ; stock GET/POST(in/out/loss+notification seuil) ; sales GET/POST(POS mixte, remise, splitTVA, écriture auto, CRM) ; employees+attendance(upsert, late>09:15) ; payroll GET/run(computePayroll CI/SN, totalsJson, écriture PA)/ecnps(XML attachment) ; accounting GET(plan, journaux, balance TOUTES lignes, états) + manual OD (équilibrage vérifié)
- Admin : stats (counts, gmvBoutique, commissions marketplace, chart diagnostics 14 j, topTenants CA 30 j)
- Correctifs : payrollJournalLines vient de @/lib/accounting/syscohada ; Product/Service/Employee sans createdAt (tris adaptés) ; let payment dans confirm ; order.items capturés avant update ; OTP espaces internes normalisés

Tests:
- Suite directe 51 scénarios (bun, handlers + DB side-effects) : 50 OK / 1 assertion de test erronée (match CRM par téléphone = spec)
- curl HTTP : 18 GET → 200 + POST flows (OTP 200/400, orders 201 & wallet-paid, confirm 200 & double 400, RDV 201 & chevauchement 409 & cancel refund, POS 201 + journal +1, payroll run 201 & doublon 400, ecnps 200 XML + 404, OD 201 & déséquilibrée 400, chat LLM 200 ~3 s, diagnoses VLM 200 ~6 s)
- DB remise à l'état seed après tests (comptes, ventes 29, wallet 12 500, ratings, CRM réconcilié) ; eslint src/app/api + lib/kene/server.ts → 0 erreur ; dev.log sans erreur de compilation (les ⨯ restants sont historiques, périmètre agent B)

Stage Summary:
- Backend 100 % opérationnel et testé : 43 endpoints REST conformes au contrat frontend, effets métier complets (wallet, stocks, RFM, SYSCOHADA, paie CI/SN, e-CNPS)
- Prêt pour l'intégration UI (agent B) ; démo : Mariam +2250701020304, pro « Éclat d'Abidjan » (tenant par défaut si tenantId absent)
---
Task ID: 7-b
Agent: subagent-B (Cliente)

Task: APP CLIENTE complète (Sprint 1 diagnostic IA + Sprint 3 boutique/RDV/wallet/chat) — mobile-first ≤430px

Work Log:
- src/components/kene/client/types.ts : types de réponse du contrat API cliente (ApiUser/Diagnosis/Institute/Service/Resource/Review/Slot/Appointment/Product/Order/Payment/Wallet/WalletTx/ChatMsg) + parseDiagnosis sûr + diagImgSrc (gère préfixe « file: » du seed) + constantes UI (SHOP_CATEGORIES, SKIN_TYPES, SKIN_GOALS, FITZPATRICK_CARDS avec dégradés carnations #8D5524→#241A10)
- bits.tsx : briques partagées — ScoreGauge (SVG stroke-dasharray animé scoreColor), ScoreChip, SectionTitle, EmptyBlock, Stars, SpinnerButton, KenteTop, APPT_STATUS_STYLES/ApptBadge, WalletPill, MomoProcessing (écran opérateur simulé)
- ClientApp.tsx : orchestrateur — !user → Onboarding, sinon conteneur max-w-[430px] + AnimatePresence par tab + nav bas sticky glass-kene grid-cols-5 (Diagnostic surélevé cercle or -mt-5, badge panier + dot chat non lu clearé via goTab, dot or actif, pb-[env(safe-area-inset-bottom)]) ; pendingZone propagé Accueil→Diagnostic
- Onboarding.tsx : 3 étapes framer-motion slide — (1) hero /hero/hero-client.webp h-60 + overlay dégradé + KeneLogo + input +225 + bouton démo Mariam (otp/request→verify devCode, compte riche → accueil direct) ; (2) input-otp 6 + carte « SMS simulé » devCode cliquable autofill+submit + renvoyer + prénom si « Nouvelle cliente » ; (3) Fitzpatrick IV/V/VI cartes dégradés + chips type/goals + allergies + checkbox consent OBLIGATOIRE → POST consent + PATCH profile (userId capté au verify)
- HomeScreen.tsx : header « Bonjour {prénom} » + ville + WalletPill + avatar initiale ; score multi-zones pondéré BODY_ZONES (dernier diag/zone, 69 pour Mariam) + gauge + chips zones manquantes cliquables (scan direct) ; CTA géant Scanner (NeaOnnimIcon, bogolan overlay) ; prochain RDV (SankofaIcon) ; wallet card mélanine (solde, cashback 5 %) ; « Recommandé pour ta peau » 3 produits h-scroll selon skinType ; Suivi WhatsApp cartes simulées badge « Programmé »
- DiagnosticScreen.tsx : wizard 5 étapes — grille 2col zones (icônes lucide + badge poids %) ; capture (tips 3 points, file capture=user → resizeImage, photo démo fetch /skin/demo-*.webp) ; analyse (barre scan loop, 4 étapes checkées progressivement, Progress, POST /api/diagnoses en parallèle + durée min 3,4 s, typo corrigée) ; RÉSULTAT VISIA-like : gauge + Fitz estimé + alerte bissap orientation_dermato (raison + chips ABCDE + CTA RDV), Tabs 4 vues spectrales (filter spectre-* + heatmap-* overlay mix-blend-screen + cadres dashed zones_marquages % + dot sévérité + légende), grille 2×4 priorités (barres SEVERITY_STYLES animées), Accordion 14 indicateurs avec notes, recommandations (resume bord or, routine matin/soir 2 col Sunrise/Moon, badges botaniques Moringa/Karité/Baobab, produits matchés flou→produits boutique avec +Panier→addToCart+toast, soins→Réserver, hygiène de vie), disclaimer, Nouvelle zone/Historique ; HISTORIQUE : cartes miniature+ScoreChip, mode comparaison (sélection 2 même zone → avant/après côte à côte + delta score coloré + top 3 évolutions indicateurs)
- ShopScreen.tsx : chips catégories + recherche ; grille 2col (img square rounded, botanicals text-terre, prix mono, Stars) ; Sheet fiche (qty stepper, stock max) ; barre panier sticky bottom-[84px] au-dessus nav (badge count) ; Sheet checkout (steppers, sous-total, cashback 5 % estimé, Wave/Orange couleurs + Wallet disabled si insuffisant) ; overlay paiement simulé plein cadre (logo opérateur, montant, n°, spinner 3 s) → POST payments/confirm → succès check spring + toast cashback ; wallet → orders paid direct
- BookingScreen.tsx : Tabs Réserver/Mes RDV — instituts (hero img, ★+count, ville, nb soins) → détail (description, avis h-scroll, services durée/prix/botanicals) → 7 jours chips → availability grille 4col slots disabled grisés → récap (praticienne = 1er resourceIds, prix, acompte 30 %) → paiement Wave simulé/Wallet → POST appointments (+confirm) → confirmation Sankofa « Rappel SMS J-1 programmé (simulé) » ; Mes RDV : à venir (annuler → Dialog politique cancellationRefund complète + remboursement estimé live → POST cancel → toast wallet) / passés (completed → Dialog avis 5 étoiles cliquables + commentaire → POST review) ; FIX closure bug : chooseService fetch directement avec le service fraîchoir (les créneaux ne se chargeaient pas sinon)
- ChatScreen.tsx : WhatsApp-like fond bogolan-dots — bulles user bg-primary/90 / IA bg-card + avatar DuafeIcon « Dr. Kènè » ; suggestions initiales ; triage photo : resizeImage → POST dermato/photo → bulle bord gauche vert/jaune/rouge + CircleCheck/TriangleAlert/OctagonAlert + CTA selon niveau (boutique/RDV) ; micro webkitSpeechRecognition fr-FR typé maison (tooltip si non supporté) ; toggle TTS speechSynthesis fr-FR ; typing 3 dots animés ; footer « Éducation cutanée — pas de prescription médicale »
- ProfileScreen.tsx : carte identité éditable (PATCH) ; profil peau rééditable (Fitz chips dégradés/type/goals/allergies → PATCH, goals parsés via type local ClientUser car SessionStore n'expose pas goals) ; wallet complet (solde mélanine + code parrain + transactions crédit/déb colorés + Sheet approvisionnement chips 2000/5000/10000 + Wave/Orange → topup + confirm simulé 2,6 s + écran succès spring) ; consentement statut ; carte « Vous êtes gérante ? → Espace Pro » (setSpace('pro')) ; déconnexion (setUser(null))

Tests (navigateur headless + curl, serveur :3000 réel) :
- Onboarding démo Mariam → accueil : score multi-zones 69 (visage 66×40 % + mains 81×10 %, zones manquantes ok), wallet 12 500, recommandations mixte OK
- Diagnostic réel visage photo démo : POST VLM 15-30 s → score 78, tabs spectraux (classe spectre-pigment vérifiée sur img), 14 indicateurs, 4 produits matchés +Panier
- Boutique : ajout panier 17 000 → checkout Wave simulé → confirm → wallet 12 500+850 cashback=13 350 vérifié API ; bouton wallet correctement disabled (solde < total)
- RDV : Éclat d'Abidjan → Diagnostic IA + Consultation → créneaux 13 dispo (fix closure) → 13:30 → acompte 3 000 Wave → « Rendez-vous confirmé » + rappel J-1 → RDV visible dans Mes RDV (Bintou Cissé)
- Chat : suggestion PIH → réponse LLM complète (SPF, niacinamide, AHA…) sans erreur console
- Diagnostic de test nettoyé en DB (3 diagnostics seed restaurés) ; le RDV démo créé est conservé (utile pour Mes RDV)
- tsc --noEmit : 0 erreur ; eslint : 0 erreur 0 warning ; dev.log sans erreur de compilation récente

Stage Summary:
- App Cliente 100 % fonctionnelle branchée sur le contrat API réel : onboarding OTP démo 1-clic, diagnostic IA VISIA-like multi-zones avec vues spectrales & historique comparatif, boutique + paiements mobile money simulés + cashback wallet, réservation RDV avec acompte et annulation remboursée, chat Dr. Kènè vocal/photo/TTS, profil complet
- Aucun fichier hors src/components/kene/client/ modifié (sauf worklog)

---
Task ID: 9+10+11
Agent: main (Z.ai Code)
Task: Intégration, corrections, vérification E2E agent-browser, images, rapport final

Work Log:
- Images : 15 assets générés via SDK (8 produits, 4 peaux démo, 2 instituts, 1 hero) — scripts/gen-images.ts
- Corrections typing/lint : ThemeToggle (dark:hidden sans state, règle react-hooks/set-state-in-effect), icons.tsx TS1016, vlm.ts (VisionMessage + model "glm-4.6v" explicites, botaniques_conseillees aligné partout), types.ts (emoji retiré de BODY_ZONES), 3 routes API (annotions Awaited<ReturnType<…>> | null)
- BUG #1 (bloquant RDV wallet) : POST /api/appointments rejetait paymentMethod "wallet" (zod wave|orange) → wallet natif : ensureWallet → contrôle solde → debitWallet → Payment success + RDV confirmed direct (testé curl + navigateur, débit 3 000 vérifié)
- BUG #2 (liasse) : bilan déséquilibré si résultat négatif → buildStatements présente la PERTE à l'actif (convention SYSCOHADA) → écart 0 vérifié (6 683 305 = 6 683 305)
- BUG #3 (crash fiche CRM) : GET /api/pro/clients/[id] sans include service → a.service.name undefined → include ajouté, fiche re-testée OK (5 diagnostics liés, RFM, onglets)
- Cosmétique : compteur d'avis instituts = champ marketing seedé (132/87) au lieu de _count POC
- E2E agent-browser (golden paths) : Démo Mariam 1-clic → accueil score multi-zones pondéré 79/100 → diagnostic VLM RÉEL visage démo (POST 200 en 19,9 s < 30 s PRD) → écran VISIA (gauge, 4 vues spectrales + heatmaps + cadres zones_marquages, 8 priorités + accordion 14 indicateurs, routine, produits matchés boutique) → + panier → checkout Wave simulé → cashback +225 crédité (wallet 13 575) → RDV Éclat d'Abidjan (créneaux, acompte 3 000 wallet, confirmation + rappel J-1 simulé) → chat Dr. Kènè (LLM : réponse PIH + botaniques) → Espace Pro : dashboard KPIs + BarChart/PieChart → agenda semaine + détail RDV → POS 28 000 Wave + ticket thermique imprimable → CRM table + fiche → Stock alertes → Paie (pointage retard >09:15, périodes, bulletin A4 détaillé : CNPS 6,3 %/7,7 %, IGR tranches, CN 1,5 % — recalculs vérifiés exacts, e-CNPS XML) → Compta (Balance D=C équilibrée, Liasse bilan + compte résultat + TVA 243 050/73 220/169 830) → Admin console → responsive iPhone 14 OK → dark mode validé par VLM (« excellent contrast ») → footer sticky vérifié (mt-auto + push naturel)
- Qualité finale : eslint 0 erreur, tsc --noEmit 0 erreur (src), dev.log sans erreur, page 200

Stage Summary:
- Plateforme Kènè MVP complète et vérifiée bout-en-bout : 3 espaces (Cliente mobile-first / Pro desktop / Admin), 43 endpoints REST, VLM + LLM réels, moteurs paie CI/SN et SYSCOHADA exacts, paiements MoMo simulés + wallet, POC démarrable en 1 clic (bouton « Démo — Mariam »)
- 3 bugs bloquants détectés et corrigés pendant l'E2E navigateur (preuve que la vérification était nécessaire)
- État DB : données seed + diagnostics/ventes/RDV de démonstration fraîches

---
Task ID: 12 (ré-application post-rollback)
Agent: main (Z.ai Code)
Task: Correction hydration mismatch ThemeToggle — 2e passage après rollback environnement

⚠️ INCIDENT : l'environnement a été restauré depuis un snapshot git (commit 0b31a7b, message UUID) entre les 2 sessions → le correctif initial du Task 12 (2 boutons statiques CSS) avait été ÉCRASÉ, ainsi que suppressHydrationWarning (page.tsx) et l'entrée worklog. L'utilisateur a re-signalé le même bug — légitime, le code était réellement revenu à l'état bogué.

Work Log:
- Diagnostic rollback : ThemeToggle.tsx (13:07) revenu au code dérivé de resolvedTheme ; grep confirmé aria-label dynamique de retour ; git status/montrer que le fix n'était plus dans l'arbre
- Ré-application 1:1 du correctif validé : ThemeToggle = 2 boutons statiques commutés par CSS (`dark:hidden` / `hidden dark:flex`), aria-label fixes par bouton, setTheme("dark"|"light") fixe par bouton — AUCUN attribut rendu dérivé du thème (pattern anti-hydration-mismatch), pas d'état/effet (react-hooks/set-state-in-effect)
- Ré-application suppressHydrationWarning sur le <p> © année (page.tsx)
- Re-vérification agent-browser : dark preset localStorage + reload → console + page errors 100 % vides ; bascule dark→light OK (html class + localStorage + bouton visible) ; reload light → clean ; eslint 0 erreur

Stage Summary:
- Bug hydration résolu à nouveau + racine documentée (rollback snapshot) — si le bug re réapparaît, VÉRIFIER D'ABORD que le fichier n'a pas été re-réverté (cf. timestamps + grep resolvedTheme dans ThemeToggle.tsx)
- Console navigateur vierge sur / en light ET dark, premier chargement inclus

---
Task ID: 13 (Phase A — Innovation immersive)
Agent: main (Z.ai Code)
Task: LE FIL DE KENTE — introduction narrative immersive 3D au défilement (récit d'onboarding en 6 chapitres)

Work Log:
- Dépendances : three@0.185.1 + @react-three/fiber@9.7.0 + lenis@1.3.26 + @types/three (pas de drei/gsap : tout procédural, progression pilotée en rAF maison)
- src/components/kene/intro/chapters.ts : partition du récit — 6 chapitres [0→0.12 prologue, 0.12→0.34 fil, 0.34→0.56 jardin, 0.56→0.74 fitz, 0.74→0.90 scan, 0.90→1.00 kente], copie UX Writer FR intime, keyframes caméra CAM[7], utilitaires chapterT/easeInOut/easeOut (convention fadeIn/fadeOut=0 → pas de fondu)
- src/components/kene/intro/Intro3D.tsx (dynamic ssr:false) : Canvas unique fond mélanine #1A1410 + fog + 3 lumières chaudes — (0) MelaninDust 1100 points additifs palette or/karité/sunset/bissap qui se condensent en galaxie spirale au scroll ; (1) GoldenThread TubeGeometry(catmullrom 240 seg) révélé par setDrawRange + navette lumineuse (sphère émissive + pointLight #E07A2B) au point curve.getPointAt ; (2) Botanical 3 arbres low-poly flatShading (baobab tronc+3 dodecaèdres verts, moringa tige+5 icosahedrons+fleurs or, karité branch+fruits bissap/karité) flottement sin + panoramique ; (3) FitzWall 3 panneaux ShaderMaterial dégradés carnations IV/V/VI + cadre or, montée + resserrement au scroll ; (4) ScanEcho tête abstraite Icosahedron(1.05,6) déplacée par bruit sinusoïdal + wireframe crème + faisceau biseau #E07A2B qui balaie une fois + 7 zones émissives qui s'allument au passage (teaser VISIA) ; (5) KenteBand PlaneGeometry 6.6×2.7 shader procédural 9 rangées × 14 colonnes palette kente + liserés or + armure sinusoïdale + ondulation vertex + 170 étincelles or
- src/components/kene/intro/KenteIntro.tsx : orchestrateur — conteneur 640vh + sticky h-svh, Lenis 1.25s + boucle rAF unique qui écrit la progression dans ref mutable (zéro re-render) et pilote overlays HTML (opacity/translate/visibility par data-from/to/fadein/fadeout) + rail 6 points ; bouton « Passer » permanent ; CTA final or ; StaticIntro fallback (6 sections empilées, zéro animation)
- src/components/kene/intro/introState.ts : pattern useSyncExternalStore — INTRO_KEY localStorage + événement custom same-tab + listener storage cross-tab, markIntroDone(), useIntroDone() (snapshot serveur false → aucune mismatch d'hydratation) ; mode 3d/static aussi via uES avec cache module (reduced-motion || pas de WebGL || #intro-static QA)
- Intégration : store kene.ts +introActive (non persisté) ; page.tsx header/footer masqués pendant l'intro ; ClientApp gate `if (!user) return introDone ? <Onboarding/> : <KenteIntro/>` (re-check au logout via uES)
- 2 bugs détectés par la vérif navigateur et corrigés : (1) chapterT fadeIn>0 rendait prologue invisible à p=0 → convention fadeIn=0 = visible immédiatement ; (2) outT=(1-local)/fadeOut = 0 à local=1 → CTA disparaissait exactement en bas de page → convention fadeOut=0 = jamais de fondu de sortie
- 3 erreurs eslint corrigées en architecture : setState-in-effect remplacé par useSyncExternalStore (localStorage + mode), vecteurs CameraRig sortis de useMemo vers useRef (règle immutability)

Tests (agent-browser + VLM, viewport 1280×800 et 390×844) :
- Console navigateur 100 % vierge sur tout le parcours (seul warning interne THREE.Clock de R3F)
- 6 chapitres vérifiés visuellement par VLM : particules ~150-200 dorées + titre + logo + hint / fil d'or 3D lisible / arbres low-poly + texte / 3 panneaux carnations + « IV·V·VI » / sphère wireframe + nœuds lumineux / bande kente tissée + CTA or — tous « readable, polished »
- FPS mesuré au chapitre jardin (scène active) : 61 fps mobile 390px ✓ (budget 60)
- Chemin doré complet : 1re visite → intro → scroll 640vh → CTA « Commencer mon histoire » → onboarding (clé posée, header restauré, scroll 0) → démo Mariam → accueil « Bonjour » ✓
- Persistance : reload avec introDone=1 → onboarding direct, zéro canvas chargé ✓ ; skip « Passer » → onboarding + clé posée ✓
- Fallback statique #intro-static : 6/6 chapitres HTML + CTA, zéro canvas ✓ (QA : true navigation testée — un simple changement de hash ne recharge pas la page)
- Qualité : eslint 0 erreur, tsc --noEmit 0 erreur src/, dev.log compilations propres

Stage Summary:
- Phase A livrée : onboarding narratif immersif « Le Fil de Kente » — 6 chapitres 3D procéduraux pilotés au scroll (Lenis + rAF, aucun asset externe), fallback accessibilité, persistance localStorage, 61 fps mobile
- Pattern réutilisable : introState.ts (uSES sans mismatch) + chapterT (conventions fadeIn/fadeOut=0) + flag store introActive
- Prochaine étape proposée : Phase B — Skin Twin 3D (résultats diagnostic sur tête rotative + fiche CRM Pro)
---
Task ID: 14 (Phase B — Innovation immersive)
Agent: main (Z.ai Code)
Task: SKIN TWIN 3D « Ton Jumeau de Peau » — le diagnostic porté par un buste 3D interactif (résultats cliente + fiche CRM Pro 360°)

Work Log:
- src/components/kene/skintwin/twinMath.ts : math pures — tête sculptée procéduralement (bosses gaussiennes sur icosaèdre : occiput, mandibule effilée, menton, arcade, orbites, arête nasale, pommettes, oreilles, lèvres), projection photo→3D par zone (visage/barbe/cuir_chevelu→fenêtres angulaires tête ; dos/nævi→ellipsoïde torse ; mains→moufles), projection 2D fallback (viewBox 100×110), teintes Fitz IV/V/VI, SEV_HEX, matchIndicator() rapprochement flou marqueur↔indicateur (stems, seuil 0,34), DragState
- SkinTwinScene.tsx (dynamic ssr:false) : Canvas R3F — buste (tête ico(1,4) sculptée, cou, torse ellipsoïdal, 2 moufles), socle muséal + liseré or émissif teinté score, orbite du Fil d'Or (tore incliné + 3 perles, continuité Phase A), pastilles sphères émissives couleur sévérité avec pulsation cardiaque + halo billboard sur pastille active, balayage scanner sunset descendant une fois, drag rotation avec inertie + auto-rotation après repos 2,6 s + respiration, caméra adaptative à l'aspect, frameloop coupé hors viewport (prop du Card via IntersectionObserver)
- mode.ts : useSyncExternalStore 3d/pending/static (reduced-motion, WebGL absent, QA #twin-static) — pattern Phase A
- SkinTwinCard.tsx : carte UI — stage sombre « musée » 340/380 px, chips numérotées = interface accessible (hover/focus↔3D, clic↔sélection), panneau détail (sévérité + indicateur lié + % + note), légende, badge Fitz, hint « Fais pivoter » (disparaît après 1re interaction), fallback SVG (silhouette buste + pastilles), note si marqueurs absents ; drag en ref mutable (zéro re-render), pointer capture + seuil 7 px click-vs-drag
- Intégrations : DiagnosticScreen ResultView (jumeau du diagnostic courant, entre alerte dermato et tabs spectraux) ; CrmSection ClientSheet (jumeau AGRÉGÉ multi-diagnostics : 23 pastilles 21 Visage + 2 Mains, score moyen exact 75/100) + type resultJson ajouté à ProClientDetail.diagnoses
- Chasse aux FPS (méthode bisection agent-browser) : 24 fps → 60 fps. Causes trouvées et corrigées : (1) MeshPhysicalMaterial+sheen → MeshLambertMaterial (PBR inutile en low-poly facetté, +11 fps) ; (2) flag flatShading → normales plates PRÉCALCULÉES via computeVertexNormals sur géométries non-indexées (toNonIndexed pour cylindre) — évite le chemin fragment à dérivées (+2) ; (3) pastilles transparentes → OPAQUES avec pop d'échelle à la révélation (zéro blending) ; (4) overlay wireframe supprimé (~4 fps pour un effet subtil) ; (5) antialias:false + géométries fines épaissies (anneau 0,0058→0,012) pour compenser (+14, décisif) ; (6) canvas alpha→opaque avec <color> mélanine ; (7) 2 point lights (faisceau, socle) remplacées par émissifs. Calibrage : intro mesurée à 61 fps dans le même environnement → cible légitime
- Bug a11y PRÉEXISTANT corrigé au passage (prouvé par git stash) : fiche CRM → erreur Radix « DialogContent requires DialogTitle » pendant le squelette de chargement → SheetTitle sr-only dans branches loading/error + aria-describedby={undefined} sur SheetContent. Console fiche CRM désormais 100 % propre
- Warning THREE « toNonIndexed: already non-indexed » éliminé (garde g.index)

Tests (agent-browser + VLM, viewports 1280×800 et 390×844) :
- Console navigateur 100 % vierge sur tous les parcours (client, Pro, fallback, reload à froid) — seul warning THREE.Clock bénin de R3F (identique Phase A)
- Cliente : jumeau rendu (canvas 396×378), 7 pastilles/chips, clic chip → panneau détail (68 %, note, « Indicateur lié : Taches PIH post-inflammatoires » — fuzzy match OK), drag → VLM confirme ROTATED (profil gauche révélé), hint disparaît après interaction, badge Fitz V
- FPS : 60 desktop ET 60 mobile 390px (budget 60 atteint) ; hors viewport → 61 (IO gate OK)
- Pro CRM : jumeau agrégé 23 pastilles multi-zones (chips avec suffixe zone), score 75/100 exact, drag OK dans la Sheet, intégration propre — VLM SHIPPABLE
- Fallback #twin-static : 0 canvas, SVG silhouette + 7 pastilles numérotées lisibles — VLM SHIPPABLE
- Qualité : eslint 0 erreur/0 warning, tsc --noEmit 0 erreur src/, dev.log propres (incident serveur tombé en cours de route → redémarré, vérifié HTTP 200)

Stage Summary:
- Phase B livrée : « Ton Jumeau de Peau » — buste 3D procédural portant les marqueurs du diagnostic (projection par zone anatomique), rotation interactive, scan, orbite du Fil d'Or ; déployé côté cliente (résultats) et côté Pro (fiche CRM 360° agrégée)
- Leçon perf majeure (réutilisable) : en rendu logiciel, le coût est PIXELS×shader — Lambert + normales plates précalculées + opacité évitée + pas de MSAA ; bissection empirique par masquage de meshes + calibration contre une scène de référence
- Leçon process : les warnings console peuvent être PRÉEXISTANTS — prouver par git stash avant de se l'attribuer
- Prochaine étape proposée : Phase C — La Route de l'Or (parcours boutique/réservation narratif) ou Skin Twin v2 (comparaison avant/après sur le jumeau, courbes d'évolution par indicateur)

---
Task ID: 15 (Phase C — Innovation immersive)
Agent: main (Z.ai Code)
Task: LA ROUTE DE L'OR — le fil de la Phase A devient un parcours narratif qui TISSE la routine de soin (produits matchés → stations → kente personnel téléchargeable → panier en 1 geste)

Work Log:
- Data fix au passage : 5 doublons produits en DB (seed rejoué lors des tests précédents) supprimés en gardant les instances référencées par OrderItem/SaleItem → boutique propre à 8 produits (visible avant dans l'UI boutique)
- src/components/kene/route/ritual.ts (logique pure, testée bun sur vraie DB) : STATIONS 4 définitions (Purifier #8B1A3B/Soigner #3F7D3F/Nourrir #C8951E/Protéger #E07A2B — poème, botanicals, catégories, clés d'indicateurs, usage matin/soir) ; buildRitual() — produits IA (recommandations VLM matchées flou, priorité) puis fallback boutique par catégorie/rating, unicité inter-stations, solaires réservés à Protéger (2 bugs trouvés par le test CLI : SPF dans Nourrir + doublon) ; stationFocus() indicateurs les plus faibles ciblés ; ritualTotal() ; shade() ; matchProduct/norm DEPLACÉS ici depuis DiagnosticScreen (source unique, import croisé)
- src/components/kene/route/WovenBand.tsx : drawBand() pure — fond mélanine, 16 étincelles or seedées (mulberry32), 4+1 rangées tissées (armure toile : briques arrondies couleur station + accent or toutes les 4, reflet dessus, fils de trame horizontaux, onde sinusoïdale, offset alterné par rangée), clip de progression par rangée (tissage gauche→droite), NAVETTE (losange crème liseré or + fil de traîne quadratique) à la frontière de tissage, liserés or zigzag haut/bas, franges latérales quadratiques, bandeau signature (nom Ojuju résolu via getComputedStyle + document.fonts.ready, SCORE/100 mono or, diamants adinkra, cadre pointillé) ; composant canvas dpr≤2, anim rAF 2,1 s easeOut, prefers-reduced-motion → rendu direct, ResizeObserver → rendu final, bouton téléchargement PNG (toDataURL, toast), role=img + aria-label descriptif
- src/components/kene/route/RitualJourney.tsx : overlay dialog fixed inset-0 mx-auto max-w-[430px] (Escape ferme, focus bouton X, verrou scroll body) — GoldenThread SVG (route ondulée 7 nœuds, motion.path pathLength animé, navette motion.g, nœud courant pulsé, étiquette flottante de l'étape) ; 7 écrans AnimatePresence slide : intro (NeaOnnim, cartes des 4 stations), 4 StationScreen (poème en blockquote bord couleur, chips botanicals/matrin/soir, focus « Ta peau demande » avec % sévérité, ProductPick avec toggle garder role=switch + badge « Choix de l'IA sur ta photo »), institut (Sankofa, acompte/rappel/remboursement, soins_conseilles, CTA rdv), tissage final (WovenBand — rangées assombries si aucun fil gardé dans la station = personnalisation visible, récap produits retournables, total + cashback 5 %, CTA « Tisser mon panier » addToCart tous + toast + navigation boutique, CTA réserver) ; footer sticky glass-kene Continuer/Retour h-14 + safe-area
- Intégrations : DiagnosticScreen (CTA gradient « La Route de l'Or » dans la section recommandations avec mini bande tissée CSS, matchProduct/norm importés depuis ritual.ts) ; HomeScreen (carte relance « Route de l'Or » sous le CTA scanner si dernier diagnostic parsable, parseDiagnosis du multi.last)
- 2 coquilles corrigées (entité &aposhui, couleur outline sans #) ; shade déplacé de WovenBand vers ritual.ts (import unique)

Tests (agent-browser + VLM, viewports 390×844 et 1280×800, light + dark) :
- Logique pure bun sur DB réelle : stations → focus corrects (Excès sébum 40 %, Taches PIH 40 %…), produits uniques, solaire en Protéger uniquement, total exact
- Console navigateur 100 % vierge + 0 page error sur tout le parcours (seuls logs bénins THREE/HMR)
- Parcours complet E2E mobile : accueil → carte Route → intro (VLM : fil doré + navette + « LE FIL » + stations lisibles) → Purifier (citation, chips, focus %, carte produit + switch vert) → Soigner (décochage Brume testé — switch false + carte atténuée) → Instit → TISSAGE : VLM « bande textile tissée procédurale, briques, lisière zigzag, franges, 5 rangées, MARIAM + SCORE 62/100 + losanges » — rangée Soigner NETTEMENT plus sombre = désélection visible ✓ SHIPPABLE
- CTA final : « Tisser mon panier · 22 500 FCFA » → toast cashback 1 125 → overlay fermé → boutique + panier store vérifié (2 articles, 22 500) + barre panier « 2 articles, total 22 500 FCFA »
- Entrée diagnostic : CTA dans résultats → dialog ouvert ✓ (note : snapshot a11y Playwright pend sur dialog+SkinTwin — contourné par eval DOM direct, l'app elle-même est saine) ; Escape → dialog fermé ✓
- FPS mesuré pendant l'anim de tissage : 61 ✓ ; desktop 1280 : overlay exactement 430px centré (x=425) ✓ ; dark mode : VLM « fond noir profond, texte crème/or lisible, SHIPPABLE » ✓ ; bouton download PNG cliqué sans erreur ✓
- Qualité : eslint 0 erreur/0 warning, tsc --noEmit 0 erreur src/, dev.log 200 uniquement

Stage Summary:
- Phase C livrée : « La Route de l'Or » — la métaphore du fil (Phase A) devient commerce narratif : diagnostic → 4 stations produits → institut → kente de soin tissé procéduralement (canvas 2D, navette visible, signature, PNG téléchargeable) → panier en un geste
- Différenciation forte : le choix désactive des rangées (bande assombrie), badge « Choix de l'IA », cashback estimé — le tissage EST la commande
- Réutilisable : ritual.ts (match flou partagé), drawBand() pure, pattern GoldenThread motion.path pathLength
- Prochaine étape proposée : Phase D — Skin Twin v2 (comparaison avant/après sur le jumeau + courbes d'évolution par indicateur) ou la Route en 3D (bande tissée en WebGL dans le fil de l'intro)

---
Task ID: 16 (Phase D — Innovation immersive)
Agent: main (Z.ai Code)
Task: LE FIL DU TEMPS — Skin Twin v2 : le jumeau gagne la dimension temporelle (projection avant/après S+0→S+12 sur le buste 3D + courbes d'évolution par indicateur sur l'historique des diagnostics)

Work Log:
- src/lib/kene/evolution.ts (lib PURE zéro dépendance — partagée API serveur + UI client) : normKey() ; buildEvolution() agrège les resultJson en séries temporelles par indicateur (fusion floue des libellés VLM variables d'un scan à l'autre) + série score global ; projectPct() projection indicative (λ/gain par famille : PIH lent 0,15 — hydratation rapide 0,38 — rides très lent 0,13…, adhérence ×1/×0,55, horizon plafonné 12 semaines, gain modéré si p0 ≥ 50, cible ≤ 96) ; projectMarkerSev() MODÈLE HYBRIDE CONTINU (si l'indicateur lié devient sain ≥ 80 → marqueur guérit à 0 ; sinon estompe au prorata du gain relatif (proj−pct)/(96−pct) borné 0,85 ; sans indicateur lié décroissance douce ×0,2 ; jamais d'aggravation ; label passé pour les cinétiques par famille) ; pctToSev/valueColorHex/lerpHex (couleurs sans dépendance three — la lib doit rester serveur-compatible)
- src/app/api/diagnoses/evolution/route.ts : GET ?userId= → DB done asc → buildEvolution → JSON {count, firstAt, lastAt, series[], scores[]}
- src/components/kene/skintwin/ProjectionSlider.tsx : piste tissée kente (repeating-linear-gradient 5 couleurs) + diamants d'arrêts + NAVETTE (losange crème liseré or, left via calc()) + input range natif INVISIBLE par-dessus (drag tactile ET clavier ±1 semaine) + 4 boutons d'arrêt Aujourd'hui/S+4/S+8/S+12 + chips adhérence Intégrale/Irrégulière + note « simulation non médicale » ; aria-live sur le libellé Semaine
- twinMath.ts : TwinMarker.pct (score santé de l'indicateur rapproché via matchIndicator dans buildMarkers — alimente la projection) ; seuil fuzzy matchIndicator abaissé 0,34 → 0,30 (libellés 3 mots type « PIH joue droite » : 1/3 = 0,33 tombait juste sous le seuil — « PIH joue droite »→« Taches PIH », « Cernes sous-orbitaires »→« Cernes & poches » maintenant rapprochés, zéro faux positif observé)
- SkinTwinScene.tsx : prop projRef ({t 0..1, adh} — mutable, pattern progressRef Phase A, zéro re-render au drag) ; pastilles par frame : couleur interpolée SEV_COL[s0]→SEV_COL[s1] par projectMarkerSev continu + échelle ×(0,45+0,55·ratio) (rétrécissement) — copies/lerp en place, ZÉRO allocation par frame (budget rendu logiciel) ; liseré du socle verdit (rimBase→RIM_GREEN ×0,75) sous projection ; rimBase useMemo Color déclaré AVANT useFrame (fix eslint immutability)
- SkinTwinCard.tsx : prop projection ( défaut false — CRM Pro inchangé) ; state weeks/adherence + projRef mutable (setWeeks écrit la cible, la scène suit à son rythme) ; ProjectionSlider rendu sous la scène si marqueurs ; TwinFallback proj → SVG r/ fill recalculés (lerpHex) au changement de semaines ; panneau détail : ligne « S+N : ~X % » + mini barre verte pointillée quand un indicateur est lié
- EvolutionCard.tsx (components/kene/evolution/) : SVG pur (zéro lib de charting) — fil d'or lissé Catmull-Rom→béziers, aire dorée 0,07, nœuds pastille valueColorHex, grille 0/50/100 + labels mono, axe X dates courtes ; SI 1 SEUL DIAGNOSTIC → trajectoire projetée POINTILLÉE jusqu'à S+12 (13 échantillons hebdo projectPct, anneau terminal + label S+12) ; chips Score global + 4 indicateurs (delta coloré vert/bissap, icônes TrendingUp/Down) = interface accessible, table sr-only en miroir ; skeleton chargement, états vide/erreur silencieux ; garde-fou domaine X ≥ 6 jours
- DiagnosticScreen.tsx : ResultView <SkinTwinCard projection /> ; HistoryView reçoit userId + <EvolutionCard userId /> en tête (au-dessus de la liste)

Tests (agent-browser 2 sessions + VLM, viewports 390×844 et 1280×800) :
- Lib pure bun : PIH 40→68 S+12 pleine / 61 partielle / hydratation 35→65 S+4 ; modèle marqueur continu (sev1 pct55→0,59 S+12, sev3 pct35→1,62, sain→0, S+0 inchangé)
- API évolution : Mariam 7 scans → séries fusionnées (« Éclat / Uniformité du teint » fusion de libellés VLMVariables OK), deltas −48/−38/−31/+30 exacts
- E2E complète session vierge : onboarding Awa → diagnostic démo visage (VLM 26,8 s) → résultats → jumeau + slider S+12 → VLM confirme pastilles rétrécies/verdies + liseré socle orange→vert + « Semaine +12 » ; retour S+0 restaure l'état d'origine
- Panneau détail : « PIH joue droite | Léger | 55% | INDICATEUR LIÉ : TACHES PIH | S+12 : ~72 % » ; adhérence Irrégulière → ~56 % (×0,55 visible)
- EvolutionCard Mariam : courbe 4 nœuds lisible (VLM : « très lisible et bien rendu »), chips commutées (PIH/Hydratation), deltas ; Awa 1 scan : point + pointillé S+12 (VLM confirmé)
- Fallback #twin-static : 0 canvas, 5 cercles → S+12 : r 3,60→2,78 fill or-vert partiel (2 marqueurs) + r 1,62 vert total (3 guéris) ; S+0 réversible exact
- Perf : 61 fps pendant le morph 3D ; console 100 % vierge 2 sessions (seuls logs React/HMR/THREE.Clock bénins préexistants) ; dev.log aucun ⨯
- Qualité : eslint 0 erreur/0 warning, tsc --noEmit 0 erreur src/ (erreurs préexistantes examples/ + skills/ hors périmètre)

Stage Summary:
- Phase D livrée : « Le Fil du Temps » — le jumeau de peau devient prospectif (curseur tissé S+0→S+12, marqueurs qui guérissent en continu, adhérence à la routine) ET rétrospectif (courbes d'évolution par indicateur sur l'historique, fusion floue des libellés VLM, projection pointillée dès le premier scan)
- Le récit produit se boucle : Phase A le fil d'or tisse l'accueil → Phase B le jumeau porte le diagnostic → Phase C la route tisse le panier → Phase D le fil traverse le TEMPS (avant/après + trajectoire)
- Réutilisable : lib/evolution.ts pure (API + UI), pattern projRef mutable (zéro re-render au drag), smoothPath Catmull-Rom SVG
- Leçon : modèle bucket (sev = seuils du % projeté) = marches visuelles ; modèle hybride continu (prorata du gain relatif, guérison totale si l'indicateur devient sain) = morphing honnête ET visible
- Prochaine étape proposée : consolidation finale (polish global, revue a11y complète, README produit) ou Phase E — le Fil de Kente WebGL dans la boutique (bande tissée 3D réutilisable)

---
Task ID: E (Phase E)
Agent: main (Z.ai Code)
Task: Phase E — « Le Fil de la Boutique » : bande de kente tissée en WebGL dans la boutique (composant réutilisable)

Work Log:
- Choix fait entre « consolidation finale » et « Phase E » → Phase E (prolonge le récit du fil dans le dernier espace sans fil, réutilise les patterns WebGL éprouvés)
- src/components/kene/weave/threads.ts (module PUR, zéro dépendance) : KENTE_THREADS (6 fils : or #C8951E, bissap #8B1A3B, baobab #3F7D3F, karité #F8F1E4, mélanine #241A10, sunset #E07A2B) ; weftThreadIndex() armure chevrons (pas inversé 1 rangée sur 2, liserés or en rangées 0 et n−1) ; warpThreadIndex() cycle or/mélanine + accents ; categoryThread() mapping catégorie→fil (serum→bissap, creme→karité, huile→or, gommage→sunset, masque→baobab, savon→mélanine) ; WeaveRefs + createWeaveRefs() (highlight.index seulement)
- src/components/kene/weave/mode.ts : useWeaveMode (useSyncExternalStore, réduit à useTwinMode) — reduced-motion / #weave-static / #twin-static / WebGL absent → fallback
- src/components/kene/weave/KenteWeaveScene.tsx : Canvas R3F (dpr ≤1,35, alpha, IO frameloop) ; WeaveBand = 3 InstancedMesh (trame 144 box SUR/SOUS la chaîne selon (col+row)%2, chaîne 24 cylindres verticaux, franges 10 cylindres pendant sous la bande) + navette d'or (octaèdre allongé métallique + pointLight) + glowLight de surbrillance ; per-frame : matrices recomposées (tissage reveal delta-based 2,6 s, pop ~7 cellules, chute en place, vague sin, franges révélées en fin), instanceColor lerpié base→bright pour le fil actif (re-upload SEULEMENT pendant la transition), parallaxe pointer lissée, fit viewport (scale ≤1,35), delta clampé 50 ms (reprise IO sans saut) ; état mutable possédé par la scène (reveal/hlK/pass/lastHl/lastKey) — la carte écrit highlight.index, la scène lit ; weaveKey comparé (lecture seule) pour re-tissage
- src/components/kene/weave/KenteWeaveCard.tsx : wrapper réutilisable (highlightIndex, caption, label, className, weaveKey) ; dynamic import ssr:false ; IO → frameloop ; fallback CSS kente-band-soft + croisures + glow radial du fil sélectionné (renforcé après test : alpha 60 % + inset shadow) ; a11y : figure role=figure + figcaption (dot couleur + « Fil {name} » + caption), canvas aria-hidden, badge « LE FIL DE KENTE »
- ShopScreen.tsx : hero tissé entre header et recherche ; highlightIndex = categoryThread(cat) ; caption dynamique (« La navette monte le métier… » / « N soins au catalogue » / « N soins · catégorie ») ; recherche passe mt-4 → mt-3
- Fixes qualité : ESLint react-hooks/refs + immutability (nouvelles règles) — (1) jamais .current au render (ref objet passé en prop), (2) la scène ne mute RIEN issu de props → progression du tissage possédée par la scène, weaveKey = prop comparée ; navette agrandie (0,42×0,12×0,1, emissive 1,1, lumière 3+8·pass) après invisibilité VLM ; perf : couleurs re-upload en transition seulement + 1 lumière d'appoint retirée + dpr 1,5→1,35

Tests (agent-browser + VLM, viewports 390×844 et 1280×800, session démo Mariam) :
- Boutique mobile : bande tissée 3D confirmée par VLM (armure or/rouge/vert/noir + franges + badge) ; navette dorée visible (gauche de la bande) ; tissage d'entrée joué
- Highlight catégorie : Sérums → fils bissap brillants/soulevés (VLM : « glowing, lifted, luminous ») + caption « Fil bissap·1 soin · sérums » ; Huiles → « Fil or·0 soin · huiles » ; navette fait un coup accéléré au changement
- Fallback #weave-static (reload avec hash — attention : navigation hash seule ne recharge PAS le document, cache de mode déjà résolu) : 0 canvas, bande CSS + glow bissap renforcé confirmé
- Desktop : bande contenue dans la colonne centrée ≤430px, navette visible, grille 2 colonnes intacte, zéro défaut
- Mode sombre : bande rend bien (fond scène propre), caption contraste 7,8:1 (AA) — le « non lisible » VLM était un faux positif (préfixe « Fil » absent sans catégorie)
- Perf : 52 fps en rendu logiciel headless (SwiftShader) après optimisations (42 avant) ; console 100 % vierge (logs bénins préexistants) ; dev.log aucun ⨯
- Qualité : eslint 0 erreur/0 warning ; tsc --noEmit 0 erreur src/

Stage Summary:
- Phase E livrée : « Le Fil de la Boutique » — la navette tisse le catalogue, chaque catégorie a SON fil (bissap/karité/or/sunset/baobab/mélanine) qui s'illumine et saute vers l'avant
- Le récit du fil est maintenant complet dans les 4 espaces clients : accueil (Phase A), diagnostic (Phase B), routine (Phase C), temps (Phase D), boutique (Phase E)
- Réutilisable : KenteWeaveCard (props highlightIndex/caption/weaveKey) — n'importe quelle section peut arborer une bande tissée ; threads.ts pur réutilisable côté serveur
- Leçons : (1) règles ESLint react-hooks/refs + immutability nouvelles génération — les scènes ne doivent rien muter qui dérive de props, posséder leur état interne et comparer des props lecture-seule ; (2) les couleurs d'instances n'ont besoin d'être re-uploadées que pendant les transitions ; (3) tester un hash QA exige un reload vrai (navigation hash ≠ rechargement)
- Prochaine étape proposée : consolidation finale (polish global, revue a11y transversale, README produit) — ou laisser le produit en l'état, toutes les phases du récit étant tissées

---
Task ID: 17 (Consolidation finale — "consolidation totale")
Agent: main (Z.ai Code)
Task: CONSOLIDATION TOTALE — audit transversal complet + correction des 7 problèmes majeurs + code mort + revue a11y + README produit + vérification E2E navigateur de l'ensemble

Work Log:
- Audit transversal (agent Explore, very thorough, 28 fichiers lus) : 7 majeurs (M1 cashback 0.05 hardcodé ×7, M2 double toaster mort, M3 acompte client-only, M4 contraste badges, M5 hex durs non dark, M6 ligne CRM non focusable, M7 formats monétaires) + ~15 éléments de code mort vérifiés
- M1 : CASHBACK_RATE et DEPOSIT_RATE exportés de lib/kene/format.ts (source unique) ; API orders lit wallet.cashbackRate ?? CASHBACK_RATE (wallet chargée une seule fois) ; ShopScreen badge/estimations dynamiques (cashbackRate = wallet?.cashbackRate ?? CASHBACK_RATE) ; RitualJourney/HomeScreen/ProfileScreen/BookingScreen imports
- M3 : clamp serveur dans api/appointments — depositAmount plafonné à Math.round(service.price × DEPOSIT_RATE) ; BookingScreen importe DEPOSIT_RATE
- M2 : Toaster radix retiré de layout.tsx (sonner = toaster réel) ; fichiers supprimés : ui/toast.tsx, ui/toaster.tsx, hooks/use-toast.ts (~300 LOC mortes)
- Code mort : weekKey, BogolanWatermark, SpinnerButton/KenteTop (version client), PosLine, PayslipDetail, lastDiagnosisId (store + setter + écriture DiagnosticScreen), ChatMsg.triageMessage, double scroll-behavior JS, .bogolan-dots-dark CSS, 4× JSX { } vides, ternaire sans effet ui-bits, import useEffect page.tsx
- CSS : .scrollbar-thin DÉFINIE (était utilisée 8× sans exister) — thin 4px + Firefox scrollbar-width
- M4 : readableTextColor(bgHex) ajouté à format.ts (luminance relative WCAG, seuil 0.22) ; ScoreChip + badge score DiagnosticScreen : texte mélanine #1A1410 sur or/sunset (6.4–6.7:1 au lieu de 2.7–3.0:1)
- M5 : tokens --gold-text (#8F660D light / #E3B454 dark) et --sunset-text (#A84F0E / #F0A66B) créés + enregistrés @theme inline → classes text-gold-text/text-sunset-text ; migrés : SEVERITY_STYLES, APPT_STATUS_STYLES, RFM_SEGMENT_STYLES, TRIAGE ChatScreen, badge indicateur DiagnosticScreen (via SEVERITY_STYLES.text), no_show pro (text-bissap→text-destructive)
- M6 : TableRow CRM focusable — tabIndex=0, role=button, aria-label "Ouvrir la fiche de {name}", onKeyDown Enter/Space, focus-visible
- M7 : PayrollSection cumuls + DiagnosticScreen recommandations + SMS orders/confirm en xof() ; coquille "Kènè POS — Kènè" → "Kènè — Ticket de caisse" ; diagImgSrc dédupliquée (CrmSection importe la fonction, plus de replace inline)
- A11y : 14 SelectTrigger dotés d'aria-label (12 automatiques via script Python + Compte ligne N / Institut actif manuels) ; aria-label EvolutionCard condensé (de la liste brute → bornes + renvoi au tableau) ; "Cinq chapitres" → "Six chapitres" (chapters.ts + aria KenteIntro) ; no_show unifié "Absente"
- db.ts : log: ['query'] seulement hors production
- README.md produit créé : récit des 5 phases A→E, 3 espaces, stack, palette/tokens, arborescence, 5 règles maison (xof partout, cashback wallet + acompte serveur, scènes immutables props, fallbacks WebGL, budget perf), comptes démo, scripts

Tests (agent-browser + VLM, viewport 390×844, light + dark) :
- Incident Turbopack résolu : chunk CSS partiellement périmé (utilities fraîches, :root/.dark obsolètes — --gold-text introuvable) → purge .next/cache + redémarrage serveur détaché (setsid node node_modules/.bin/next) → tokens résolus #e3b454/#f0a66b en dark
- Intro : aria "six chapitres" ✓ ; skip → accueil Mariam complet (multi-zones 63, wallet, recommandations) ; console 100 % vierge
- Dark VLM 7/10 : score 63 lisible, badges visibles, hiérarchie claire (troncature "+ N…" = rail scrollable attendu)
- Boutique : 1 canvas WebGL, figcaption "Fil bissap·1 soin · sérums" au filtre Sérums, badge "Cashback 5 %" (taux wallet)
- Historique : ScoreChip 58→texte #1A1410 sur sunset, 62/78/66→#1A1410 sur or (contraste corrigé, vérifié getComputedStyle)
- CRM : 8 lignes focusables, focus+Enter ouvre la fiche Aïcha ✓ ; fiche Mariam : jumeau agrégé VLM (~15-20 pastilles) + RFM ✓ ; Escape ferme
- Fallback #weave-static (reload vrai) : 0 canvas + .kente-band-soft présent ✓
- Footer/nav : navBottom=844=innerHeight ancré mobile ; VLM light mobile "production-ready" (nav ancrée, aucun défaut bloquant)
- M1 E2E : panier 8 500 → estimation "Cashback estimé (5 %) +425 FCFA" → paiement wallet → toast 425 → solde DB exact 2 500 (10575−8500+425) — état démo ensuite restauré (wallet 10575, stock +1, commande/paiement/transactions supprimés)
- M3 E2E : POST acompte 999999 sur service 25 000 → Payment 7 500 (clamp 30 %) en DB ✓ — RDV de test supprimé
- Qualité finale : eslint 0/0, tsc --noEmit 0 erreur src/, HTTP 200, dev.log sans ⨯, console navigateur vierge

Stage Summary:
- Consolidation totale livrée : les 7 majeurs corrigés et TESTÉS en navigateur (pas seulement compilés), ~450 LOC mortes supprimées, tokens dark-mode complets (gold-text/sunset-text AA dans les 2 thèmes), 14 labels de Select, CRM accessible clavier, README produit
- Cohérence métier sécurisée : le taux de cashback et l'acompte 30 % ont désormais UNE source de vérité chacun, appliquée côté serveur (clamp) et côté affichage (estimations dynamiques)
- Le récit du fil (Phases A→E) est intact après consolidation : intro, jumeau, route, temps, boutique — tous re-vérifiés visuellement et par DOM
- Leçons : (1) Turbopack peut servir un CSS partiellement périmé (utilities fraîches + blocs :root obsolètes) — diagnostiquer via getComputedStyle par variable, guérir par purge du cache + redémarrage ; (2) un VLM peut fausser le mode (capture prise en light après un clic mal ciblé) — toujours vérifier documentElement.classList avant d'interpréter ; (3) les corrections d'accessibilité se vérifient au DOM (getComputedStyle color/backgroundColor) bien plus précisément qu'à l'œil
- Produit considéré comme CONSOLIDÉ : toutes les phases du récit tissées, audité, corrigé, documenté

---
Task ID: 28
Agent: main (Z.ai Code)
Task: CHOIX FAIT entre les 3 directions proposées → « LE FIL DU RETOUR » — rappels automatiques post-protocole & fidélisation (Pro + Cliente). Vérification préalable : suivi d'évolution déjà livré (Phase D) et compta SYSCOHADA déjà livrée → les relances étaient la seule des 3 propositions absentes du repo (état repo = worklog 1-17 consolidé ; les features PDF/CRM-360 mentionnées dans la conversation n'étaient pas présentes dans ce checkout).

Work Log:
- prisma/schema.prisma : modèle FollowUpMark { tenantId, dedupKey ("diag:|appt:|sale:|client:"), status done|dismissed, via whatsapp|call|visit|sms, note, @@unique([tenantId, dedupKey]) } + relation Tenant.followUpMarks → db:push
- src/lib/kene/followups.ts (lib PURE serveur+client, zéro dépendance) : constantes métier POST_PROTOCOL_DAYS=21 / POST_SOIN_DAYS=28 / POST_PURCHASE_DAYS=10 / INACTIVE_DAYS=60 ; KIND_META (badges) ; buildFollowUps() dérive les relances de l'activité réelle — (1) contrôle protocole S+3 après dernier diagnostic (clos si retour en institut postérieur ; RDV futur affiché en note informative, pas suppressif), (2) soin de suivi S+4 après dernier RDV complété (supprimé si rébookée), (3) satisfaction produits J+10 après dernière vente produits (≤15 j), (4) inactive >60 j sans visite ni RDV futur ; fusion des marques (todo/done/dismissed + via + handledAt), tri retards en tête ; buildRelanceMessage() 4 tons chaleureux Kènè (≤280 chars) ; waLink() ; nextClientStep() côté cliente (contrôle en retard → CTA « Refaire mon diagnostic » tab diagnostic, sinon « Réserver » tab rdv ; null si RDV futur couvre)
- src/app/api/pro/followups/route.ts : GET ?tenantId= (clients + RDV + diagnostics userId-liés 90 j + ventes produits 30 j + marks → items + counts late/week/upcoming/done/dismissed) ; POST zod (done|dismissed|todo ; upsert @@unique ; status=todo → deleteMany = réactivation ; via=whatsapp + clientPhone → notify() Notification journalisée + userId résolu via clientProfileId ; AuditLog followup_mark/followup_reopen)
- src/components/kene/pro/RelancesSection.tsx : SectionHeader « Le Fil du Retour » + 4 KpiCard (En retard/Semaine/À venir/Traitées) + 5 chips filtres comptés (filtre initial intelligent = premier panier non vide) + liste max-h-[62vh] pretty-scroll AnimatePresence (Card KenteTop, InitialAvatar, badge KIND_META, DueChip retard bissap/aujourd'hui sunset/semaine gold, note « RDV déjà prévu le X », actions WhatsApp [window.open wa.me + POST via=whatsapp] / Appel traité / Plus tard ; traitées → « Traitée · Appel · le X » + Réactiver ; toasts sonner, busyKey, refetch)
- ProApp.tsx : NAV « Relances » (BellRing) entre CRM et Catalogue + union ProSectionId + rendu section (fix parse : accolade fermante manquante dans new_str initial — détectée via dev.log 204:112 + od -c)
- HomeScreen.tsx (cliente) : carte « Ta prochaine étape » (SankofaIcon — l'adinkra du retour, bord gold/40, dégradé from-gold/10, chip Dans N j / En retard de N j, titre+detail+CTA h-11) entre Route de l'Or et Prochain RDV ; nextStep = nextClientStep(diagnoses, appointments)
- prisma/seed.ts : client Nafissa Ouattara (Potentiels, 26 j, soin complété -26 j) ; RDV futurs retirés à Ines (pending) et Grace (confirmé) — cohérent avec segments À risque/Perdus ; diagnostic Awa -5 j ; followUpMark.deleteMany dans le reset → re-seed + redémarrage serveur (client Prisma chargé en mémoire ≠ post-push)

Tests (agent-browser + VLM, viewports 1440×900 et 390×844, light + dark) :
- Lib pure bun sur DB re-seedée : 11 items exacts — Grace inactive -90 j, Ines -28 j, Awa produits -2 j, Nafissa soin +1 j, Mariam protocole +14 j (note RDV 3 sept.), Awa protocole +16 j, Aïcha soin +25 j… ; nextClientStep Mariam/Awa = post_protocol +14/+16 j
- API GET : 200, counts {late:3, week:4, upcoming:4} ; POST : marks upsertés
- E2E Pro desktop : nav « Relances » → KPI 3/4/4/0 → 3 cartes retard avec 3 boutons chacune ; « Appel traité » Grace → toast + KPI traitées 1 + chip En retard 2 + carte absente du filtre ; filtre Traitées → « Traitée · Appel · le 1 sept. » + Réactiver ; WhatsApp Ines → nouvel onglet wa.me/2250704455667 avec message complet pré-rempli (« Bonjour Ines, ça fait longtemps 👋… ») + FollowUpMark via=whatsapp en DB + Notification whatsapp sent + AuditLog ×2 ; reload → persistance (traitées 2) ; Réactiver Grace → retour todo (late 2)
- E2E Cliente : carte « Ta prochaine étape — Dans 14 j — Contrôle de ton protocole — score 66/100 » desktop + mobile (358 px) ; CTA → onglet RDV vérifié ; géométrie CTA vs nav fixe mesurée (ctaBottom 368 < navTop 771 après scroll — le « NEEDS FIX » VLM initial était un artefact de position de scroll, faux positif confirmé)
- Mobile Pro : chips nav scrollables, section Relances complète sans débordement horizontal ; dark mode : contrastes OK (texte crème 243,234,217), VLM « SHIPPABLE » ×4 (desktop relances, mobile+dark, next-step ×2)
- Console 100 % vierge (logs bénins THREE/HMR préexistants), 0 page error ; eslint 0 erreur/0 warning ; tsc --noEmit 0 erreur src/ (examples/skills hors périmètre préexistant) ; GET / 200

Stage Summary:
- « Le Fil du Retour » livré : relances 100 % DÉRIVÉES de l'activité (aucun cron à maintenir — recalcul à chaque ouverture), marques seules persistées (FollowUpMark @@unique tenantId+dedupKey), actions WhatsApp journalisées (Notification + AuditLog)
- Les 3 espaces gagnent : Pro = section Relances complète (KPI, filtres, WhatsApp wa.me pré-rempli, traiter/ignorer/réactiver) ; Cliente = carte « Ta prochaine étape » (contrôle protocole S+3 / soin de suite S+4, CTA contextuel diagnostic ou RDV)
- Règles métier défendables : contrôle protocole non fermé par une simple réservation (note informative), soin de suivi supprimé si rébookée, inactivité > 60 j sans RDV, satisfaction produits 10 j
- Le récit du fil se poursuit : le Fil du Retour ramène la cliente au tissage (Sankofa = « reviens et prends-le »)
- Leçons : (1) le client Prisma en mémoire du dev server ne voit pas db:push → toujours redémarrer ; (2) vérifier les accolades des new_str multi-édits via dev.log + od -c quand Turbopack échoue au parse ; (3) un VLM peut crier « overlap » sur une capture mi-scroll — toujours trancher par géométrie DOM (getBoundingClientRect vs nav fixe)

---
Task ID: 29
Agent: main (Z.ai Code)
Task: « LE FIL DU PARRAINAGE » — programme de parrainage bouton boucle de croissance (après Task 28 : les 3 directions initiales étant couvertes — évolution = Phase D, relances = Task 28, compta = SYSCOHADA livré — choix porté sur le parrainage, le fil qui relie les amies, infra dormante : User.referredBy + Wallet.referralCode + reason "referral" existaient sans flux)

Work Log:
- src/lib/kene/referral.ts (lib PURE zéro dépendance serveur+client) : FILLEUL_GIFT=2 000 (cadeau bienvenue filleule, immédiat à l'échange du code) + PARRAIN_REWARD=2 500 (bonus parrain à la 1ʳᵉ commande PAYÉE de la filleule) ; parrainRewardRefId()/filleulGiftRefId() clés de dédup (`parrain:{id}` / `gift:{id}`) ; referralShareMessage() WhatsApp chaleureux + referralWaLink() (waLink importé de followups.ts, reste pure) ; type ReferralSummary (code, referredBy {name, rewarded}, invitees, stats) partagé API+UI
- src/lib/kene/server.ts : rewardReferrerIfNeeded(userId) — idempotent (findFirst reason referral + refId `parrain:{userId}`), crédite le parrain (ensureWallet), notifie parrain (whatsapp) + filleule (sms), AuditLog referral_reward ; import xof + PARRAIN_REWARD
- Hooks récompense : /api/orders (paiement wallet direct, après cashback) + /api/payments/confirm (shop_order MoMo, après cashback) → rewardReferrerIfNeeded(order.userId)
- GET /api/referral?userId= : ensureWallet → code, referredBy (+rewarded via tx), filleules (users referredBy=userId, 1ʳᵉ commande payée asc, rewardedIds via refIds), earnings = Σ credits referral sur MA wallet
- POST /api/referral/redeem {userId, code} : zod ; 400 si déjà parrainée / propre code / échange croisé (parrain.referredBy = moi) ; 404 code inconnu (recherche exacte uppercase puis telle quelle) ; effets : User.referredBy=parrain.id + creditWallet FILLEUL_GIFT (refId gift:) + notifications (parrain whatsapp « tu recevras 2 500 dès sa première commande », filleule sms cadeau) + AuditLog referral_redeem
- src/components/kene/client/ParrainageCard.tsx (section Profil, entre Wallet et Consentement) : carte mélanine kente-band-soft — code font-mono + copier (clipboard + toast + état ✓) + CTA vert « Inviter une amie sur WhatsApp » (wa.me sans numéro = sélecteur de contact, message complet pré-rempli) ; phrase dynamique « {prénom} partage son fil » (fallback « Ton fil à partager » si nom par défaut) ; 3 stats (Filleules / Récompensées / Gains mono) ; liste filleules (avatar initiale, date, badge vert « +2 500 FCFA ✓ » ou muted « 1ʳᵉ commande… », max-h-44 scroll) ; si referredBy → carte « Parrainée par {name} » avec état du bonus ; sinon CTA pointillé « Une amie t'a donné son code ? » → Sheet bottom (input uppercase mono + Enter) → POST + toast + refetch + onRedeemed→loadWallet parent ; états skeleton/erreur + bouton « Réessayer »
- ProfileScreen : ligne wallet simplifiée (code retiré — déplacé vers la carte dédiée), import ParrainageCard
- prisma/seed.ts : Awa referredBy=mariam (filleule EN ATTENTE, zéro commande boutique) ; Bintou Cissé +2250706070709 (filleule RÉCOMPENSÉE : wallet 2 000 gift + commande Savon Noir 4 500 payée wave -4 j + Payment PAY-BINTOU) ; wallet Mariam 14 000 = topup 10 000 + cashback 1 500 + parrain 2 500 (refId parrain:{bintou}) ; notifications cohérentes (reward Mariam -4 j, bienvenue + commande Bintou)
- Admin : stats route + AdminStats.referredBy count → 6ᵉ KpiCard « Parrainages » (HeartHandshake, hint « Fil du Parrainage », grid xl 5→6)

Tests (suite bun 23 assertions contre dev server + DB réelle + agent-browser 390×844/1280×800 + VLM) :
- API 23/23 ✓ : OTP vierge → GET summary (code KENE-XXXX) ; 404 inconnu ; 400 propre code / double redeem / échange croisé ; redeem « mariam-kene » minuscules → gift 2 000 + referredBy + tx refId gift: ; parrain 1 filleule non récompensée earnings 1 000 (pré-seed) ; commande wave → confirm → wallet Mariam 12 500→15 000 + tx refId parrain: + 2 notifications + 2 audits ; 2ᵉ commande payée → AUCUN double bonus (15 000 stable) ; stats finales rewarded 1 / earnings 3 500 ; côté filleule referredBy.rewarded passe à true
- E2E navigateur : carte rendue (code MARIAM-KENE, stats 2/1/2 500, Awa « 1ʳᵉ commande… », Bintou « +2 500 FCFA ✓ » — VLM : « aucun chevauchement, contraste OK ») ; CTA WhatsApp → nouvel onglet wa.me avec message complet pré-rempli lu par VLM (code MARIAM-KENE + 2 000 FCFA dans l'URL) ; onboarding complète nouvelle cliente → Profil → Sheet code « MARIAM-KENE » → toast + sheet fermée + wallet 2 000 live + « Parrainée par Mariam Diallo — Elle recevra 2 500 FCFA dès ta première commande » ; côté Mariam : 3 filleules (la test + Awa + Bintou) ; erreur propre code → toast « Ce code est le tien — partage-le à une amie ! 💛 » + sheet reste ouverte ; Escape ferme ; desktop 1280 : conteneur centré ~430px VLM « cohérent et professionnel » ; console Admin : KPI PARRAINAGES 3 ; 0 page error, console vierge (warnings préexistants) ; stale session après re-seed → état erreur + « Réessayer » fonctionne (re-login démo → carte parfaite)
- Qualité : eslint 0 erreur 0 warning ; tsc --noEmit 0 erreur src/ ; dev.log 200 uniquement ; DB re-seedée en état démo propre (script de test supprimé)

Stage Summary:
- « Le Fil du Parrainage » livré : boucle de croissance complète — partage du code (copier/WhatsApp pré-rempli) → cadeau filleule 2 000 FCFA immédiat → bonus parrain 2 500 FCFA à la 1ʳᵉ commande payée (idempotent, les DEUX chemins de paiement couverts) → visibilité : cliente (stats + filleules + état parrain), admin (KPI)
- Zéro migration : User.referredBy + WalletTransaction.refId + Notification + AuditLog existaient déjà — la valeur était endormie dans le schéma
- Règles métier défendables : une filleule par code (referredBy unique), pas d'auto-parrainage, pas d'échange croisé, récompense conditionnée à un achat réel (pas à l'inscription), notifications honnêtes des deux côtés
- Le récit du fil se poursuit : le fil relie désormais les PERSONNES (HeartHandshake) — accueil, jumeau, route, temps, boutique, retour, parrainage
- Leçons : (1) un GET compilé à la volée peut renvoyer une erreur transitoire au premier hit pendant le recompile Turbopack → toujours offrir un « Réessayer » sur les cartes qui échouent ; (2) re-seeder invalide les sessions localStorage → le demo-login recapture l'id courant, les cartes doivent dégrader proprement ; (3) tester le partage WhatsApp par window.open capture l'onglet wa.me — l'URL contient le message entier, vérifiable sans VLM
- Prochaine étape proposée : onboarding v2 « j'ai un code parrain » au signup (champ optionnel à l'étape OTP) ou centre de notifications cliente réel (GET /api/notifications + cloche non-lues)
