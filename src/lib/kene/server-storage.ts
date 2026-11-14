// Kènè — Télémétrie stockage disque, RAM serveur et empreinte des dossiers.
// Utilisé conjointement par /api/admin/security et /api/admin/backup pour éviter toute duplication.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DiskUsageInfo {
  totalBytes: number;
  usedBytes: number;
  freeBytes: number;
  usedPct: number;
  mountLabel: string;
  status: "ok" | "warn" | "critical";
}

export interface HostRamInfo {
  totalMb: number;
  usedMb: number;
  freeMb: number;
  usedPct: number;
}

export interface StorageFoldersInfo {
  dbBytes: number;
  backupsBytes: number;
  uploadsBytes: number;
  backupsCount: number;
}

export interface ServerStorageSnapshot {
  disk: DiskUsageInfo | null;
  hostRam: HostRamInfo;
  folders: StorageFoldersInfo;
}

const BACKUP_EXTS = new Set([".db", ".gz", ".json"]);

/** Localise la base SQLite active (Docker /app/db ou dev local). */
export function resolveDbPath(): string {
  const candidates = [
    path.join(process.cwd(), "db", "custom.db"),
    path.join(process.cwd(), "prisma", "custom.db"),
    "/app/db/custom.db",
  ];
  for (const p of candidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ p)) return p;
  }
  return candidates[0];
}

/** Localise le dossier de snapshots serveur (db/backups). */
export function resolveBackupDir(createIfMissing = false): string {
  const dir = path.join(path.dirname(resolveDbPath()), "backups");
  if (createIfMissing && !fs.existsSync(/*turbopackIgnore: true*/ dir)) {
    try {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    } catch {
      // ignorer si lecture seule
    }
  }
  return dir;
}

function resolveUploadsDir(): string {
  const dockerUploads = "/app/public/uploads";
  if (fs.existsSync(/*turbopackIgnore: true*/ dockerUploads)) return dockerUploads;
  return path.join(process.cwd(), "public", "uploads");
}

function scanDirStats(
  dirPath: string,
  opts: { excludeSubdir?: string; countExts?: Set<string>; maxDepth?: number } = {},
  depth = 0
): { bytes: number; count: number } {
  const maxDepth = opts.maxDepth ?? 3;
  if (depth > maxDepth || !fs.existsSync(/*turbopackIgnore: true*/ dirPath)) {
    return { bytes: 0, count: 0 };
  }
  let bytes = 0;
  let count = 0;
  try {
    const entries = fs.readdirSync(/*turbopackIgnore: true*/ dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (depth === 0 && opts.excludeSubdir && entry.name === opts.excludeSubdir) continue;
        const sub = scanDirStats(full, opts, depth + 1);
        bytes += sub.bytes;
        count += sub.count;
      } else if (entry.isFile()) {
        try {
          const st = fs.statSync(/*turbopackIgnore: true*/ full);
          bytes += st.size;
          if (!opts.countExts || opts.countExts.has(path.extname(entry.name).toLowerCase())) {
            count += 1;
          }
        } catch {
          // fichier transitoire supprimé en cours de lecture
        }
      }
    }
  } catch {
    return { bytes: 0, count: 0 };
  }
  return { bytes, count };
}

function readDiskUsage(probeDirs: string[]): DiskUsageInfo | null {
  if (typeof fs.statfsSync !== "function") return null;
  for (const dir of probeDirs) {
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) continue;
    try {
      const s = fs.statfsSync(/*turbopackIgnore: true*/ dir);
      const bsize = Number(s.bsize) || 4096;
      const blocks = Number(s.blocks) || 0;
      const bfree = Number(s.bfree) || 0;
      const bavail = Number(s.bavail) || 0;
      if (blocks <= 0) continue;

      const totalBytes = blocks * bsize;
      const freeBytes = bavail * bsize;
      const usedBytes = Math.max(0, (blocks - bfree) * bsize);
      // Aligné sur GNU df : dénominateur = utilisé + disponible (exclut les ~5 % réservés root ext4)
      const effectiveTotal = usedBytes + freeBytes;
      const usedPct = effectiveTotal > 0 ? Math.min(100, Math.round((usedBytes / effectiveTotal) * 100)) : 0;
      const status: DiskUsageInfo["status"] =
        usedPct >= 85 ? "critical" : usedPct >= 75 ? "warn" : "ok";
      const mountLabel = dir.startsWith("/app") ? "/app/db" : path.parse(path.resolve(dir)).root || dir;

      return { totalBytes, usedBytes, freeBytes, usedPct, mountLabel, status };
    } catch {
      // essayer le chemin suivant
    }
  }
  return null;
}

function readHostRam(): HostRamInfo {
  // Sur Linux (VPS Docker), /proc/meminfo fournit MemAvailable (bien plus fiable que os.freemem)
  if (process.platform === "linux") {
    try {
      const raw = fs.readFileSync(/*turbopackIgnore: true*/ "/proc/meminfo", "utf8");
      const totalMatch = raw.match(/^MemTotal:\s+(\d+)\s+kB$/m);
      const availMatch = raw.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
      if (totalMatch && availMatch) {
        let totalMb = Math.round(Number(totalMatch[1]) / 1024);
        let freeMb = Math.round(Number(availMatch[1]) / 1024);

        // Respecter une éventuelle limite cgroup v2 si le conteneur est plafonné
        try {
          const maxRaw = fs.readFileSync(/*turbopackIgnore: true*/ "/sys/fs/cgroup/memory.max", "utf8").trim();
          const curRaw = fs.readFileSync(/*turbopackIgnore: true*/ "/sys/fs/cgroup/memory.current", "utf8").trim();
          const maxBytes = Number(maxRaw);
          const curBytes = Number(curRaw);
          if (Number.isFinite(maxBytes) && maxBytes > 0 && Number.isFinite(curBytes)) {
            const cgroupTotalMb = Math.round(maxBytes / (1024 * 1024));
            if (cgroupTotalMb > 0 && cgroupTotalMb < totalMb) {
              totalMb = cgroupTotalMb;
              freeMb = Math.max(0, totalMb - Math.round(curBytes / (1024 * 1024)));
            }
          }
        } catch {
          // pas de limite cgroup v2 lisible
        }

        const usedMb = Math.max(0, totalMb - freeMb);
        const usedPct = totalMb > 0 ? Math.min(100, Math.round((usedMb / totalMb) * 100)) : 0;
        return { totalMb, usedMb, freeMb, usedPct };
      }
    } catch {
      // repli sur os.totalmem/os.freemem
    }
  }

  const totalMb = Math.round(os.totalmem() / (1024 * 1024));
  const freeMb = Math.round(os.freemem() / (1024 * 1024));
  const usedMb = Math.max(0, totalMb - freeMb);
  const usedPct = totalMb > 0 ? Math.min(100, Math.round((usedMb / totalMb) * 100)) : 0;
  return { totalMb, usedMb, freeMb, usedPct };
}

/** Mesure disque système, RAM serveur et empreinte réelle db / backups / uploads. */
export function getServerStorageSnapshot(): ServerStorageSnapshot {
  const dbDir = path.dirname(resolveDbPath());
  const backupDir = path.join(dbDir, "backups");
  const uploadsDir = resolveUploadsDir();

  const disk = readDiskUsage(["/app/db", dbDir, process.cwd()]);
  const hostRam = readHostRam();

  const dbStats = scanDirStats(dbDir, { excludeSubdir: "backups", maxDepth: 1 });
  const backupsStats = scanDirStats(backupDir, { countExts: BACKUP_EXTS, maxDepth: 1 });
  const uploadsStats = scanDirStats(uploadsDir, { maxDepth: 3 });

  return {
    disk,
    hostRam,
    folders: {
      dbBytes: dbStats.bytes,
      backupsBytes: backupsStats.bytes,
      uploadsBytes: uploadsStats.bytes,
      backupsCount: backupsStats.count,
    },
  };
}
