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
    const userRoleParam = req.nextUrl.searchParams.get("userRole") || "";
    const isOwnerParam = req.nextUrl.searchParams.get("isOwner");
    const allowedSectionsParam = req.nextUrl.searchParams.get("allowedSections") || "";
    const allowedSections = allowedSectionsParam ? allowedSectionsParam.split(",").map((s) => s.trim()) : null;

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      include: {
        products: { where: { active: true } },
        services: { where: { active: true } },
      },
    });
    if (!tenant) return jsonError("Institut introuvable", 404);

    // Détermination dynamique des permissions effectives
    const isOwner = isOwnerParam === null ? true : isOwnerParam !== "false";
    const canViewCaisse = isOwner || Boolean(allowedSections?.includes("caisse") || allowedSections?.includes("dashboard"));
    const canViewStock = isOwner || Boolean(allowedSections?.includes("stock") || allowedSections?.includes("catalogue"));
    const canViewTeam = isOwner || Boolean(allowedSections?.includes("equipe"));
    const canViewRelances = isOwner || Boolean(allowedSections?.includes("relances"));

    // Début et fin de journée locale
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // 1. Ventes du jour (uniquement si permission caisse)
    let total = 0;
    let waveTotal = 0;
    let orangeTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let servicesCount = 0;
    let productsCount = 0;
    let salesTodayCount = 0;
    let uniqueClientsCount = 0;

    if (canViewCaisse) {
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

      salesTodayCount = salesToday.length;
      uniqueClientsCount = new Set(salesToday.map((s) => s.clientProfileId).filter(Boolean)).size;

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

    // 3. Produits en alerte de stock (uniquement si permission stock)
    const lowStockProducts = canViewStock
      ? tenant.products
          .filter((p) => p.stock <= p.stockAlert)
          .map((p) => ({
            id: p.id,
            name: p.name,
            stock: p.stock,
            stockAlert: p.stockAlert,
          }))
      : [];

    // Détermination de l'adresse polie & dévouée selon le rôle
    const rawName = (userNameParam || tenant.name || "Collaboratrice").trim();
    const cleanFirstName = rawName.split(/\s+/)[0] || "Collaboratrice";

    // Heure du jour pour salutation circonstanciée
    const currentHour = new Date().getHours();
    let timeGreeting = "Bonjour";
    if (currentHour >= 18 || currentHour < 5) {
      timeGreeting = "Bonsoir";
    }

    // Titre respectueux (Patron/Patronne pour gérante, ou Titre Métier pour collaboratrice)
    let bossTitle = "";
    if (isOwner) {
      const isFem =
        cleanFirstName.toLowerCase().endsWith("e") ||
        cleanFirstName.toLowerCase().endsWith("a") ||
        cleanFirstName.toLowerCase().includes("mme") ||
        cleanFirstName.toLowerCase().includes("deborah") ||
        cleanFirstName.toLowerCase().includes("fatou") ||
        cleanFirstName.toLowerCase().includes("mariam") ||
        cleanFirstName.toLowerCase().includes("awa") ||
        cleanFirstName.toLowerCase().includes("aminata");
      bossTitle = `${timeGreeting} Patron${isFem ? "ne" : ""} ${cleanFirstName}`;
    } else {
      const rolePretty = userRoleParam
        ? userRoleParam.charAt(0).toUpperCase() + userRoleParam.slice(1).replace(/_/g, " ")
        : "Collaboratrice";
      bossTitle = `${timeGreeting} ${cleanFirstName} · ${rolePretty}`;
    }

    // Synthèse vocale humaine adaptée aux permissions
    let vocalSummary = "";
    if (isOwner) {
      vocalSummary = `${bossTitle} ! C'est un réel plaisir de vous retrouver. Je suis à vos ordres pour le salon. `;
      if (appointmentsToday.length > 0) {
        vocalSummary += `Vous avez ${appointmentsToday.length} rendez-vous programmés aujourd'hui${pendingAppts.length > 0 ? `, dont ${pendingAppts.length} nécessitent confirmation` : ""}. `;
      } else {
        vocalSummary += `Aucun rendez-vous n'est encore calé aujourd'hui. `;
      }
      if (canViewCaisse && total > 0) {
        vocalSummary += `La caisse compte déjà ${total.toLocaleString("fr-FR")} francs d'encaissements. `;
      }
      if (canViewStock && lowStockProducts.length > 0) {
        vocalSummary += `Veuillez noter que ${lowStockProducts.length} produit${lowStockProducts.length > 1 ? "s sont" : " est"} en seuil d'alerte. `;
      }
      vocalSummary += `Dites-moi simplement ce que vous souhaitez que je prépare ou enregistre pour vous !`;
    } else {
      // Pour une collaboratrice sans accès caisse
      vocalSummary = `${bossTitle} ! C'est un plaisir de vous retrouver. Je suis à vos côtés pour préparer votre journée. `;
      if (appointmentsToday.length > 0) {
        vocalSummary += `Il y a ${appointmentsToday.length} rendez-vous planifiés aujourd'hui au salon. `;
      } else {
        vocalSummary += `Aucun rendez-vous n'est planifié pour le moment. `;
      }
      if (canViewStock && lowStockProducts.length > 0) {
        vocalSummary += `Attention, ${lowStockProducts.length} produit${lowStockProducts.length > 1 ? "s sont" : " est"} en seuil d'alerte stock. `;
      }
      vocalSummary += `Indiquez-moi les soins cabine ou rendez-vous que vous souhaitez préparer ou consulter !`;
    }

    // Initiatives proactives construites selon les permissions et la réalité du salon
    const initiatives: Array<{ type: string; title: string; desc: string; actionLabel: string }> = [];

    if (pendingAppts.length > 0) {
      initiatives.push({
        type: "whatsapp_reminder",
        title: "Confirmer les rendez-vous du jour",
        desc: `${pendingAppts.length} cliente(s) du jour n'ont pas encore validé leur présence. Envoyer les rappels WhatsApp ?`,
        actionLabel: "Lancer les rappels WhatsApp",
      });
    }

    if (canViewStock && lowStockProducts.length > 0) {
      const names = lowStockProducts.slice(0, 2).map((p) => p.name).join(", ");
      initiatives.push({
        type: "stock_reorder",
        title: "Alerte réassort prioritaire",
        desc: `${names}${lowStockProducts.length > 2 ? ` (+${lowStockProducts.length - 2})` : ""} ont atteint leur seuil d'alerte.`,
        actionLabel: "Préparer le bon de commande",
      });
    }

    if (isOwner && appointmentsToday.length < 3) {
      initiatives.push({
        type: "fill_slots",
        title: "Combler les créneaux disponibles",
        desc: "L'après-midi dispose de cabines libres. Souhaitez-vous relancer 5 clientes fidèles avec un avantage exclusif ?",
        actionLabel: "Proposer les créneaux VIP",
      });
    }

    if (canViewRelances) {
      initiatives.push({
        type: "client_followup",
        title: "Relances des clientes à J+30",
        desc: "Identifier les clientes dont le dernier protocole date d'un mois pour leur soin de maintien dermo-botanique.",
        actionLabel: "Ouvrir les relances",
      });
    }

    return NextResponse.json({
      summary: {
        bossTitle,
        isOwner,
        canViewCaisse,
        canViewStock,
        canViewTeam,
        canViewRelances,
        tenantPlan: tenant.plan,
        total,
        waveTotal,
        orangeTotal,
        cashTotal,
        cardTotal,
        salesCount: salesTodayCount,
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
