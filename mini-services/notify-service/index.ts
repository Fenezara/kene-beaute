// Kènè — notify-service (mini-service temps réel, port 3004)
// Relais socket.io entre l'app Next.js (port 3000) et les clientes :
//  • une cliente connectée rejoint sa room `user:{userId}` (event `join`)
//  • le service interroge périodiquement GET /api/notifications?userId=…
//    (l'API reste l'unique source de vérité : backfill + due-runner idempotents)
//  • à chaque changement du fil (arrivée, rappel parti, lecture…)
//    il émet `feed` vers la room — la cloche cliente se met à jour SANS reload
//  • event `push` {secret, userId} : poll immédiat — émis par l'app Next.js
//    (socket serveur) après chaque notify() → arrivée instantanée
//  • event `read-all` : même effet, déclenché par la cliente après « tout marquer
//    lu » (évite qu'un poll périmé fasse revenir le badge)
// Santé : curl 'http://localhost:3004/socket.io/?EIO=4&transport=polling'
import { createServer } from "http";
import { Server, type Socket } from "socket.io";

const PORT = 3004; // ne pas changer : les clientes passent par ?XTransformPort=3004
const APP = process.env.APP_URL ?? "http://localhost:3000";
const POLL_MS = 8_000; // filet de sécurité : le due-runner y passe aussi
const PUSH_SECRET = process.env.PUSH_SECRET ?? "kene-push-secret";

const httpServer = createServer();
// L'app Next.js (socket serveur) se connecte DIRECTEMENT à localhost:3004 :
// socket.io ne doit répondre qu'aux événements, pas de routes HTTP ici.

// DO NOT change the path, it is used by Caddy to forward the request to the correct port
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60_000,
  pingInterval: 25_000,
});

/* ── État interne ────────────────────────────────────────────────
 * connected : userId → sockets clientes (room par utilisatrice, multi-onglets)
 * appSockets : sockets « app » (serveur Next.js, droit de push)
 * cache     : userId → dernière sérialisation du fil émise (diff → emit)
 * polling   : single-flight — jamais deux GET imbriqués pour une utilisatrice
 * due       : timer d'un poll forcé imminent (debounce 250 ms)
 *────────────────────────────────────────────────────────────────*/
const connected = new Map<string, Set<Socket>>();
const appSockets = new Set<Socket>();
const cache = new Map<string, string>();
const polling = new Set<string>();
const due = new Map<string, ReturnType<typeof setTimeout>>();
let seq = 0; // compteur pour les logs

function log(msg: string, userId?: string) {
  const tag = userId ? ` [${userId.slice(-6)}]` : "";
  console.log(`${new Date().toISOString().slice(11, 19)} #${++seq}${tag} ${msg}`);
}

/* ── Poll : GET API → diff → emit vers la room si changement ──── */
async function poll(userId: string, reason: string) {
  if (!connected.has(userId)) return; // déconnectée entre-temps
  if (polling.has(userId)) return; // single-flight
  polling.add(userId);
  try {
    const res = await fetch(`${APP}/api/notifications?userId=${encodeURIComponent(userId)}`, {
      signal: AbortSignal.timeout(6_000),
      headers: { "user-agent": "kene-notify-service/1.0" },
    });
    if (!res.ok) {
      log(`poll ${reason} → HTTP ${res.status} (silence, cache conservé)`, userId);
      return;
    }
    const payload = await res.json();
    const serialized = JSON.stringify(payload);
    if (cache.get(userId) === serialized) return; // rien de neuf
    cache.set(userId, serialized);
    io.to(`user:${userId}`).emit("feed", payload);
    const u = (payload as { unread?: number })?.unread ?? 0;
    const s = (payload as { scheduled?: unknown[] })?.scheduled?.length ?? 0;
    log(`feed émis (${reason}) — unread ${u} · ${s} à venir`, userId);
  } catch (e) {
    log(`poll ${reason} → échec réseau (${e instanceof Error ? e.message : "?"}) — silencieux`, userId);
  } finally {
    polling.delete(userId);
  }
}

/* Un événement (push / read-all / join) programme un poll frais sous 250 ms,
 * debouncé : plusieurs événements rapprochés → un seul GET API. */
function schedulePoll(userId: string, reason: string) {
  const prev = due.get(userId);
  if (prev) clearTimeout(prev);
  due.set(
    userId,
    setTimeout(() => {
      due.delete(userId);
      void poll(userId, reason);
    }, 250)
  );
}

/* ── Boucle périodique (due-runner : S+3, J-1, backfill…) ─────── */
setInterval(() => {
  for (const userId of connected.keys()) void poll(userId, "tick");
}, POLL_MS);

/* ── Connexions ───────────────────────────────────────────────── */
io.on("connection", (socket) => {
  let joined: string | null = null; // cliente (room) | null (socket app)

  socket.on("join", (data: { userId?: string }) => {
    const userId = typeof data?.userId === "string" ? data.userId.trim() : "";
    if (!userId || userId.length > 64) return;
    joined = userId;
    socket.join(`user:${userId}`);
    const set = connected.get(userId) ?? new Set<Socket>();
    set.add(socket);
    connected.set(userId, set);
    cache.delete(userId); // première synchro immédiate (badge dès la connexion)
    schedulePoll(userId, "join");
    log(`connexion cliente (${set.size} onglet(s))`, userId);
  });

  // Canal d'arrivée instantanée — réservé à l'app Next.js (secret partagé).
  socket.on("push", (data: { secret?: string; userId?: string }) => {
    if (data?.secret !== PUSH_SECRET) return; // silencieux : pas un socket app
    const userId = typeof data.userId === "string" ? data.userId.trim() : "";
    if (!userId || userId.length > 64) return;
    if (!connected.has(userId)) return; // pas en ligne : le fil sera lu au join
    cache.delete(userId);
    schedulePoll(userId, "push");
    log(`push reçu → poll immédiat`, userId);
  });

  socket.on("register-app", (data: { secret?: string }) => {
    if (data?.secret !== PUSH_SECRET) return;
    appSockets.add(socket);
    log("socket app enregistrée (push instantané armé)");
  });

  socket.on("read-all", (data: { userId?: string }) => {
    if (!joined || data?.userId !== joined) return;
    cache.delete(joined); // force un GET frais : jamais de badge périmé
    schedulePoll(joined, "read-all");
  });

  socket.on("disconnect", () => {
    appSockets.delete(socket);
    if (!joined) return;
    const set = connected.get(joined);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      connected.delete(joined);
      cache.delete(joined);
      const t = due.get(joined);
      if (t) clearTimeout(t);
      due.delete(joined);
      log("déconnexion cliente (plus aucun onglet)", joined);
    } else {
      log(`onglet fermé (${set.size} restant(s))`, joined);
    }
  });

  socket.on("error", (err: unknown) => {
    log(`erreur socket : ${err instanceof Error ? err.message : "?"}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Kènè notify-service en écoute sur :${PORT} (app ${APP}, poll ${POLL_MS} ms)`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM — arrêt");
  io.close();
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("SIGINT — arrêt");
  io.close();
  httpServer.close(() => process.exit(0));
});
