// Kènè — helpers fetch côté client (importé uniquement par des composants
// clients → sonner est sûr ici ; le <Toaster> est monté dans page.tsx).
import { toast } from "sonner";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ─────────────── Toasts réseau centralisés ───────────────
// Hors-ligne (header posé par le service worker) : max 1 toast / 30 s,
// variable module-level — le flux continue avec les données du cache.
let lastOfflineToastAt = 0;
const OFFLINE_TOAST_THROTTLE_MS = 30_000;

/** "45 s" | "1 min 30 s" | "15 min" — joli et lisible. */
function formatDelay(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  const min = Math.floor(sec / 60);
  const rest = Math.round(sec % 60);
  return rest === 0 ? `${min} min` : `${min} min ${rest} s`;
}

/** Délai de déblocage d'un 429 : body JSON retryAfterSec, sinon header Retry-After. */
function retryAfterSec(body: { error?: string; retryAfterSec?: number } | null, res: Response): number {
  if (typeof body?.retryAfterSec === "number" && body.retryAfterSec > 0) return body.retryAfterSec;
  const header = Number(res.headers.get("Retry-After"));
  return Number.isFinite(header) && header > 0 ? header : 0;
}

async function handle<T>(res: Response): Promise<T> {
  // Réponse servie depuis le cache hors-ligne → simple info, flux normal.
  if (res.headers.get("x-kene-offline") === "1" && Date.now() - lastOfflineToastAt > OFFLINE_TOAST_THROTTLE_MS) {
    lastOfflineToastAt = Date.now();
    toast.info("Mode hors-ligne", { description: "Données affichées depuis le cache" });
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = data as { error?: string; retryAfterSec?: number } | null;
    if (res.status === 429) {
      const sec = retryAfterSec(body, res);
      toast.error(body?.error || "Trop de tentatives", {
        description: sec > 0 ? `Réessaie dans ${formatDelay(sec)}` : "Réessaie dans un instant",
      });
    }
    // 502/503/504 : la gateway renvoie du HTML (pas de body.error) — un message
    // humain plutôt qu'un « Erreur 502 » brut qui fait croire à un bug applicatif
    // (t. 77 : la fondatrice a lu ce code tel quel sur la carte score de l'accueil).
    const gatewayish = res.status === 502 || res.status === 503 || res.status === 504;
    const msg =
      body?.error ??
      (gatewayish ? "Connexion au serveur instable — réessaie dans un instant" : `Erreur ${res.status}`);
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return handle<T>(res);
}

/* ─────────────── Pont GET (t. 91) + transport résilient (t. 92) ───────────────
 * INCIDENT MESURÉ : chez l'utilisatrice réelle (iframe de préview), TOUS les
 * POST sortant de la page échouent AVANT le serveur alors que ses GET
 * traversent (polls notifications, beacons : 16 GET / 0 POST sur une
 * génération de logs). Et l'échec n'est pas toujours un rejet propre :
 *   • certains POST restent PENDUS indéfiniment (fetch ne résout jamais) ;
 *   • d'autres reçoivent une réponse PROXY (statut réseau + corps HTML) avant
 *     d'atteindre le serveur.
 * Le pont t. 91 ne couvrait que le rejet réseau pur → trois correctifs t. 92 :
 *   1. TIMEOUT : chaque POST client est borné (8 s par défaut ; le chat passe
 *      35 s, plus long que la garde serveur de 30 s). Un POST muet trop
 *      longtemps = transport bloqué → pont GET.
 *   2. DÉTECTION PROXY : une réponse 403/405/502/503/504 en corps NON-JSON
 *      (nos routes répondent TOUJOURS en JSON) = blocage transport déguisé →
 *      pont GET. Les vraies erreurs serveur (JSON) ne passent JAMAIS ici.
 *   3. MÉMOIRE TRANSPORT : dès qu'un POST échoue mais que le pont GET réussit,
 *      le drapeau « POST mort » est posé (module + localStorage) → les appels
 *      suivants vont DROIT au pont, sans attendre le timeout. La sonde
 *      PostBeacon (POST /api/health/echo toutes les 45 s) le réanime
 *      automatiquement si l'environnement se met à laisser passer les POST.
 * Comportement STRICTEMENT inchangé quand le POST marche. */

/** Nom du paramètre de pont GET↔POST (contrat serveur, voir les routes). */
const GET_BRIDGE_PARAM = "_g";

/** Taille max d'un payload transportable en query string (URL safe). */
const GET_BRIDGE_MAX_CHARS = 6_000;

/** Timeout par défaut d'un POST client : les routes critiques répondent en
 *  < 1 s côté serveur — un POST muet au-delà de 8 s est bloqué en amont. */
const POST_TIMEOUT_MS = 8_000;

/** Erreur interne : le POST n'a rien dit à temps (transport pendu). */
class PostTimeoutError extends Error {
  constructor(ms: number) {
    super(`POST muet après ${Math.round(ms / 1000)} s`);
  }
}

/** Message FR unique pour « le serveur est injoignable par ce transport ». */
const MSG_INSTABLE = "Connexion au serveur instable — réessaie dans un instant";

/* ── Mémoire « POST mort » (module + localStorage) ── */
const POST_DEAD_KEY = "kene-post-dead";
let postDeadCache: boolean | null = null; // null = pas encore lu

function isPostDead(): boolean {
  if (postDeadCache === null) {
    try {
      postDeadCache = localStorage.getItem(POST_DEAD_KEY) === "1";
    } catch {
      postDeadCache = false; // stockage bloqué → on part du comportement normal
    }
  }
  return postDeadCache;
}

/** Pose le drapeau « les POST ne traversent pas ici » (appelé aussi par la
 *  sonde PostBeacon). Idempotent, silencieux si stockage indisponible. */
export function markPostDead(): void {
  if (postDeadCache === true) return;
  postDeadCache = true;
  try {
    localStorage.setItem(POST_DEAD_KEY, "1");
  } catch {
    /* iframe sans stockage : le drapeau vit au moins en mémoire de page */
  }
}

/** Réanime le transport POST (un POST a traversé — appelé par la sonde
 *  PostBeacon et par tout apiPost qui aboutit normalement). */
export function markPostAlive(): void {
  if (postDeadCache === false) return;
  postDeadCache = false;
  try {
    localStorage.removeItem(POST_DEAD_KEY);
  } catch {
    /* idem */
  }
}

/** Réponse « suspecte » = blocage transport déguisé : statut réseau que nos
 *  routes n'émettent JAMAIS en corps HTML (elles répondent en JSON). Typique
 *  du proxy de préview qui répond 403/405 avant le serveur. */
function looksProxyBlocked(res: Response): boolean {
  if (![403, 405, 502, 503, 504].includes(res.status)) return false;
  const ct = res.headers.get("content-type") ?? "";
  return !ct.includes("json");
}

/** Requête à corps JSON bornée dans le temps : résout la réponse, rejette
 *  l'erreur réseau, ou rejette PostTimeoutError si elle reste muette (le fetch
 *  d'origine continue en arrière-plan — son éventuel résultat est ignoré). */
function raceMethod(url: string, method: "POST" | "PATCH", json: string | undefined, ms: number): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => reject(new PostTimeoutError(ms)), ms);
    fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: json,
    }).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Relance pont GET (t. 91) : même payload en query `_g`. Les erreurs HTTP de
 *  NOS routes remontent telles quelles (ApiError avec le vrai statut) ; seul
 *  un échec réseau du pont devient « connexion instable ». */
async function bridgeCall<T>(url: string, json: string): Promise<T> {
  const sep = url.includes("?") ? "&" : "?";
  let res: Response;
  try {
    res = await fetch(`${url}${sep}${GET_BRIDGE_PARAM}=${encodeURIComponent(json)}`, { cache: "no-store" });
  } catch {
    throw new ApiError(MSG_INSTABLE, 0);
  }
  return handle<T>(res);
}

export async function apiPost<T>(url: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
  const json = body === undefined ? undefined : JSON.stringify(body);
  const canBridge = json !== undefined && json.length <= GET_BRIDGE_MAX_CHARS;
  const timeoutMs = opts.timeoutMs ?? POST_TIMEOUT_MS;

  // Transport POST connu mort → droit au pont (zéro attente). Un payload trop
  // gros pour le pont n'a rien à perdre : on tente quand même le POST.
  if (isPostDead() && canBridge) {
    return bridgeCall<T>(url, json!);
  }

  let res: Response;
  try {
    res = await raceMethod(url, "POST", json, timeoutMs);
  } catch (err) {
    // Rejet réseau OU POST muet trop longtemps (pendu) : même remède — le pont
    // GET, si le payload tient en query string. Une erreur HTTP (4xx/5xx) ne
    // passe JAMAIS ici : elle a une réponse → traitée plus bas.
    if (canBridge) {
      try {
        const out = await bridgeCall<T>(url, json!);
        markPostDead(); // le pont marche, le POST non → mémoire transport
        return out;
      } catch (e) {
        // Le pont a ATTEINT le serveur (erreur applicative réelle) → POST mort
        // quand même ; sinon (pont réseau muet) on ne conclut rien.
        if (e instanceof ApiError && e.status !== 0) markPostDead();
        throw e;
      }
    }
    // Payload trop volumineux (photo/audio base64) : pas de pont possible →
    // message FR clair plutôt qu'un « TypeError: Failed to fetch » brut.
    throw new ApiError(MSG_INSTABLE, 0);
  }

  // Le POST a répondu — mais une réponse « proxy » (HTML sur statut réseau)
  // est un blocage transport déguisé : pont une fois, et mémoire si le pont
  // passe (l'environnement bloque les POST mais laisse les GET).
  if (looksProxyBlocked(res)) {
    if (canBridge) {
      try {
        const out = await bridgeCall<T>(url, json!);
        markPostDead();
        return out;
      } catch (e) {
        if (e instanceof ApiError && e.status !== 0) markPostDead();
        throw e;
      }
    }
    // gros payload + proxy : le message FR arrive via handle() (gatewayish).
  }

  // Réponse normale (succès OU erreur applicative JSON de nos routes) : le
  // transport POST fonctionne → on réanime la mémoire transport.
  try {
    return await handle<T>(res);
  } finally {
    markPostAlive();
  }
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  // PATCH sans pont (aucune route n'expose de GET équivalent) : borné dans le
  // temps pour ne jamais geler un bouton si le transport est bloqué — l'erreur
  // FR « connexion instable » remonte au bout de 8 s au lieu d'un pendu infini.
  try {
    const res = await raceMethod(url, "PATCH", body === undefined ? undefined : JSON.stringify(body), POST_TIMEOUT_MS);
    return await handle<T>(res);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(MSG_INSTABLE, 0);
  }
}

/** Redimensionne une photo côté client (max 820px, JPEG q0.8) → dataURL.
 *  820px/q0.8 suffit pour l'analyse VLM et réduit fortement le coût data
 *  (segment « petite data » : recharges journalières de 100-500 FCFA). */
export function resizeImage(file: File, maxSide = 820): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponible"));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
