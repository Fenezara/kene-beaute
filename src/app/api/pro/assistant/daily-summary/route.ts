// Kènè Pro — GET /api/pro/assistant/daily-summary
// Le « Point Exécutif & Bilan de Direction » : Salutation dévouée, briefing du jour et initiatives proactives.
// Calcule l'encaissement du jour (Wave, Orange, Espèces), RDV du jour, alertes stocks et initiatives de gestion.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError, serverError } from "@/lib/kene/server";
import { guardProRole } from "@/lib/kene/session";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:assistant:daily-summary");
    if (guard) return guard;

    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!tenantId) return jsonError("tenantId requis", 400);

    const userNameParam = req.nextUrl.searchParams.get("userName") || "";

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        products: { where: { active: true } },
        services: { where: { active: true } },
      },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Début et fin de journée locale
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Ventes du jour
    const salesToday = await db.sale.findMany({
      where: {
        tenantId,
        createdAt: { gte: todayStart },
        status: "completed",
      },
      include: {
        items: true,
      },
    });

    let total = 0;
    let waveTotal = 0;
    let orangeTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let servicesCount = 0;
    let productsCount = 0;

    for (const sale of salesToday) {
      total += sale.total;
      if (sale.paymentMethod === "wave") waveTotal += sale.total;
      else if (sale.paymentMethod === "orange") orangeTotal += sale.total;
      else if (sale.paymentMethod === "cash") cashTotal += sale.total;
      else if (sale.paymentMethod === "card") cardTotal += sale.total;

      for (const it of sale.items) {
        if (it.kind === "service") servicesCount += it.qty;
        else if (it.kind === "product") productsCount += it.qty;
      }
    }

    // 2. Rendez-vous du jour
    const appointmentsToday = await db.appointment.findMany({
      where: {
        tenantId,
        startAt: { gte: todayStart, lte: todayEnd },
      },
      include: {
        service: true,
        resource: true,
      },
      orderBy: { startAt: "asc" },
    });

    const pendingAppts = appointmentsToday.filter((a) => a.status === "pending" || a.status === "unconfirmed");
    const confirmedAppts = appointmentsToday.filter((a) => a.status === "confirmed");

    // 3. Produits en alerte de stock
    const lowStockProducts = tenant.products
      .filter((p) => p.stock <= p.stockAlert)
      .map((p) => ({
        id: p.id,
        name: p.name,
        stock: p.stock,
        stockAlert: p.stockAlert,
      }));

    // Clients uniques aujourd'hui
    const uniqueClientsCount = new Set(salesToday.map((s) => s.clientProfileId).filter(Boolean)).size;

    // Détermination de l'adresse polie & dévouée du patron
    const rawName = (userNameParam || tenant.name || "Patron").trim();
    const cleanFirstName = rawName.split(/\s+/)[0] || "Patron";
    
    // Heure du jour pour salutation circonstanciée
    const currentHour = new Date().getHours();
    let timeGreeting = "Bonjour";
    if (currentHour >= 18 || currentHour < 5) {
      timeGreeting = "Bonsoir";
    }

    // Titre respectueux (Patron / Patronne)
    const bossTitle = `${timeGreeting} Patron${cleanFirstName.toLowerCase().endsWith("e") || cleanFirstName.toLowerCase().includes("mme") || cleanFirstName.toLowerCase().includes("deborah") || cleanFirstName.toLowerCase().includes("fatou") ? "ne" : ""} ${cleanFirstName}`;

    // Synthèse vocale humaine, loyale, attentive et proactive
    let vocalSummary = `${bossTitle} ! C'est un réel plaisir de vous retrouver. Je suis à vos ordres pour le salon. `;
    
    if (appointmentsToday.length > 0) {
      vocalSummary += `Vous avez ${appointmentsToday.length} rendez-vous programmés aujourd'hui${pendingAppts.length > 0 ? `, dont ${pendingAppts.length} nécessitent confirmation` : ""}. `;
    } else {
      vocalSummary += `Aucun rendez-vous n'est encore calé aujourd'hui. `;
    }

    if (total > 0) {
      vocalSummary += `La caisse compte déjà ${total.toLocaleString("fr-FR")} francs d'encaissements. `;
    }

    if (lowStockProducts.length > 0) {
      vocalSummary += `Veuillez noter que ${lowStockProducts.length} produit${lowStockProducts.length > 1 ? "s sont" : " est"} en seuil d'alerte. `;
    }

    vocalSummary += `Dites-moi simplement ce que vous souhaitez que je prépare ou enregistre pour vous !`;

    // Initiatives proactives construites selon la réalité du salon
    const initiatives: Array<{ type: string; title: string; desc: string; actionLabel: string }> = [];

    if (pendingAppts.length > 0) {
      initiatives.push({
        type: "whatsapp_reminder",
        title: "Confirmer les rendez-vous du jour",
        desc: `${pendingAppts.length} cliente(s) du jour n'ont pas encore validé leur présence. Envoyer les rappels WhatsApp ?`,
        actionLabel: "Lancer les rappels WhatsApp",
      });
    }

    if (lowStockProducts.length > 0) {
      const names = lowStockProducts.slice(0, 2).map((p) => p.name).join(", ");
      initiatives.push({
        type: "stock_reorder",
        title: "Alerte réassort prioritaire",
        desc: `${names}${lowStockProducts.length > 2 ? ` (+${lowStockProducts.length - 2})` : ""} ont atteint leur seuil d'alerte.`,
        actionLabel: "Préparer le bon de commande",
      });
    }

    if (appointmentsToday.length < 3) {
      initiatives.push({
        type: "fill_slots",
        title: "Combler les créneaux disponibles",
        desc: "L'après-midi dispose de cabines libres. Souhaitez-vous relancer 5 clientes fidèles avec un avantage exclusif ?",
        actionLabel: "Proposer les créneaux VIP",
      });
    }

    initiatives.push({
      type: "client_followup",
      title: "Relances des clientes à J+30",
      desc: "Identifier les clientes dont le dernier protocole date d'un mois pour leur soin de maintien dermo-botanique.",
      actionLabel: "Ouvrir les relances",
    });

    return NextResponse.json({
      summary: {
        bossTitle,
        total,
        waveTotal,
        orangeTotal,
        cashTotal,
        cardTotal,
        salesCount: salesToday.length,
        uniqueClientsCount,
        servicesCount,
        productsCount,
        appointmentsCount: appointmentsToday.length,
        pendingAppointmentsCount: pendingAppts.length,
        confirmedAppointmentsCount: confirmedAppts.length,
        todayAppointments: appointmentsToday.map((a) => ({
          id: a.id,
          time: new Date(a.startAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          clientName: a.clientName || "Cliente",
          serviceName: a.service?.name || "Soin en cabine",
          practitionerName: a.resource?.name || "Non assigné",
          status: a.status,
        })),
        lowStockProducts,
        initiatives,
        vocalSummary,
      },
    });
  } catch (err) {
    return serverError("pro/assistant:daily-summary", err);
  }
}
