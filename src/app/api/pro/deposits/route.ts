// GET /api/pro/deposits?tenantId=&clientId= — Historique des acomptes/avances
// POST /api/pro/deposits — Enregistrement d'une nouvelle avance (WhatsApp / Cabine / MoMo / Cash)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, AUTH_MUTATION } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

const CreateDepositSchema = z.object({
  tenantId: z.string().min(1),
  clientProfileId: z.string().min(1),
  amount: z.number().int().positive("Le montant de l'avance doit être supérieur à 0"),
  paymentMethod: z.enum(["wave", "orange", "mtn", "moov", "cash", "card"]),
  paymentRef: z.string().optional(),
  purpose: z.string().optional(),
  notes: z.string().optional(),
  practitionerName: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:deposits:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const clientId = req.nextUrl.searchParams.get("clientId") || req.nextUrl.searchParams.get("clientProfileId");
    const status = req.nextUrl.searchParams.get("status");

    const where: any = {
      tenantId: tenant.id,
      ...(clientId ? { clientProfileId: clientId } : {}),
      ...(status ? { status } : {}),
    };

    const deposits = await db.clientDeposit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        clientProfile: {
          select: { id: true, name: true, phone: true },
        },
        sales: {
          select: { id: true, total: true, createdAt: true },
        },
      },
    });

    return NextResponse.json({ deposits });
  } catch (err) {
    return serverError("pro/deposits:GET", err);
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "pro:deposits:post"), AUTH_MUTATION);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, "Trop d'enregistrements d'avances consécutifs");

  try {
    const guard = guardProRole(req, "pro:deposits:post");
    if (guard) return guard;

    const body = await req.json().catch(() => null);
    const parsed = CreateDepositSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Données d'avance invalides", 400);
    }

    const { tenantId, clientProfileId, amount, paymentMethod, paymentRef, purpose, notes, practitionerName } = parsed.data;

    const tenant = await resolveTenant(req, tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);

    const client = await db.clientProfile.findFirst({
      where: { id: clientProfileId, tenantId: tenant.id },
    });
    if (!client) return jsonError("Fiche cliente introuvable", 404);

    // Déterminer le nom de la caissière / dermo-conseillère
    let cashier = practitionerName?.trim();
    if (!cashier) {
      const sess = sessionFromRequest(req);
      if (sess?.userId) {
        const emp = await db.employee.findFirst({
          where: { tenantId: tenant.id, userId: sess.userId },
          select: { name: true },
        });
        if (emp?.name) cashier = emp.name;
        else {
          const u = await db.user.findUnique({ where: { id: sess.userId }, select: { name: true } });
          cashier = u?.name || "Équipe Kènè Pro";
        }
      }
    }

    // Génération du numéro officiel de reçu d'acompte (ex: AC-2026-0001)
    const count = await db.clientDeposit.count({ where: { tenantId: tenant.id } });
    const receiptNumber = `AC-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const deposit = await db.clientDeposit.create({
      data: {
        tenantId: tenant.id,
        clientProfileId: client.id,
        amount,
        usedAmount: 0,
        remainingAmount: amount,
        paymentMethod,
        paymentRef: paymentRef?.trim() || null,
        purpose: purpose?.trim() || "Avance sur soin ou produit",
        receiptNumber,
        notes: notes?.trim() || null,
        createdBy: cashier || "Caisse",
        status: "available",
      },
      include: {
        clientProfile: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      deposit,
      message: `Avance de ${amount.toLocaleString("fr-FR")} FCFA enregistrée avec succès.`,
    });
  } catch (err) {
    return serverError("pro/deposits:POST", err);
  }
}
