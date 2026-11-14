// GET & POST /api/admin/backup — Sauvegarde & Continuité d'activité (Backups)
//
// Réservé exclusivement aux sessions administrateur signées (HMAC-SHA256).
// Permet :
// 1. GET ?info=1        → État de la base SQLite (taille, dernière écriture, liste des snapshots serveur)
// 2. GET ?format=db     → Téléchargement direct du fichier SQLite (.db) sur l'appareil de la fondatrice
// 3. GET ?format=json   → Export JSON intégral multi-tables (portable et lisible)
// 4. POST               → Crée un point de restauration instantané sur le disque serveur (db/backups/)

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { serverError } from "@/lib/kene/server";
import { sessionFromRequest, sanitizeUser } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";
import { getServerStorageSnapshot, resolveBackupDir, resolveDbPath } from "@/lib/kene/server-storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:backup"), ADMIN_STATS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Trop de requêtes — patiente quelques secondes");
  }

  try {
    const sess = sessionFromRequest(req);
    if (!sess || sess.role !== "admin") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const infoOnly = searchParams.get("info") === "1";
    const format = searchParams.get("format") || "db";
    const dbPath = resolveDbPath();

    if (infoOnly) {
      let sizeBytes = 0;
      let updatedAt = new Date().toISOString();
      if (fs.existsSync(/*turbopackIgnore: true*/ dbPath)) {
        const stat = fs.statSync(/*turbopackIgnore: true*/ dbPath);
        sizeBytes = stat.size;
        updatedAt = stat.mtime.toISOString();
      }

      const backupDir = resolveBackupDir(true);
      let snapshots: Array<{ name: string; sizeBytes: number; createdAt: string }> = [];
      if (fs.existsSync(/*turbopackIgnore: true*/ backupDir)) {
        const files = fs.readdirSync(/*turbopackIgnore: true*/ backupDir).filter((f) => f.endsWith(".db") || f.endsWith(".gz") || f.endsWith(".json"));
        snapshots = files
          .map((name) => {
            const st = fs.statSync(/*turbopackIgnore: true*/ path.join(backupDir, name));
            return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 15);
      }

      const storage = getServerStorageSnapshot();
      return NextResponse.json(
        {
          dbSizeBytes: sizeBytes,
          dbUpdatedAt: updatedAt,
          snapshots,
          autoBackupSchedule: "Quotidien · 03h00 UTC (Rétention 30 jours)",
          disk: storage.disk,
          folders: storage.folders,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    void audit({
      kind: "admin_access",
      ip: clientIp(req),
      detail: `backup_download:${format}`,
    });
    try {
      const statusFile = path.join(resolveBackupDir(true), ".offsite-status.json");
      fs.writeFileSync(
        /*turbopackIgnore: true*/ statusFile,
        JSON.stringify({
          ok: true,
          at: new Date().toISOString(),
          target: `Téléchargement Console Admin (${format.toUpperCase()})`,
          detail: "Copie hors serveur téléchargée sur l'appareil administrateur",
        }),
      );
    } catch {
      /* ignore */
    }

    if (format === "json") {
      const [users, tenants, products, services, orders, appointments, sales, diagnoses] = await Promise.all([
        db.user.findMany(),
        db.tenant.findMany(),
        db.product.findMany(),
        db.service.findMany(),
        db.order.findMany({ include: { items: true } }),
        db.appointment.findMany(),
        db.sale.findMany({ include: { items: true } }),
        db.diagnosis.findMany({
          select: {
            id: true,
            userId: true,
            zone: true,
            scoreGlobal: true,
            createdAt: true,
          },
        }),
      ]);

      const safeUsers = users.map((u) => sanitizeUser(u));
      const dump = {
        exportedAt: new Date().toISOString(),
        platform: "Kènè — Dermo TIC",
        counts: {
          users: safeUsers.length,
          tenants: tenants.length,
          products: products.length,
          services: services.length,
          orders: orders.length,
          appointments: appointments.length,
          sales: sales.length,
          diagnoses: diagnoses.length,
        },
        data: { users: safeUsers, tenants, products, services, orders, appointments, sales, diagnoses },
      };

      const body = JSON.stringify(dump, null, 2);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="kene-backup-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // Format par défaut : base SQLite binaire (.db)
    if (!fs.existsSync(/*turbopackIgnore: true*/ dbPath)) {
      return NextResponse.json({ error: "Fichier de base de données introuvable" }, { status: 404 });
    }

    // Force un checkpoint WAL avant lecture pour garantir que toutes les transactions récentes sont dans le fichier
    await db.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").catch(() => null);

    const buffer = fs.readFileSync(/*turbopackIgnore: true*/ dbPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="kene-backup-${stamp}.db"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return serverError("admin/backup", err);
  }
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(rlKey(req, "admin:backup:create"), ADMIN_STATS);
  if (!rl.ok) {
    return rateLimitResponse(rl.retryAfterSec, "Patiente quelques secondes avant une nouvelle sauvegarde");
  }

  try {
    const sess = sessionFromRequest(req);
    if (!sess || sess.role !== "admin") {
      return NextResponse.json({ error: "Accès réservé à l'administrateur" }, { status: 403 });
    }

    const dbPath = resolveDbPath();
    if (!fs.existsSync(/*turbopackIgnore: true*/ dbPath)) {
      return NextResponse.json({ error: "Base de données introuvable" }, { status: 404 });
    }

    await db.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").catch(() => null);

    const backupDir = resolveBackupDir(true);
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `kene-snapshot-${ts}.db`;
    const targetPath = path.join(backupDir, fileName);

    fs.copyFileSync(/*turbopackIgnore: true*/ dbPath, /*turbopackIgnore: true*/ targetPath);

    // Rotation automatique : garder les 30 snapshots les plus récents
    const allFiles = fs
      .readdirSync(/*turbopackIgnore: true*/ backupDir)
      .filter((f) => f.startsWith("kene-snapshot-") && f.endsWith(".db"))
      .map((name) => ({
        name,
        fullPath: path.join(backupDir, name),
        mtime: fs.statSync(/*turbopackIgnore: true*/ path.join(backupDir, name)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of allFiles.slice(30)) {
      try {
        fs.unlinkSync(/*turbopackIgnore: true*/ old.fullPath);
      } catch {
        // ignore
      }
    }

    const stat = fs.statSync(/*turbopackIgnore: true*/ targetPath);
    void audit({
      kind: "admin_access",
      ip: clientIp(req),
      detail: `snapshot_created:${fileName}`,
    });

    return NextResponse.json({
      ok: true,
      snapshot: {
        name: fileName,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      },
    });
  } catch (err) {
    return serverError("admin/backup:post", err);
  }
}
