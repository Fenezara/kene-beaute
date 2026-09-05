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
    const msg = body?.error ?? `Erreur ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return handle<T>(res);
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
