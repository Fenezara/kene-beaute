// Kènè — glossaire 1 tap : définition SIMPLE de chaque indicateur du diagnostic,
// + les grandes notions de la base de connaissances (conditions, botaniques,
// actifs, dépigmentation — voir src/lib/kene/knowledge.ts).
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
  keloides: {
    title: "Keloïdes",
    simple:
      "Une cicatrice qui pousse trop : elle forme une bosse dure qui dépasse la blessure et peut continuer à grandir. Fréquent sur peau noire. Ça gratte parfois, ce n'est pas dangereux, mais il ne faut jamais la couper soi-même — un dermatologue sait l'atténuer.",
  },
  vitiligo: {
    title: "Vitiligo",
    simple:
      "Des taches blanches bien nettes qui apparaissent et peuvent s'étendre : la peau perd sa couleur par plaques. Ce n'est pas contagieux et ce n'est pas dangereux, mais ça se voit. Un dermatologue peut proposer des traitements, surtout au début.",
  },
  acanthosis_nigricans: {
    title: "Acanthosis nigricans",
    simple:
      "La peau devient épaisse, sombre et douce comme du velours sur le cou, la nuque ou les aisselles. Ce n'est pas une saleté et ça ne part pas en frottant : c'est souvent un signal du corps (résistance à l'insuline). Parle-en à un médecin.",
  },
  mycoses: {
    title: "Mycoses (champignons)",
    simple:
      "Des champignons microscopiques qui aiment la chaleur et l'humidité : ça démange entre les orteils ou dans les plis, ou ça fait des taches. Ça se soigne bien. Garder les zones sèches et porter du coton large aide à éviter ça.",
  },
  pityriasis_versicolor: {
    title: "Pityriasis versicolor (taches blanches)",
    simple:
      "Des petites taches plus claires qui pelent très fin, sur le torse, les épaules ou le cou. C'est un champignon de surface, pas grave. À ne pas confondre avec le vitiligo : ici, ça pèle et ça se soigne.",
  },
  teigne: {
    title: "Teigne (enfant)",
    simple:
      "Chez l'enfant : des plaques sans cheveux avec des petites croûtes sur la tête, qui démangent. C'est un champignon très contagieux (école, famille). Les crèmes seules ne suffisent pas : il faut voir un médecin vite.",
  },
  gale: {
    title: "Gale",
    simple:
      "Des démangeaisons très fortes surtout la NUIT, et souvent toute la famille en même temps. C'est un tout petit parasite qui se transmet par le contact et la literie. Ça se soigne très bien — toute la famille doit se soigner ensemble.",
  },
  impetigo: {
    title: "Impétigo",
    simple:
      "Des croûtes jaunes comme du miel autour de la bouche ou sur une plaie, surtout chez les enfants. C'est une bactérie, très contagieux, mais ça guérit vite avec le bon traitement du médecin.",
  },
  urticaire: {
    title: "Urticaire",
    simple:
      "Des plaques gonflées et roses qui démangent, qui apparaissent et disparaissent en quelques heures. Souvent une allergie (aliment, médicament, piqûre). Si les lèvres ou la gorge gonflent : va vite à l'hôpital.",
  },
  alopecie_traction: {
    title: "Alopécie de traction",
    simple:
      "La chute des cheveux causée par des coiffures trop TIRÉES : tresses, tissages, chignons serrés. Ça commence aux tempes et au front. Solution : desserrer, varier les coiffures et laisser reposer la ligne des cheveux.",
  },
  ccca: {
    title: "CCCA (chute du sommet du crâne)",
    simple:
      "Une chute de cheveux au SOMMET de la tête, avec picotements ou petites croûtes, chez la femme noire. Le follicule se détruit lentement et ne repousse plus. Plus on agit tôt chez le dermatologue, plus on sauve de cheveux.",
  },
  alopecie_areata: {
    title: "Alopécie areata (plaques)",
    simple:
      "Une plaque de cheveux tombés, ronde et lisse, qui apparaît en quelques jours. Pas de croûtes, pas de douleur. C'est souvent le stress. Ça repousse souvent tout seul — un dermatologue peut aider.",
  },
  depigmentation: {
    title: "Dépigmentation (éclaircissement)",
    simple:
      "Utiliser des crèmes ou sachets pour éclaircir la peau. Beaucoup de ces produits vendus au marché abîment la peau en profondeur : elle devient fine, marquée, parfois grise. Kènè ne juge jamais — si tu veux unifier ton teint, il y a des moyens sains.",
  },
  ochronose: {
    title: "Ochronose",
    simple:
      "Le teint devient gris-noir et terne, surtout après des années de crèmes éclaircissantes. C'est une coloration profonde de la peau, difficile à effacer. Un dermatologue peut aider — et l'arrêt doit se faire tout doucement, jamais d'un coup.",
  },
  savon_noir: {
    title: "Savon noir (alata)",
    simple:
      "Le savon noir : un savon traditionnel à base de cendres végétales. Il nettoie bien le corps et aide sur les petites imperfections. Attention : il peut assécher — hydrate bien après, et évite-le sur un visage fragile tous les jours.",
  },
  karite: {
    title: "Karité",
    simple:
      "Le beurre de karité, tiré de l'arbre du même nom : très nourrissant. Il répare la peau sèche, apaise et protège du dessèchement (harmattan). Parfait pour le corps, les lèvres et les cheveux — trop riche pour un visage qui fait des boutons.",
  },
  moringa: {
    title: "Moringa",
    simple:
      "L'arbre moringa : ses feuilles et son huile sont riches en vitamines. L'huile nourrit et redonne de l'éclat, la poudre de feuilles sert en masque. Doux et apprécié des peaux fatiguées.",
  },
  baobab: {
    title: "Baobab",
    simple:
      "L'huile de baobab : légère, elle pénètre vite sans laisser de film gras. Bien pour la peau sèche, les marques anciennes et les cheveux cassants.",
  },
  bissap: {
    title: "Bissap (hibiscus)",
    simple:
      "Le bissap : la fleur séchée de la boisson rouge. Sur la peau, elle est riche en acides de fruits qui affinent le grain et donnent de l'éclat. En rinçage ou en masque court — et toujours un écran solaire après.",
  },
  nere: {
    title: "Néré",
    simple:
      "Le néré : l'arbre du caroube africain. Sa poudre et ses beurrs traditionnels apaisent la peau sèche et assouplissent les cheveux. Utilisé depuis toujours en Afrique de l'Ouest.",
  },
  neem: {
    title: "Neem (margousier)",
    simple:
      "Le neem : ses feuilles sont antibactériennes et antifongiques. En rinçage ou en savon, il aide sur les boutons, les pellicules et les mycoses légères. Puissant : pas pour un usage quotidien sur le visage.",
  },
  niacinamide: {
    title: "Niacinamide",
    simple:
      "Une vitamine (B3) très douce pour la peau. Elle atténue les taches brunes et renforce la barrière de la peau. Bien supportée sur peau noire, matin ou soir — un bon premier actif.",
  },
  acide_azelaique: {
    title: "Acide azélaïque",
    simple:
      "Un actif double emploi : il calme l'acné ET atténue les taches brunes qui restent après. Particulièrement adapté aux peaux foncées car il est doux. À introduire lentement, une fois par jour au début.",
  },
  retinol: {
    title: "Rétinol",
    simple:
      "Un actif puissant de la famille de la vitamine A : anti-imperfections et anti-âge. Sur peau noire, il faut y aller TRÈS doucement : trop fort = irritation = taches. Commencer léger, deux soirs par semaine.",
  },
  photoprotection: {
    title: "Photoprotection (écran solaire)",
    simple:
      "Se protéger du soleil : écran solaire, chapeau, ombre. Indispensable même sur peau noire : le soleil entretient les taches (mélasma, PIH) et fonce le teint. Écran indice 30 ou plus, chaque matin.",
  },
  insulinoresistance: {
    title: "Insulinorésistance",
    simple:
      "Quand le corps répond mal à son propre sucre. La peau peut le montrer : cou et aisselles sombres et épais (acanthosis). C'est un signal à faire vérifier par un médecin, avant que le diabète ne s'installe.",
  },
  melanome_acral: {
    title: "Mélanome acral",
    simple:
      "Un grain de beauté dangereux qui pousse sur les PAUMES, les PLANTES ou les ONGLES. Signe à montrer vite : une ligne sombre verticale sur UN SEUL ongle qui s'élargit, ou une tache sombre qui change. Dermatologue sans attendre.",
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
  "keloides": "keloides",
  "keloïdes": "keloides",
  "cheloïdes": "keloides",
  "cheloides": "keloides",
  "cicatrice keloide": "keloides",
  "cicatrice keloidienne": "keloides",
  "vitiligo": "vitiligo",
  "taches blanches": "pityriasis_versicolor",
  "acanthosis nigricans": "acanthosis_nigricans",
  "cou noir sombre epais": "acanthosis_nigricans",
  "mycose": "mycoses",
  "mycoses": "mycoses",
  "mycose des plis": "mycoses",
  "mycose des pieds": "mycoses",
  "champignon": "mycoses",
  "pityriasis versicolor": "pityriasis_versicolor",
  "teigne": "teigne",
  "teigne tinea capitis": "teigne",
  "gale": "gale",
  "impetigo": "impetigo",
  "impétigo": "impetigo",
  "urticaire": "urticaire",
  "plaques urticaire": "urticaire",
  "alopecie de traction": "alopecie_traction",
  "chute par traction": "alopecie_traction",
  "ccca": "ccca",
  "alopecie centrale cicatricielle": "ccca",
  "chute sommet du crane": "ccca",
  "alopecie areata": "alopecie_areata",
  "pelade": "alopecie_areata",
  "depigmentation": "depigmentation",
  "dépigmentation": "depigmentation",
  "eclaircissement": "depigmentation",
  "eclaircissement de la peau": "depigmentation",
  "crèmes éclaircissantes": "depigmentation",
  "cremes eclaircissantes": "depigmentation",
  "ochronose": "ochronose",
  "teint gris noir": "ochronose",
  "savon noir": "savon_noir",
  "savon alata": "savon_noir",
  "karite": "karite",
  "karité": "karite",
  "beurre de karite": "karite",
  "beurre de karité": "karite",
  "moringa": "moringa",
  "huile de moringa": "moringa",
  "baobab": "baobab",
  "huile de baobab": "baobab",
  "bissap": "bissap",
  "hibiscus": "bissap",
  "nere": "nere",
  "néré": "nere",
  "neem": "neem",
  "margousier": "neem",
  "niacinamide": "niacinamide",
  "acide azelaique": "acide_azelaique",
  "acide azélaïque": "acide_azelaique",
  "retinol": "retinol",
  "photoprotection": "photoprotection",
  "ecran solaire": "photoprotection",
  "écran solaire": "photoprotection",
  "spf": "photoprotection",
  "insulinoresistance": "insulinoresistance",
  "insulinorésistance": "insulinoresistance",
  "melanome acral": "melanome_acral",
  "ligne sombre sur l ongle": "melanome_acral",
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
  ["traction", "alopecie_traction"],
  ["taches blanches", "pityriasis_versicolor"],
  ["tinea", "teigne"],
  ["capitis", "teigne"],
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
  ["keloid", "keloides"],
  ["keloides", "keloides"],
  ["keloïdes", "keloides"],
  ["cheloide", "keloides"],
  ["cheloïde", "keloides"],
  ["vitiligo", "vitiligo"],
  ["acanthosis", "acanthosis_nigricans"],
  ["nigricans", "acanthosis_nigricans"],
  ["mycose", "mycoses"],
  ["mycoses", "mycoses"],
  ["champignon", "mycoses"],
  ["versicolor", "pityriasis_versicolor"],
  ["teigne", "teigne"],
  ["gale", "gale"],
  ["impetigo", "impetigo"],
  ["impétigo", "impetigo"],
  ["urticaire", "urticaire"],
  ["ccca", "ccca"],
  ["areata", "alopecie_areata"],
  ["pelade", "alopecie_areata"],
  ["depigmentation", "depigmentation"],
  ["dépigmentation", "depigmentation"],
  ["eclairciss", "depigmentation"],
  ["blanchiment", "depigmentation"],
  ["ochronose", "ochronose"],
  ["savon noir", "savon_noir"],
  ["alata", "savon_noir"],
  ["karite", "karite"],
  ["moringa", "moringa"],
  ["baobab", "baobab"],
  ["bissap", "bissap"],
  ["hibiscus", "bissap"],
  ["nere", "nere"],
  ["neem", "neem"],
  ["margousier", "neem"],
  ["niacinamide", "niacinamide"],
  ["azelaique", "acide_azelaique"],
  ["azélaïque", "acide_azelaique"],
  ["retinol", "retinol"],
  ["photoprotection", "photoprotection"],
  ["ecran solaire", "photoprotection"],
  ["écran solaire", "photoprotection"],
  ["spf", "photoprotection"],
  ["insulino", "insulinoresistance"],
  ["melanome", "melanome_acral"],
  ["acral", "melanome_acral"],
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
