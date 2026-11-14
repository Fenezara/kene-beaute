// Kènè — Intelligence Exposome Africain Temps Réel (UV, Harmattan, Hygrométrie, Poussières PM10)
// Corrèle l'analyse cutanée et la prescription dermo-botanique aux conditions météo/climatiques réelles
// d'Afrique de l'Ouest (Abidjan par défaut, Dakar, Bamako, Ouagadougou, Cotonou, Lomé, Douala).
// Zéro clé API requise (Open-Meteo REST) + Cache mémoire 1h + Fallback saisonnier instantané.

export interface ExposomeContext {
  city: string;
  tempC: number;
  humidityPct: number;
  uvIndex: number;
  pm10: number;
  harmattanActive: boolean;
  humidHeatActive: boolean;
  highUvActive: boolean;
  promptSummary: string;
  hygieneTip: string;
}

const CITY_COORDS: Record<string, { name: string; lat: number; lon: number }> = {
  abidjan: { name: "Abidjan", lat: 5.36, lon: -4.008 },
  dakar: { name: "Dakar", lat: 14.7167, lon: -17.4677 },
  bamako: { name: "Bamako", lat: 12.6392, lon: -8.0029 },
  ouagadougou: { name: "Ouagadougou", lat: 12.3714, lon: -1.5197 },
  cotonou: { name: "Cotonou", lat: 6.3654, lon: 2.4183 },
  lome: { name: "Lomé", lat: 6.1375, lon: 1.2123 },
  douala: { name: "Douala", lat: 4.0511, lon: 9.7679 },
};

const g = globalThis as typeof globalThis & {
  __keneExposomeCache?: Map<string, { expiresAt: number; data: ExposomeContext }>;
};
const cache = (g.__keneExposomeCache ??= new Map());
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 heure

function buildExposomeFromValues(
  city: string,
  tempC: number,
  humidityPct: number,
  uvIndex: number,
  pm10: number,
): ExposomeContext {
  const harmattanActive = humidityPct < 50 || pm10 >= 65;
  const humidHeatActive = humidityPct >= 75 && tempC >= 27;
  const highUvActive = uvIndex >= 7;

  const risks: string[] = [];
  if (harmattanActive) {
    risks.push(
      `alerte Harmattan/poussières (PM10=${Math.round(pm10)} µg/m³, humidité=${Math.round(humidityPct)}% → perte insensible en eau accrue, voile cendré et micro-particules comédogènes)`,
    );
  } else if (humidHeatActive) {
    risks.push(
      `chaleur tropicale humide (${Math.round(tempC)}°C, humidité=${Math.round(humidityPct)}% → hyperséborrhée réactionnelle en zone T et macération sudorale)`,
    );
  }
  if (highUvActive) {
    risks.push(
      `indice UV élevé (${uvIndex.toFixed(1)} → risque fort de rebond mélanique PIH/mélasma sur phototypes IV-VI)`,
    );
  }

  const riskText =
    risks.length > 0
      ? risks.join(" ; ")
      : `climat équatorial modéré (${Math.round(tempC)}°C, humidité ${Math.round(humidityPct)}%, UV ${uvIndex.toFixed(1)})`;

  const promptSummary = `\nExposome environnemental en direct (${city}) : ${riskText}.`;

  let hygieneTip =
    "Protéger les zones hyperpigmentées avec un écran solaire SPF 50+ invisible adapté aux peaux mélanodermes";
  if (harmattanActive) {
    hygieneTip = `Climat sec / Harmattan actif (${Math.round(humidityPct)}% d'humidité) : double nettoyage doux le soir pour éliminer les poussières fines et sceller l'hydratation au beurre de karité ou huile de baobab sur peau humide`;
  } else if (humidHeatActive) {
    hygieneTip = `Chaleur humide (${Math.round(tempC)}°C · ${Math.round(humidityPct)}% d'humidité) : privilégier des émulsions fluides matifiantes non-comédogènes le matin et éponger la sueur par tapotement sans frotter`;
  }

  return {
    city,
    tempC: Math.round(tempC * 10) / 10,
    humidityPct: Math.round(humidityPct),
    uvIndex: Math.round(uvIndex * 10) / 10,
    pm10: Math.round(pm10),
    harmattanActive,
    humidHeatActive,
    highUvActive,
    promptSummary,
    hygieneTip,
  };
}

/** Fallback saisonnier instantané pour l'Afrique de l'Ouest (zéro latence réseau). */
export function getSeasonalFallbackExposome(cityKey = "abidjan"): ExposomeContext {
  const target = CITY_COORDS[cityKey.toLowerCase()] ?? CITY_COORDS.abidjan;
  const month = new Date().getUTCMonth(); // 0=Jan .. 11=Dec
  const hour = new Date().getUTCHours();
  const isDaytime = hour >= 8 && hour <= 17;
  // Décembre à Février : saison sèche & Harmattan
  const isHarmattanSeason = month === 11 || month === 0 || month === 1;

  const tempC = isHarmattanSeason ? 30 : 28.5;
  const humidityPct = isHarmattanSeason ? 46 : 79;
  const uvIndex = isDaytime ? (isHarmattanSeason ? 8.5 : 9.2) : 1.0;
  const pm10 = isHarmattanSeason ? 78 : 28;

  return buildExposomeFromValues(target.name, tempC, humidityPct, uvIndex, pm10);
}

/**
 * Récupère en < 1.2s (ou instantanément depuis le cache 1h) l'exposome climatique africain réel.
 */
export async function getAfricanExposomeContext(cityHint = "abidjan"): Promise<ExposomeContext> {
  const normalizedKey =
    Object.keys(CITY_COORDS).find((k) => cityHint.toLowerCase().includes(k)) ?? "abidjan";
  const now = Date.now();
  const cached = cache.get(normalizedKey);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const target = CITY_COORDS[normalizedKey] ?? CITY_COORDS.abidjan;
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${target.lat}&longitude=${target.lon}&current=temperature_2m,relative_humidity_2m,uv_index&timezone=GMT`;
    const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${target.lat}&longitude=${target.lon}&current=pm10&timezone=GMT`;

    const [wRes, aRes] = await Promise.all([
      fetch(weatherUrl, { signal: AbortSignal.timeout(1200) }).catch(() => null),
      fetch(airUrl, { signal: AbortSignal.timeout(1200) }).catch(() => null),
    ]);

    if (!wRes || !wRes.ok) {
      const fb = getSeasonalFallbackExposome(normalizedKey);
      cache.set(normalizedKey, { expiresAt: now + 10 * 60_000, data: fb });
      return fb;
    }

    const wJson = (await wRes.json().catch(() => null)) as {
      current?: { temperature_2m?: number; relative_humidity_2m?: number; uv_index?: number };
    } | null;
    const aJson = aRes?.ok
      ? ((await aRes.json().catch(() => null)) as { current?: { pm10?: number } } | null)
      : null;

    const tempC = typeof wJson?.current?.temperature_2m === "number" ? wJson.current.temperature_2m : 29;
    const humidityPct =
      typeof wJson?.current?.relative_humidity_2m === "number" ? wJson.current.relative_humidity_2m : 76;
    const uvIndex = typeof wJson?.current?.uv_index === "number" ? wJson.current.uv_index : 7.5;
    const pm10 = typeof aJson?.current?.pm10 === "number" ? aJson.current.pm10 : 32;

    const data = buildExposomeFromValues(target.name, tempC, humidityPct, uvIndex, pm10);
    cache.set(normalizedKey, { expiresAt: now + CACHE_TTL_MS, data });
    return data;
  } catch {
    const fb = getSeasonalFallbackExposome(normalizedKey);
    cache.set(normalizedKey, { expiresAt: now + 10 * 60_000, data: fb });
    return fb;
  }
}
