// Kènè — i18n interface: français (défaut) + dioula + baoulé + bété.
// Lib PURE (aucune dépendance React/store): métadonnées des langues,
// dictionnaires statiques et translate avec repli français.
// La langue active vit dans src/store/lang (zustand persist) et le hook
// useT (src/lib/kene/use-t.ts) — ce fichier ne fait que du texte.
//
// Choix de traduction (, étendue):
// • fr: libellés repris EXACTS du code existant (référence).
// • dy: dioula d'Abidjan, écriture latine usuelle (è pour ɛ, o pour ɔ),
// COUVERTURE COMPLÈTE du dictionnaire FR — vocabulaire
// attesté + emprunts français naturels là où il n'y a pas
// d'équivalent usuel certain (Scanner, wallet, RDV…) — comme
// on parle vraiment: code-switching assumé. Tutoiement Kènè.
// • bq: attesté usuel UNIQUEMENT (, sources croisées 2026-09:
// cours de baoulé de Clément N'Goran, coastsystems.net — « Nja /
// Mmo anyin o! » salutation du matin; page Baoule Mhin, FB —
// « Mo agni oh » pour une femme). Refus délibéré d'inventer du
// baoulé: tout le reste retombe sur le français via le repli
// (même honnêteté que la narration vocale).
// • bt: attesté usuel UNIQUEMENT — salutation « Yaho » confirmée par le
// « Petit lexique en Bété de Gagnoa » (multi-sources: bonjour
// Yaho, au revoir wato-keyi, comment ça va eko-lobo-wa — aucun
// libellé d'interface attesté au-delà de la salutation). Reste
// en repli fr.
// Une extension future = pure donnée: compléter DICTS, aucun code à toucher.

export type Lang = "fr" | "dy" | "bq" | "bt";

/** Métadonnées d'affichage du sélecteur (Profil → Langue de l'interface) */
export interface LangMeta {
  id: Lang;
  label: string;
 /** Pastille courte façon pills VoiceNarration (FR/DY/BQ/BT) */
  flag: string;
  note: string;
}

export const LANGS: LangMeta[] = [
  { id: "fr", label: "Français", flag: "FR", note: "Langue par défaut" },
  { id: "dy", label: "Dioula", flag: "DY", note: "Interface complète — dioula d'Abidjan" },
  { id: "bq", label: "Baoulé", flag: "BQ", note: "Salutations attestées — reste en français" },
  { id: "bt", label: "Bété", flag: "BT", note: "Salutations attestées — reste en français" },
];

export type Dict = Record<string, string>;

/* ───────── Dictionnaire français (référence — libellés du code) ───────── */

const FR: Dict = {
  // Onglets (tab-bar mobile + rail desktop)
  "tab.home": "Accueil",
  "tab.scan": "Scanner",
  "tab.shop": "Boutique",
  "tab.shop.short": "Boutik",
  "tab.rdv": "Rendez-vous",
  "tab.rdv.short": "RDV",
  "tab.chat": "Messages",
  "tab.profile": "Profil",
  "nav.scan.aria": "Scanner ma peau — diagnostic IA",
  "nav.chat.aria": "Dr. Kènè — chat",

  // Titres d'écran (h1 du header ClientApp)
  "title.home": "Accueil",
  "title.diag": "Diagnostic IA",
  "title.shop": "Boutique",
  "title.rdv": "Rendez-vous",
  "title.chat": "Dr. Kènè",
  "title.profile": "Mon profil",
  "title.parametres": "Paramètres",

  // Accueil
  "home.greeting": "Bonjour",
  "home.score.title": "Santé de ta peau",
  "home.score.zone": "Multi-zones",
  "home.scan.cta": "Scanner ma peau",
  "home.scan.sub": "Analyse IA VISIA-like · 6 zones · 30 s",
  "home.scan.aria": "Scanner ma peau maintenant",
  "home.scan.story.aria": "Scanner ma peau — nouveau diagnostic",
  "home.shop.cta": "Voir la boutique",
  "home.reco.title": "Recommandé pour ta peau",
  "home.rdv.title": "Prochain rendez-vous",
  "home.rdv.empty": "Aucun RDV à venir — réserve un soin en 2 minutes.",
  "home.whatsapp.title": "Suivi WhatsApp",
  "home.next.title": "Ta prochaine étape",
  "home.first.title": "Ton premier diagnostic t'attend",
  "home.first.sub": "Analyse IA de 6 zones — commence par le visage.",
  "home.missing.title": "Zones à scanner pour compléter ton score",

  // Onboarding — écran 1 (téléphone)
  "onboarding.title": "La beauté mélanoderme, enfin comprise.",
  "onboarding.subtitle": "Diagnostic IA multi-zones, boutique botaniques, instituts partenaires et coach Dr. Kènè — pensés pour les peaux Fitzpatrick IV–VI.",
  "onboarding.phone.label": "Mon numéro",
  "onboarding.cta": "Recevoir mon code",
  "onboarding.legal": "En continuant, tu acceptes les conditions Kènè. Données santé chiffrées, jamais revendues.",

  // Boutique (écran non couvert — prêt pour la suite)
  "shop.search.placeholder": "Rechercher un produit, un botanique…",
  "shop.filters.all": "Tout",

  // Diagnostic (écran non couvert)
  "diag.scan.zone": "Scanner la zone",

  // Rendez-vous (écran non couvert)
  "rdv.title": "Rendez-vous",
  "rdv.cta": "Prendre rendez-vous",

  // Chat Dr. Kènè (écran non couvert)
  "chat.placeholder": "Écris ta question beauté…",

  // Profil
  "profile.title": "Mon profil",
  "profile.settings": "Réglages",
  "profile.wallet": "Mes avantages",
  "profile.back.aria": "Retour accueil",

  // Sélecteur de langue
  "lang.selector.label": "Langue de l'interface",
  "lang.selector.note": "Textes des écrans principaux. La lecture vocale se règle séparément, près du résumé du diagnostic.",

  // Notifications (écran non couvert)
  "notif.title": "Notifications",

  // Commun
  "common.back": "Retour",
  "common.continue": "Continuer",
  "common.retry": "Réessayer",
  "common.offline": "Connexion perdue — tes données restent affichées, réessaie quand le réseau revient",
  "common.loading": "Chargement…",
  "common.save": "Enregistrer",
  "common.cancel": "Annuler",
  "common.close": "Fermer",

  // Espaces (bas du rail desktop)
  "space.pro": "Espace Pro",
  "space.admin": "Console Admin",

  // Rail droit desktop
  "rail.view.profile": "Voir mon profil",
};

/* ───────── Dioula (dy) — COUVERTURE COMPLÈTE du dictionnaire FR ─────────
 Dioula d'Abidjan, écriture latine usuelle: è = ɛ, o = ɔ.
 Toutes les clés FR sont présentes; code-switching assumé là
 où il n'y a pas d'équivalent usuel certain (Scanner, wallet, RDV,
 Paramètres…) — « I ni sogoma » = bonjour, « I ni cé » = merci. */

const DY: Dict = {
  // Onglets (tab-bar mobile + rail desktop)
  "tab.home": "So",
  "tab.scan": "Scanner",
  "tab.shop": "Boutiki",
  "tab.shop.short": "Boutiki",
  "tab.rdv": "Rendez-vous",
  "tab.rdv.short": "RDV",
  "tab.chat": "Baro",
  "tab.profile": "Profil",
  "nav.scan.aria": "Scanner i kogoji — diagnostic IA",
  "nav.chat.aria": "Dr. Kènè — baro",

  // Titres d'écran (h1 du header ClientApp)
  "title.home": "So",
  "title.diag": "Diagnostic IA",
  "title.shop": "Boutiki",
  "title.rdv": "Rendez-vous",
  "title.chat": "Dr. Kènè",
  "title.profile": "N ka profil",
  "title.parametres": "Paramètres",

  // Accueil
  "home.greeting": "I ni sogoma",
  "home.score.title": "I kogoji kènè",
  "home.score.zone": "Zones bèè",
  "home.scan.cta": "Scanner i kogoji",
  "home.scan.sub": "Analyse IA zone 6 · 30 s",
  "home.scan.aria": "Sisan scanner i kogoji",
  "home.scan.story.aria": "Diagnostic koura — scanner i kogoji",
  "home.shop.cta": "Na boutiki kono",
  "home.reco.title": "Ka di i kogoji ma",
  "home.rdv.title": "Rendez-vous min bena na",
  "home.rdv.empty": "RDV tè na — soro i ka soin.",
  "home.whatsapp.title": "I ka suivi WhatsApp",
  "home.next.title": "I ka taama min bena na",
  "home.first.title": "I ka diagnostic folo be i ma.",
  "home.first.sub": "Analyse IA zone 6 — daminye i ka nye la.",
  "home.missing.title": "Zone minw tè soro — ka i score timinti.",

  // Onboarding — écran 1 (téléphone)
  "onboarding.title": "Kogoji finman ka di, a bè dòn sisan.",
  "onboarding.subtitle": "Diagnostic IA zone ni zone, boutiki botaniques, instituts ni coach Dr. Kènè — kogoji Fitzpatrick IV–VI kama.",
  "onboarding.phone.label": "N ka numero",
  "onboarding.cta": "Soro n ka code",
  "onboarding.legal": "I ka to Kènè sariyaw ma. I ka données santéw bè sécurisé, tè revendre.",

  // Boutique
  "shop.search.placeholder": "Nyini produit walima botanique…",
  "shop.filters.all": "Bèè",

  // Diagnostic
  "diag.scan.zone": "Scanner zone kelen kelen.",

  // Rendez-vous
  "rdv.title": "Rendez-vous",
  "rdv.cta": "Ka rendez-vous ta",

  // Chat Dr. Kènè
  "chat.placeholder": "Seben i ka nyininkali…",

  // Profil
  "profile.title": "N ka profil",
  "profile.settings": "Réglages",
  "profile.wallet": "N ka nafolo",
  "profile.back.aria": "So kono na",

  // Sélecteur de langue
  "lang.selector.label": "Interface kan",
  "lang.selector.note": "Screnw ka kan. Lecture vocale bè règle dò — diagnostic résumé kofè.",

  // Notifications
  "notif.title": "Kunnafoniw",

  // Commun
  "common.back": "Segin",
  "common.continue": "Taama kofè",
  "common.retry": "Ka a wale koura",
  "common.offline": "Réseau tè — i ka données bè yen sisan. Réseau na, ka a wale koura.",
  "common.loading": "A bè don…",
  "common.save": "Ka a mara",
  "common.cancel": "Ka bali",
  "common.close": "Datugu",

  // Espaces (bas du rail desktop)
  "space.pro": "Espace Pro",
  "space.admin": "Console Admin",

  // Rail droit desktop
  "rail.view.profile": "N ka profil ye",
};

/* ───────── Baoulé (bq) / Bété (bt) — attesté usuel UNIQUEMENT ─────────
 Sources croisées 2026-09 — la salutation, et rien d'autre:
 baoulé: « Nja / Mmo anyin o! » le matin (cours Clément N'Goran,
 coastsystems.net); « Mo agni oh » à une femme (page Baoule Mhin) →
 « Mo anyin o », la cliente Kènè étant une femme.
 bété: « Yaho » = bonjour, « wato-keyi » = au revoir, « eko-lobo-wa » =
 comment ça va (Petit lexique en Bété de Gagnoa, multi-sources) — seules
 les salutations ont un équivalent attesté pour nos libellés UI.
 Tout le reste retombe sur le français: ne rien inventer est un choix. */

const BQ: Dict = {
  "home.greeting": "Mo anyin o",
};

const BT: Dict = {
  "home.greeting": "Yaho",
};

export const DICTS: Record<Lang, Dict> = { fr: FR, dy: DY, bq: BQ, bt: BT };

/**
 * Traduit une clé dans la langue demandée.
 * Repli en cascade: langue → français → clé brute (jamais de vide).
 */
export function translate(lang: Lang, key: string): string {
  const dict = DICTS[lang];
  const hit = dict?.[key];
  if (hit) return hit;
  return FR[key] ?? key;
}
