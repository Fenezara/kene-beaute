// GET /api/profile/export?userId= — portabilité RGPD « Mes données » :
// export JSON complet de TOUT ce que Kènè sait de la cliente (POC, données locales).
// En-têtes Content-Disposition → téléchargement direct côté client.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError, ensureWallet } from "@/lib/kene/server";

export const runtime = "nodejs";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return jsonError("userId requis", 400);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) return jsonError("Utilisatrice introuvable", 404);

    // ── Données parallélisables ──
    const [consents, diagnoses, appointments, orders, walletRec, notifications, redemptions, payments] = await Promise.all([
      db.consent.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      db.diagnosis.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, zone: true, scoreGlobal: true, status: true,
          resultJson: true, createdAt: true,
        },
      }),
      db.appointment.findMany({
        where: { userId },
        orderBy: { startAt: "desc" },
        include: {
          service: { select: { name: true, durationMin: true } },
          tenant: { select: { name: true, city: true } },
        },
      }),
      db.order.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
          items: { select: { label: true, qty: true, unitPrice: true, total: true } },
          payment: { select: { method: true, status: true, ref: true, confirmedAt: true } },
        },
      }),
      ensureWallet(userId),
      db.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { channel: true, message: true, status: true, scheduledAt: true, readAt: true, createdAt: true },
      }),
      db.couponRedemption.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { coupon: { select: { code: true, label: true, kind: true, value: true } } },
      }),
      db.payment.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { purpose: true, method: true, amount: true, status: true, ref: true, createdAt: true, confirmedAt: true },
      }),
    ]);

    const walletTxs = walletRec
      ? await db.walletTransaction.findMany({ where: { walletId: walletRec.id }, orderBy: { createdAt: "desc" } })
      : [];

    // ── Parrainage ──
    let referredBy: { name: string } | null = null;
    if (user.referredBy) {
      const parrain = await db.user.findUnique({ where: { id: user.referredBy }, select: { name: true } });
      referredBy = parrain ? { name: parrain.name } : null;
    }
    const filleuls = await db.user.findMany({
      where: { referredBy: userId },
      select: { name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // ── Assemblage (les images photo ne sont PAS exportées : volumétrie) ──
    const payload = {
      formatVersion: 1,
      generatedAt: new Date().toISOString(),
      application: "Kènè — la beauté mélanoderme, de A à Z",
      rgpd: {
        droit: "Portabilité des données (art. 20 RGPD)",
        note: "Export généré à ta demande. Les photos envoyées pour les diagnostics ne sont pas incluses (volumétrie) ; les résultats complets le sont.",
      },
      profil: {
        nom: user.name,
        telephone: user.phone,
        email: user.email,
        ville: user.city,
        role: user.role,
        phototypeFitzpatrick: user.fitzpatrick,
        typeDePeau: user.skinType,
        objectifs: safeJson(user.goals ?? "[]"),
        allergies: user.allergies,
        consentementSante: { accorde: user.consentHealth, horodatage: iso(user.consentTs) },
        codeParrainage: user.referralCode,
        parrainePar: referredBy,
        filleuls: filleuls.map((f) => ({ nom: f.name, depuis: iso(f.createdAt) })),
        inscriteLe: iso(user.createdAt),
      },
      consentements: consents.map((c) => ({ type: c.type, accorde: c.granted, date: iso(c.createdAt), ip: c.ip })),
      diagnostics: diagnoses.map((d) => ({
        zone: d.zone,
        scoreGlobal: d.scoreGlobal,
        statut: d.status,
        date: iso(d.createdAt),
        resultat: d.status === "done" ? safeJson(d.resultJson) : null,
      })),
      rendezVous: appointments.map((a) => ({
        dateHeure: iso(a.startAt),
        statut: a.status,
        soin: a.service?.name ?? null,
        dureeMin: a.service?.durationMin ?? null,
        institut: a.tenant?.name ?? null,
        villeInstitut: a.tenant?.city ?? null,
        acompte: a.depositAmount,
      })),
      commandes: orders.map((o) => ({
        date: iso(o.createdAt),
        statut: o.status,
        sousTotal: o.subtotal,
        remiseCoupon: o.discount,
        codeCoupon: o.couponCode,
        cashback: o.cashback,
        total: o.total,
        paiement: o.payment ? { methode: o.payment.method, statut: o.payment.status, reference: o.payment.ref, confirmeLe: iso(o.payment.confirmedAt) } : null,
        articles: o.items.map((i) => ({ libelle: i.label, quantite: i.qty, prixUnitaire: i.unitPrice, total: i.total })),
      })),
      paiementsAutres: payments.map((p) => ({
        objet: p.purpose, methode: p.method, montant: p.amount, statut: p.status, reference: p.ref, date: iso(p.createdAt), confirmeLe: iso(p.confirmedAt),
      })),
      wallet: walletRec
        ? { solde: walletRec.balance, tauxCashback: walletRec.cashbackRate, transactions: walletTxs.map((t) => ({ type: t.type, montant: t.amount, motif: t.reason, date: iso(t.createdAt) })) }
        : null,
      couponsUtilises: redemptions.map((r) => ({ code: r.coupon?.code ?? null, libelle: r.coupon?.label ?? null, remise: r.discount, date: iso(r.createdAt) })),
      notifications: notifications.map((n) => ({ canal: n.channel, message: n.message, statut: n.status, prevuLe: iso(n.scheduledAt), luLe: iso(n.readAt), date: iso(n.createdAt) })),
    };

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="kene-mes-donnees-${date}.json"`,
        "Cache-Control": "no-store",
        "X-Data-Sections": "profil,consentements,diagnostics,rendezVous,commandes,paiements,wallet,coupons,notifications",
      },
    });
  } catch (err) {
    return serverError("profile:export", err);
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
