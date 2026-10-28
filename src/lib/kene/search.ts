// src/lib/kene/search.ts — Moteur de recherche universel Kènè (Noms, Téléphones, Multi-mots & Sans Accents)

/**
 * Normalise un texte pour la recherche :
 * - supprime les accents / diacritiques (é -> e, ç -> c, î -> i, è -> e...)
 * - met en minuscules
 * - normalise les apostrophes et tirets
 * - compresse les espaces multiples
 */
export function normalizeSearchText(text?: string | null): string {
  if (!text) return "";
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Supprime les diacritiques
    .toLowerCase()
    .replace(/['’`´]/g, " ") // Apostrophes en espaces
    .replace(/[-_]/g, " ")   // Tirets en espaces
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait uniquement les chiffres d'un texte (pour comparaison téléphonique).
 */
export function extractDigits(text?: string | null): string {
  if (!text) return "";
  return String(text).replace(/\D/g, "");
}

/**
 * Compare un numéro de téléphone cible avec une requête de recherche téléphonique :
 * - Gère les formats internationaux (+225 XX XX, 00225, etc.)
 * - Gère les formats locaux (01, 05, 07, etc.)
 * - Gère les espaces, tirets, points
 * - Permet la recherche par préfixe, suffixe ou sous-chaîne de 3 chiffres ou plus
 */
export function phoneMatchesQuery(phoneCandidate?: string | null, query?: string | null): boolean {
  if (!phoneCandidate || !query) return false;

  const queryDigits = extractDigits(query);
  if (queryDigits.length < 3) return false;

  const candidateDigits = extractDigits(phoneCandidate);
  if (!candidateDigits) return false;

  // 1. Correspondance directe sur la chaîne de chiffres
  if (candidateDigits.includes(queryDigits)) return true;

  // 2. Si le candidat ou la requête commence par 225 ou 00225
  const candidateLocal = candidateDigits.startsWith("225")
    ? candidateDigits.slice(3)
    : candidateDigits.startsWith("00225")
    ? candidateDigits.slice(5)
    : candidateDigits;

  const queryLocal = queryDigits.startsWith("225")
    ? queryDigits.slice(3)
    : queryDigits.startsWith("00225")
    ? queryDigits.slice(5)
    : queryDigits;

  if (candidateLocal && queryLocal) {
    if (candidateLocal.includes(queryLocal) || queryLocal.includes(candidateLocal)) return true;
  }

  // 3. Correspondance sur les 8 derniers chiffres
  if (queryDigits.length >= 6 && candidateDigits.length >= 8) {
    const candTail = candidateDigits.slice(-8);
    const queryTail = queryDigits.slice(-8);
    if (candTail.includes(queryTail) || queryTail.includes(candTail)) return true;
  }

  return false;
}

/**
 * Vérifie si une requête de recherche correspond à un ou plusieurs champs textuels ou téléphoniques.
 * 
 * Règles :
 * 1. Si `query` est vide -> MATCH (renvoie true).
 * 2. Si `query` contient des chiffres (≥ 3 chiffres) -> recherche automatique dans les cibles téléphoniques et textuelles.
 * 3. Tous les mots de la recherche (termes) doivent être présents dans la combinaison des champs cibles (ordre libre).
 * 4. Insensible aux accents (é == e, à == a) et à la casse.
 */
export function matchesSearch(
  query: string | null | undefined,
  ...targets: Array<string | number | null | undefined>
): boolean {
  if (!query || !query.trim()) return true;

  const rawQuery = query.trim();
  const normQuery = normalizeSearchText(rawQuery);
  const queryDigits = extractDigits(rawQuery);

  // Préparation des cibles
  const rawTargetStrings = targets.filter((t): t is string | number => t != null).map((t) => String(t));
  if (rawTargetStrings.length === 0) return false;

  // 1. Si la requête contient au moins 3 chiffres, tester la correspondance téléphonique sur les champs cibles
  if (queryDigits.length >= 3) {
    for (const target of rawTargetStrings) {
      if (phoneMatchesQuery(target, rawQuery)) {
        return true;
      }
    }
  }

  // 2. Test textuel multi-mots insensible aux accents
  const combinedNormTargets = rawTargetStrings.map(normalizeSearchText).join(" ");

  // Découpe la requête en mots-clés distincts
  const queryWords = normQuery.split(" ").filter((w) => w.length > 0);

  // Tous les mots de la recherche doivent apparaître dans les cibles
  const allWordsMatch = queryWords.every((word) => combinedNormTargets.includes(word));
  if (allWordsMatch) return true;

  // 3. Si la requête compactée sans espaces est contenue dans une cible compactée
  const compactQuery = normQuery.replace(/\s+/g, "");
  const compactTargets = combinedNormTargets.replace(/\s+/g, "");
  if (compactQuery.length >= 2 && compactTargets.includes(compactQuery)) return true;

  return false;
}
