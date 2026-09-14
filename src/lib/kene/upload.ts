// Kènè — validation serveur des uploads photo (dataURL),.
// Défense 2026: un `data:image/...` n'est jamais cru sur parole —
// 1) MIME restreint à JPEG / PNG / WebP,
// 2) taille décodée plafonnée (DoS mémoire),
// 3) MAGIC BYTES sniffés et confrontés au type déclaré (un.exe renommé
// en.jpg ne passe pas, un SVG scripté non plus).
// Pure JS / node:crypto-free: AUCUN sharp ici (leçon — sharp ne doit
// jamais être importé par une route API).

export type UploadCheck =
  | { ok: true; mime: string; bytes: number }
  | { ok: false; reason: string };

/** 8 Mo décodés — large: le client resize déjà à ~820 px (~1 Mo), ce plafond
 * protège surtout contre les corps forgés. */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Signature du contenu réel — retourne le MIME sniffé ou null. */
function sniffMime(buf: Uint8Array): string | null {
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  // WebP: "RIFF" + taille + "WEBP"
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

/** Valide une dataURL photo: en-tête, base64, taille, magic bytes.
 * Toujours SÛR sur des entrées hostiles: aucune exception jetée, longueur
 * bornée avant tout décodage. */
export function checkImageDataUrl(dataUrl: string, maxBytes: number = UPLOAD_MAX_BYTES): UploadCheck {
  if (typeof dataUrl !== "string" || dataUrl.length > maxBytes * 2) {
    return { ok: false, reason: "photo trop lourde" };
  }
  const comma = dataUrl.indexOf(",");
  if (comma <= 4 || comma > 128) return { ok: false, reason: "dataURL malformé" };

  const header = dataUrl.slice(0, comma);
  const m = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64$/i.exec(header);
  if (!m) return { ok: false, reason: "en-tête dataURL invalide (base64 attendu)" };
  const mime = m[1].toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) {
    return { ok: false, reason: `format ${mime} non accepté (JPEG, PNG ou WebP)` };
  }

  const b64 = dataUrl.slice(comma + 1);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    return { ok: false, reason: "encodage base64 invalide" };
  }
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes > maxBytes) {
    return { ok: false, reason: `photo trop lourde (${(approxBytes / 1_048_576).toFixed(1)} Mo, max ${(maxBytes / 1_048_576).toFixed(0)} Mo)` };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(b64, "base64");
  } catch {
    return { ok: false, reason: "base64 indécodable" };
  }
  if (buf.length < 16) return { ok: false, reason: "fichier image trop court" };

  const sniffed = sniffMime(buf);
  if (!sniffed) return { ok: false, reason: "contenu non reconnu comme image (JPEG, PNG ou WebP)" };
  if (sniffed !== mime) {
    return { ok: false, reason: `contenu réel (${sniffed}) différent du type déclaré (${mime})` };
  }
  return { ok: true, mime, bytes: buf.length };
}
