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

const VERSION = "kene-sw-v21";
const PRECACHE = "kene-precache-v21";
const DATA_CACHE = "kene-data-v21";
const IMG_CACHE = "kene-img-v21";
const STATIC_CACHE = "kene-static-v21";
/** Caches autorisés pour la version courante — les autres sont purgés à l'activation. */
const KEEP_CACHES = [PRECACHE, DATA_CACHE, IMG_CACHE, STATIC_CACHE, "kene-sw-debug"];

const PRECACHE_URLS = [
  "/",
  "/pro",
  "/favicon.ico",
  "/brand/kene-emblem-light.png",
  "/brand/kene-emblem-dark.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
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
      description: "Concentré d'actifs dermo-botaniques ciblant l'hyperpigmentation post-inflammatoire.",
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
      name: "Déborah",
      role: "manager",
      accountPhone: "+2250504195071",
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
        name: "Déborah (Gérante - Hors-ligne)",
        phone: "+2250504195071",
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
      name: "Déborah",
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
        name: "Déborah (Gérante - Hors-ligne)",
        phone: "+2250504195071",
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
  if (pathname.startsWith("/api/notifications")) return { notifications: [] };
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

      // 2. Extraction automatique de tous les scripts et styles Next.js de la coquille d'accueil
      try {
        const homeRes = await caches.match("/", { cacheName: PRECACHE });
        if (homeRes) {
          const text = await homeRes.text();
          const scriptMatches = Array.from(text.matchAll(/<script[^>]+src="(\/_next\/[^">]+)"/g), (m) => m[1]);
          const styleMatches = Array.from(text.matchAll(/<link[^>]+href="(\/_next\/[^">]+\.css)"/g), (m) => m[1]);
          const assetUrls = Array.from(new Set([...scriptMatches, ...styleMatches]));

          await Promise.all(
            assetUrls.map(async (assetUrl) => {
              try {
                const assetRes = await fetch(new Request(assetUrl, { cache: "reload" }));
                if (assetRes && assetRes.ok) {
                  await staticCache.put(assetUrl, assetRes);
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

  // Requêtes d'authentification POST : réseau direct, fallback hors-ligne immédiat
  if (req.method === "POST" && (url.pathname.startsWith("/api/auth/check-phone") || url.pathname.startsWith("/api/auth/login"))) {
    event.respondWith(networkFirstPostAuth(req));
    return;
  }

  if (req.method !== "GET") return;

  // Assets Next (/_next/) : stale-while-revalidate
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(staleWhileRevalidate(req));
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
    if (res && res.ok) return res;
  } catch {}
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
    status: 200,
    headers: { "content-type": "application/json", "x-kene-offline": "1" },
  });
}

async function networkFirstData(req) {
  let networkRes = null;
  const url = new URL(req.url);

  try {
    networkRes = await fetch(req);
    if (networkRes && networkRes.ok) {
      try {
        const cache = await caches.open(DATA_CACHE);
        const sanitized = await sanitizeForCache(networkRes);
        try {
          await cache.put(req.url, sanitized.clone());
        } catch {
          await cache.put(req, sanitized);
        }
      } catch {}
      return networkRes;
    }
  } catch {
    /* réseau injoignable */
  }

  // Échec réseau ou offline : recherche dans le cache
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

  // Pas de cache : renvoyer le fallback JSON au lieu de lever une exception
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

  if (networkRes) return networkRes;
  return new Response(JSON.stringify({ error: "hors-ligne", offline: true }), {
    status: 200,
    headers: { "content-type": "application/json", "x-kene-offline": "1" },
  });
}

async function networkFirstNavigation(req) {
  let networkRes = null;
  try {
    networkRes = await fetch(req);
    if (networkRes && (networkRes.ok || networkRes.status === 404)) return networkRes;
  } catch {}

  const exactShell = await caches.match(req.url, { cacheName: PRECACHE });
  if (exactShell) return exactShell;

  const shell = await caches.match("/", { cacheName: PRECACHE });
  if (shell) return shell;

  const anyShell = await caches.match("/");
  if (anyShell) return anyShell;

  if (networkRes) return networkRes;
  throw new Error("Kènè hors-ligne : coquille indisponible");
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) {
        void cache.put(req, res.clone()).catch(() => {});
      }
      return res;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const res = await network;
  if (res && res.ok) return res;

  // Si le chunk n'est pas encore en cache, tenter n'importe quel match
  const anyCached = await caches.match(req);
  if (anyCached) return anyCached;

  throw new Error("Kènè hors-ligne : ressource statique jamais visitée");
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
