// Kènè — helpers WebAuthn serveur (t. 130 — passkeys Console).
//
// RP ID & ORIGIN DÉRIVÉS DE LA REQUÊTE: l'app vit derrière le gateway Caddy
// (le Host vu par Next est réécrit), et la fondatrice peut y accéder par le
// domaine public de la préview OU en direct. Le WebAuthn exige que
// `expected.rpID`/`expected.origin` correspondent au contexte du NAVIGATEUR:
// on dérive donc l'origine publique de la requête, dans cet ordre:
// 1. header Origin (posé par le navigateur sur les POST — le plus véridique);
// 2. X-Forwarded-Proto + X-Forwarded-Host (posés par le gateway — les GET
//    fetch same-origin n'emportent pas d'Origin);
// 3. header Host (accès direct :3000).
// NOTE PROD: le passkey est LIÉ au domaine (rpID) où il est enregistré —
// changer de domaine officiel demande un ré-enregistrement des appareils.
import type { NextRequest } from "next/server";

export type RpContext = { rpID: string; origin: string };

/** Origine publique de la requête (protocole + domaine + port) ou null. */
export function rpFromRequest(req: NextRequest): RpContext | null {
  const originHeader = req.headers.get("origin")?.trim();
  const candidates: string[] = [];
  if (originHeader && originHeader !== "null") candidates.push(originHeader);

  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (fwdHost) candidates.push(`${fwdProto}://${fwdHost}`);

  const host = req.headers.get("host")?.trim();
  if (host) candidates.push(`http://${host}`);

  for (const c of candidates) {
    try {
      const u = new URL(c);
      if (u.hostname) return { rpID: u.hostname, origin: u.origin };
    } catch {
      /* candidate imparsable → suivant */
    }
  }
  return null;
}
