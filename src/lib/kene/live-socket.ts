// Kènè — heartbeat des sockets live (cliente, pro, app serveur).
// Problème visé (rencontré en): quand le notify-service redémarre à
// chaud (bun --hot), le TCP reste établi mais la session socket.io est
// orpheline côté serveur — le client CROIT être connecté, le nouveau service
// ne le connaît pas: plus aucun push reçu, silencieusement.
// Solution: sonde toutes les 30 s (event `hb`); sans ack sous 5 s, on ferme
// et reconnecte — les handlers « connect » rejouent join / join-tenant /
// register-app, tout repart proprement.
import type { Socket } from "socket.io-client";

const HB_MS = 30_000;
const HB_TIMEOUT = 5_000;

/**
 * Arme le heartbeat sur une socket socket.io-client. Retourne un désarmeur
 * (à appeler dans le cleanup d'un useEffect, ou jamais pour une socket qui
 * vit toute la durée du process).
 */
export function armHeartbeat(socket: Socket): () => void {
  let waiting = false;
  const timer = setInterval(() => {
    if (!socket.connected || waiting) return;
    waiting = true;
    const onAck = () => {
      clearTimeout(watchdog);
      waiting = false;
    };
    socket.once("hb-ack", onAck);
    const watchdog = setTimeout(() => {
      socket.off("hb-ack", onAck);
      waiting = false;
      // Zombie confirmé: reset dur → reconnexion → join rejoués au connect
      socket.disconnect();
      socket.connect();
    }, HB_TIMEOUT);
    socket.emit("hb");
  }, HB_MS);
  return () => {
    clearInterval(timer);
    socket.off("hb-ack");
  };
}
