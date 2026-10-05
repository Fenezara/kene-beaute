// Kènè — i18n interface: français (standard haute clarté).
// Lib PURE (aucune dépendance React/store): métadonnées des langues,
// dictionnaires statiques et translate avec repli français.
// La langue active vit dans src/store/lang (zustand persist) et le hook
// useT (src/lib/kene/use-t.ts) — ce fichier ne fait que du texte.

export type Lang = "fr";

/** Métadonnées d'affichage du sélecteur (Profil → Langue de l'interface) */
export interface LangMeta {
  id: Lang;
  label: string;
 /** Pastille courte façon pills VoiceNarration (FR) */
  flag: string;
  note: string;
}

export const LANGS: LangMeta[] = [
  { id: "fr", label: "Français", flag: "FR", note: "Langue officielle & audio naturel haute fidélité" },
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
  "nav.chat.aria": "Dermo Kènè — chat",

  // Titres d'écran (h1 du header ClientApp)
  "title.home": "Accueil",
  "title.diag": "Diagnostic IA",
  "title.shop": "Boutique",
  "title.rdv": "Rendez-vous",
  "title.chat": "Dermo Kènè",
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
  "onboarding.subtitle": "Diagnostic IA multi-zones, boutique botaniques, instituts partenaires et coach Dermo Kènè — pensés pour les peaux Fitzpatrick IV–VI.",
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
  "lang.selector.note": "Textes de l'interface et synthèse vocale en français naturel haute fidélité.",

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

export const DICTS: Record<Lang, Dict> = { fr: FR };

/**
 * Traduit une clé dans la langue demandée.
 * Repli direct sur le français (langue officielle et naturelle).
 */
export function translate(lang: Lang, key: string): string {
  const dict = DICTS[lang];
  const hit = dict?.[key];
  if (hit) return hit;
  return FR[key] ?? key;
}
