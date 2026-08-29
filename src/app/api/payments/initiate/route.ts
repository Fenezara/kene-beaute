// POST /api/payments/initiate — crée un Payment pending (simulation MoMo)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, genRef } from "@/lib/kene/server";

const Body = z.object({
  userId: z.string().optional(),
  purpose: z.enum(["shop_order", "appointment_deposit", "wallet_topup", "pos_sale"]),
  method: z.enum(["wave", "orange", "cash", "card", "wallet"]),
  amount: z.number().int().min(1),
  metaJson: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError("Corps de requête invalide", 400);
    const { userId, purpose, method, amount, metaJson } = parsed.data;

    const payment = await db.payment.create({
      data: {
        userId: userId ?? null,
        purpose,
        method,
        amount,
        status: "pending",
        ref: genRef("PAY"),
        metaJson: typeof metaJson === "string" ? metaJson : metaJson ? JSON.stringify(metaJson) : null,
      },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err) {
    return serverError("payments/initiate", err);
  }
}
