// GET /api/admin/security — visionneuse « Sécurité » de la console admin 
// Journal d'audit + posture: les 80 événements les plus récents (ts desc) et
// les compteurs 24 h.
//
// Garde: même mécanique de session que /api/admin/stats (cookie signé
// kene_session, HMAC-SHA256), mais STRICT — la route est nouvelle (aucun
// consommateur antérieur), et le journal expose des IP: pas de mode legacy
// public possible. Sans session admin valide → 403 franc.
import { NextRequest, NextResponse } from "next/server";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { alertChannelsStatus } from "@/lib/kene/admin-alerts";
import { lookupIpGeoBatch } from "@/lib/kene/ip-geo";
import { db } from "@/lib/db";
import { serverError } from "@/lib/kene/server";
import { sessionFromRequest } from "@/lib/kene/session";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS, getRateLimitStoreStats } from "@/lib/kene/rate-limit";
import type { AdminSecurity, AdminSystemHealth } from "@/components/kene/pro/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:security"), ADMIN_STATS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Journal très sollicité — reprends dans quelques secondes");
  }
  try {
    // Garde stricte : session signée avec rôle admin, sinon 403.
    const sess = sessionFromRequest(req);
    if (!sess || sess.role !== "admin") {
      return NextResponse.json({ error: "Console admin réservée aux comptes admin" }, { status: 403 });
    }

    const t0 = performance.now();
    await db.$queryRaw`SELECT 1`;
    const dbLatencyMs = Math.round((performance.now() - t0) * 10) / 10;

    const since24h = new Date(Date.now() - 24 * 3_600_000);
    const [
      events,
      total,
      last24h,
      failedLogins24h,
      locked24h,
      clientErrors24h,
      threats24h,
      pinLockedUsers,
      webhookEvents24h,
      lastWebhook,
      adminIpRows,
    ] = await Promise.all([
      db.securityEvent.findMany({ orderBy: { ts: "desc" }, take: 100 }),
      db.securityEvent.count(),
      db.securityEvent.count({ where: { ts: { gte: since24h } } }),
      db.securityEvent.count({ where: { kind: "login_failed", ts: { gte: since24h } } }),
      db.securityEvent.count({ where: { kind: "login_locked", ts: { gte: since24h } } }),
      db.securityEvent.count({ where: { kind: "client_error", ts: { gte: since24h } } }),
      db.securityEvent.count({
        where: {
          kind: {
            in: [
              "honeypot_probe",
              "impossible_travel",
              "velocity_anomaly",
              "bot_blocked",
              "rate_limit_exceeded",
              "upload_reject",
            ],
          },
          ts: { gte: since24h },
        },
      }),
      db.user.count({
        where: {
          OR: [
            { pinLockedUntil: { gt: new Date() } },
            { pinFails: { gte: 3 } },
          ],
        },
      }),
      db.webhookEvent.count({ where: { processedAt: { gte: since24h } } }),
      db.webhookEvent.findFirst({ orderBy: { processedAt: "desc" }, select: { processedAt: true } }),
      db.securityEvent.findMany({
        where: { kind: "admin_access", ts: { gte: new Date(Date.now() - 30 * 24 * 3_600_000) } },
        select: { ip: true },
        distinct: ["ip"],
        take: 20,
      }),
    ]);

    // Statut de la copie hors serveur (écrit par le script de sauvegarde nocturne).
    let offsiteBackup: AdminSystemHealth["offsiteBackup"] = {
      ok: false,
      at: null,
      target: null,
      detail: "Aucune copie externe enregistrée",
    };
    try {
      const candidates = [path.join(process.cwd(), "db", "backups"), "/app/db/backups"];
      for (const dir of candidates) {
        const raw = await fs.readFile(path.join(dir, ".offsite-status.json"), "utf8").catch(() => null);
        if (!raw) continue;
        const j = JSON.parse(raw) as { ok?: boolean; at?: string; target?: string; detail?: string };
        const fresh = j.at ? Date.now() - new Date(j.at).getTime() < 36 * 3_600_000 : false;
        offsiteBackup = { ok: Boolean(j.ok) && fresh, at: j.at ?? null, target: j.target ?? null, detail: j.detail ?? null };
        break;
      }
    } catch {
      /* pas encore de copie externe */
    }

    const adminIps = adminIpRows.map((r) => r.ip).filter((x): x is string => Boolean(x));
    const eventIps = events.map((e) => e.ip).filter((x): x is string => Boolean(x));
    const geoFull = await lookupIpGeoBatch([...adminIps, ...eventIps]);
    const ipGeo: Record<string, { label: string; countryCode: string } | null> = {};
    for (const [ip, gg] of Object.entries(geoFull)) ipGeo[ip] = gg ? { label: gg.label, countryCode: gg.countryCode } : null;

    const mem = process.memoryUsage();
    const memUsageMb = Math.round(mem.heapUsed / 1024 / 1024);
    const memRssMb = Math.round(mem.rss / 1024 / 1024);
    const uptime = Math.floor(process.uptime());
    const rlStats = getRateLimitStoreStats();

    // Calcul du score de santé global (0 - 100)
    let score = 100;
    if (dbLatencyMs > 50) score -= 15;
    if (dbLatencyMs > 200) score -= 30;
    if (memUsageMb > 800) score -= 15;
    if (threats24h > 10) score -= 10;
    if (clientErrors24h > 20) score -= 10;
    score = Math.max(10, Math.min(100, score));

    const status: AdminSystemHealth["status"] =
      score >= 85 ? "optimal" : score >= 60 ? "warning" : "critical";

    const health: AdminSystemHealth = {
      status,
      score,
      uptimeSec: uptime,
      dbLatencyMs,
      memoryUsageMb: memUsageMb,
      memoryRssMb: memRssMb,
      nodeVersion: process.version,
      osPlatform: `${os.type()} ${os.arch()}`,
      loadAvg: os.loadavg ? os.loadavg() : [0, 0, 0],
      webhookEvents24h,
      jailedIpsCount: 0,
      activeRateLimitKeys: rlStats.activeKeys,
      startedAt: new Date(Date.now() - uptime * 1000).toISOString(),
      lastWebhookAt: lastWebhook?.processedAt ? lastWebhook.processedAt.toISOString() : null,
      alertChannels: alertChannelsStatus(),
      offsiteBackup,
    };

    const payload: AdminSecurity = {
      events: events.map((e) => ({
        id: e.id,
        ts: e.ts.toISOString(),
        kind: e.kind,
        phone: e.phone,
        ip: e.ip,
        detail: e.detail,
      })),
      stats: {
        total,
        last24h,
        failedLogins24h,
        locked24h,
        clientErrors24h,
        threats24h,
        pinLockedCount: pinLockedUsers,
      },
      health,
      ipGeo,
      adminIps,
    };

    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return serverError("admin/security", err);
  }
}
