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
import { sessionFromRequest } from "@/lib/kene/session";
import { audit, clientIp } from "@/lib/kene/audit";
import { rateLimit, rlKey, rateLimitResponse, ADMIN_STATS } from "@/lib/kene/rate-limit";

export const runtime = "nodejs";

function resolveDbPath(): string {
  const candidates = [
    path.join(process.cwd(), "db", "custom.db"),
    path.join(process.cwd(), "prisma", "custom.db"),
    "/app/db/custom.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function resolveBackupDir(): string {
  const dir = path.join(path.dirname(resolveDbPath()), "backups");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // ignore if read-only
    }
  }
  return dir;
}

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
      if (fs.existsSync(dbPath)) {
        const stat = fs.statSync(dbPath);
        sizeBytes = stat.size;
        updatedAt = stat.mtime.toISOString();
      }

      const backupDir = resolveBackupDir();
      let snapshots: Array<{ name: string; sizeBytes: number; createdAt: string }> = [];
      if (fs.existsSync(backupDir)) {
        const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".db") || f.endsWith(".gz") || f.endsWith(".json"));
        snapshots = files
          .map((name) => {
            const st = fs.statSync(path.join(backupDir, name));
            return { name, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 15);
      }

      return NextResponse.json(
        {
          dbSizeBytes: sizeBytes,
          dbUpdatedAt: updatedAt,
          snapshots,
          autoBackupSchedule: "Quotidien · 03h00 UTC (Rétention 30 jours)",
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

      const dump = {
        exportedAt: new Date().toISOString(),
        platform: "Kènè — Dermo TIC",
        counts: {
          users: users.length,
          tenants: tenants.length,
          products: products.length,
          services: services.length,
          orders: orders.length,
          appointments: appointments.length,
          sales: sales.length,
          diagnoses: diagnoses.length,
        },
        data: { users, tenants, products, services, orders, appointments, sales, diagnoses },
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
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Fichier de base de données introuvable" }, { status: 404 });
    }

    // Force un checkpoint WAL avant lecture pour garantir que toutes les transactions récentes sont dans le fichier
    await db.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").catch(() => null);

    const buffer = fs.readFileSync(dbPath);
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
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json({ error: "Base de données introuvable" }, { status: 404 });
    }

    await db.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").catch(() => null);

    const backupDir = resolveBackupDir();
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const fileName = `kene-snapshot-${ts}.db`;
    const targetPath = path.join(backupDir, fileName);

    fs.copyFileSync(dbPath, targetPath);

    // Rotation automatique : garder les 30 snapshots les plus récents
    const allFiles = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("kene-snapshot-") && f.endsWith(".db"))
      .map((name) => ({
        name,
        fullPath: path.join(backupDir, name),
        mtime: fs.statSync(path.join(backupDir, name)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime);

    for (const old of allFiles.slice(30)) {
      try {
        fs.unlinkSync(old.fullPath);
      } catch {
        // ignore
      }
    }

    const stat = fs.statSync(targetPath);
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
