// POST /api/wallet/topup — recharge wallet via Payment MoMo (confirmé ensuite via /api/payments/confirm)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";

const Body = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(100),
  method: z.enum(["wave", "orange"]),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide (amount ≥ 100, method wave|orange)", 400);

    const user = await db.user.findUnique({ where: { id: parsed.data.userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    const payment = await db.payment.create({
      data: {
        userId: user.id,
        purpose: "wallet_topup",
        method: parsed.data.method,
        amount: parsed.data.amount,
        status: "pending",
        ref: genRef("PAY"),
        metaJson: JSON.stringify({ userId: user.id }),
      },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    return serverError("wallet/topup", err);
  }
}
