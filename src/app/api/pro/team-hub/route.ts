// GET & POST /api/pro/team-hub — Messagerie interne d'équipe (remplacement WhatsApp),
// Bips métier 1-clic, Consigne du jour de la Gérante, Objectif collectif (Cagnotte Salon),
// et Passation de relais Cabine → Caisse POS (Handoff).
//
// Stockage sans migration destructive : table `AuditLog` (indexée par tenantId + entity)
// + relais temps réel immédiat via `pushTenantFeed(tenantId)` (Socket.io 250ms)
// et `pushFeed(userId)` (Web Push VAPID sur les téléphones verrouillés de l'équipe).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { jsonError, serverError, resolveTenant, dayStart } from "@/lib/kene/server";
import { guardProRole, sessionFromRequest } from "@/lib/kene/session";
import { pushFeed, pushTenantFeed } from "@/lib/kene/realtime";

export const runtime = "nodejs";

export type TeamChannel = "general" | "cabine_accueil" | "stock" | "direct";
export type TeamBeepKind = "none" | "client_arrived" | "need_product" | "handoff_pos" | "stock_alert";

export interface TeamHubMessage {
  id: string;
  channel: TeamChannel;
  senderName: string;
  senderRole: string;
  toEmployeeId?: string | null;
  toEmployeeName?: string | null;
  text: string;
  audioDataUrl?: string | null;
  beepKind: TeamBeepKind;
  pinned?: boolean;
  readBy: string[];
  createdAt: string;
}

export interface PosHandoffLine {
  kind: "service" | "product";
  id: string;
  label: string;
  unitPrice: number;
  qty: number;
  practitionerName?: string;
}

export interface PosHandoffTicket {
  id: string;
  practitionerId?: string | null;
  practitionerName: string;
  clientProfileId?: string | null;
  clientName: string;
  clientPhone?: string | null;
  appointmentId?: string | null;
  items: PosHandoffLine[];
  note?: string | null;
  totalFcfa: number;
  status: "pending" | "completed" | "dismissed";
  createdAt: string;
}

export interface TeamDirective {
  text: string;
  author: string;
  updatedAt: string;
  monthlyGoalFcfa: number;
  teamBonusFcfa: number;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:team-hub:get");
    if (guard) return guard;

    const tenant = await resolveTenant(req, req.nextUrl.searchParams.get("tenantId"));
    if (!tenant) return jsonError("Institut introuvable", 404);

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    const [chatLogs, handoffLogs, directiveLog, employees, monthSalesAgg] = await Promise.all([
      db.auditLog.findMany({
        where: { tenantId: tenant.id, entity: "team_chat" },
        orderBy: { createdAt: "desc" },
        take: 80,
      }),
      db.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entity: "pos_handoff",
          action: "pending",
          createdAt: { gte: dayStart() },
        },
        orderBy: { createdAt: "desc" },
        take: 25,
      }),
      db.auditLog.findFirst({
        where: { tenantId: tenant.id, entity: "team_directive" },
        orderBy: { createdAt: "desc" },
      }),
      db.employee.findMany({
        where: { tenantId: tenant.id, active: true },
        select: { id: true, name: true, role: true, userId: true },
        orderBy: { name: "asc" },
      }),
      db.sale.aggregate({
        where: { tenantId: tenant.id, status: "completed", createdAt: { gte: monthStart } },
        _sum: { total: true },
      }),
    ]);

    const messages: TeamHubMessage[] = chatLogs
      .map((row) => {
        const d = parseJson<Partial<TeamHubMessage>>(row.detailsJson, {});
        return {
          id: row.id,
          channel: (d.channel as TeamChannel) || "general",
          senderName: d.senderName || "Équipe",
          senderRole: d.senderRole || "pro",
          toEmployeeId: d.toEmployeeId ?? null,
          toEmployeeName: d.toEmployeeName ?? null,
          text: d.text || "",
          audioDataUrl: d.audioDataUrl ?? null,
          beepKind: (d.beepKind as TeamBeepKind) || "none",
          pinned: Boolean(d.pinned),
          readBy: Array.isArray(d.readBy) ? d.readBy : [],
          createdAt: row.createdAt.toISOString(),
        };
      })
      .reverse();

    const handoffs: PosHandoffTicket[] = handoffLogs.map((row) => {
      const d = parseJson<Partial<PosHandoffTicket>>(row.detailsJson, {});
      const items = Array.isArray(d.items) ? d.items : [];
      const totalFcfa = items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * (Number(it.qty) || 1), 0);
      return {
        id: row.id,
        practitionerId: d.practitionerId ?? null,
        practitionerName: d.practitionerName || "Praticienne",
        clientProfileId: d.clientProfileId ?? null,
        clientName: d.clientName || "Cliente Cabine",
        clientPhone: d.clientPhone ?? null,
        appointmentId: d.appointmentId ?? null,
        items,
        note: d.note ?? null,
        totalFcfa,
        status: (row.action as PosHandoffTicket["status"]) || "pending",
        createdAt: row.createdAt.toISOString(),
      };
    });

    const rawDir = directiveLog ? parseJson<Partial<TeamDirective>>(directiveLog.detailsJson, {}) : {};
    const directive: TeamDirective = {
      text:
        rawDir.text ??
        "Bienvenue à toute l'équipe ! Pensez à envoyer vos paniers de sortie de cabine directement vers la caisse pour créditer automatiquement vos commissions.",
      author: rawDir.author ?? "Direction",
      updatedAt: directiveLog ? directiveLog.createdAt.toISOString() : now.toISOString(),
      monthlyGoalFcfa: Number(rawDir.monthlyGoalFcfa) > 0 ? Number(rawDir.monthlyGoalFcfa) : 1_500_000,
      teamBonusFcfa: Number(rawDir.teamBonusFcfa) > 0 ? Number(rawDir.teamBonusFcfa) : 10_000,
    };

    return NextResponse.json({
      messages,
      handoffs,
      directive,
      monthRevenueFcfa: monthSalesAgg._sum.total ?? 0,
      employees,
    });
  } catch (err) {
    return serverError("pro/team-hub:get", err);
  }
}

const SendMessageSchema = z.object({
  action: z.literal("send_message"),
  tenantId: z.string().min(1),
  channel: z.enum(["general", "cabine_accueil", "stock", "direct"]).default("general"),
  senderName: z.string().trim().min(1).max(80),
  senderRole: z.string().trim().max(60).default("pro"),
  toEmployeeId: z.string().nullable().optional(),
  toEmployeeName: z.string().nullable().optional(),
  text: z.string().trim().min(1).max(1200),
  audioDataUrl: z.string().max(450_000).nullable().optional(),
  beepKind: z.enum(["none", "client_arrived", "need_product", "handoff_pos", "stock_alert"]).default("none"),
  pinned: z.boolean().optional(),
});

const MarkReadSchema = z.object({
  action: z.literal("mark_read"),
  tenantId: z.string().min(1),
  readerName: z.string().trim().min(1).max(80),
});

const SetDirectiveSchema = z.object({
  action: z.literal("set_directive"),
  tenantId: z.string().min(1),
  text: z.string().trim().min(1).max(600),
  author: z.string().trim().max(80).default("Direction"),
  monthlyGoalFcfa: z.number().int().min(50_000).max(500_000_000).default(1_500_000),
  teamBonusFcfa: z.number().int().min(0).max(5_000_000).default(10_000),
});

const CreateHandoffSchema = z.object({
  action: z.literal("create_handoff"),
  tenantId: z.string().min(1),
  practitionerId: z.string().nullable().optional(),
  practitionerName: z.string().trim().min(1).max(80),
  clientProfileId: z.string().nullable().optional(),
  clientName: z.string().trim().min(1).max(120),
  clientPhone: z.string().nullable().optional(),
  appointmentId: z.string().nullable().optional(),
  note: z.string().max(400).nullable().optional(),
  items: z
    .array(
      z.object({
        kind: z.enum(["service", "product"]),
        id: z.string().min(1),
        label: z.string().min(1).max(160),
        unitPrice: z.number().int().min(0),
        qty: z.number().int().min(1).max(99).default(1),
        practitionerName: z.string().optional(),
      }),
    )
    .min(1),
});

const ConsumeHandoffSchema = z.object({
  action: z.enum(["consume_handoff", "dismiss_handoff"]),
  tenantId: z.string().min(1),
  handoffId: z.string().min(1),
});

const PostBody = z.discriminatedUnion("action", [
  SendMessageSchema,
  MarkReadSchema,
  SetDirectiveSchema,
  CreateHandoffSchema,
  ConsumeHandoffSchema,
]);

export async function POST(req: NextRequest) {
  try {
    const guard = guardProRole(req, "pro:team-hub:post");
    if (guard) return guard;

    const raw = await req.json().catch(() => null);
    const parsed = PostBody.safeParse(raw);
    if (!parsed.success) return jsonError("Données invalides", 400);

    const data = parsed.data;
    const tenant = await resolveTenant(req, data.tenantId);
    if (!tenant) return jsonError("Institut introuvable", 404);
    const sess = sessionFromRequest(req);

    // 1. Envoi d'un message ou Bip Métier
    if (data.action === "send_message") {
      const payload = {
        channel: data.channel,
        senderName: data.senderName,
        senderRole: data.senderRole,
        toEmployeeId: data.toEmployeeId ?? null,
        toEmployeeName: data.toEmployeeName ?? null,
        text: data.text,
        audioDataUrl: data.audioDataUrl ?? null,
        beepKind: data.beepKind,
        pinned: Boolean(data.pinned),
        readBy: [data.senderName],
      };

      const created = await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: sess?.userId ?? null,
          entity: "team_chat",
          action: data.beepKind !== "none" ? `beep:${data.beepKind}` : "message",
          entityId: data.toEmployeeId ?? data.channel,
          detailsJson: JSON.stringify(payload),
        },
      });

      // Notification temps réel Salon + Web Push vers les téléphones des employées ciblées
      const shortNotif = `💬 [${data.senderName}${data.toEmployeeName ? ` → ${data.toEmployeeName}` : ""}] ${data.text.slice(0, 110)}`;
      await db.notification
        .create({
          data: {
            tenantId: tenant.id,
            channel: "whatsapp",
            toPhone: tenant.phone,
            message: shortNotif,
            status: "sent",
          },
        })
        .catch(() => null);

      if (data.toEmployeeId) {
        const targetEmp = await db.employee.findUnique({
          where: { id: data.toEmployeeId },
          select: { userId: true },
        });
        if (targetEmp?.userId) {
          await db.notification
            .create({
              data: {
                userId: targetEmp.userId,
                tenantId: tenant.id,
                channel: "whatsapp",
                toPhone: tenant.phone,
                message: shortNotif,
                status: "sent",
              },
            })
            .catch(() => null);
          pushFeed(targetEmp.userId);
        }
      } else {
        // Bip général / canal : notifier les employées actives ayant un compte lié
        const emps = await db.employee.findMany({
          where: { tenantId: tenant.id, active: true, userId: { not: null } },
          select: { userId: true, name: true },
        });
        for (const e of emps) {
          if (!e.userId || e.name.toLowerCase() === data.senderName.toLowerCase()) continue;
          pushFeed(e.userId);
        }
      }

      pushTenantFeed(tenant.id);
      return NextResponse.json({ ok: true, id: created.id });
    }

    // 2. Accusé de lecture (« Vu par Edith, Irène ✓✓ »)
    if (data.action === "mark_read") {
      const recent = await db.auditLog.findMany({
        where: { tenantId: tenant.id, entity: "team_chat" },
        orderBy: { createdAt: "desc" },
        take: 35,
      });
      const reader = data.readerName.trim();
      for (const row of recent) {
        const d = parseJson<Partial<TeamHubMessage>>(row.detailsJson, {});
        const readBy = Array.isArray(d.readBy) ? d.readBy : [];
        if (!readBy.some((r) => r.toLowerCase() === reader.toLowerCase())) {
          readBy.push(reader);
          await db.auditLog.update({
            where: { id: row.id },
            data: { detailsJson: JSON.stringify({ ...d, readBy }) },
          });
        }
      }
      return NextResponse.json({ ok: true });
    }

    // 3. Consigne du Jour de la Gérante & Objectif Collectif
    if (data.action === "set_directive") {
      const details = {
        text: data.text,
        author: data.author,
        monthlyGoalFcfa: data.monthlyGoalFcfa,
        teamBonusFcfa: data.teamBonusFcfa,
      };
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: sess?.userId ?? null,
          entity: "team_directive",
          action: "pinned",
          detailsJson: JSON.stringify(details),
        },
      });
      pushTenantFeed(tenant.id);
      return NextResponse.json({ ok: true });
    }

    // 4. Création d'un Ticket de Sortie de Cabine → Caisse POS (Handoff)
    if (data.action === "create_handoff") {
      const totalFcfa = data.items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
      const handoffPayload = {
        practitionerId: data.practitionerId ?? null,
        practitionerName: data.practitionerName,
        clientProfileId: data.clientProfileId ?? null,
        clientName: data.clientName,
        clientPhone: data.clientPhone ?? null,
        appointmentId: data.appointmentId ?? null,
        items: data.items.map((it) => ({
          ...it,
          practitionerName: it.practitionerName || data.practitionerName,
        })),
        note: data.note ?? null,
        totalFcfa,
      };

      const created = await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: sess?.userId ?? null,
          entity: "pos_handoff",
          action: "pending",
          entityId: data.practitionerName,
          detailsJson: JSON.stringify(handoffPayload),
        },
      });

      // Poster aussi une trace automatique dans le canal #Accueil ↔ Cabine
      const itemsSummary = data.items.map((i) => `${i.qty}× ${i.label}`).join(", ");
      const chatPayload = {
        channel: "cabine_accueil",
        senderName: data.practitionerName,
        senderRole: "Cabine",
        text: `💳 Sortie de cabine envoyée en caisse pour ${data.clientName} (${itemsSummary} — ${totalFcfa.toLocaleString("fr-FR")} FCFA). Praticienne : ${data.practitionerName}.`,
        beepKind: "handoff_pos",
        readBy: [data.practitionerName],
      };
      await db.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: sess?.userId ?? null,
          entity: "team_chat",
          action: "beep:handoff_pos",
          entityId: created.id,
          detailsJson: JSON.stringify(chatPayload),
        },
      });

      await db.notification
        .create({
          data: {
            tenantId: tenant.id,
            channel: "whatsapp",
            toPhone: tenant.phone,
            message: `💳 Sortie de cabine (${data.practitionerName}) : ${data.clientName} prête à encaisser (${totalFcfa.toLocaleString("fr-FR")} FCFA)`,
            status: "sent",
          },
        })
        .catch(() => null);

      pushTenantFeed(tenant.id);
      return NextResponse.json({ ok: true, handoffId: created.id });
    }

    // 5. Consommation ou annulation d'un Ticket de Sortie de Cabine par la Caisse
    if (data.action === "consume_handoff" || data.action === "dismiss_handoff") {
      const nextStatus = data.action === "consume_handoff" ? "completed" : "dismissed";
      await db.auditLog.updateMany({
        where: { id: data.handoffId, tenantId: tenant.id, entity: "pos_handoff" },
        data: { action: nextStatus },
      });
      pushTenantFeed(tenant.id);
      return NextResponse.json({ ok: true });
    }

    return jsonError("Action inconnue", 400);
  } catch (err) {
    return serverError("pro/team-hub:post", err);
  }
}
