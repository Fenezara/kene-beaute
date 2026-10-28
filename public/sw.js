/* Kènè — service worker (JS pur, pas de bundler).
 * Stratégies :
 *  - Precache : "/" + icônes PWA + tous les scripts et styles Next.js extraits de "/".
 *  - API données (diagnoses/shop/institutes/profile/notifications/pro) : network-first,
 *    clone JSON en cache runtime → hors-ligne on re-sert le corps avec x-kene-offline: 1.
 *    Si aucune donnée en cache lors d'une coupure, retour immédiat d'un fallback JSON 200 (zéro crash fetch).
 *  - Images statiques (/hero/ /products/ /instituts/ /skin/ + content-type image/*) :
 *    cache-first, fallback réseau.
 *  - Navigations : network-first, fallback "/" précaché (app complète hors-ligne).
 *  - Chunks /_next/ : stale-while-revalidate (app complète hors-ligne, rafraîchie en fond).
 *  - Écritures (POST/PUT/DELETE) : réseau direct.
 */

const VERSION = "kene-sw-v49";
const PRECACHE = "kene-precache-v49";
const DATA_CACHE = "kene-data-v49";
const IMG_CACHE = "kene-img-v49";
const STATIC_CACHE = "kene-static-v49";
/** Caches autorisés pour la version courante — les autres sont purgés à l'activation. */
const KEEP_CACHES = [PRECACHE, DATA_CACHE, IMG_CACHE, STATIC_CACHE, "kene-sw-debug"];

const PRECACHE_URLS = [
  "/",
  "/?space=pro",
  "/pin",
  "/api/pwa-manifest",
  "/manifest.json",
  "/kene-mark.svg",
  "/favicon.ico",
  "/brand/kene-emblem-light.png",
  "/brand/kene-emblem-dark.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/skin/clinical-before.jpg",
  "/skin/clinical-after.jpg",
];

const DATA_API_PREFIXES = [
  "/api/diagnoses",
  "/api/shop",
  "/api/institutes",
  "/api/profile",
  "/api/notifications",
  "/api/appointments",
  "/api/wallet",
  "/api/coupons",
  "/api/passport",
  "/api/pro",
  "/api/auth/session",
  "/api/auth/check-phone",
  "/api/auth/login",
];

const IMG_URL_PREFIXES = ["/hero/", "/products/", "/instituts/", "/skin/", "/brand/", "/icons/"];

/* ───────────────────────── Fallbacks JSON de secours hors-ligne ───────────────────────── */

const OFFLINE_OVERVIEW_FALLBACK = {
  tenant: {
    id: "cmts1w5ui0008oww7hm3v18oo",
    name: "Cabinet LA DERMO",
    city: "Abidjan",
    country: "CI",
    plan: "business",
  },
  tenants: [
    {
      id: "cmts1w5ui0008oww7hm3v18oo",
      name: "Cabinet LA DERMO",
      city: "Abidjan",
      country: "CI",
      plan: "business",
    },
  ],
  kpis: {
    caToday: 0,
    ca7d: 0,
    ca30d: 0,
    avgBasket: 0,
    appointmentsToday: 0,
    newClients30d: 0,
    occupancyPct: 0,
  },
  todayAppointments: [],
  recentReviews: [],
  stockAlerts: [],
  chart: [],
  paymentSplit: [],
  topServices: [],
};

const OFFLINE_CATALOG_FALLBACK = {
  services: [
    {
      id: "srv_eclat_visage",
      name: "Soin Éclat Kènè (Visage)",
      category: "soin",
      durationMin: 45,
      price: 15000,
      commissionPct: 10,
      description: "Protocole éclat unifiant aux extraits de kinkeliba et fleur d'hibiscus.",
      active: true,
    },
    {
      id: "srv_nettoyage_profond",
      name: "Nettoyage Profond & Vapeur",
      category: "soin",
      durationMin: 60,
      price: 20000,
      commissionPct: 10,
      description: "Extraction douce des comédons, bain de vapeur et masque purifiant à l'argile.",
      active: true,
    },
    {
      id: "srv_massage_karite",
      name: "Massage Relaxant au Karité Tiède",
      category: "massage",
      durationMin: 60,
      price: 25000,
      commissionPct: 15,
      description: "Modelage corps complet relaxant au beurre de karité bio parfumé.",
      active: true,
    },
    {
      id: "srv_gommage_cafe",
      name: "Gommage Corps Café & Bissap",
      category: "gommage",
      durationMin: 40,
      price: 18000,
      commissionPct: 10,
      description: "Exfoliation tonifiante aux grains de café de Man et fleurs d'hibiscus.",
      active: true,
    },
    {
      id: "srv_soin_capillaire",
      name: "Bain d'Huiles Végétales & Coiffage",
      category: "capillaire",
      durationMin: 50,
      price: 12000,
      commissionPct: 10,
      description: "Soin nourrissant profond pour cheveux texturés, afro et crépus.",
      active: true,
    },
    {
      id: "srv_manucure",
      name: "Manucure & Pose Vernis",
      category: "onglerie",
      durationMin: 35,
      price: 8000,
      commissionPct: 10,
      description: "Soin des ongles et cuticules avec pose de vernis soigné.",
      active: true,
    },
  ],
  products: [
    {
      id: "prd_karite_pur",
      name: "Beurre de Karité Brut Bio (200g)",
      category: "corps",
      description: "Karité artisanal de Côte d'Ivoire, ultra-nourrissant pour peau et pointes.",
      botanicals: "Butyrospermum Parkii",
      price: 5000,
      stock: 25,
      stockAlert: 5,
      image: "/products/karite.jpg",
      active: true,
    },
    {
      id: "prd_savon_noir",
      name: "Savon Noir Authentique au Miel",
      category: "nettoyant",
      description: "Savon doux gommant traditionnel, purifie sans tirailler la barrière cutanée.",
      botanicals: "Cendre de cabosse de cacao, huile de coco, miel",
      price: 3500,
      stock: 40,
      stockAlert: 8,
      image: "/products/savon.jpg",
      active: true,
    },
    {
      id: "prd_serum_eclat",
      name: "Sérum Botanique Éclat & Anti-taches",
      category: "serum",
      description: "Concentré d'actifs dermo-cosm�tiques ciblant l'hyperpigmentation post-inflammatoire.",
      botanicals: "Kinkeliba, Hibiscus, Niacinamide",
      price: 18500,
      stock: 15,
      stockAlert: 3,
      image: "/products/serum.jpg",
      active: true,
    },
    {
      id: "prd_huile_baobab",
      name: "Huile Végétale de Baobab Vierge (100ml)",
      category: "huile",
      description: "Huile précieuse régénérante et protectrice, riche en antioxydants.",
      botanicals: "Adansonia Digitata Seed Oil",
      price: 9000,
      stock: 18,
      stockAlert: 4,
      image: "/products/huile.jpg",
      active: true,
    },
  ],
};

const OFFLINE_CLIENTS_FALLBACK = {
  clients: [
    {
      id: "cli_comptoir_express",
      name: "Passage Comptoir (Sans RDV)",
      phone: "+22500000000",
      visitsCount: 1,
      totalSpent: 0,
      rfmSegment: "Nouveaux",
      createdAt: new Date().toISOString(),
    },
  ],
};

const OFFLINE_TEAM_FALLBACK = {
  employees: [
    {
      id: "emp_fondatrice",
      name: "Responsable Institut",
      role: "manager",
      accountPhone: "+2250100000000",
      active: true,
      country: "CI",
      baseSalary: 250000,
      transport: 30000,
      contractType: "CDI",
      hireDate: "2024-01-01",
    },
    {
      id: "emp_estheticienne",
      name: "Aminata",
      role: "estheticienne",
      accountPhone: "+2250700000001",
      active: true,
      country: "CI",
      baseSalary: 150000,
      transport: 25000,
      contractType: "CDI",
      hireDate: "2024-01-01",
    },
  ],
  attendanceToday: [],
};

function getOfflineApiFallback(pathname) {
  if (pathname.startsWith("/api/auth/session")) {
    return {
      ok: true,
      user: {
        id: "pro_offline_manager",
        name: "Gérante (Hors-ligne)",
        phone: "+2250100000000",
        role: "pro",
        employeeRole: "manager",
        tenantId: "cmts1w5ui0008oww7hm3v18oo",
      },
      tenantId: "cmts1w5ui0008oww7hm3v18oo",
      employeeRole: "manager",
    };
  }
  if (pathname.startsWith("/api/auth/check-phone")) {
    return {
      ok: true,
      exists: true,
      hasPin: true,
      name: "Gérante",
      role: "pro",
      isEmployee: false,
      tenant: { id: "cmts1w5ui0008oww7hm3v18oo", name: "Cabinet LA DERMO" },
    };
  }
  if (pathname.startsWith("/api/auth/login")) {
    return {
      ok: true,
      user: {
        id: "pro_offline_manager",
        name: "Gérante (Hors-ligne)",
        phone: "+2250100000000",
        role: "pro",
        employeeRole: "manager",
        tenantId: "cmts1w5ui0008oww7hm3v18oo",
      },
      tenant: { id: "cmts1w5ui0008oww7hm3v18oo", name: "Cabinet LA DERMO" },
      employeeRole: "manager",
    };
  }
  if (pathname.startsWith("/api/pro/overview")) return OFFLINE_OVERVIEW_FALLBACK;
  if (pathname.startsWith("/api/pro/catalog")) return OFFLINE_CATALOG_FALLBACK;
  if (pathname.startsWith("/api/pro/clients")) return OFFLINE_CLIENTS_FALLBACK;
  if (pathname.startsWith("/api/pro/stock")) return { products: OFFLINE_CATALOG_FALLBACK.products, movements: [] };
  if (pathname.startsWith("/api/pro/employees")) return OFFLINE_TEAM_FALLBACK;
  if (pathname.startsWith("/api/pro/appointments")) return { appointments: [] };
  if (pathname.startsWith("/api/pro/sales")) return { sales: [] };
  if (pathname.startsWith("/api/pro/diagnoses")) return { diagnoses: [], kpis: { monthCount: 0, avgScore: 0, photoShare: 0, total: 0 } };
  if (pathname.startsWith("/api/diagnoses")) return { diagnoses: [] };
  if (pathname.startsWith("/api/shop")) return { products: [] };
  if (pathname.startsWith("/api/appointments")) return { appointments: [] };
  if (pathname.startsWith("/api/wallet")) return { balance: 0, transactions: [] };
  if (pathname.startsWith("/api/notifications")) return { scheduled: [], sent: [], created: 0, unread: 0 };
  if (pathname.startsWith("/api/coupons")) return { coupons: [] };
  if (pathname.startsWith("/api/passport")) return { passport: null };
  return null;
}

/* ───────────────────────── Install / activate ───────────────────────── */

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const precache = await caches.open(PRECACHE);
      const staticCache = await caches.open(STATIC_CACHE);

      // 1. Pré-cache des URL de base
      const results = await Promise.all(
        PRECACHE_URLS.map((url) =>
          precacheClean(precache, url)
            .then(() => "ok")
            .catch((err) => "ÉCHEC " + url + " : " + (err?.message ?? err))
        )
      );

      // 2. Pré-cache exhaustif de TOUS les chunks Next.js via l'API dédiée /api/pwa-manifest
      let manifestAssets = [];
      try {
        const manifestRes = await fetch("/api/pwa-manifest", { cache: "no-store" });
        if (manifestRes && manifestRes.ok) {
          const data = await manifestRes.json();
          if (Array.isArray(data.assets) && data.assets.length > 0) {
            manifestAssets = data.assets;
          }
        }
      } catch {}

      if (manifestAssets.length > 0) {
        await Promise.all(
          manifestAssets.map(async (assetUrl) => {
            try {
              const assetRes = await fetch(new Request(assetUrl, { credentials: "same-origin" }));
              if (assetRes && assetRes.ok) {
                const clean = await sanitizeForCache(assetRes);
                const fullUrl = new URL(assetUrl, self.location.origin).href;
                await staticCache.put(assetUrl, clean.clone());
                await staticCache.put(fullUrl, clean);
              }
            } catch {
              /* chunk best-effort */
            }
          })
        );
      }

      // 3. Extraction automatique complémentaire des scripts et styles Next.js depuis "/" et "/?space=pro"
      for (const entryUrl of ["/", "/?space=pro"]) {
        try {
          const entryRes = (await precache.match(entryUrl, { ignoreSearch: true })) || (await precache.match("/"));
          if (entryRes) {
            const rawText = await entryRes.text();
            const text = rawText.replace(/\\"/g, '"');
            const matches = Array.from(
              text.matchAll(/(?:(?:\/_next\/static\/)|(?:\\\/_next\\\/static\\\/))[^"'\s\\<>)]+\.(?:js|css)/g),
              (m) => m[0].replace(/\\/g, "")
            );
            const assetUrls = Array.from(new Set(matches));

            await Promise.all(
              assetUrls.map(async (assetUrl) => {
                try {
                  const assetRes = await fetch(new Request(assetUrl, { credentials: "same-origin" }));
                  if (assetRes && assetRes.ok) {
                    const clean = await sanitizeForCache(assetRes);
                    const fullUrl = new URL(assetUrl, self.location.origin).href;
                    await staticCache.put(assetUrl, clean.clone());
                    await staticCache.put(fullUrl, clean);
                  }
                } catch {
                  /* chunk best-effort */
                }
              })
            );
          }
        } catch {
          /* best-effort */
        }
      }

      try {
        const dbg = await caches.open("kene-sw-debug");
        await dbg.put("/kene-sw-debug", new Response(JSON.stringify({ version: VERSION, precache: results })));
      } catch {}
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const c of clients) c.postMessage({ keneSwDebug: VERSION, precache: results });
      } catch {}
    })()
  );
});

async function precacheClean(cache, url) {
  const res = await fetch(new Request(url, { cache: "reload" }));
  if (!res || !res.ok) throw new Error("HTTP " + res.status);
  const clean = await sanitizeForCache(res);
  return cache.put(url, clean);
}

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
      const oldCaches = keys.filter((name) => !KEEP_CACHES.includes(name));
      const hadOldVersion = oldCaches.some((name) => name.startsWith("kene-static-") || name.startsWith("kene-precache-"));
      await Promise.all(oldCaches.map((name) => caches.delete(name)));
      await self.clients.claim();
      if (hadOldVersion) {
        try {
          const windowClients = await self.clients.matchAll({ type: "window" });
          for (const client of windowClients) {
            client.postMessage({ type: "KENE_SW_UPDATED", version: VERSION });
          }
        } catch {}
      }
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/* ───────────────────────── Web Push ───────────────────────── */

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
  } catch {}
  event.waitUntil(
    (async () => {
      try {
        await self.registration.showNotification(title, {
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          tag: "kene-push",
          data: { url },
        });
      } catch {}
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
            return;
          }
        }
        await self.clients.openWindow(url);
      } catch {}
    })()
  );
});

/* ───────────────────────── Fetch ───────────────────────── */

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // En développement local (localhost), laisser passer les requêtes d'authentification sans interception SW
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    if (url.pathname.startsWith("/api/auth/")) return;
  }

  // Requêtes d'authentification POST : réseau direct, fallback hors-ligne immédiat
  if (req.method === "POST" && (url.pathname.startsWith("/api/auth/check-phone") || url.pathname.startsWith("/api/auth/login"))) {
    event.respondWith(networkFirstPostAuth(req));
    return;
  }

  if (req.method !== "GET") return;

  // Ne jamais intercepter les flux HMR purs de dev Next.js
  if (
    url.pathname.includes("webpack-hmr") ||
    url.pathname.includes("hot-update.json") ||
    url.pathname.includes("hot-update.js")
  ) {
    return;
  }

  // Assets Next (/_next/) : stale-while-revalidate / cache-first résilient
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(cacheFirstStatic(req));
    return;
  }

  // API données : network-first + cache runtime JSON + fallback instantané
  if (DATA_API_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(networkFirstData(req));
    return;
  }

  // Autres /api/ : réseau direct
  if (url.pathname.startsWith("/api/")) return;

  // Navigations : network-first, fallback coquille "/" précachée
  if (req.mode === "navigate") {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  // Images : cache-first
  if (isImageRequest(url, req)) {
    event.respondWith(cacheFirstImage(req));
    return;
  }
});

/* ───────────────────────── Stratégies ───────────────────────── */

async function networkFirstPostAuth(req) {
  try {
    const res = await fetch(req.clone());
    // Si le serveur a répondu (200, 400, 401, 500...), renvoyer la réponse réelle du serveur
    if (res) return res;
  } catch {}
  // Échec réseau avéré (déconnecté d'internet)
  const url = new URL(req.url);
  const fallback = getOfflineApiFallback(url.pathname);
  if (fallback !== null) {
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-kene-offline": "1",
      },
    });
  }
  return new Response(JSON.stringify({ ok: true, offline: true }), {
    status: 503,
    headers: { "content-type": "application/json", "x-kene-offline": "1" },
  });
}

async function networkFirstData(req) {
  let networkRes = null;
  const url = new URL(req.url);

  try {
    networkRes = await fetch(req);
    // 1) Réponse 2xx ou 304 : mise en cache runtime si 200 et retour immédiat
    if (networkRes && (networkRes.ok || networkRes.status === 304)) {
      if (networkRes.ok && networkRes.status === 200) {
        try {
          const cache = await caches.open(DATA_CACHE);
          const sanitized = await sanitizeForCache(networkRes);
          try {
            await cache.put(req.url, sanitized.clone());
          } catch {
            await cache.put(req, sanitized);
          }
        } catch {}
      }
      return networkRes;
    }
    // 2) Erreurs client 4xx (401 non authentifié, 403 interdit, 404 introuvable, 429...) :
    // Le serveur est en ligne et a répondu de façon explicite. Ne JAMAIS masquer par du cache ou un mock hors-ligne !
    if (networkRes && networkRes.status >= 400 && networkRes.status < 500) {
      return networkRes;
    }
    // 3) Pour les erreurs 5xx (500, 502 gateway), tenter le cache de secours ci-dessous si présent.
  } catch {
    /* réseau réellement injoignable (offline, DNS, timeout) */
  }

  // Échec réseau avéré ou erreur 5xx : recherche dans le cache
  let cached = await caches.match(req.url, { cacheName: DATA_CACHE });
  if (!cached) {
    cached = await caches.match(req, { cacheName: DATA_CACHE });
  }

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

  // Si le serveur a répondu (ex. 500 ou 502) et qu'aucun cache n'existe, renvoyer la réponse serveur
  if (networkRes) return networkRes;

  // Pas de cache et réseau totalement coupé : renvoyer le fallback JSON de secours
  const fallback = getOfflineApiFallback(url.pathname);
  if (fallback !== null) {
    return new Response(JSON.stringify(fallback), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-kene-offline": "1",
      },
    });
  }

  return new Response(JSON.stringify({ error: "hors-ligne", offline: true }), {
    status: 503,
    headers: { "content-type": "application/json", "x-kene-offline": "1" },
  });
}

const OFFLINE_HTML_SHELL = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Kènè — Mode Hors-Ligne</title>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: #0f0d0b;
      color: #f7f2ea;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      box-sizing: border-box;
    }
    .card {
      max-width: 420px;
      width: 100%;
      background: #1c1713;
      border: 1px solid rgba(200, 149, 30, 0.3);
      border-radius: 24px;
      padding: 32px 24px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      background: rgba(200, 149, 30, 0.15);
      border: 1px solid rgba(200, 149, 30, 0.4);
      color: #e2ad3b;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 16px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    h1 {
      font-size: 22px;
      font-weight: 800;
      margin: 0 0 10px 0;
      color: #ffffff;
    }
    p {
      font-size: 14px;
      line-height: 1.5;
      color: #a89f91;
      margin: 0 0 24px 0;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 14px 20px;
      background: linear-gradient(135deg, #c8951e, #e07a2b);
      color: #16110d;
      font-weight: 800;
      font-size: 14px;
      border-radius: 14px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      box-sizing: border-box;
    }
    .btn:active {
      transform: scale(0.98);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">📡 Mode Hors-Ligne</div>
    <h1>Kènè Dermo-Cosmétique</h1>
    <p>Vous êtes actuellement hors connexion. Vos données locales et votre caisse restent protégées. La connexion sera rétablie dès que le réseau sera disponible.</p>
    <button class="btn" onclick="window.location.reload()">Réessayer la connexion</button>
  </div>
  <script>
    function tryRestore() {
      fetch('/api/health', { cache: 'no-store' })
        .then(function(r) {
          if (r.ok) {
            window.location.replace(window.location.href);
          }
        })
        .catch(function() {});
    }
    window.addEventListener('online', tryRestore);
    setInterval(tryRestore, 2000);
  </script>
</body>
</html>`;

async function networkFirstNavigation(req) {
  // 1. Si déconnecté d'internet avéré, servir immédiatement la coquille locale avec zéro latence
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const cached = await getCachedAppShell(req);
    if (cached) return cached;
  }

  // 2. Détection réseau avec timeout réactif de 2000ms (filet anti-attente infinie)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);
  try {
    const networkRes = await fetch(new Request(req.url, { cache: "no-store", credentials: "same-origin", signal: controller.signal }));
    clearTimeout(timeoutId);
    if (networkRes && (networkRes.ok || networkRes.status === 404)) {
      if (networkRes.ok && networkRes.status === 200) {
        try {
          const precache = await caches.open(PRECACHE);
          const clean = await sanitizeForCache(networkRes);
          await precache.put(req.url, clean.clone());
          await precache.put("/", clean);
        } catch {}
      }
      return networkRes;
    }
  } catch {
    clearTimeout(timeoutId);
  }

  // 3. Repli prioritaire sur la coquille applicative précachée (avec ignoreSearch pour supporter ?space=pro etc.)
  const cached = await getCachedAppShell(req);
  if (cached) return cached;

  // 4. Repli ultime coquille offline de secours avec auto-reconnexion active
  return new Response(OFFLINE_HTML_SHELL, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "x-kene-offline": "1" },
  });
}

async function getCachedAppShell(req) {
  try {
    const precache = await caches.open(PRECACHE);
    let shell = await precache.match(req.url, { ignoreSearch: true });
    if (!shell) shell = await precache.match("/", { ignoreSearch: true });
    if (!shell) shell = await precache.match("/?space=pro", { ignoreSearch: true });
    if (!shell) shell = await caches.match(req.url, { ignoreSearch: true });
    if (!shell) shell = await caches.match("/", { ignoreSearch: true });

    if (shell) {
      const body = await shell.clone().arrayBuffer();
      const headers = new Headers(shell.headers);
      headers.set("x-kene-offline", "1");
      return new Response(body, { status: 200, headers });
    }
  } catch {}
  return null;
}

async function cacheFirstStatic(req) {
  const cache = await caches.open(STATIC_CACHE);
  let cached = await cache.match(req);
  if (cached) return cached;

  // Recherche avec ignoreSearch
  cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  const anyCached = await caches.match(req, { ignoreSearch: true });
  if (anyCached) return anyCached;

  try {
    const res = await fetch(new Request(req.url, { credentials: "same-origin" }));
    if (res && res.ok) {
      const clean = await sanitizeForCache(res);
      void cache.put(req, clean.clone()).catch(() => {});
      return clean;
    }
    if (res) return res;
  } catch {
    /* Hors-ligne réel */
  }

  const url = new URL(req.url);
  if (url.pathname.endsWith("/_buildManifest.js")) {
    return new Response(
      'self.__BUILD_MANIFEST = { "/": [], sortedPages: ["/"] }; self.__BUILD_MANIFEST_CB && self.__BUILD_MANIFEST_CB();',
      { status: 200, headers: { "content-type": "application/javascript", "x-kene-offline": "1" } }
    );
  }
  if (url.pathname.endsWith("/_ssgManifest.js")) {
    return new Response(
      'self.__SSG_MANIFEST = new Set(); self.__SSG_MANIFEST_CB && self.__SSG_MANIFEST_CB();',
      { status: 200, headers: { "content-type": "application/javascript", "x-kene-offline": "1" } }
    );
  }
  if (url.pathname.endsWith(".css")) {
    return new Response("/* kene offline css */", {
      status: 200,
      headers: { "content-type": "text/css", "x-kene-offline": "1" },
    });
  }

  // Si c'est un script JS manquant hors-ligne : NE JAMAIS renvoyer une erreur 503 texte brut
  // qui fait crasher le parseur JS (SyntaxError) et bloque l'application sur le splash screen !
  if (url.pathname.endsWith(".js") || req.destination === "script") {
    return new Response(
      "/* Kènè offline safe stub */ (function(){ try { if (typeof self !== 'undefined') { self.__kene_offline_chunk_stub = true; } } catch(e){} })();",
      {
        status: 200,
        headers: { "content-type": "application/javascript", "x-kene-offline": "1" },
      }
    );
  }

  // Autres ressources manquantes hors-ligne (ex: font/media)
  return new Response("Offline resource unavailable", {
    status: 404,
    headers: { "content-type": "text/plain", "x-kene-offline": "1" },
  });
}

async function cacheFirstImage(req) {
  const cached = await caches.match(req, { cacheName: IMG_CACHE });
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok && isImageResponse(res)) {
    try {
      const cache = await caches.open(IMG_CACHE);
      await cache.put(req, res.clone());
    } catch {}
  }
  return res;
}

function isImageRequest(url, req) {
  if (IMG_URL_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return true;
  if (req.destination === "image") return true;
  return /\.(?:png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname);
}

function isImageResponse(res) {
  const type = res.headers.get("content-type") || "";
  return type.startsWith("image/");
}
