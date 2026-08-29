// GET /api/institutes?city=&q= — instituts partenaires actifs
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError, instituteImage, slugify } from "@/lib/kene/server";

export async function GET(req: NextRequest) {
  try {
    const city = req.nextUrl.searchParams.get("city")?.trim().toLowerCase() ?? "";
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() ?? "";

    const tenants = await db.tenant.findMany({
      where: { active: true },
      include: { _count: { select: { services: true, reviews: true } } },
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
