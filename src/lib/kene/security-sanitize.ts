// src/lib/kene/security-sanitize.ts — Défense contre la pollution de prototype et payloads toxiques.
// Protection enterprise contre __proto__, constructor et prototype injection.

const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Nettoie récursivement un objet ou tableau pour supprimer toute clé dangereuse
 * susceptible de polluer Object.prototype (__proto__, constructor, prototype).
 * Préserve l'intégrité des dates, regex et primitives.
 */
export function sanitizePayload<T>(input: T): T {
  if (input === null || typeof input !== "object") {
    return input;
  }

  // Préservation des types natifs spéciaux
  if (input instanceof Date || input instanceof RegExp) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizePayload(item)) as unknown as T;
  }

  const cleanObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (BLOCKED_KEYS.has(key)) {
      continue;
    }
    cleanObj[key] = sanitizePayload(value);
  }
  return cleanObj as T;
}

/**
 * Parse du JSON de façon sécurisée avec protection anti-prototype pollution.
 */
export function safeJsonParse<T = unknown>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw);
    return sanitizePayload(parsed) as T;
  } catch {
    return null;
  }
}
