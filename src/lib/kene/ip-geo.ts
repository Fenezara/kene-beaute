// Kènè — Géolocalisation légère des IP (affichage admin & alertes).
// Service public HTTPS ipwho.is (sans clé), cache mémoire 24 h, timeout 4 s.
// Ne bloque jamais : renvoie null en cas d'échec.

export interface IpGeo {
  country: string;
  countryCode: string;
  city: string;
  isp: string;
  label: string;
}

const TTL_MS = 24 * 3_600_000;
const g = globalThis as typeof globalThis & { __keneIpGeo?: Map<string, { at: number; geo: IpGeo | null }> };

function isPrivate(ip: string): boolean {
  return (
    !ip ||
    ip === "local" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    ip.startsWith("127.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

export async function lookupIpGeo(ip: string): Promise<IpGeo | null> {
  if (isPrivate(ip)) return null;
  const cache = (g.__keneIpGeo ??= new Map());
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.geo;
  let geo: IpGeo | null = null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,country,country_code,city,connection`, {
      signal: AbortSignal.timeout(4000),
    });
    const j = (await res.json()) as {
      success?: boolean;
      country?: string;
      country_code?: string;
      city?: string;
      connection?: { isp?: string; org?: string };
    };
    if (j.success) {
      const isp = j.connection?.isp || j.connection?.org || "";
      geo = {
        country: j.country ?? "",
        countryCode: j.country_code ?? "",
        city: j.city ?? "",
        isp,
        label: [j.city, j.country].filter(Boolean).join(", ") + (isp ? ` · ${isp}` : ""),
      };
    }
  } catch {
    geo = null;
  }
  cache.set(ip, { at: Date.now(), geo });
  if (cache.size > 2000) cache.clear();
  return geo;
}

/** Géolocalise un lot d'IP (dédupliquées, max 25 pour rester sous les quotas). */
export async function lookupIpGeoBatch(ips: string[]): Promise<Record<string, IpGeo | null>> {
  const uniq = [...new Set(ips.filter((ip) => !isPrivate(ip)))].slice(0, 25);
  const out: Record<string, IpGeo | null> = {};
  await Promise.all(uniq.map(async (ip) => (out[ip] = await lookupIpGeo(ip))));
  return out;
}
