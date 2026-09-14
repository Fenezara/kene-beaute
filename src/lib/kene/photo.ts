// Validation partagée des photos uploadées (data URL).
// Le client redimensionne déjà (canvas → JPEG ~820px): ici on borne la
// taille et on vérifie le format AVANT d'écrire en base — jamais de blob
// arbitraire dans la base.
export const PHOTO_MAX_CHARS = 1_600_000; // ~1,2 Mo de JPEG base64 (820px q80)

export const PHOTO_DATA_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

export type PhotoCheck = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * `undefined` → champ non fourni (aucune modification)
 * `null` → suppression de la photo
 * string → nouvelle photo (data URL image/jpeg|png|webp bornée)
 */
export function checkPhoto(v: unknown, label = "photo"): PhotoCheck {
  if (v === undefined) return { ok: true, value: undefined as unknown as null };
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: `${label} invalide` };
  if (!PHOTO_DATA_RE.test(v)) return { ok: false, error: `Format de ${label} non supporté (JPG, PNG ou WebP)` };
  if (v.length > PHOTO_MAX_CHARS) return { ok: false, error: `${label} trop lourde — réduis-la et réessaie` };
  return { ok: true, value: v };
}
