// GET /api/testimonials — le Cercle Kènè (, vague 3).
// Le cercle des témoignages: les voix de celles qui tissent avant. Contenu
// PUBLIC — aucune auth, aucune donnée personnelle
// réelle (prénom + initiale, villes ivoiriennes variées, parcours cohérents
// avec l'app: PIH, mélasma, DPN, alopécie de traction, teigne, barrière,
// acné dorsale). Seed paresseux: si la table est vide, les 8 voix sont
// insérées au premier appel puis servies telles quelles (jamais re-seedées).
// Cache public 5 min — ce contenu ne change qu'à la main (BO plus tard).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serverError } from "@/lib/kene/server";

export const dynamic = "force-dynamic"; // contenu vivant en base → jamais de cache statique Next

/** Les 8 voix du cercle — parcours réalistes, alignés sur l'app réelle. */
const SEED_TESTIMONIALS: {
  author: string;
  city: string;
  zone: string | null;
  text: string;
  months: number;
  rating: number;
  threads: number | null;
}[] = [
  {
    author: "Aminata K.",
    city: "Cocody",
    zone: "visage",
    text: "Mes boutons laissaient des taches brunes à chaque fois. Avec le rituel du soir et l'écran solaire chaque matin, mes taches s'atténuent semaine après semaine. Le scanner me montre le chemin, je ne change plus rien.",
    months: 6,
    rating: 5,
    threads: 12,
  },
  {
    author: "Mariam D.",
    city: "Yamoussoukro",
    zone: "visage",
    text: "Mon mélasma revenait dès que j'arrêtais tout. Depuis huit mois, l'écran solaire teintée est mon geste non négociable, même en voiture. Les zones foncées ont nettement pâli, sans produit agressif.",
    months: 8,
    rating: 5,
    threads: 15,
  },
  {
    author: "Awa T.",
    city: "Yopougon",
    zone: "visage",
    text: "Mes petites perles sur les joues me complexiaient depuis l'adolescence. L'appli m'a orientée vers un institut partenaire, les DPN ont été retirées en deux séances. Le diagnostic avait tout prévu.",
    months: 5,
    rating: 4,
    threads: null,
  },
  {
    author: "Fatou B.",
    city: "Bouaké",
    zone: "cuir chevelu",
    text: "Le diagnostic a vu mes débuts d'alopécie de traction avant moi — mes nattes trop serrées. J'ai changé mes habitudes à temps, les repousses sont là. Sans ce scan, j'aurais continué à casser mes cheveux.",
    months: 3,
    rating: 5,
    threads: 6,
  },
  {
    author: "Chantal A.",
    city: "Marcory",
    zone: "cuir chevelu",
    text: "Le scanner a repéré la teigne de mon petit fils derrière l'oreille. L'appli nous a dit de voir un dermatologue sans attendre. Traitement pris à temps, plus de plaques. Kènè veille pour toute la famille.",
    months: 2,
    rating: 4,
    threads: null,
  },
  {
    author: "Rokia S.",
    city: "Daloa",
    zone: "corps",
    text: "Mon savon dur me desséchait sans que je comprenne pourquoi. J'ai arrêté, passé au beurre de karité brut le soir. En trois mois, ma barrière s'est réparée, ma peau ne tire plus du tout après la douche.",
    months: 4,
    rating: 5,
    threads: null,
  },
  {
    author: "Esther N.",
    city: "San-Pédro",
    zone: "dos",
    text: "Mon dos se couvrait de boutons avant chaque saison des robes. Le rituel gommage puis sérum a assaini tout ça en un trimestre. Cet été, j'ai porté mes robes dos nu sans complexe.",
    months: 4,
    rating: 5,
    threads: 8,
  },
  {
    author: "Bineta F.",
    city: "Dakar",
    zone: "visage",
    text: "Je ne me gratte plus les boutons depuis que je comprends le PIH. Je sais maintenant qu'une croûte brune reste des mois, qu'un bouton pressé marque pour longtemps. Je laisse ma peau faire, elle me le rend bien.",
    months: 2,
    rating: 5,
    threads: 5,
  },
];

export async function GET() {
  try {
    // Seed paresseux: au tout premier appel (table vide), on installe le
    // cercle. La condition count === 0 garantit qu'on ne re-seed JAMAIS
    // par la suite (les appels suivants ne font que lire).
    const count = await db.testimonial.count();
    if (count === 0) {
      await db.testimonial.createMany({ data: SEED_TESTIMONIALS });
    }

    const testimonials = await db.testimonial.findMany({
      where: { featured: true },
      orderBy: { createdAt: "asc" }, // la voix la plus ancienne ouvre le cercle
    });

    return NextResponse.json(
      { testimonials },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    return serverError("testimonials:get", err);
  }
}
