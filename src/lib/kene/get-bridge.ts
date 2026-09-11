// Kènè — pont GET↔POST (t. 91). Voir src/lib/kene/api.ts pour le contexte
// complet de l'incident (POST de la préview de l'utilisatrice bloqués en
// amont, GET opérationnels). Côté serveur : une route qui expose déjà un
// POST peut accepter le MÊME payload transporté en query param `_g` :
//
//   GET /api/…?_g=<encodeURIComponent(JSON.stringify(body))>
//
// Le payload est décodé puis validé PAR LE MÊME schéma zod que le POST —
// aucun contournement de garde-fou possible (rate-limit IP identique : la
// clé dérive de la requête, pas de la méthode). Utilisé par les routes
// critiques du parcours de l'utilisatrice : chat Dr Kènè, otp/request,
// otp/verify.
import type { ZodType } from "zod";
import type { NextRequest } from "next/server";

export const GET_BRIDGE_PARAM = "_g";

/** Résultat du décodage du pont : soit un payload validé, soit une erreur
 *  explicite (le handler répond 400 sans exécuter la moindre logique). */
export type BridgeResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Décode et valide le paramètre `_g` d'une requête pont GET.
 *  - absent → { ok: false } : la route répond 400 (contrat d'appel rompu) ;
 *  - JSON invalide ou schéma invalide → idem, message FR actionnable. */
export function decodeBridge<T>(req: NextRequest, schema: ZodType<T>): BridgeResult<T> {
  const raw = req.nextUrl.searchParams.get(GET_BRIDGE_PARAM);
  if (raw === null) return { ok: false, error: "paramètre _g requis" };
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { ok: false, error: "payload _g illisible" };
  }
  const validated = schema.safeParse(parsedJson);
  if (!validated.success) return { ok: false, error: "payload _g invalide" };
  return { ok: true, data: validated.data };
}
