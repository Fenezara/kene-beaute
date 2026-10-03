// Kènè — Hachage et vérification sécurisée du code secret PIN (style Wave / Mobile Banking)
// Zéro dépendance externe — utilise le scrypt natif de node:crypto avec sel aléatoire de 16 octets.
// Protection cryptographique contre les attaques par dictionnaire et GPU brute-force.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Valide le format du code PIN : 4 chiffres (ou jusqu'à 6 chiffres).
 */
export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin.trim());
}

/**
 * Hache un code PIN avec un sel aléatoire de 16 octets.
 * Format retourné : "saltHex:derivedHex"
 */
export function hashPin(pin: string): string {
  const clean = pin.trim();
  if (!isValidPin(clean)) {
    throw new Error("Le code PIN doit comporter 4 chiffres");
  }
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(clean, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

/**
 * Vérifie un code PIN par rapport au hash stocké en base de données.
 * Utilise timingSafeEqual pour se prémunir des attaques temporelles (timing attacks).
 */
export function verifyPin(pin: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !pin) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  try {
    const derivedHex = scryptSync(pin.trim(), salt, 32).toString("hex");
    const a = Buffer.from(derivedHex, "hex");
    const b = Buffer.from(expectedHex, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
