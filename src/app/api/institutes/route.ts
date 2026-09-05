// GET /api/institutes?city=&q= — instituts partenaires actifs (annuaire public)
// Sécurité (t. 63-d) : select explicite — la réponse publique ne contient
// UNIQUEMENT que ce que le front consomme (BookingScreen : nom, ville, pays,
// note, nb d'avis, description, horaires + visuel calculé + compteurs).
// Jamais de ownerName/ownerPhone/phone/address/plan/commissionRate/active.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, instituteImage, slugify } from "@/lib/kene/server";

/** Champs publics d'un institut (contrat = ApiInstitute côté cliente). */
const PUBLIC_TENANT_SELECT = {
  id: true,
  name: true,
  city: true,
  country: true,
  rating: true,
  reviewCount: true,
  description: true,
  openingHour: true,
  closingHour: true,
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
      .map((t) => ({
        ...t,
        image: instituteImage(t.name),
        // Le compteur d'avis public vient du champ marketing (seedé), pas du _count du POC
        reviewCount: t.reviewCount ?? t._count.reviews,
      }));

    return NextResponse.json({ institutes });
  } catch (err) {
    return serverError("institutes", err);
  }
}
