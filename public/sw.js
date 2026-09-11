/* Kènè — service worker (JS pur, pas de bundler).
 * Stratégies :
 *  - Precache : "/" + icônes PWA (coquille offline minimale).
 *  - API données (diagnoses/shop/institutes/profile/notifications) : network-first,
 *    clone JSON en cache runtime → hors-ligne on re-sert le corps avec x-kene-offline: 1.
 *  - Images statiques (/hero/ /products/ /instituts/ /skin/ + content-type image/*) :
 *    cache-first, fallback réseau.
 *  - Navigations : network-first, fallback "/" précaché.
 *  - Chunks /_next/ : stale-while-revalidate (app complète hors-ligne, rafraîchie en fond).
 *  - Tout le reste (POST, /api/auth /api/payments /api/dermato…, cross-origin) :
 *    réseau direct, JAMAIS de cache (les écritures et secrets ne se mettent pas en cache).
 */

const VERSION = "kene-sw-v5";
const PRECACHE = "kene-precache-v5";
const DATA_CACHE = "kene-data-v5";
const IMG_CACHE = "kene-img-v5";
const STATIC_CACHE = "kene-static-v5"; // chunks /_next/ (SWR t. 61)
/** Caches autorisés pour la version courante — les autres sont purgés à l'activation. */
const KEEP_CACHES = [PRECACHE, DATA_CACHE, IMG_CACHE, STATIC_CACHE, "kene-sw-debug"];

const PRECACHE_URLS = [
  "/",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/** API de lecture : network-first + réplication offline. T. 61 : appointments
 * et wallet ajoutés — HomeScreen les charge avec diagnoses (sans .catch) : un
 * seul 502 hors-ligne faisait tomber toute la carte score de l'accueil. */
const DATA_API_PREFIXES = [
  "/api/diagnoses",
  "/api/shop",
  "/api/institutes",
  "/api/profile",
  "/api/notifications",
  "/api/appointments",
  "/api/wallet",
  "/api/coupons",
];

/** Dossiers d'images statiques (cache-first). */
const IMG_URL_PREFIXES = ["/hero/", "/products/", "/instituts/", "/skin/"];

/* ───────────────────────── Install / activate ───────────────────────── */

self.addEventListener("install", (event) => {
  // Pas de skipWaiting ici : la bascule vers la nouvelle version reste
  // contrôlée par le message "SKIP_WAITING" (toast côté UI).
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      const results = await Promise.all(
        PRECACHE_URLS.map((url) =>
          precacheClean(cache, url)
            .then(() => "ok")
            .catch((err) => "ÉCHEC " + url + " : " + (err?.message ?? err))
        )
      );
      // T. 61 — diagnostic : résultat du precache stocké DANS le cache
      // (lisible depuis la page via caches.open) + postMessage aux clients.
      try {
        const dbg = await caches.open("kene-sw-debug");
        await dbg.put("/kene-sw-debug", new Response(JSON.stringify({ version: VERSION, precache: results })));
      } catch { /* diagnostic best-effort */ }
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const c of clients) c.postMessage({ keneSwDebug: VERSION, precache: results });
      } catch { /* pas de client — silencieux */ }
    })()
  );
});

/** Met en cache une réponse avec en-têtes ASSAINIS.
 * Le HTML de Next dev porte « Vary: RSC, next-router-state-tree… » : une
 * navigation simple n'envoie pas ces en-têtes → cache.match échouerait et la
 * coquille offline ne serait jamais servie. On retire aussi content-encoding /
 * transfer-encoding : le corps lu via text()/arrayBuffer() est DÉJÀ décompressé,
 * le renvoyer avec « gzip » produirait une page corrompue. */
async function precacheClean(cache, url) {
  const res = await fetch(new Request(url, { cache: "reload" }));
  if (!res || !res.ok) throw new Error("HTTP " + res.status);
  const clean = await sanitizeForCache(res); // T. 61 : AWAIT — sinon put() reçoit une Promesse
  return cache.put(url, clean);
}

/** Clone une réponse en nettoyant les en-têtes incompatibles avec un re-service. */
async function sanitizeForCache(res) {
  const body = await res.clone().arrayBuffer();
  const headers = new Headers(res.headers);
  for (const h of ["vary", "content-encoding", "content-length", "transfer-encoding"]) {
    headers.delete(h);
  }
  headers.set("cache-control", "no-cache");
  return new Response(body, { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((name) => !KEEP_CACHES.includes(name)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/* ───────────────────────── Web Push (t. 60-e) ─────────────────────────
 * Notifications reçues MÊME application fermée : le push service du
 * navigateur réveille ce worker avec un event "push" (payload VAPID de
 * /api/push/dispatch : { title, body, url }). Fallbacks sûrs si data
 * absent/illisible. Le clic ouvre (ou focus) l'app sur l'URL du payload. */

self.addEventListener("push", (event) => {
  let title = "Kènè";
  let body = "Tu as une nouvelle notification";
  let url = "/";
  try {
    if (event.data) {
      const data = event.data.json();
      if (typeof data?.title === "string" && data.title) title = data.title;
      if (typeof data?.body === "string" && data.body) body = data.body;
      if (typeof data?.url === "string" && data.url) url = data.url;
    }
  } catch {
    /* payload non JSON → fallbacks par défaut */
  }
  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: "kene-push", // remplace la précédente au lieu d'empiler
          data: { url },
        });
      } catch {
        /* showNotification indisponible → rien à faire, le push est acquitté */
      }
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  const url = event.notification?.data?.url || "/";
  event.notification.close();
  event.waitUntil(
    (async () => {
      try {
        const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of clientList) {
          if ("focus" in client) {
            await client.focus();
            return; // app déjà ouverte → on la ramène au premier plan
          }
        }
        await self.clients.openWindow(url); // app fermée → on l'ouvre
      } catch {
        /* openWindow refusé (pas d'interaction utilisateur récente…) → silencieux */
      }
    })()
  );
});

/* ───────────────────────── Fetch ───────────────────────── */

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // POST/PATCH/PUT/DELETE → réseau direct (jamais de cache sur les écritures).
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cross-origin (socket.io, fonts Google…) → hors de notre périmètre.
  if (url.origin !== self.location.origin) return;

  // Assets Next (/_next/) : stale-while-revalidate — servent le cache hors-ligne
  // (app complète offline), se rafraîchissent en arrière-plan quand le réseau
  // revient. Sûr : les chunks Turbopack portent des URL à hash (nouveau build →
  // nouvelle URL → cache miss → réseau frais). Le HMR websocket n'est pas du GET
  // fetch et reste hors de ce périmètre.
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // (a) API données → network-first + cache runtime JSON.
  if (DATA_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(networkFirstData(req));
    return;
  }

  // Autres /api/ (auth, payments, dermato/chat, tts…) → réseau direct, JAMAIS de cache.
  if (url.pathname.startsWith("/api/")) return;

  // (c) Navigations → network-first, fallback coquille "/" précachée.
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  // (b) Images → cache-first.
  if (isImageRequest(url, req)) {
    event.respondWith(cacheFirstImage(req));
    return;
  }

  // Tout le reste passe au réseau sans interception.
});

/* ───────────────────────── Stratégies ───────────────────────── */

/** API données : réseau d'abord ; offline/5xx (gateway 502) → cache runtime
 * avec header x-kene-offline. NB : quand l'app :3000 est down, le gateway :81
 * répond 502 — une vraie réponse HTTP, pas un rejet réseau → il faut traiter
 * !res.ok comme un échec et retomber sur le cache. */
async function networkFirstData(req) {
  let networkRes = null;
  try {
    networkRes = await fetch(req);
    if (networkRes && networkRes.ok) {
      try {
        const cache = await caches.open(DATA_CACHE);
        // En-têtes assainis : Vary RSC (Next) casserait le match hors-ligne et
        // content-encoding gzip corromprait le re-service (corps déjà décodé).
        await cache.put(req, await sanitizeForCache(networkRes));
      } catch {
        /* quota dépassé ou corps illisible → on sert quand même le réseau */
      }
      return networkRes;
    }
  } catch {
    /* réseau injoignable → on tente le cache ci-dessous */
  }
  // Échec réseau OU réponse 4xx/5xx → cache runtime si disponible.
  const cached = await caches.match(req, { cacheName: DATA_CACHE });
  if (cached) {
    const body = await cached.text();
    const headers = new Headers(cached.headers);
    if (!headers.get("content-type")) {
      headers.set("content-type", "application/json");
    }
    for (const h of ["vary", "content-encoding", "content-length", "transfer-encoding"]) {
      headers.delete(h);
    }
    headers.set("x-kene-offline", "1");
    return new Response(body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }
  // Pas de cache : on renvoie la réponse réseau telle quelle (erreur métier
  // réelle — 404, 403… — ou 502 assumé, l'UI affiche son état réseau).
  if (networkRes) return networkRes;
  throw new Error("Kènè hors-ligne : données jamais consultées en ligne");
}

/** Navigations : réseau d'abord ; offline/5xx → coquille "/" précachée.
 * Le gateway répond 502 (réponse valide !) quand l'app est down → sans ce
 * garde, le navigateur afficherait la page d'erreur Caddy au lieu de l'app. */
async function networkFirstNavigation(req) {
  let networkRes = null;
  try {
    networkRes = await fetch(req);
    // 200 → page normale. 404 → page brandée t. 86 (« égarée dans le
    // tissage ») : on la MONTRE au lieu de la masquer derrière la coquille.
    // Autres statuts (5xx, 502 gateway) → coquille précachée.
    if (networkRes && (networkRes.ok || networkRes.status === 404)) return networkRes;
  } catch {
    /* réseau injoignable → coquille ci-dessous */
  }
  const shell = await caches.match("/", { cacheName: PRECACHE });
  if (shell) return shell;
  if (networkRes) return networkRes;
  throw new Error("Kènè hors-ligne : coquille indisponible");
}

/** Chunks statiques : cache d'abord + rafraîchissement arrière-plan (SWR).
 * Hors-ligne : l'app complète (HTML précaché + chunks) démarre sans réseau.
 * 5xx (gateway 502) : on sert le cache plutôt qu'une page cassée. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) {
        void cache
          .put(req, res.clone())
          .then(() => {})
          .catch(() => {
            /* quota → chunk non mis à jour en cache, on sert quand même */
          });
      }
      return res;
    })
    .catch(() => null);
  if (cached) {
    // On n'attend pas le réseau : réponse immédiate depuis le cache ;
    // la mise à jour arrière-plan continue en parallèle.
    void network;
    return cached;
  }
  const res = await network;
  if (res && (res.ok || !cached)) return res;
  throw new Error("Kènè hors-ligne : ressource statique jamais visitée");
}

/** Images : cache d'abord ; miss → réseau (et mise en cache si image). */
async function cacheFirstImage(req) {
  const cached = await caches.match(req, { cacheName: IMG_CACHE });
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok && isImageResponse(res)) {
    try {
      const cache = await caches.open(IMG_CACHE);
      await cache.put(req, res.clone());
    } catch {
      /* quota → image non mise en cache, on sert quand même */
    }
  }
  return res;
}

/* ───────────────────────── Helpers ───────────────────────── */

function isImageRequest(url, req) {
  if (IMG_URL_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  if (req.destination === "image") return true;
  return /\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(url.pathname);
}

function isImageResponse(res) {
  const type = res.headers.get("content-type") || "";
  return type.startsWith("image/");
}
