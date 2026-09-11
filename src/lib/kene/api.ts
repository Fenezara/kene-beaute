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
  if (sec < 60) return `${Math.max(1, sec)} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
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

/* ─────────────── Pont GET (t. 91) ───────────────
 * INCIDENT MESURÉ : chez l'utilisatrice réelle (iframe de préview), TOUS les
 * POST sortant de la page échouent au niveau réseau (fetch rejette, aucune
 * requête n'atteint le serveur — zéro POST de sa part dans dev.log sur toute
 * une génération) alors que ses GET traversent (polls notifications visibles).
 * Conséquence vécue : « impossible de se connecter » (login = 2 POST) puis
 * « Dr Kènè répond "une erreur est survenue" à chaque question » (chat = 1
 * POST). Pont : quand le POST échoue SANS réponse serveur (échec réseau pur,
 * pas une erreur HTTP), UNE relance en GET transporte le même payload via le
 * paramètre `_g` — les routes critiques (chat, otp/request, otp/verify)
 * acceptent ce paramètre côté serveur avec les MÊMES garde-fous (rate-limit
 * IP, validation zod, audit). Cap 6 000 caractères : photo/audio (base64
 * volumineux) ne tentent jamais le pont — échec réseau propagé tel quel.
 * Comportement STRICTEMENT inchangé quand le POST marche. */

/** Nom du paramètre de pont GET↔POST (contrat serveur, voir les routes). */
const GET_BRIDGE_PARAM = "_g";

/** Taille max d'un payload transportable en query string (URL safe). */
const GET_BRIDGE_MAX_CHARS = 6_000;

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const json = body === undefined ? undefined : JSON.stringify(body);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
    });
  } catch {
    // Échec réseau PUR (fetch rejeté, aucune réponse) → pont GET si le payload
    // tient en query string. Une erreur HTTP (4xx/5xx) ne passe JAMAIS ici :
    // elle a une réponse → relancer en GET doublerait le rate-limit pour rien.
    // Payload trop volumineux (photo/audio base64) : pas de pont possible →
    // message FR clair plutôt qu'un « TypeError: Failed to fetch » brut.
    if (json === undefined || json.length > GET_BRIDGE_MAX_CHARS) {
      throw new ApiError("Connexion au serveur instable — réessaie dans un instant", 0);
    }
    const sep = url.includes("?") ? "&" : "?";
    try {
      res = await fetch(`${url}${sep}${GET_BRIDGE_PARAM}=${encodeURIComponent(json)}`, { cache: "no-store" });
    } catch {
      // Le pont lui-même n'atteint pas le serveur : même message FR clair.
      throw new ApiError("Connexion au serveur instable — réessaie dans un instant", 0);
    }
    return handle<T>(res);
  }
  return handle<T>(res);
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(res);
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
