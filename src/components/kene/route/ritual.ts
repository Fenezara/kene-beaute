// Kènè — La Route de l'Or : logique pure du rituel tissé (Phase C)
// Le diagnostic désigne des priorités → la route les organise en stations
// → chaque station choisit des produits → le tissage final les relie.
import type { DiagnosisResult, Indicator } from "@/lib/kene/types";
import type { ApiProduct } from "@/components/kene/client/types";

/* ─────────────── Matching flou produit (partagé avec le diagnostic) ─────────────── */

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
}

/** Match une recommandation libre (« Sérum Moringa éclat ») avec un produit boutique */
export function matchProduct(rec: string, products: ApiProduct[]): ApiProduct | null {
  const words = norm(rec).split(" ").filter((w) => w.length >= 5);
  let best: { p: ApiProduct; score: number } | null = null;
  for (const p of products) {
    const target = `${norm(p.name)} ${norm(p.botanicals)} ${norm(p.description)}`;
    let score = 0;
    for (const w of words) if (target.includes(w)) score += 1;
    if (score > 0 && (!best || score > best.score)) best = { p, score };
  }
  return best?.p ?? null;
}

/* ─────────────── Stations ─────────────── */

export type StationId = "purifier" | "soigner" | "nourrir" | "proteger";

export interface StationDef {
  id: StationId;
  label: string;
  verb: string;
  poem: string;
  /** couleur du fil dans le tissage + accents UI */
  thread: string;
  threadSoft: string;
  botanical: string;
  /** catégories boutique acceptées en fallback */
  categories: string[];
  /** mots-clés d'indicateurs ciblés par cette station */
  indicatorKeys: string[];
  /** usage — étiquettes du rituel */
  matin: boolean;
  soir: boolean;
}

/** Les 4 stations de soin, dans l'ordre du rituel */
export const STATIONS: StationDef[] = [
  {
    id: "purifier",
    label: "Purifier",
    verb: "Laver le lin de ta peau",
    poem: "Le savon noir lave les mains qui tissent. Rien ne se construit sur une toile sale.",
    thread: "#8B1A3B",
    threadSoft: "rgba(139,26,59,0.14)",
    botanical: "Bissap & cacao",
    categories: ["savon", "gommage"],
    indicatorKeys: ["texture", "pores", "noirs", "kystes", "sebum", "acne", "desquamation", "rugosite", "incarne", "folliculite"],
    matin: true,
    soir: true,
  },
  {
    id: "soigner",
    label: "Soigner",
    verb: "Viser les taches",
    poem: "Le moringa réveille l'éclat qui dort. Chaque tache raconte une inflammation passée — on l'apaise, on l'efface.",
    thread: "#3F7D3F",
    threadSoft: "rgba(63,125,63,0.14)",
    botanical: "Moringa & vitamine C",
    categories: ["serum"],
    indicatorKeys: ["taches", "pih", "melasma", "hyperpigmentation", "acne", "rougeurs", "inflammation", "cernes", "eclat", "uniformite", "alopeciques"],
    matin: true,
    soir: true,
  },
  {
    id: "nourrir",
    label: "Nourrir",
    verb: "Sceller l'eau",
    poem: "Le karité scelle l'eau de ta peau comme un bijou dans son écrin. La nuit, le tissage se répare.",
    thread: "#C8951E",
    threadSoft: "rgba(200,149,30,0.16)",
    botanical: "Karité & baobab",
    categories: ["creme", "huile", "masque"],
    indicatorKeys: ["hydratation", "barriere", "secheresse", "elasticite", "fermete", "callosites", "ongles"],
    soir: true,
    matin: false,
  },
  {
    id: "proteger",
    label: "Protéger",
    verb: "Tenir le soleil à distance",
    poem: "Le soleil d'Abidjan respecte celles qui s'apprêtent. Sans écran, chaque tache gagnée se rejoue au prochain midi.",
    thread: "#E07A2B",
    threadSoft: "rgba(224,122,43,0.16)",
    botanical: "Filtres minéraux",
    categories: ["creme"],
    indicatorKeys: ["hyperpigmentation", "melasma", "taches", "eclat"],
    matin: true,
    soir: false,
  },
];

/** un produit retenu dans une station, avec son pourquoi */
export interface StationPick {
  product: ApiProduct;
  /** indicateur ciblé (le plus faible parmi les cibles de la station) */
  target: Indicator | null;
  /** le produit vient-il de la recommandation IA (VLM) ? */
  fromAi: boolean;
}

export interface RitualStation {
  def: StationDef;
  picks: StationPick[];
  /** indicateurs les plus faibles ciblés par la station (affichés même sans produit) */
  focus: Indicator[];
}

export interface Ritual {
  stations: RitualStation[];
  soins: string[];
  score: number;
  zone: string;
}

/** Indicateurs cibles triés par santé croissante (les plus faibles d'abord) */
function stationFocus(def: StationDef, indicators: Indicator[]): Indicator[] {
  return indicators
    .filter((i) => def.indicatorKeys.some((k) => norm(i.nom).includes(k)))
    .sort((a, b) => a.pourcentage - b.pourcentage)
    .slice(0, 2);
}

function isSunProduct(p: ApiProduct): boolean {
  const t = norm(`${p.name} ${p.description}`);
  return t.includes("solaire") || t.includes("spf");
}

/** Construit le rituel complet à partir d'un diagnostic + catalogue boutique */
export function buildRitual(result: DiagnosisResult, products: ApiProduct[]): Ritual {
  // 1. produits matchés depuis les recommandations IA (flou)
  const aiProducts: ApiProduct[] = [];
  for (const rec of result.recommandations.produits) {
    const m = matchProduct(rec, products);
    if (m && !aiProducts.some((p) => p.id === m.id)) aiProducts.push(m);
  }

  const byCat = (cats: string[], exclude: string[]) =>
    products.filter((p) => cats.includes(p.category) && !exclude.includes(p.id)).sort((a, b) => b.rating - a.rating);

  const used: string[] = [];
  const stations: RitualStation[] = STATIONS.map((def) => {
    const focus = stationFocus(def, result.indicateurs);
    // IA d'abord : produits recommandés dont la catégorie colle à la station.
    // Un produit n'apparaît qu'une fois dans tout le rituel ; un solaire
    // n'appartient qu'à la station Protéger.
    const aiPool = aiProducts.filter(
      (p) =>
        !used.includes(p.id) &&
        (def.id === "proteger"
          ? isSunProduct(p) && def.categories.includes(p.category)
          : def.categories.includes(p.category) && !isSunProduct(p))
    );
    const picks: StationPick[] = [];
    for (const p of aiPool.slice(0, 2)) {
      picks.push({ product: p, target: focus[0] ?? null, fromAi: true });
      used.push(p.id);
    }
    // fallback boutique (et pour protéger : uniquement un vrai solaire)
    if (picks.length === 0) {
      const pool =
        def.id === "proteger"
          ? byCat(["creme"], used).filter(isSunProduct)
          : byCat(def.categories, used).filter((p) => !isSunProduct(p));
      const best = pool.slice(0, def.id === "proteger" ? 1 : 2);
      for (const p of best) {
        picks.push({ product: p, target: focus[0] ?? null, fromAi: false });
        used.push(p.id);
      }
    }
    return { def, picks, focus };
  });

  return {
    stations,
    soins: result.recommandations.soins_conseilles.slice(0, 3),
    score: result.score_global,
    zone: result.zone,
  };
}

/** Total des produits du rituel (ceux que la cliente garde) */
export function ritualTotal(picks: StationPick[]): number {
  return picks.reduce((s, p) => s + p.product.price, 0);
}

/** éclaircit (amt>0) ou assombrit (amt<0) une couleur hex — util dessin partagé */
export function shade(hex: string, amt: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
  return `#${((f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, "0")}`;
}

export const GOLD = "#C8951E";
export const MELANINE = "#1A1410";
export const CREME = "#F8F1E4";
