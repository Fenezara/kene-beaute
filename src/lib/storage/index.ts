// Kènè — Service d'Abstraction du Stockage Média & CDN
// Gère l'enregistrement et la résolution des URLs d'images pour Kènè :
// • Produits cosmétiques & soins
// • Photos vitrines d'instituts
// • Avatars des clientes
//
// 1. Mode Base de Données / Local (développement & POC):
//    Stocke les data URLs optimisées et les sert via /api/media/:type/:id avec ETag et cache 24h.
// 2. Mode CDN / Object Storage (S3 / Cloudflare R2 - Production haute charge):
//    Déporte les binaires hors de la BDD SQL et sert directement via CDN global.

export type MediaType = "tenant" | "product" | "service" | "user";

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=]+)$/;

/**
 * Détecte si une chaîne est une data URL base64 brute.
 */
export function isDataUrl(str: string | null | undefined): boolean {
  if (!str) return false;
  return str.startsWith("data:image/");
}

/**
 * Découpe une data URL base64 en type MIME et Buffer binaire.
 */
export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } | null {
  const m = DATA_URL_RE.exec(dataUrl.trim());
  if (!m) return null;
  const [, mime, b64] = m;
  try {
    const buffer = Buffer.from(b64, "base64");
    return { mime, buffer };
  } catch {
    return null;
  }
}

/**
 * Recompose une data URL base64 depuis un Buffer.
 */
export function formatDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Résout l'URL publique optimale d'un média vitrine.
 * En production avec CDN configuré : https://cdn.kene.app/:type/:id.jpg
 * En mode standard : /api/media/:type/:id (avec cache navigateur et ETag)
 */
export function getMediaPublicUrl(type: MediaType, id: string): string {
  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL?.trim();
  if (cdnBase) {
    const cleanBase = cdnBase.endsWith("/") ? cdnBase.slice(0, -1) : cdnBase;
    return `${cleanBase}/${type}/${id}`;
  }
  return `/api/media/${type}/${id}`;
}
