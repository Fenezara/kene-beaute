// GET /api/media/:type/:id — service d'images Kènè (t. 120).
// Sert les photos uploadées (data URL stockées en base) en vraies réponses
// image cacheables : vitrine institut, produits, soins, avatar cliente.
// Pourquoi une route dédiée plutôt que d'embarquer les data URLs dans les
// payloads JSON : les listes (boutique, annuaire, catalogue) restent légères,
// le navigateur met la réponse en cache (ETag = type-id-taille).
// Sécurité : lecture publique assumée — ce sont des visuels VITRINE (pas des
// photos de diagnostic, qui ne quittent jamais l'espace propriétaire) ; les
// identifiants sont des cuids non énumérables. 404 net si pas de photo.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await ctx.params;
  try {
    if (!/^[a-z]+$/.test(type) || !/^[a-zA-Z0-9]+$/.test(id)) {
      return new NextResponse("Requête invalide", { status: 400 });
    }

    let dataUrl: string | null | undefined;
    switch (type) {
      case "tenant":
        dataUrl = (await db.tenant.findUnique({ where: { id }, select: { photoData: true } }))?.photoData;
        break;
      case "product":
        dataUrl = (await db.product.findUnique({ where: { id }, select: { photoData: true } }))?.photoData;
        break;
      case "service":
        dataUrl = (await db.service.findUnique({ where: { id }, select: { photoData: true } }))?.photoData;
        break;
      case "user":
        dataUrl = (await db.user.findUnique({ where: { id }, select: { avatarData: true } }))?.avatarData;
        break;
      default:
        return new NextResponse("Type de média inconnu", { status: 404 });
    }

    if (!dataUrl) return new NextResponse("Aucune photo", { status: 404 });

    const m = DATA_URL_RE.exec(dataUrl);
    if (!m) return new NextResponse("Photo illisible", { status: 404 });

    const [, mime, b64] = m;
    const bytes = Buffer.from(b64, "base64");
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes.byteLength),
        // Photo réputée immuable : chaque nouvelle photo écrase la colonne et
        // l'ETag (type-id-taille) change — le cache navigateur se rafraîchit
        // seul, sans staleness visible.
        "Cache-Control": "public, max-age=86400, must-revalidate",
        ETag: `"${type}-${id}-${bytes.byteLength}"`,
      },
    });
  } catch {
    // Id introuvable / base occupée : 404 sobre, jamais de 500 bruyant
    return new NextResponse("Photo indisponible", { status: 404 });
  }
}
