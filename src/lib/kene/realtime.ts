// Kènè — push temps réel côté SERVEUR (routes API uniquement, node runtime).
// Après chaque notify, l'app prévient le mini-service notify-service
// (socket.io, port 3004) qui déclenche un poll immédiat du fil de la cliente
// → sa cloche se met à jour en ~250 ms, sans reload.
//
// Connexion DIRECTE localhost (server-to-server, jamais depuis le navigateur —
// les clientes passent par la gateway (query XTransformPort=3004), cf. NotificationCenter).
// Best-effort: si le service est down, on saute silencieusement — le poll
// périodique du service reste le filet de sécurité (8 s).
//
// globalThis: le socket survit aux hot-reload du dev server Next.js
// (sinon chaque recompilation ouvrirait une connexion de plus).
import { io, type Socket } from "socket.io-client";
import { armHeartbeat } from "./live-socket";

const NOTIFY_URL = process.env.NOTIFY_SERVICE_URL ?? "http://localhost:3004";
const PUSH_SECRET = process.env.PUSH_SECRET ?? "kene-push-secret";

type G = typeof globalThis & { __kenePushSocket?: Socket };
const g = globalThis as G;

/** À n'appeler qu'une fois par process (idempotent) — lazy, jamais bloquant. */
function ensurePushSocket(): Socket | null {
  if (g.__kenePushSocket) return g.__kenePushSocket;
  try {
    const socket = io(NOTIFY_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
      timeout: 4_000,
    });
    socket.on("connect", () => {
      socket.emit("register-app", { secret: PUSH_SECRET });
    });
    // Auto-guérison: si le service redémarre à chaud, le TCP survit mais la
    // session socket.io devient orpheline (push perdus en silence). Le
    // heartbeat détecte le zombie ≤ 35 s et reconnecte → register-app rejoué.
    armHeartbeat(socket);
    g.__kenePushSocket = socket;
    return socket;
  } catch {
    return null; // service injoignable: push désactivé, poll 8 s en filet
  }
}

/**
 * Prévient le service temps réel qu'une notification vient d'être créée pour
 * cette utilisatrice. Fire-and-forget: n'échoue JAMAIS, ne ralentit JAMAIS
 * la route appelante (si le service est absent, le poll 8 s rattrape tout).
 * L'emit est bufferisé par socket.io-client si la connexion est en cours
 * (démarrage à froid) puis envoyé dès qu'elle s'établit.
 */
export function pushFeed(userId?: string | null): void {
  if (!userId) return;
  const socket = ensurePushSocket();
  if (!socket) return;
  socket.emit("push", { secret: PUSH_SECRET, userId });
}

/**
 * Même canal, côté institut: après un événement tenant (RDV réservé, vente
 * POS, commande contenant un produit de l'institut…), l'espace Pro connecté
 * à ce tenant reçoit un `tenant-feed` frais en ~250 ms — badge, toasts et
 * KPIs du dashboard sans reload.
 */
export function pushTenantFeed(tenantId?: string | null): void {
  if (!tenantId) return;
  const socket = ensurePushSocket();
  if (!socket) return;
  socket.emit("push", { secret: PUSH_SECRET, tenantId });
}
