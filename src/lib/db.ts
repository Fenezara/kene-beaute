import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  walConfigured: boolean | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Trace des requêtes utile en dev — silence en production
    log: process.env.NODE_ENV === 'production' ? [] : ['query'],
  })

// Optimisation Concurrence SQLite (WAL mode, cache RAM et timeouts anti-blocage)
// Transparent si migration future vers PostgreSQL
if (!globalForPrisma.walConfigured) {
  globalForPrisma.walConfigured = true;
  void (async () => {
    try {
      const url = process.env.DATABASE_URL || '';
      if (!url.startsWith('postgres') && !url.startsWith('postgresql')) {
        await db.$executeRawUnsafe('PRAGMA journal_mode = WAL;');
        await db.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');
        await db.$executeRawUnsafe('PRAGMA busy_timeout = 5000;');
        await db.$executeRawUnsafe('PRAGMA cache_size = -64000;'); // 64 Mo de cache en mémoire
      }
    } catch {
      // Tolérance si initialisation concurrente
    }
  })();
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db