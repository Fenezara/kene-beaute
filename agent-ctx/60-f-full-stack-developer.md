# Task ID: 60-f — Agent: full-stack-developer

## Task
Sécurité renforcée (2FA-lite) : re-vérification par code OTP avant paiement (boutique + acompte RDV), activable/désactivable depuis le profil. Store persistant dédié + composant SecureVerify plein écran + interceptions chirurgicales dans ShopScreen / BookingScreen + carte Switch dans ProfileScreen.

## Contexte relu avant intervention
- worklog.md (sections 57 → 60-e) : conventions toasts sonner tutoyés, tokens Tailwind (or/terre, jamais bleu/indigo — les Wave/Orange natifs existants sont des couleurs de marque opérateur, non touchés), cibles ≥ 40 px, shadcn existants, framer-motion.
- API OTP inspectées : POST /api/auth/otp/request { phone } → { ok, devCode } ; POST /api/auth/otp/verify { phone, code } → { user } (re-testées curl, 200).
- Pattern OTP de référence : Onboarding.tsx étape 2 (InputOTP 6 cases + encart pointillé « SMS simulé (POC) » + devCode cliquable auto-remplissant).

## Fichiers créés
1. **src/store/security.ts** — zustand + persist, localStorage `kene-secure`, `enabled: boolean` (défaut false) + `setEnabled(b)`, partialize enabled seul. Fichier séparé, kene.ts non touché. Même pattern que kene-store/favorites (persistance par appareil, POC assumé).
2. **src/components/kene/client/SecureVerify.tsx** — overlay plein écran mobile (motion, role="dialog" aria-modal, z-[80], bg-background thème-aware) :
   - API : `{ open, phone, amount?, onVerified, onCancel }` — le parent rend le composant UNE fois et pilote `open` ; l'état interne (code, saisie) est remis à zéro à chaque ouverture (montage d'un dialog interne sous AnimatePresence → code frais à chaque ouverture, jamais de code obsolète).
   - À l'ouverture : POST /api/auth/otp/request → devCode gardé ; `requesting` initial true → zéro setState synchrone dans l'effet (gate lint react-hooks/set-state-in-effect), alive-flag au démontage.
   - UX copie exacte de Onboarding étape 2 : 6 cases InputOTP (autoFocus, autoComplete one-time-code, sr-only label), titre « Confirme que c'est bien toi », sous-texte « Sécurité renforcée — code envoyé au {phone} », bouton Continuer h-12 bg-primary, lien « Renvoyer le code » (min-h-11), encart pointillé « SMS simulé (POC) » avec devCode cliquable → auto-remplit + vérifie (setTimeout 250 ms, pattern Onboarding).
   - Succès : toast.success("Identité confirmée 💛") + onVerified() ; échec : toast.error + reset de la saisie.
   - Annulation : bouton X (h-10 w-10) + touche Échap → onCancel(). Garde `settled` (useRef) : une seule issue par ouverture — pas de onVerified après onCancel (fenêtre de course auto-vérif POC).
   - Montant : rappel discret « Paiement de {xof(amount)} » si amount fourni.

## Fichiers modifiés (éditions chirurgicales)
3. **ShopScreen.tsx** — imports (Lock, useSecurity, SecureVerify) + état `securityEnabled`/`pendingPay` + fonction passerelle `startPay(method)` : si enabled → haptic + ouvre SecureVerify (phone du user, amount=total) ; sinon `void pay(method)` comme avant. Les 3 boutons Wave/Orange/Wallet appellent startPay (pay() inchangé — flow existant repris tel quel après onVerified). Badge discret « 🔒(Lock lucide) Vérification par code activée » (bg-primary/10, text-[10px]) sous le label « Mode de paiement » du checkout.
4. **BookingScreen.tsx** — même logique avant la confirmation payante : `startBook()` (si enabled && deposit > 0 → SecureVerify ; RDV gratuit/sans acompte → rien d'ajouté), bouton « Confirmer pour {xof(deposit)} » → startBook (book() inchangé). Badge identique près de « Payer l'acompte avec » (condition deposit > 0).
5. **ProfileScreen.tsx** — carte « Sécurité renforcée » (icône ShieldCheck dans bg-primary/15, texte « Exige un code par SMS avant chaque paiement — même si quelqu'un a ton téléphone ») insérée ENTRE la carte RGPD « Mes données » et la carte « Application » (aucune des deux touchée). Toute la rangée est un bouton role="switch" aria-checked (cible pleine largeur ≥ 40 px) ; le Switch shadcn est l'indicateur visuel (pointer-events-none, tabIndex -1, aria-hidden) — le composant natif fait ~18×32 px, trop petit pour la convention 40 px. Toggle → setEnabled + toast.success("Sécurité renforcée activée") / toast("Sécurité renforcée désactivée").

## Points de cohérence
- Store persist « kene-secure » → l'option survit au reload (localStorage).
- Connexion démo « Mariam » (login) NON touchée : la vérification ne s'insère QUE aux paiements (startPay/startBook), l'Onboarding est intact.
- Z-order : SecureVerify z-[80] au-dessus des overlays paiement z-[70] ; à la fermeture (onVerified), il s'efface en fade sur l'overlay de traitement qui démarre.
- Échec d'envoi du code (429/réseau) : l'overlay reste ouvert, « Renvoyer le code » permet de réessayer — le paiement n'est jamais lancé sans code valide.

## Incident hors périmètre (documenté)
- next-server OOM-killé par le noyau pendant la session (pid 1548, ~2 Go RSS — même incident que t. 57/58, dmesg) ALORS que mes éditions avaient déjà compilé proprement (✓ Compiled sans erreur). Redémarrage `bun run dev` en arrière-plan (précédent worklog t. 58 : « OOM kill → redémarrage ») : GET / 200, services 200, compilations propres. Aucun autre service touché.

## Qualité
- `bun run lint` : 0 problème.
- `npx tsc --noEmit` : 0 erreur sur le périmètre (src/components/kene + src/store) ; erreurs préexistantes hors périmètre uniquement (examples/, skills/, lib/kene/push-client.ts d'une autre tâche).
- curl : GET / 200 ; POST /api/auth/otp/request → { ok, devCode } 200 ; POST /api/auth/otp/verify → { user } 200.
- dev.log : compilations propres, 0 erreur.

## Limites
- POC : le « SMS » reste simulé (devCode affiché) — la 2FA réelle exigera une passerelle SMS ; l'otp/verify réel marque le code used côté DB (vrai garde serveur), mais le paiement lui-même reste simulé.
- Préférence par appareil (localStorage) : pas synchronisée multi-appareils ni côté serveur (évolution naturelle : champ User.secure2FA + API).
- Couvre les 2 points de paiement cliente (commande boutique, acompte RDV) ; l'approvisionnement wallet du Profil n'est pas gated (flux de crédit, pas de débit — choix assumé, évolution facile via le même composant si voulu).
