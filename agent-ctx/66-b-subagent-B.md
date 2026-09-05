# Task 66-b — subagent-B (frontend flows)

## Mission
4 chantiers front : résilience 502 du diagnostic, inscription entreprise (mode pro onboarding), validation session au boot, chip user réel ProApp.

## Fichiers modifiés (périmètre exclusif respecté)
1. `src/components/kene/client/DiagnosticScreen.tsx`
2. `src/components/kene/client/Onboarding.tsx`
3. `src/components/kene/client/ClientApp.tsx`
4. `src/components/kene/pro/ProApp.tsx` (chip sidebar + 2 lectures de store uniquement)
5. `src/components/kene/client/types.ts` (contrats register + readSession)

## Résumé par chantier
- **1 — DiagnosticScreen (502)** : launch() = boucle 3 tentatives sur POST /api/diagnoses (retry SEULEMENT si ApiError 502/503/504 ; backoff 1500 ms puis 4000 ms ; state `netNotice` « Rétablissement de la connexion… » affiché sous la barre de progression, p role=status + aria-live). Échec total gateway → récupération : GET /api/diagnoses?userId → diagnostic `zone` match + `done` + < 4 min → résultats + toast « Analyse retrouvée… » ; `pending` → re-poll 3 s × 10. Sinon toast honnête « Moteur d'analyse momentanément injoignable… », retour étape 1, photo conservée. Animation min 3,4 s intacte (showResult partagé succès/récupération). timersRef centralisé : intervals + timeouts nettoyés dans succès/échec/démontage (useEffect cleanup).
- **2 — Onboarding (pro)** : mode `"client" | "pro"` — étape 0 : bandeau dashed BriefcaseBusiness → pro (inversable, badge « Entreprise »), mini-ligne Smartphone « Une seule connexion suffit… » sous le CTA (« Recevoir mon code » dans les 2 modes) ; étape 1 OTP identique, carte parrain masquée en pro ; étape 2 pro = formulaire entreprise (nom 3-60 requis, 3 cartes type Sparkles/Flower2/Stethoscope, ville défaut Abidjan, pays CI/SN, gérante facultative pré-remplie) → registerPro() : 201 → setUser + setProTenantId + setSpace("pro") + toast 🎉 ; 409 → GET /api/auth/session de secours (ApiError ne transporte pas le body — solution imposée) → role pro → entrée espace + toast « Tu gères déjà… » ; 400 → toast FR. Jamais de questionnaire peau en mode pro.
- **3 — ClientApp (session boot)** : effet APRÈS rehydrate, gate `_keneHydrated` ; si user → UNE requête GET /api/auth/session par userId (anti-boucle : `validatedUserIdRef` + deps = string id — le setUser 200 conserve l'id) ; 200 → profil rafraîchi ; 404 → clearCart + setUser(null) + toast « Session expirée — reconnecte-toi » ; réseau/502 → silencieux (jamais de déconnexion sur un saut réseau).
- **4 — ProApp (chip)** : `sessionUser = useKene(s => s.user)` ; role "pro" → nom de la gérante + « Fondatrice / Gérante » + initiales dérivées ; sinon repli démo « Fatou Koné — Gérante — démo ».

## Contrats branchés (66-a, routes déjà live, vérifiées curl)
- POST /api/auth/pro/register : 201 `{ok, tenant{id,name,city,country,type,plan}, user}` · 400 {error} · 404 · 409 `{error, tenant}` — le front ne lit PAS le body 409 (ApiError) → GET session.
- GET /api/auth/session?userId= : 200 `{user}` · 400 · 404 « Session expirée » — readSession() tolère aussi l'utilisateur nu (défense contrat).

## Vérifications
- `bun x tsc --noEmit` : 0 erreur src/ (3 préexistantes examples/+skills/ hors périmètre ; l'erreur « latente » icons.tsx du briefing n'existe pas dans l'arbre courant — confirmé, rien touché).
- `bun run lint` : exit 0, 0 erreur / 0 warning.
- curl GET / → 200 (recompile 77 ms propre) ; dev.log sans ⨯ ; contrat session re-testé (400/409/404).
- Relecture : tous les intervals/timeouts nettoyés, poll borné 10 × 3 s, effet session sans re-trigger possible.

## Risques / à faire par le main agent
- 409 sans proTenantId persisté (gérante du seed jamais passée par 201) → ProApp charge l'institut par défaut (auto-guérison + sélecteur existants) : la réponse session ne transporte pas le tenant (limite de la solution GET session choisie par la spec).
- La récupération 502 peut remonter un « done » < 4 min d'une session précédente même zone (fenêtre assumée).
- E2E navigateur (agent-browser) à faire par le main agent : bandeau pro → OTP → formulaire → espace Pro ; retry 502 (pas reproduit au curl front) ; boot avec session valide/expirée.
