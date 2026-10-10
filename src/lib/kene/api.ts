// Kènè — helpers fetch côté client (importé uniquement par des composants
// clients → sonner est sûr ici; le <Toaster> est monté dans page.tsx).
import { toast } from "sonner";

export class ApiError extends Error {
  status: number;
  /** Code machine optionnel du body d'erreur (ex. "elevation_required" —
   * t. 130 step-up console: le front ouvre le dialogue de confirmation
   * puis rejoue l'action). */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** "45 s" | "1 min 30 s" | "15 min" — joli et lisible. */
function formatDelay(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  const min = Math.floor(sec / 60);
  const rest = Math.round(sec % 60);
  return rest === 0 ? `${min} min` : `${min} min ${rest} s`;
}

/** Délai de déblocage d'un 429: body JSON retryAfterSec, sinon header Retry-After. */
function retryAfterSec(body: { error?: string; retryAfterSec?: number } | null, res: Response): number {
  if (typeof body?.retryAfterSec === "number" && body.retryAfterSec > 0) return body.retryAfterSec;
  const header = Number(res.headers.get("Retry-After"));
  return Number.isFinite(header) && header > 0 ? header : 0;
}

async function handle<T>(res: Response): Promise<T> {
  // Réponse réseau réussie : notification d'activité réseau pour les écouteurs de statut
  if (typeof window !== "undefined" && res.ok && res.headers.get("x-kene-offline") !== "1") {
    try {
      window.dispatchEvent(new Event("kene:network:alive"));
    } catch {}
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = data as { error?: string; retryAfterSec?: number; code?: string } | null;
    if (res.status === 429) {
      const sec = retryAfterSec(body, res);
      toast.error(body?.error || "Trop de tentatives", {
        description: sec > 0 ? `Réessaie dans ${formatDelay(sec)}` : "Réessaie dans un instant",
      });
    }
    // 502/503/504: la gateway renvoie du HTML (pas de body.error) — un message
    // humain plutôt qu'un « Erreur 502 » brut qui fait croire à un bug applicatif
    // (: la fondatrice a lu ce code tel quel sur la carte score de l'accueil).
    const gatewayish = res.status === 502 || res.status === 503 || res.status === 504;
    const msg =
      body?.error ??
      (gatewayish ? "Connexion au serveur instable — réessaie dans un instant" : `Erreur ${res.status}`);
    throw new ApiError(msg, res.status, body?.code);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-cache" });
  return handle<T>(res);
}

/* ─────────────── Téléchargement de fichier (CSV/PDF — t. 140) ───────────────
 * Les exports console ne passent PAS par apiGet (réponse non-JSON): même
 * discipline que la compta Pro — fetch → blob → ancre de téléchargement,
 * nom de fichier lu dans Content-Disposition, erreur JSON propagée en
 * ApiError. Retourne le nom du fichier téléchargé (pour le toast). */
export async function downloadFile(url: string, fallbackName: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let body: { error?: string; code?: string } | null = null;
    try {
      body = await res.json();
    } catch {
      /* réponse non-JSON (gateway) */
    }
    throw new ApiError(body?.error ?? `Erreur ${res.status}`, res.status, body?.code);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? fallbackName;
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2000);
  return filename;
}

/* ─────────────── Pont GET + transport résilient ───────────────
 * INCIDENT MESURÉ: chez l'utilisatrice réelle (iframe de préview), TOUS les
 * POST sortant de la page échouent AVANT le serveur alors que ses GET
 * traversent (polls notifications, beacons: 16 GET / 0 POST sur une
 * génération de logs). Et l'échec n'est pas toujours un rejet propre:
 * • certains POST restent PENDUS indéfiniment (fetch ne résout jamais);
 * • d'autres reçoivent une réponse PROXY (statut réseau + corps HTML) avant
 * d'atteindre le serveur.
 * Le pont ne couvrait que le rejet réseau pur → trois correctifs:
 * 1. TIMEOUT: chaque POST client est borné (8 s par défaut; le chat passe
 * 35 s, plus long que la garde serveur de 30 s). Un POST muet trop
 * longtemps = transport bloqué → pont GET.
 * 2. DÉTECTION PROXY: une réponse 403/405/502/503/504 en corps NON-JSON
 * (nos routes répondent TOUJOURS en JSON) = blocage transport déguisé →
 * pont GET. Les vraies erreurs serveur (JSON) ne passent JAMAIS ici.
 * 3. MÉMOIRE TRANSPORT: dès qu'un POST échoue mais que le pont GET réussit,
 * le drapeau « POST mort » est posé (module + localStorage) → les appels
 * suivants vont DROIT au pont, sans attendre le timeout. La sonde
 * TransportProbe (POST /api/health/echo toutes les 45 s) le réanime
 * automatiquement si l'environnement se met à laisser passer les POST.
 * Comportement STRICTEMENT inchangé quand le POST marche. */

/** Nom du paramètre de pont GET↔POST (contrat serveur, voir les routes). */
const GET_BRIDGE_PARAM = "_g";

/** Taille max d'un payload transportable en query string (URL safe). */
const GET_BRIDGE_MAX_CHARS = 6_000;

/** Timeout par défaut d'un POST client: 45 s pour accommoder la 3G/4G et les analyses IA */
const POST_TIMEOUT_MS = 45_000;

/** Erreur interne: le POST n'a rien dit à temps (transport pendu). */
class PostTimeoutError extends Error {
  constructor(ms: number) {
    super(`POST muet après ${Math.round(ms / 1000)} s`);
  }
}

/** Message FR unique pour « le serveur est injoignable par ce transport ». */
const MSG_INSTABLE = "Connexion au serveur instable — réessaie dans un instant";

/* ── Registre des routes pontées ──
 * SEULES ces routes acceptent le paramètre `_g` côté serveur (handlers GET
 * avec decodeBridge — voir src/lib/kene/get-bridge.ts). Le client ne tente
 * le pont QUE sur ces chemins: les autres POST/PATCH échouent avec le
 * message FR clair au lieu d'un 405 incompréhensible. Registre = le PARCOURS
 * COMPLET d'inscription et les interactions critiques (login, chat, accès express);
 * les écritures pro quotidiennes (POS, stock, CRM) restent hors pont
 * (payloads volumineux ou routes dynamiques — limitation documentée). */
const BRIDGEABLE_ROUTES = new Set([
  "/api/dermato/chat", // chat Dr Kènè 
  "/api/auth/otp/request", // login pavé 
  "/api/auth/otp/verify", // login pavé 
  "/api/auth/express", // GET pur — jamais appelé en apiPost, documentation
  "/api/auth/consent", // consentement santé — inscription cliente 
  "/api/auth/profile", // questionnaire d'inscription — PATCH 
  "/api/referral/redeem", // parrainage — inscription cliente 
  "/api/auth/pro/register", // inscription entreprise 
  "/api/subscriptions/activate", // activation plan 
  "/api/subscriptions/renew", // renouvellement plan 
  "/api/admin/elevate", // t. 130 — step-up console (dialogue code frais)
  "/api/admin/passkey/login/options", // t. 130 — connexion console par passkey
  "/api/admin/passkey/login/verify", // t. 130 (assertion ~1 ko — tient en query)
  "/api/admin/passkey/register/options", // t. 130 — enregistrement appareil
  "/api/admin/passkey/register/verify", // t. 130 (attestation ~1-3 ko)
]);

/** La route expose-t-elle un handler GET ponté (`_g`)? */
function isBridgedRoute(url: string): boolean {
  return BRIDGEABLE_ROUTES.has(url);
}

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
 * sonde TransportProbe). Idempotent, silencieux si stockage indisponible. */
export function markPostDead(): void {
  if (postDeadCache === true) return;
  postDeadCache = true;
  try {
    localStorage.setItem(POST_DEAD_KEY, "1");
  } catch {
 /* iframe sans stockage: le drapeau vit au moins en mémoire de page */
  }
}

/** Réanime le transport POST (un POST a traversé — appelé par la sonde
 * TransportProbe et par tout apiPost qui aboutit normalement). */
export function markPostAlive(): void {
  if (postDeadCache === false) return;
  postDeadCache = false;
  try {
    localStorage.removeItem(POST_DEAD_KEY);
  } catch {
 /* idem */
  }
}

/** Réponse « suspecte » = blocage transport déguisé: statut réseau que nos
 * routes n'émettent JAMAIS en corps HTML (elles répondent en JSON). Typique
 * du proxy de préview qui répond 403/405 avant le serveur. */
function looksProxyBlocked(res: Response): boolean {
  if (![403, 405, 502, 503, 504].includes(res.status)) return false;
  const ct = res.headers.get("content-type") ?? "";
  return !ct.includes("json");
}

/** Requête à corps JSON bornée dans le temps: résout la réponse, rejette
 * l'erreur réseau, ou rejette PostTimeoutError si elle reste muette (le fetch
 * d'origine continue en arrière-plan — son éventuel résultat est ignoré). */
function raceMethod(url: string, method: "POST" | "PATCH" | "DELETE", json: string | undefined, ms: number): Promise<Response> {
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

/** Relance pont GET: même payload en query `_g`. Les erreurs HTTP de
 * NOS routes remontent telles quelles (ApiError avec le vrai statut); seul
 * un échec réseau du pont devient « connexion instable ». */
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

/** Pont + mémoire transport: si le pont RÉUSSIT (ou atteint le serveur avec
 * une erreur applicative), le POST/PATCH est déclaré mort chez cette
 * utilisatrice → les prochains appels iront droit au pont. */
async function bridgedRetry<T>(url: string, json: string): Promise<T> {
  try {
    const out = await bridgeCall<T>(url, json);
    markPostDead();
    return out;
  } catch (e) {
    // Le pont a ATTEINT le serveur (erreur applicative réelle, statut ≠ 0) →
    // POST mort quand même; sinon (pont réseau muet) on ne conclut rien.
    if (e instanceof ApiError && e.status !== 0) markPostDead();
    throw e;
  }
}

/** Cœur transport partagé POST/PATCH ( +): tentative HTTP
 * normale bornée dans le temps, puis pont GET si la route l'expose.
 * Comportement STRICTEMENT inchangé quand le POST/PATCH marche. */
async function apiWrite<T>(
  method: "POST" | "PATCH",
  url: string,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  const json = body === undefined ? undefined : JSON.stringify(body);
  // Pont possible uniquement si la route expose un GET ponté (registre)
  // ET si le payload tient en query string.
  const canBridge =
    json !== undefined && json.length <= GET_BRIDGE_MAX_CHARS && isBridgedRoute(url);

  // Transport POST connu mort → droit au pont (zéro attente). Un payload hors
  // pont n'a rien à perdre: on tente quand même le POST/PATCH.
  if (isPostDead() && canBridge) {
    return bridgedRetry<T>(url, json!);
  }

  let res: Response;
  try {
    res = await raceMethod(url, method, json, timeoutMs);
  } catch {
    // Rejet réseau OU requête muette trop longtemps (pendue): même remède —
    // le pont GET, si la route l'expose. Une erreur HTTP (4xx/5xx) ne passe
    // JAMAIS ici: elle a une réponse → traitée plus bas.
    if (canBridge) return bridgedRetry<T>(url, json!);
    // Route non pontée ou payload trop volumineux (photo/audio base64):
    // message FR clair plutôt qu'un « TypeError: Failed to fetch » brut.
    throw new ApiError(MSG_INSTABLE, 0);
  }

  // La requête a répondu — mais une réponse « proxy » (HTML sur statut réseau)
  // est un blocage transport déguisé: pont une fois, et mémoire si le pont
  // passe (l'environnement bloque les écritures mais laisse les GET).
  if (looksProxyBlocked(res) && canBridge) {
    return bridgedRetry<T>(url, json!);
  }

  // Réponse normale (succès OU erreur applicative JSON de nos routes): le
  // transport fonctionne → on réanime la mémoire transport.
  try {
    return await handle<T>(res);
  } finally {
    markPostAlive();
  }
}

export async function apiPost<T>(url: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
  return apiWrite<T>("POST", url, body, opts.timeoutMs ?? POST_TIMEOUT_MS);
}

export async function apiPatch<T>(url: string, body?: unknown, opts: { timeoutMs?: number } = {}): Promise<T> {
  // PATCH ponté pour les routes du registre (auth/profile — questionnaire
  // d'inscription,); borné 8 s pour les autres au lieu d'un pendu infini.
  return apiWrite<T>("PATCH", url, body, opts.timeoutMs ?? POST_TIMEOUT_MS);
}

/** DELETE JSON (t. 130 — retrait d'un appareil passkey). Borné 8 s; pas de
 * pont (les routes dynamiques ne sont pas au registre) — message FR clair si
 * le transport est bloqué. */
export async function apiDelete<T>(url: string, opts: { timeoutMs?: number } = {}): Promise<T> {
  let res: Response;
  try {
    res = await raceMethod(url, "DELETE", undefined, opts.timeoutMs ?? POST_TIMEOUT_MS);
  } catch {
    throw new ApiError(MSG_INSTABLE, 0);
  }
  return handle<T>(res);
}

/** Redimensionne une photo côté client (max 820px, JPEG q0.8) → dataURL.
 * 820px/q0.8 suffit pour l'analyse VLM et réduit fortement le coût data
 * (segment « petite data »: recharges journalières de 100-500 FCFA). */
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
