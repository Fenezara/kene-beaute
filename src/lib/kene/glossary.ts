// Kènè — glossaire 1 tap : définition SIMPLE de chaque indicateur du diagnostic.
// Lib PURE (aucune dépendance React). Cible : semi-lettrées et non-lectrices —
// phrases courtes, mots du quotidien, zéro jargon médical non expliqué.
// Les définitions sont aussi lues par TTS (SpeakButton) — rester < 1024 chars.

export interface GlossaryEntry {
  title: string; // titre propre à afficher
  simple: string; // définition 1-3 phrases, mots simples
}

/** Normalisation : minuscules, sans accents, sans ponctuation, espaces simples. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const G: Record<string, GlossaryEntry> = {
  hydratation: {
    title: "Hydratation",
    simple:
      "C'est l'eau que garde ta peau. Une peau bien hydratée est souple et douce, sans tiraillement. Quand le niveau est bas, la peau tire et pèle par petites plaques.",
  },
  barriere_cutanee: {
    title: "Barrière cutanée",
    simple:
      "C'est le bouclier de surface de ta peau. Il protège des agressions du dehors (soleil, poussières, savons) et garde l'eau au dedans. Quand il est faible, la peau devient sensible, sèche et réactive.",
  },
  elasticite_fermete: {
    title: "Élasticité / Fermeté",
    simple:
      "La capacité de ta peau à revenir en place quand tu la pinces. C'est elle qui garde le visage ferme et tonique. Elle diminue avec l'âge et le soleil.",
  },
  eclat_uniformite: {
    title: "Éclat / Uniformité du teint",
    simple:
      "Un teint lumineux et d'une seule couleur, sans zones sombres ou grises. Il se perd quand des taches s'installent ou que la peau est fatiguée.",
  },
  texture_pores: {
    title: "Texture / Pores dilatés",
    simple:
      "Le toucher de ta peau : lisse, ou avec du relief et des petits trous ouverts (pores). Les pores s'ouvrent avec l'excès de sébum et avec l'âge.",
  },
  points_noirs: {
    title: "Points noirs & microkystes",
    simple:
      "Des petites bouchées d'huile dans les pores. Le point noir s'ouvre à l'air et noircit. Le microkyste reste fermé sous la peau, en petite boule blanche.",
  },
  acne_active: {
    title: "Acné active (papules / pustules)",
    simple:
      "Des boutons rouges, parfois avec du blanc au sommet. C'est une inflammation des pores. « Active » veut dire : boutons présents maintenant, pas juste des marques anciennes.",
  },
  taches_pih: {
    title: "Taches PIH (post-inflammatoires)",
    simple:
      "Des taches brunes qui restent APRÈS un bouton, une piqûre ou une gratture. Très fréquentes sur peau noire : en réparant, la peau fabrique trop de pigment. Elles s'atténuent avec le temps et des soins doux — ne pas les gratter.",
  },
  melasma: {
    title: "Mélasma",
    simple:
      "Taches brunes symétriques, souvent sur les joues, le front ou la mâchoire. Liées aux hormones (grossesse, pilule) et au soleil. Bénignes mais tenaces : la protection solaire est indispensable.",
  },
  hyperpigmentation_globale: {
    title: "Hyperpigmentation globale",
    simple:
      "Le teint devient plus foncé de façon large, par zones. Causes fréquentes : soleil, inflammation, ou produits trop agressifs pour la peau noire.",
  },
  rougeurs_inflammation: {
    title: "Rougeurs / Inflammation",
    simple:
      "La peau est irritée : elle rosit, chauffe parfois, picote. Souvent une réaction à un produit, au soleil, ou au frottement.",
  },
  sebum: {
    title: "Excès de sébum",
    simple:
      "Le sébum est l'huile naturelle de la peau — elle en a besoin. En excès, la peau brille, les pores se bouchent et les boutons apparaissent.",
  },
  cernes_poches: {
    title: "Cernes & poches",
    simple:
      "Les ombres ou gonflements sous les yeux. Causes fréquentes : fatigue, manque de sommeil, manque d'eau, ou frottement des yeux.",
  },
  dpn_keratoses: {
    title: "DPN / Kératoses",
    simple:
      "DPN : petites excroissances noires et lisses, très fréquentes sur peau noire (joues, cou) — bénignes. Kératoses : zones de peau épaissie et rugueuse. Un dermatologue peut les retirer si elles gênent.",
  },
  acne_dorsale: {
    title: "Acné dorsale",
    simple:
      "Boutons et points noirs sur le dos. Souvent liés à la sueur, aux vêtements serrés et à l'excès de sébum. Se laver après la sport et porter du coton large aide.",
  },
  texture_rugosite: {
    title: "Texture / Rugosité",
    simple:
      "Peau rêche au toucher, avec du relief irrégulier. Souvent signe de sécheresse ou d'accumulation de peaux mortes.",
  },
  desquamation: {
    title: "Desquamation (pellicules)",
    simple:
      "Des petites peaux mortes qui se détachent. Sur le cuir chevelu, ce sont les pellicules. Causes : sécheresse, excès de sébum, ou un champignon. Un shampoing adapté calme ça.",
  },
  folliculite: {
    title: "Folliculite",
    simple:
      "Petits boutons ou rougeurs à la base d'un poil : le pore du poil est irrité ou infecté. Fréquent après le rasage ou l'épilation. Éviter de percer, désinfecter doucement.",
  },
  secheresse: {
    title: "Sécheresse cutanée",
    simple:
      "Manque d'eau et de gras : la peau tire, démange et peut peler. Renforcée par les savons durs, les douches très chaudes et le climat sec. Une crème grasse répare.",
  },
  taches_alopeciques: {
    title: "Taches alopeciques",
    simple:
      "Zones où les cheveux tombent ou cassent, souvent rondes. Causes possibles : inflammation, tresses trop serrées, ou carence. À faire examiner si la zone s'agrandit.",
  },
  kératose_callosites: {
    title: "Kératose / Callosités",
    simple:
      "Peau épaissie et dure aux points de frottement (paumes, doigts, talons). C'est une protection naturelle, mais ça peut gêner. Adoucir avec de la crème épaisse.",
  },
  taches_pigmentaires: {
    title: "Taches pigmentaires",
    simple:
      "Zones plus foncées que ton teint : taches d'âge, de soleil, ou laissées par une blessure. La peau noire marque très facilement — d'où l'importance de ne pas gratter les boutons.",
  },
  etat_ongles: {
    title: "État des ongles",
    simple:
      "La santé de tes ongles : couleur, cassure, taches blanches, décollement. Ça reflète parfois un manque (fer) ou une mycose.",
  },
  irritation_eczema: {
    title: "Irritation / Eczéma",
    simple:
      "Eczéma : peau sèche qui démange et rougit par crises. Irritation : réaction à un produit. Les deux demandent de la douceur (savon sans savon, crème hydratante).",
  },
  poils_incarnes: {
    title: "Poils incarnés",
    simple:
      "Un poil qui repousse sous la peau au lieu de sortir : petite bosse, parfois rouge. Très fréquent après le rasage sur cheveux crépus. Exfolier doucement et raser dans le sens du poil aide.",
  },
  abcde_a: {
    title: "Asymétrie (règle ABCDE)",
    simple:
      "Règle ABCDE — A comme Asymétrie : une tache dont les deux moitiés ne se ressemblent pas. C'est un signe à montrer à un dermatologue.",
  },
  abcde_b: {
    title: "Bords irréguliers (règle ABCDE)",
    simple:
      "Règle ABCDE — B comme Bords : les contours de la tache sont déchiquetés ou flous, au lieu d'être nets et réguliers. À montrer à un dermatologue.",
  },
  abcde_c: {
    title: "Couleurs multiples (règle ABCDE)",
    simple:
      "Règle ABCDE — C comme Couleur : la tache montre plusieurs couleurs (marron, noir, rouge, blanc) au lieu d'une seule. À montrer à un dermatologue.",
  },
  abcde_d: {
    title: "Diamètre > 6 mm (règle ABCDE)",
    simple:
      "Règle ABCDE — D comme Diamètre : la tache fait plus de 6 millimètres, environ la gomme au bout d'un crayon. À montrer à un dermatologue.",
  },
  abcde_e: {
    title: "Évolution (règle ABCDE)",
    simple:
      "Règle ABCDE — E comme Évolution : la tache change avec le temps — taille, forme, couleur, ou elle gratte/saigne. C'est le signe le plus important : montre-la à un dermatologue.",
  },
};

/** Alias nom complet → clé canonique (variantes de zones). */
const EXACT: Record<string, string> = {
  "hydratation": "hydratation",
  "hydratation du dos": "hydratation",
  "hydratation de la zone": "hydratation",
  "barriere cutanee": "barriere_cutanee",
  "elasticite fermete": "elasticite_fermete",
  "eclat uniformite du teint": "eclat_uniformite",
  "texture pores dilates": "texture_pores",
  "texture rugosite": "texture_rugosite",
  "points noirs microkystes": "points_noirs",
  "acne active papules pustules": "acne_active",
  "acne dorsale": "acne_dorsale",
  "taches pih post inflammatoires": "taches_pih",
  "taches pih du dos": "taches_pih",
  "taches pih barbe": "taches_pih",
  "melasma": "melasma",
  "hyperpigmentation globale": "hyperpigmentation_globale",
  "rougeurs inflammation": "rougeurs_inflammation",
  "irritation rougeurs": "rougeurs_inflammation",
  "excès de sebum": "sebum",
  "exces de sebum": "sebum",
  "cernes poches": "cernes_poches",
  "dpn keratoses": "dpn_keratoses",
  "desquamation pellicules": "desquamation",
  "irritation du cuir chevelu": "rougeurs_inflammation",
  "folliculite": "folliculite",
  "folliculite de barbe": "folliculite",
  "secheresse": "secheresse",
  "secheresse cutanee": "secheresse",
  "taches alopeciques": "taches_alopeciques",
  "keratose callosites": "kératose_callosites",
  "taches pigmentaires": "taches_pigmentaires",
  "etat des ongles": "etat_ongles",
  "irritation eczema": "irritation_eczema",
  "poils incarnes": "poils_incarnes",
  "asymetrie a": "abcde_a",
  "bords irreguliers b": "abcde_b",
  "couleurs multiples c": "abcde_c",
  "diametre 6 mm d": "abcde_d",
  "diametre 6 mm": "abcde_d",
  "evolution e": "abcde_e",
};

/** Recherche par mots-clés (repli : libellés proches venus du VLM). */
const KEYWORDS: [string, string][] = [
  ["pih", "taches_pih"],
  ["sebum", "sebum"],
  ["hydrat", "hydratation"],
  ["folliculite", "folliculite"],
  ["melasma", "melasma"],
  ["points noirs", "points_noirs"],
  ["microkystes", "points_noirs"],
  ["acne", "acne_active"],
  ["barriere", "barriere_cutanee"],
  ["elasticite", "elasticite_fermete"],
  ["fermete", "elasticite_fermete"],
  ["eclat", "eclat_uniformite"],
  ["uniformite", "eclat_uniformite"],
  ["pores", "texture_pores"],
  ["texture", "texture_pores"],
  ["rugosite", "texture_rugosite"],
  ["rougeurs", "rougeurs_inflammation"],
  ["inflammation", "rougeurs_inflammation"],
  ["irritation", "rougeurs_inflammation"],
  ["eczema", "irritation_eczema"],
  ["cernes", "cernes_poches"],
  ["poches", "cernes_poches"],
  ["dpn", "dpn_keratoses"],
  ["keratoses", "dpn_keratoses"],
  ["kératoses", "dpn_keratoses"],
  ["callosites", "kératose_callosites"],
  ["desquamation", "desquamation"],
  ["pellicules", "desquamation"],
  ["secheresse", "secheresse"],
  ["alopeciques", "taches_alopeciques"],
  ["alopecie", "taches_alopeciques"],
  ["pigmentaires", "taches_pigmentaires"],
  ["hyperpigmentation", "hyperpigmentation_globale"],
  ["ongles", "etat_ongles"],
  ["poils incarnes", "poils_incarnes"],
  ["incarnes", "poils_incarnes"],
  ["asymetrie", "abcde_a"],
  ["bords", "abcde_b"],
  ["couleurs multiples", "abcde_c"],
  ["diametre", "abcde_d"],
  ["evolution", "abcde_e"],
];

/** Entrée de glossaire pour un libellé d'indicateur (ou null si inconnu). */
export function glossaryFor(term: string): GlossaryEntry | null {
  const n = norm(term);
  if (!n) return null;
  const direct = EXACT[n] ?? (G[n] ? n : null);
  if (direct && G[direct]) return { title: G[direct].title, simple: G[direct].simple };
  for (const [kw, key] of KEYWORDS) {
    if (n.includes(kw) && G[key]) return { title: G[key].title, simple: G[key].simple };
  }
  return null;
}

/** Texte parlé d'une entrée (titre + définition) — pour le TTS. */
export function glossarySpoken(entry: GlossaryEntry): string {
  return `${entry.title}. ${entry.simple}`;
}
