// Kènè — mémoire du dernier compte connecté sur CET appareil.
//
// Rôle (, « rester connectée / se reconnecter simplement »): la page
// d'accueil (« les Portes ») propose à une utilisatrice déconnectée de
// reprendre sa session en un geste. On mémorise donc le dernier téléphone
// utilisé dans une clé dédiée `kene-last-account` — clé volontairement
// SÉPARÉE du store persisté (`kene-store`): la déconnexion vide la session
// (setUser(null) + cookie serveur /api/auth/logout) mais NE vide JAMAIS cette
// clé — c'est elle qui rend la reconnexion tactile.
//
// Confidentialité: données locales à l'appareil (jamais envoyées), téléphone
// affiché masqué (+225 •• •• 03 04). Supprimable d'un geste (« Oublier ») et
// par l'effacement du stockage navigateur.
export interface LastAccount {
 /** E.164 complet, ex. "+2250701020304" */
  phone: string;
 /** Nom affiché (prénom extrait à l'affichage) */
  name: string;
  role: "client" | "pro" | "admin";
}

const KEY = "kene-last-account";

/** Mémorise (ou rafraîchit) le dernier compte — appelé à chaque connexion. */
export function rememberAccount(a: LastAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
 /* stockage indisponible (navigation privée…) — silencieux, non bloquant */
  }
}

/** Dernier compte mémorisé sur cet appareil, ou null (première visite). */
export function readLastAccount(): LastAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastAccount>;
    if (typeof v.phone !== "string" || !v.phone.startsWith("+")) return null;
    return {
      phone: v.phone,
      name: typeof v.name === "string" ? v.name : "",
      role: v.role === "pro" || v.role === "admin" ? v.role : "client",
    };
  } catch {
    return null;
  }
}

/** Oublie le dernier compte (bouton « Oublier ce numéro » des Portes). */
export function forgetAccount(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
 /* silencieux */
  }
}

/** Masque un E.164 pour l'affichage public: +225 •• •• 03 04 */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return phone;
  const head = phone.startsWith("+") ? `+${d.slice(0, 3)}` : `+${d.slice(0, 3)}`;
  const tail = d.slice(-4).replace(/(\d{2})(?=\d)/g, "$1 ");
  return `${head} •• •• ${tail}`;
}

/** Prénom affichable depuis un nom complet ("Mariam Traoré" → "Mariam"). */
export function firstNameOf(name: string): string {
  const f = name.trim().split(/\s+/)[0];
  return f || "";
}
