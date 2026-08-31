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
