// PATCH /api/admin/users/[id] — les leviers de compte (t. 128 verrouiller /
// déverrouiller ; t. 141 accès Console délégué).
//
// · { locked: true, reason } / { locked: false } — le compte est refusé à la
//   vérification OTP (403 avec le motif montré) et sa session existante
//   s'éteint au prochain boot (auth/session → 404 « Session expirée »).
// · { action: "promote" } — DONNE l'accès Console (rôle admin) à un compte
//   CLIENTE: elle ouvrira /console avec son propre numéro. t. 141.
// · { action: "demote" } — RETIRE l'accès Console: le compte redevient
//   cliente (ses données restent intactes). t. 141.
//   ⚠ t. 130/141 — STEP-UP: ce PATCH exige une session admin + une ÉLÉVATION
//   fraîche (< 5 min, code confirmé) — ASVS V2.7 sur les actions sensibles.
//
// Protections: l'admin ne peut ni se verrouiller ELLE-MÊME ni verrouiller un
// autre compte admin (sinon la fondatrice pourrait se murer hors de sa
// propre console). PROMOTE: uniquement les comptes clientes — un compte Pro
// reste lié à son institut (la Console ne se délègue pas en cassant la
// gerance). DEMOTE: jamais soi-même, jamais le DERNIER admin (au moins deux
// consoles doivent rester ouvrables), et la session console ouverte de la
// déléguée s'éteint à son rechargement de page (le cookie signé expire au
// bout de 8 h au maximum — limite documentée).
//
// Sécurité: session admin EXIGÉE (401 sans cookie, 403 autre rôle) + audit
// user_locked/user_unlocked/admin_promoted/admin_demoted (téléphone masqué).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, notify } from "@/lib/kene/server";
import { sessionFromRequest, guardAdminElevated } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

const Body = z.union([
  z.object({
    action: z.enum(["promote", "demote"], { message: "Action inconnue (promote ou demote)" }),
  }),
  z.object({
    locked: z.boolean(),
    reason: z.string().trim().min(3, "Motif requis (min. 3 caractères)").max(280).optional(),
  }),
]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(rlKey(req, "admin:user:patch"), ADMIN_STATS);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'actions — réessaie dans une minute");
  // t. 130 — step-up: session admin + élévation fraîche.
  const guard = guardAdminElevated(req);
  if (guard) return guard;
  try {
    const { id } = await ctx.params;
    const raw = await req.json().catch(() => null);
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Requête invalide", 400);
    }
    const body = parsed.data;

    const sess = sessionFromRequest(req);
    // (guardAdminElevated garantit sess non null — TS a besoin du rappel)
    if (!sess) return jsonError("Session requise", 401);

    const user = await db.user.findUnique({ where: { id } });
    if (!user) return jsonError("Compte introuvable", 404);
    const ip = clientIp(req);

    // ── ACCÈS CONSOLE DÉLÉGUÉ (t. 141) ───────────────────────────
    if ("action" in body) {
      if (body.action === "promote") {
        if (user.role === "admin") return jsonError("Ce compte a déjà accès à la Console", 400);
        if (user.role === "pro") {
          return jsonError(
            "Les comptes Pro restent liés à leur institut — donne l'accès Console à un compte cliente (ou crée un compte dédié)",
            400,
          );
        }
        if (user.lockedAt) return jsonError("Déverrouille d'abord ce compte — une console verrouillée ne s'ouvre pas", 400);
        const updated = await db.user.update({ where: { id }, data: { role: "admin" } });
        await notify({
          userId: user.id,
          channel: "app",
          toPhone: user.phone,
          message: `👑 Tu as maintenant accès à la Console Kènè — ouvre /console depuis un navigateur et connecte-toi avec ton numéro. Bienvenue dans le pilotage 💛`,
        });
        void audit({
          kind: "admin_promoted",
          userId: user.id,
          phone: user.phone,
          ip,
          detail: `${user.name} — accès Console donné`,
        });
        return NextResponse.json({
          ok: true,
          user: { id: updated.id, name: updated.name, role: updated.role },
        });
      }

      // demote — retirer l'accès Console.
      if (user.role !== "admin") return jsonError("Ce compte n'a pas accès à la Console", 400);
      if (id === sess.userId) return jsonError("Tu ne peux pas retirer ton propre accès console", 400);
      const adminCount = await db.user.count({ where: { role: "admin" } });
      if (adminCount < 2) {
        return jsonError("Impossible de retirer le DERNIER accès console — promouves d'abord une autre personne", 400);
      }
      const updated = await db.user.update({ where: { id }, data: { role: "client" } });
      await notify({
        userId: user.id,
        channel: "app",
        toPhone: user.phone,
        message: `Ton accès à la Console Kènè a été retiré — ton espace cliente reste intact 💛`,
      });
      void audit({
        kind: "admin_demoted",
        userId: user.id,
        phone: user.phone,
        ip,
        detail: `${user.name} — accès Console retiré (redevient cliente)`,
      });
      return NextResponse.json({
        ok: true,
        user: { id: updated.id, name: updated.name, role: updated.role },
      });
    }

    // ── VERROUILLAGE (t. 128) ────────────────────────────────────
    const { locked, reason } = body;
    if (locked && id === sess.userId) {
      return jsonError("Tu ne peux pas verrouiller ton propre compte console", 400);
    }
    if (locked && user.role === "admin") {
      return jsonError(
        "Un compte admin ne se verrouille pas depuis la console — retire ses droits (action Console) ou verrouille côté base",
        400,
      );
    }
    if (locked && !reason) {
      return jsonError("Un motif est requis pour verrouiller (montré au compte à sa tentative de connexion)", 400);
    }

    const updated = await db.user.update({
      where: { id },
      data: locked
        ? { lockedAt: new Date(), lockedReason: reason ?? null }
        : { lockedAt: null, lockedReason: null },
    });

    void audit({
      kind: locked ? "user_locked" : "user_unlocked",
      userId: user.id,
      phone: user.phone,
      ip,
      detail: `${user.name}${reason && locked ? ` — ${reason}` : ""}`,
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: updated.id,
        name: updated.name,
        role: updated.role,
        lockedAt: updated.lockedAt?.toISOString() ?? null,
        lockedReason: updated.lockedReason,
      },
    });
  } catch (err) {
    return serverError("admin/user:patch", err);
  }
}
