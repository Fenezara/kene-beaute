// GET /api/institutes?city=&q= — instituts partenaires actifs (annuaire public)
// Sécurité (t. 63-d) : select explicite — la réponse publique ne contient
// UNIQUEMENT que ce que le front consomme (BookingScreen : nom, ville, pays,
// note, nb d'avis, description, horaires + visuel calculé + compteurs).
// Jamais de ownerName/ownerPhone/phone/address/plan/commissionRate/active.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, instituteImage, slugify } from "@/lib/kene/server";

/** Champs publics d'un institut (contrat = ApiInstitute côté cliente).
 * t. 120 — `phone` (numéro OFFICIEL de l'établissement, affiché devanture :
// il alimente le bouton WhatsApp cliente → institut) et `photoData` (seul
// le booléen hasPhoto part dans la réponse — la photo binaire est servie
// par /api/media/tenant/:id) rejoignent les champs publics. Jamais
// ownerName/ownerPhone/plan/commissionRate/active. */
const PUBLIC_TENANT_SELECT = {
  id: true,
  name: true,
  city: true,
  country: true,
  phone: true,
  rating: true,
  reviewCount: true,
  description: true,
  openingHour: true,
  closingHour: true,
  photoData: true,
  _count: { select: { services: true, reviews: true } },
} as const;

export async function GET(req: NextRequest) {
  try {
    const city = req.nextUrl.searchParams.get("city")?.trim().toLowerCase() ?? "";
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const tenants = await db.tenant.findMany({
      where: { active: true },
      select: PUBLIC_TENANT_SELECT,
      orderBy: { rating: "desc" },
    });

    // SQLite : filtrage insensible à la casse/accents côté JS
    const institutes = tenants
      .filter((t) => !city || slugify(t.city).includes(slugify(city)) || t.city.toLowerCase().includes(city))
      .filter((t) => !q || slugify(t.name).includes(slugify(q)) || t.name.toLowerCase().includes(q))
      .map((t) => {
        const { photoData, ...rest } = t;
        return {
          ...rest,
          // t. 120 — photo de vitrine réelle si posée par la gérante, sinon le
          // visuel studio calculé depuis le nom
          image: photoData ? `/api/media/tenant/${t.id}` : instituteImage(t.name),
          hasPhoto: Boolean(photoData),
          // Le compteur d'avis public vient du champ marketing (seedé), pas du _count du POC
          reviewCount: t.reviewCount ?? t._count.reviews,
        };
      });

    return NextResponse.json({ institutes });
  } catch (err) {
    return serverError("institutes", err);
  }
}
