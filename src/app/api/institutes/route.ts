// GET /api/institutes?city=&q= — instituts partenaires actifs (annuaire public)
// Sécurité: select explicite — la réponse publique ne contient
// UNIQUEMENT que ce que le front consomme (BookingScreen: nom, ville, pays,
// note, nb d'avis, description, horaires + visuel calculé + compteurs).
// Jamais de ownerName/ownerPhone/phone/address/plan/commissionRate/active.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, instituteImage, slugify } from "@/lib/kene/server";

/** Champs publics d'un institut (contrat = ApiInstitute côté cliente).
 * — `phone` (numéro OFFICIEL de l'établissement, affiché devanture:
// il alimente le bouton WhatsApp cliente → institut) et `photoData` (seul
// le booléen hasPhoto part dans la réponse — la photo binaire est servie
// par /api/media/tenant/:id) rejoignent les champs publics. Jamais
// ownerName/ownerPhone/plan/commissionRate/active. */
const PUBLIC_TENANT_SELECT = {
  id: true,
  name: true,
  city: true,
  address: true,
  country: true,
  phone: true,
  ownerName: true,
  ownerPhone: true,
  rating: true,
  reviewCount: true,
  description: true,
  openingHour: true,
  closingHour: true,
  photoData: true,
  _count: { select: { services: true, reviews: true } },
} as const;

// Coordonnées de référence des quartiers phares d'Abidjan et Dakar
const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  cocody: { lat: 5.3599, lng: -3.9870 },
  vallon: { lat: 5.3620, lng: -3.9880 },
  riviera: { lat: 5.3650, lng: -3.9550 },
  marcory: { lat: 5.3044, lng: -3.9825 },
  zone4: { lat: 5.2950, lng: -3.9780 },
  plateau_abidjan: { lat: 5.3261, lng: -4.0197 },
  yopougon: { lat: 5.3420, lng: -4.0830 },
  almadies: { lat: 14.7436, lng: -17.5147 },
  ngor: { lat: 14.7540, lng: -17.5160 },
  mermoz: { lat: 14.7080, lng: -17.4720 },
  dakar_plateau: { lat: 14.6708, lng: -17.4381 },
};

export function getTenantCoords(city: string, address?: string | null): { lat: number; lng: number } {
  const text = `${city} ${address ?? ""}`.toLowerCase();
  if (text.includes("almadie") || text.includes("ngor")) return DISTRICT_COORDS.almadies;
  if (text.includes("dakar") && text.includes("plateau")) return DISTRICT_COORDS.dakar_plateau;
  if (text.includes("mermoz")) return DISTRICT_COORDS.mermoz;
  if (text.includes("dakar")) return DISTRICT_COORDS.dakar_plateau;
  if (text.includes("zone 4") || text.includes("zone4")) return DISTRICT_COORDS.zone4;
  if (text.includes("marcory")) return DISTRICT_COORDS.marcory;
  if (text.includes("riviera")) return DISTRICT_COORDS.riviera;
  if (text.includes("vallon")) return DISTRICT_COORDS.vallon;
  if (text.includes("plateau")) return DISTRICT_COORDS.plateau_abidjan;
  if (text.includes("yopougon")) return DISTRICT_COORDS.yopougon;
  return DISTRICT_COORDS.cocody;
}

/** Distance orthodromique en kilomètres via la formule de Haversine */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export async function GET(req: NextRequest) {
  try {
    const city = req.nextUrl.searchParams.get("city")?.trim().toLowerCase() ?? "";
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";
    const latParam = req.nextUrl.searchParams.get("lat");
    const lngParam = req.nextUrl.searchParams.get("lng");
    const userLat = latParam ? parseFloat(latParam) : null;
    const userLng = lngParam ? parseFloat(lngParam) : null;
    const hasUserCoords = userLat !== null && !isNaN(userLat) && userLng !== null && !isNaN(userLng);

    const tenants = await db.tenant.findMany({
      where: { active: true },
      select: PUBLIC_TENANT_SELECT,
      orderBy: { rating: "desc" },
    });

    // SQLite: filtrage insensible à la casse/accents côté JS
    let institutes = tenants
      .filter((t) => !city || slugify(t.city).includes(slugify(city)) || t.city.toLowerCase().includes(city) || (t.address && t.address.toLowerCase().includes(city)))
      .filter((t) => !q || slugify(t.name).includes(slugify(q)) || t.name.toLowerCase().includes(q) || (t.address && t.address.toLowerCase().includes(q)))
      .map((t) => {
        const { photoData, ...rest } = t;
        const coords = getTenantCoords(t.city, t.address);
        const distanceKm = hasUserCoords ? haversineKm(userLat!, userLng!, coords.lat, coords.lng) : null;

        return {
          ...rest,
          coords,
          distanceKm,
          image: photoData ? `/api/media/tenant/${t.id}` : instituteImage(t.name),
          hasPhoto: Boolean(photoData),
          reviewCount: t.reviewCount ?? t._count.reviews,
        };
      });

    // Si géolocalisé, trier par distance croissante (les plus proches en premier)
    if (hasUserCoords) {
      institutes = institutes.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    }

    return NextResponse.json({ institutes });
  } catch (err) {
    return serverError("institutes", err);
  }
}
