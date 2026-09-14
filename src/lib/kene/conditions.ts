// Kènè — ATLAS DES DERMATOSES AFRICAINES.
// Lib PURE (zéro dépendance React/serveur). Source unique de vérité pour:
// 1. Le DIAGNOSTIC PHOTO (src/lib/ai/vlm.ts): catalogue zone-filtré injecté
// dans le prompt vision; le VLM cite un id EXACT → validation
// anti-hallucination ici-même (hypothesesFromVlm) → carte « hypothèses »
// dans l'écran de résultats.
// 2. Le chat Dr Kènè: ATLAS_DIGEST (condensé injecté dans le prompt système).
// 3. Les écrans pédagogiques à venir (croisements glossaire/herbier).
//
// PROFONDEUR: chaque affection porte sa signature SUR PEAU NOIRE — sur peau
// mélanoderme (Fitz IV-VI), l'érythème est violacé et masqué, la
// pigmentation réagit à tout (PIH), les squames se lisent sur fond foncé,
// l'hypopigmentation saute aux yeux. C'est LA différence avec les atlas
// occidentaux, et la clé de la reconnaissance correcte.
//
// POSITIONNEMENT: Kènè ÉDUQUE et ORIENTE — jamais de diagnostic formel, jamais
// de prescription. niveau=educatif → conseils doux; institut → dermo-
// conseillère partenaire; dermato → avis médical; urgence → immédiat.

import type { AtlasLevel, BodyZone, SuspectedCondition } from "@/lib/kene/types";

// ─────────────────────────── Types ───────────────────────────

export type AtlasCategory =
  | "pigmentation"
  | "folliculaire"
  | "eczema"
  | "bacterien"
  | "fongique"
  | "parasitaire"
  | "viral"
  | "vih"
  | "papulosquameux"
  | "autoimmun"
  | "tumoral"
  | "cheveux"
  | "nutrition"
  | "culturel"
  | "climat";

export const CATEGORY_LABELS: Record<AtlasCategory, string> = {
  pigmentation: "Pigmentation",
  folliculaire: "Acné & folliculaire",
  eczema: "Eczémas & dermites",
  bacterien: "Infections bactériennes",
  fongique: "Infections fongiques (mycoses)",
  parasitaire: "Infections parasitaires",
  viral: "Infections virales",
  vih: "Dermatoses liées au VIH",
  papulosquameux: "Maladies inflammatoires",
  autoimmun: "Maladies auto-immunes",
  tumoral: "Lésions tumorales",
  cheveux: "Cheveux & cuir chevelu",
  nutrition: "Carence & nutrition",
  culturel: "Pratiques & cosmétiques",
  climat: "Climat & grossesse",
};

export const LEVEL_LABELS: Record<AtlasLevel, string> = {
  educatif: "Éducatif — conseils doux",
  institut: "Institut partenaire",
  dermato: "Avis dermatologique",
  urgence: "Urgence",
};

export interface AtlasCondition {
 /** id ASCII snake_case — cité EXACTEMENT par le VLM (contrat anti-hallucination). */
  id: string;
  nom: string;
 /** Noms courants / locaux / médicaux que la cliente peut employer. */
  aliases?: string[];
  categorie: AtlasCategory;
  frequence: "tres-frequente" | "frequente" | "peu-frequente" | "rare";
 /** Zones de photo Kènè où l'affection est visible (contrat zone-filtré). */
  zones: BodyZone[];
 /** LA clé: comment ça se présente SUR PEAU NOIRE (1-2 phrases cliniques). */
  surPeauNoire: string;
 /** Symptômes ressentis (mots de la cliente). */
  symptomes?: string[];
 /** Pièges — avec quoi on la confond souvent. */
  confondAvec?: string[];
  niveau: AtlasLevel;
 /** Conduite Kènè (1 phrase, jamais de médicament nommé). */
  action: string;
 /** Éducation patiente 2-3 phrases (affichée telle quelle sur la carte). */
  education: string;
 /** Signe d'alerte: ce qui impose de sortir du cadre éducatif. */
  drapeau?: string;
 /** Libellés d'indicateurs du diagnostic en lien (croisements éducatifs). */
  indicateurs?: string[];
 /** Requête glossaire 1-tap qui résout (clé/mot-clé existant). */
  glossaire?: string;
 /** Signature compacte ≤ 60 chars pour le prompt VLM. */
  vlmHint: string;
}

// ───────────────────── PIGMENTATION (9) ─────────────────────

export const ATLAS: AtlasCondition[] = [
  {
    id: "pih",
    nom: "Hyperpigmentation post-inflammatoire (PIH)",
    aliases: ["taches après boutons", "marques d'acné", "taches noires"],
    categorie: "pigmentation",
    frequence: "tres-frequente",
    zones: ["visage", "dos", "barbe"],
    surPeauNoire:
      "Taches brunes à brun très foncé, aux bords flous, aux endroits exacts des anciens boutons, piqûres ou grattures. Sur peau noire, chaque inflammation surproduit du pigment : la PIH est le motif n°1 de consultation esthétique africaine. Persiste des mois.",
    symptomes: ["aucune douleur", "juste des marques", "s'allonge si on gratte"],
    confondAvec: ["mélasma (symétrique, sans boutons avant)", "lentigos solaires (âge)"],
    niveau: "educatif",
    action:
      "Photoprotection SPF 50 chaque matin + niacinamide ou azélaïque en douceur, UN actif à la fois ; surtout ne plus percer ni gratter les boutons.",
    education:
      "Ces taches brunes sont des cicatrices de pigment, pas des taches de « saleté ». Elles partent lentement — des mois, pas des jours. Le soleil les fonce : sans écran solaire chaque matin, aucun soin ne gagnera. Et chaque nouveau bouton gratté en fabrique une nouvelle.",
    indicateurs: ["Taches PIH post-inflammatoires", "Acné dorsale"],
    glossaire: "taches PIH",
    vlmHint: "taches brunes post-boutons/grattage, bords flous, sans relief",
  },
  {
    id: "melasma",
    nom: "Mélasma",
    aliases: ["masque de grossesse", "taches hormonales", "chloasma"],
    categorie: "pigmentation",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plaques brunes SYMÉTRIQUES en miroir : pommettes, front, lèvre supérieure, mâchoire. Bord net mais régulier, surface lisse. Aggravé par chaleur, soleil, grossesse, pilule. Sur peau noire, volontiers rebelle et récidivant.",
    symptomes: ["aucune douleur", "sombre au soleil", "apparu en grossesse ou avec la pilule"],
    confondAvec: ["PIH (suit les boutons)", "ochronose (crèmes éclaircissantes, teinte gris-bleu)"],
    niveau: "institut",
    action:
      "SPF 50 matin et soir réapplication, éclaircissement doux en institut (pas de produits agressifs), avis médical si très rebelle — jamais de crèmes éclaircissantes de rue.",
    education:
      "Le mélasma est la réaction de ta peau aux hormones et au soleil — il se pose en miroir sur les joues et le front. Il ne part pas en une semaine : il se DOMPTE. La protection solaire est le vrai traitement, les soins d'institut accélèrent, la patience gagne.",
    indicateurs: ["Mélasma"],
    glossaire: "mélasma",
    vlmHint: "plaques brunes symetriques miroir joues/front/levre, lisses",
  },
  {
    id: "vitiligo",
    nom: "Vitiligo",
    categorie: "pigmentation",
    frequence: "frequente",
    zones: ["visage", "mains", "dos"],
    surPeauNoire:
      "Plaques BLANC LAIT totalement dépigmentées, à bords nets, souvent bordées d'un liseré plus foncé. Très visibles sur peau noire (contraste maximal). S'étendent par poussées, symétriques ou en périphérie des frottements (Koebner).",
    symptomes: ["aucune douleur", "aucune démangeaison", "grandit lentement"],
    confondAvec: ["pityriasis alba (enfants, squameux, partiel)", "lèpre (perte de SENSIBILITÉ)", "PIH hypochromique"],
    niveau: "dermato",
    action:
      "Oriente vers un dermatologue pour confirmer et suivre ; photoprotection stricte des plaques (elles brûlent sans mélanine) ; soutien psychologique — le vitiligo bouscule l'image de soi.",
    education:
      "Le vitiligo est une perte de pigment, pas une maladie qui se soigne par des crèmes de rue. Sur peau noire le contraste impressionne, mais la peau reste saine. Un dermatologue peut freiner les poussées et proposer des repigmentations — et surtout, ce n'est pas contagieux.",
    drapeau: "Plaques blanches qui s'étendent vite, ou autour des yeux/bouche → avis médical sans attendre.",
    glossaire: "vitiligo",
    vlmHint: "plaques blanc-lait depigmentees nettes, liseré foncé",
  },
  {
    id: "cernes_pigmentaires",
    nom: "Hyperpigmentation péri-orbitaire",
    aliases: ["cernes noires", "cernes pigmentaires"],
    categorie: "pigmentation",
    frequence: "tres-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Auricules brunes à noires sous les yeux, bilatérales, souvent familiales. Sur peau noire, dominante PIGMENTAIRE (pas seulement vasculaire) : le cerne « violet fatigué » occidental est ici un cerne brun profond.",
    symptomes: ["fatigue visuelle", "allure fatiguée"],
    confondAvec: ["allergies (frottement des yeux + rhinite)", "corticoïdes autour des yeux"],
    niveau: "educatif",
    action:
      "Photoprotection, correcteur teinté, sommeil et eau ; recherche des frottements allergiques à traiter ; pas de crème agressive autour de l'œil.",
    education:
      "Tes cernes noires sont surtout du pigment — souvent hérité de ta famille, pas juste de la fatigue. Le soleil les fonce, le frottement des yeux (allergies) aussi. Elles s'atténuent avec une protection solaire douce et du correcteur, rarement avec des crèmes miracles.",
    indicateurs: ["Cernes & poches"],
    glossaire: "cernes",
    vlmHint: "ombres brunes profondes sous les yeux, bilaterales",
  },
  {
    id: "acanthosis",
    nom: "Acanthosis nigricans",
    aliases: ["cou noir", "peau velours des plis"],
    categorie: "pigmentation",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plaques brunes-veloutées épaissies, « terne et rugueuses », sur les côtés du cou (visibles sur photo de face), tempes, front. MARQUEUR CUTANÉ de l'insulinorésistance / diabète naissant — très fréquent chez les femmes africaines en surpoids.",
    symptomes: ["peau « sale » qui revient", "épaississement", "parfois démangeaisons légères"],
    confondAvec: ["« saleté » qui ne part pas au gommage", "dermite de friction"],
    niveau: "dermato",
    action:
      "Ce n'est pas de la saleté : oriente vers un médecin pour glycémie et bilan (diabète) ; activité physique et alimentation ; le gommage agressif ne sert à RIEN et irrite.",
    education:
      "Si ton cou semble « sale » malgré le gommage, ce n'est pas un problème de propreté : c'est souvent un signal que ton corps gère mal le sucre. Une prise de sang simple lève le doute. Prendre soin de l'insuline éclaircit peu à peu cette peau velours.",
    drapeau: "Plaques veloutées qui s'étendent + soif, urines fréquentes → médecin VITE.",
    indicateurs: ["Hyperpigmentation globale"],
    glossaire: "acanthosis nigricans",
    vlmHint: "plaque brun-veloute epaisse cou/tempes, aspect terne",
  },
  {
    id: "dpn",
    nom: "Dermatose papuleuse noire (DPN)",
    aliases: ["petits grains", "grains de beauté noirs"],
    categorie: "pigmentation",
    frequence: "tres-frequente",
    zones: ["visage", "naevi"],
    surPeauNoire:
      "Multiples petites papules brun-noir LUISSANTES (1-5 mm), bien séparées, sur les joues, les tempes, le front et le cou. Familiales, augmentent avec l'âge. Bénignes — l'affection « signature » de la joue mélanoderme.",
    symptomes: ["aucun", "aspect esthétique"],
    confondAvec: ["nævi, mélanome (règle : une lésion qui CHANGE seule est différente)"],
    niveau: "institut",
    action:
      "Confirmation esthétique en institut partenaire ; retrait éventuel UNIQUEMENT par un dermatologue (électrodesiccation) — jamais d'arrachage, de fil ou de produit corrosif maison.",
    education:
      "Ces petits grains noirs brillants sont une signature familiale des peaux noires — ils sont bénins et arrivent en nombre avec l'âge. On peut les retirer un par un chez le dermatologue si tu le souhaites, proprement. Les retirer toi-même fabrique des cicatrices et des taches.",
    indicateurs: ["DPN / Kératoses"],
    glossaire: "DPN",
    vlmHint: "papules brun-noir luisantes 1-5mm disseminees joues/tempes",
  },
  {
    id: "ochronose",
    nom: "Ochronose exogène",
    aliases: ["taches gris-bleu des crèmes éclaircissantes"],
    categorie: "pigmentation",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plaques gris-bleu à noir bleuté, DURES au toucher, sur pommettes, front, tempes et cou — après des années de crèmes éclaircissantes à hydroquinone forte. S'y ajoutent souvent des « confettis » blancs et une peau foto-vieillie par endroits.",
    symptomes: ["peau épaissie par endroits", "taches bizarres bleutées", "crème éclaircissante utilisée"],
    confondAvec: ["mélasma (brun, pas bleuté)", "PIH"],
    niveau: "dermato",
    action:
      "Arrêt PROGRESSIF du produit éclaircissant (jamais brutal), photoprotection maximale, orientation dermatologique — la couleur bleutée ne part pas en institut.",
    education:
      "Ces taches gris-bleu sont la signature d'un usage prolongé de crèmes éclaircissantes puissantes : la peau a réagi en fabriquant un pigment anormal. En arrêtant DOUCEMENT le produit et en protégeant du soleil, un dermatologue peut améliorer la peau — mais elle mérite un vrai suivi.",
    drapeau: "Utilisation actuelle de crèmes de teint/lightening + urines foncées ou fatigue intense → médecin.",
    glossaire: "ochronose",
    vlmHint: "plaques gris-bleu dures pommettes/front + confettis blancs",
  },
  {
    id: "lentigos_solaires",
    nom: "Lentigos solaires",
    aliases: ["taches de vieillesse", "taches de soleil"],
    categorie: "pigmentation",
    frequence: "frequente",
    zones: ["visage", "mains", "dos"],
    surPeauNoire:
      "Taches brunes bien délimitées, plus foncées que la peau, posées sur les zones tampons par des décennies de soleil : pommettes, tempes, dessus des mains, décolleté et dos. En Afrique, le soleil tape toute l'année — elles arrivent plus tôt qu'on ne croit.",
    symptomes: ["aucun", "aspect inégal"],
    confondAvec: ["PIH (histoire de boutons)", "nævi (relief)"],
    niveau: "institut",
    action:
      "Photoprotection stricte, soins éclat doux en institut, azélaïque ou rétinol progressif ; éviter les « décapeurs » (toutes les formules caustiques du marché informel).",
    education:
      "Ces taches nettes sont la mémoire du soleil accumulée par ta peau. Elles s'estompent avec de la patience et une protection solaire quotidienne — et surtout, chaque matin sans écran solaire en imprime de nouvelles. Le marché informel promet de les « décaper » : c'est la porte aux PIH.",
    indicateurs: ["Éclat / Uniformité du teint"],
    glossaire: "photoprotection",
    vlmHint: "taches brunes nettes posees pommettes/tempes/mains, sans boutons avant",
  },
  {
    id: "hypo_post_inflam",
    nom: "Hypopigmentation post-inflammatoire",
    aliases: ["taches claires après plaie"],
    categorie: "pigmentation",
    frequence: "frequente",
    zones: ["visage", "dos", "mains", "barbe"],
    surPeauNoire:
      "Taches PLUS CLAIRES que la peau (hypochromiques, pas blanc-lait), aux endroits d'eczéma guéri, de plaies, de gommages agressifs ou de « décapeurs ». Sur peau foncée, la perte de pigment se voit autant que l'excès. Repigmente en des mois.",
    symptomes: ["aucune douleur", "histoire de plaie/eczéma/produit"],
    confondAvec: ["vitiligo (blanc complet)", "pityriasis versicolor (fine squame)"],
    niveau: "educatif",
    action:
      "Patience + photoprotection + hydratation ; identifier la cause (produit agressif à arrêter) ; repigmentation lente mais réelle. Si blancheur totale → avis médical.",
    education:
      "Après une inflammation, la peau noire peut laisser une tache plus claire au lieu d'une plus foncée. Ce n'est ni la lèpre ni le vitiligo : le pigment revient tout seul en plusieurs mois si tu protèges la zone du soleil et que tu cesses de l'irriter.",
    glossaire: "taches blanches",
    vlmHint: "taches plus claires que la peau apres plaie/irritation, pas blanc pur",
  },

  // ───────────────────── ACNÉ & FOLLICULAIRE (7) ─────────────────────

  {
    id: "acne_vulgaire",
    nom: "Acné vulgaire",
    aliases: ["boutons", "acné à pousses"],
    categorie: "folliculaire",
    frequence: "tres-frequente",
    zones: ["visage", "dos", "barbe"],
    surPeauNoire:
      "Comédons, papules et pustules ; sur peau noire, l'inflammation se voit VIOLET-BRUN (l'érythème rouge est masqué) et chaque bouton laisse une PIH. Les nodules douloureux (bas du visage, mâchoire) signent l'acné sévère — hormonale chez la femme adulte.",
    symptomes: ["boutons", "douleur des gros boutons", "poussées avant les règles"],
    confondAvec: ["folliculite bactérienne", "acné à la 5-médication (crème corticoïde)"],
    niveau: "institut",
    action:
      "Routine douce (nettoyant sans savon + niacinamide), ne jamais percer ; acné nodulaire ou douloureuse → dermatologue (les cicatrices sont à vie) ; bilan hormonal si cycles irréguliers.",
    education:
      "L'acné sur peau noire a une règle d'or : chaque bouton maltraité devient une tache brune qui dure des mois. Traite-les tôt et en douceur — et si ce sont des nodules profonds et douloureux, un dermatologue t'évitera des cicatrices définitives.",
    drapeau: "Nodules douloureux, saignement au moindre contact, ou acné + cycles irréguliers/pilosité excessive → avis médical.",
    indicateurs: ["Acné active (papules / pustules)", "Acné dorsale"],
    glossaire: "acné",
    vlmHint: "papules/pustules, base violace-brun sur peau noire, PIH associee",
  },
  {
    id: "acne_pomade",
    nom: "Acné pomade",
    aliases: ["boutons des huiles capillaires"],
    categorie: "folliculaire",
    frequence: "tres-frequente",
    zones: ["visage", "barbe"],
    surPeauNoire:
      "Comédons FERMÉS nombreux, petits et réguliers, alignés le long de la ligne frontale des cheveux, des tempes et du front — là où coulent les huiles et pommades capillaires comédogènes (lait de corps, vaseline épaisse, « brillantines »).",
    symptomes: ["petits boutons blancs fermés", "front graissé par les soins capillaires"],
    confondAvec: ["acné vulgaire du front", "folliculite"],
    niveau: "educatif",
    action:
      "Passer à des produits capillaires NON comédogènes (appliquer sur cheveux, pas sur peau), nettoyer le front au soir ; les comédons partent en quelques semaines.",
    education:
      "Tes « boutons du front » suivent souvent tes huiles capillaires : quand la pommade coule sur la peau, elle bouche les pores en rang. Change de produit (non comédogène, appliqué sur la longueur des cheveux), lave ton front chaque soir — et cette acné fond sans soins lourds.",
    indicateurs: ["Points noirs & microkystes", "Excès de sébum"],
    glossaire: "points noirs",
    vlmHint: "comedons fermes alignes ligne frontiere cheveux/front/tempes",
  },
  {
    id: "pfb",
    nom: "Pseudofolliculose de la barbe (PFB)",
    aliases: ["poils incarnés", "boutons de rasage"],
    categorie: "folliculaire",
    frequence: "tres-frequente",
    zones: ["barbe", "visage"],
    surPeauNoire:
      "Le poil frisé africain, coupé court, recourbe et RETREMPE dans la peau : papules et pustules du cou et des mâchoires, poils visibles enroulés sous la peau, PIH et parfois petits kystes. La barbe des hommes noirs est la zone PFB n°1 au monde.",
    symptomes: ["brûlure après rasage", "boutons du cou", "poils qui « rentrent »"],
    confondAvec: ["acné", "folliculite bactérienne", "AKN (nuque)"],
    niveau: "educatif",
    action:
      "Raser DANS le sens du poil, jamais de trop près (tondeuse à 1 mm plutôt que lame), exfoliation douce 1×/semaine, jamais arracher au tweezers ; cas sévères → institut/dermato.",
    education:
      "Tes poils incarnés sont un problème de PHYSIQUE, pas d'hygiène : le poil frisé, coupé ras, recourbe sous la peau et l'irrite. En laissant la barbe un peu plus longue, en rasant dans le sens du poil et en exfoliant doucement, la boucle s'apaise — et les taches brunes suivantes s'arrêtent.",
    indicateurs: ["Poils incarnés", "Folliculite de barbe"],
    glossaire: "poils incarnés",
    vlmHint: "papules/pustules cou+machoires, poils enroules visibles sous peau",
  },
  {
    id: "akn",
    nom: "Acné keloidalis nuchae (AKN)",
    aliases: ["boutons de la nuque", "kyste de la nuque"],
    categorie: "folliculaire",
    frequence: "frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "Papules dures puis plaques et touffes boursouflées BRUN-FONCÉ, agglomérées à la NUQUE, juste sous la ligne de cheveux, chez le jeune homme africain. Poches de cheveux incarnés profonds + formations chéloïdiennes. Fréquemment aggravé par les tontes rasées et les bords effacés du barbershop.",
    symptomes: ["démangeaisons de la nuque", "bosse dure", "suintement/poils incrustés"],
    confondAvec: ["kéloïde post-plaie", "folliculite simple"],
    niveau: "dermato",
    action:
      "Dermatologue (injections/retouches propres, extraction stérile des kystes) ; arrêt des tontes rasées à blanc, assèchement doux, linge propre ; ne jamais presser.",
    education:
      "Ces bosses dures de la nuque sont des poils incarnés profonds qui cicatrisent en bourrelets — typiques du jeune homme africain au bord de tonte rasé. Plus on rase court, plus ça s'épaissit. Un dermatologue sait aplatir ces bourrelets proprement ; presser chez soi infecte et agrandit.",
    drapeau: "Suintement, pus ou douleur de la nuque → avis médical rapide.",
    glossaire: "acné keloidalis nuchae",
    vlmHint: "papules dures brun-fonce agglomees nuque sous ligne cheveux",
  },
  {
    id: "folliculite",
    nom: "Folliculite bactérienne",
    aliases: ["boutons après transpiration", "petit clou"],
    categorie: "folliculaire",
    frequence: "tres-frequente",
    zones: ["dos", "visage", "barbe", "cuir_chevelu"],
    surPeauNoire:
      "Pustules PERI-FOLLICULAIRES (le point blanc entouré d'un halo violacé-brun), en crops, sur dos, épaules, fesses, cuir chevelu et barbe — après transpiration, vêtements serrés, sport, tontes ou casque. Sur peau noire, chaque pustule laisse une PIH.",
    symptomes: ["picotements", "boutons qui perclent", "chaleur/aggravation"],
    confondAvec: ["acné", "PFB", "folliculite à Malassezia"],
    niveau: "institut",
    action:
      "Hygiène douce : douche rapide après sport, textile respirant, serviettes/tondeuses PERSONNELLES, antiseptique local léger ; récurrences ou abcès → médecin.",
    education:
      "Ces boutons blancs « en halo » poussent dans les pores irrités par la sueur et le frottement. Ils demandent de la fraîcheur et de la propreté — serviette et tondeuse à toi seule — pas des crèmes fortes. Grattés, ils deviennent des petits clous et des taches.",
    drapeau: "Furoncles répétés ou fièvre → avis médical.",
    indicateurs: ["Folliculite", "Folliculite de barbe"],
    glossaire: "folliculite",
    vlmHint: "pustules peri-folliculaires en halo violace, dos/epaules/cuir",
  },
  {
    id: "hidrosadenite",
    nom: "Hidrosadénite suppurée (acné inversée)",
    aliases: ["clous d'aisselle", "furoncles des plis"],
    categorie: "folliculaire",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Nodules Douloureux récurrents, abcès, fistules suintantes et cordons cicatriciels BRUNS dans les plis (aisselles, aine, sous les seins) — photo du visage possible quand l'atteinte est cervico-faciale. Sous-diagnostiquée chez la femme noire (honte, « on croit que c'est sale »).",
    symptomes: ["douleur profonde", "bouts qui perclent", "cicatrices en corde", "plis"],
    confondAvec: ["furonculose simple", "kéloïdes", "bartholinite"],
    niveau: "dermato",
    action:
      "Dermatologue TÔT (prise en charge chronique, éviter tunnels et cicatrices) ; hygiène douce, textile ample, tabac et surpoids aggravent ; ne JAMAIS presser.",
    education:
      "Ces « clous » douloureux des plis qui reviennent sont une vraie maladie chronique des follicules — très fréquente chez les femmes noires, et ce n'est NI de la saleté NI une malédiction. Plus on la fait suivre tôt par un dermatologue, plus on garde des plis souples.",
    drapeau: "Fièvre, abcès très douloureux ou plaie qui ne ferme pas → avis médical rapide.",
    glossaire: "hidrosadénite",
    vlmHint: "nodules douloureux/fistules plis (aisselles/aine), cords cicatriciels",
  },
  {
    id: "keratose_pilaire",
    nom: "Kératose pilaire",
    aliases: ["peau de poulet", "bras de chat"],
    categorie: "folliculaire",
    frequence: "tres-frequente",
    zones: ["visage", "dos"],
    surPeauNoire:
      "Papules folliculaires RUGUEUSES « peau de poulet », chair de poule permanente, sur les bras (hors photo), cuisses et JOUES (aspect « sales » gris-tertes sur les pommettes chez l'enfant). Bouchons de kératine, souvent familiaux. Sèche avec l'âge.",
    symptomes: ["rugosité", "aspect gris", "parfois démangeaisons sèches"],
    confondAvec: ["DPN (plus âgées, luisantes)", "acné (inflammatoire)"],
    niveau: "educatif",
    action:
      "Hydratation riche (urée 10 %, karité) + exfoliation DOUCE lactique 1-2×/semaine ; jamais de gommage violent ni de brosse sèche (PIH).",
    education:
      "Tes joues ou tes bras « rugueux comme une poule » sont des bouchons de kératine héréditaires, pas de la saleté. Une crème riche à l'urée, brossée en douceur, lisse la peau en quelques semaines — mais frotter fort la noircit.",
    glossaire: "kératose",
    vlmHint: "papules folliculaires rugueuses denses pommettes, peau poulet",
  },

  // ───────────────────── ECZÉMAS & DERMITES (10) ─────────────────────

  {
    id: "atopie",
    nom: "Dermatite atopique (eczéma)",
    aliases: ["eczéma", "allergie de peau"],
    categorie: "eczema",
    frequence: "tres-frequente",
    zones: ["visage", "mains", "dos"],
    surPeauNoire:
      "Sur peau noire, l'atopie est souvent PAPULEUSE (petits boutons) et LICHÉNIFIÉE (peau épaissie, plus foncée) plutôt que rouge : plis des coudes/genoux, fissure derrière les oreilles, joues sèches de l'enfant. Prurit intense nocturne ; PIH à chaque poussée.",
    symptomes: ["démangeaisons fortes la nuit", "peau sèche épaisse", "fissures derrière oreilles"],
    confondAvec: ["teigne (enfant)", "psoriasis (couche épaisse isolée)", "scabies"],
    niveau: "dermato",
    action:
      "Émollients 2×/jour (karité), bains courts tièdes sans savon agressif, ongles courts ; poussées suintantes ou fièvre → médecin (infection) ; forme sévère → suivi dermato pédiatrique.",
    education:
      "L'eczéma de peau noire gratte surtout la nuit et épaissit la peau aux plis plutôt que de la rougir. Le vrai soin, c'est la crème ÉPAISSE deux fois par jour et l'eau tiède, jamais chaude. Gratté, il tache ; suivi, il s'éteint avec l'âge chez la plupart des enfants.",
    drapeau: "Suintement, croûtes jaunes, fièvre (surinfection) → médecin VITE.",
    indicateurs: ["Irritation / Eczéma", "Sécheresse cutanée"],
    glossaire: "eczéma",
    vlmHint: "plaques papuleuses lichenifiees plis + fissure retro-auriculaire",
  },
  {
    id: "pityriasis_alba",
    nom: "Pityriasis alba",
    aliases: ["taches blanches de l'enfant"],
    categorie: "eczema",
    frequence: "tres-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plaques PLUS PÂLES que la peau, à bord flou, légèrement FINE-SQUAMEUSES (poudreux au doigt), sur les joues des enfants et ados noirs. Forme légère d'eczéma : s'assombrit au soleil, repigmente en quelques mois une fois hydraté. LE piège diagnostique n°1 (confondu avec lèpre/vitiligo).",
    symptomes: ["taches claires", "peau sèche", "parfois démangeaisons légères"],
    confondAvec: ["vitiligo (blanc pur, net)", "lèpre (perte de sensibilité)", "pityriasis versicolor (tronc)"],
    niveau: "educatif",
    action:
      "Hydratation épaisse quotidienne (karité), photoprotection, tranquillité : ce n'est NI la lèpre NI le vitiligo. Si la plaque perd la sensibilité → médecin.",
    education:
      "Ces taches plus claires sur les joues des enfants sont de l'eczéma léger, très fréquent sur peau noire. Elles reprennent leur couleur en quelques mois avec une bonne crème et du soleil modéré. Elles ne sont ni contagieuses, ni la lèpre — rassure l'école aussi.",
    glossaire: "pityriasis alba",
    vlmHint: "plaques pale bord flou + fine squame joues enfant",
  },
  {
    id: "dermite_contact_irritative",
    nom: "Dermite de contact irritative",
    aliases: ["main de ménage", "mains craquelées"],
    categorie: "eczema",
    frequence: "tres-frequente",
    zones: ["mains", "visage"],
    surPeauNoire:
      "Mains SÈCHES, épaissies, brun-foncé terne, craquelées sur les jointures — chez les laveuses, ménagères, coiffeuses et manipulatrices d'eau + savons/détergents. Sur peau noire, l'irritation rend terne et foncé avant de fissurer. Visage : joues irritées par savons noirs trop forts ou gommages répétés.",
    symptomes: ["tiraillements", "fissures douloureuses", "brûlure à l'eau"],
    confondAvec: ["mycose des mains (unilatérale)", "psoriasis (couche isolée)"],
    niveau: "educatif",
    action:
      "Gants + savon sans savon + émollient après chaque lavage (karité en couche épaisse), réduire la fréquence des gommages faciaux ; fissures profondes ou suintement → avis médical.",
    education:
      "Tes mains abîmées parlent de ton travail, pas de ton âge : eau + savons à répétition dissolvent le bouclier de la peau. Des gants, un nettoyant doux et du karité juste après chaque contact d'eau réparent en deux semaines. La teinture « grand-mère » aggrave les fissures.",
    indicateurs: ["Irritation / Eczéma", "Sécheresse cutanée"],
    glossaire: "dermite de contact",
    vlmHint: "mains seches epaisses brun-terne fissurees, metier exposant",
  },
  {
    id: "dermite_contact_allergique",
    nom: "Dermite de contact allergique",
    aliases: ["allergie bijou", "allergie produit"],
    categorie: "eczema",
    frequence: "frequente",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Eczéma VIOLET-BRUN bien délimité EXACTEMENT à la zone de contact : lobes d'oreilles et poignets (nickel), paupières et joues (teintures, PPD), dessus des pieds (caoutchouc des sandales), nuque (teinture). Surveiller le gonflement du visage (réaction forte).",
    symptomes: ["démangeaisons vives", "petites vésicules", "gonflement de la zone"],
    confondAvec: ["dermite irritative", "mycose (bord actif)"],
    niveau: "dermato",
    action:
      "Retirer le suspect (bijou, produit, teinture) ; dermato pour tests (patch tests) ; jamais de corticoïde fort sans avis ; œil gonflé ou gêne respiratoire → URGENCE.",
    education:
      "Ton oreille ou ta paupière a « réagi » à un contact précis — nickel des bijoux de rue, teinture capillaire, collants neufs. La zone gonfle et gratte exactement là où l'objet touche. Éliminer le coupable suffit ; un dermatologue peut le confirmer par des tests.",
    drapeau: "Gonflement du visage/lèvres, gêne pour respirer → URGENCE.",
    glossaire: "allergie",
    vlmHint: "plaque violet-brun NETTE a la zone de contact (oreille/paupiere)",
  },
  {
    id: "eczema_nummulaire",
    nom: "Eczéma nummulaire (disciforme)",
    aliases: ["eczéma en pièces de monnaie"],
    categorie: "eczema",
    frequence: "frequente",
    zones: ["dos", "mains"],
    surPeauNoire:
      "Plaques en « PIÈCES DE MONNAIE » très prurigineuses, épaisses, squameuses et BRUN-VIOLACÉ sur les jambes, bras et dos — flare au harmattan, à la xérose et au stress. Sur peau noire, très hyperpigmentées en post-poussée.",
    symptomes: ["démangeaisons fortes", "plaques rondes", "aggravation saison sèche"],
    confondAvec: ["psoriasis (couche argentée isolée)", "teigne (bord actif, enfant)"],
    niveau: "institut",
    action:
      "Émollients abondants, savons doux, humidificateur d'air le soir ; dermato si plaques récidivantes (prise en charge spécifique) ; ne jamais gratter (PIH).",
    education:
      "Ces plaques rondes qui grattent comme des pièces posées sur la peau adorent la saison sèche et les douches brûlantes. Crème ÉPAISSE, eau tiède, air humide la nuit : elles s'éteignent. Grattées, elles deviennent des taches sombres de longues durée.",
    glossaire: "eczéma",
    vlmHint: "plaques rondes epaisses squameuses brun-violace, prurigineuses",
  },
  {
    id: "dermite_seborrheique",
    nom: "Dermite séborrhéique",
    aliases: ["pellicules", "dermite du visage"],
    categorie: "eczema",
    frequence: "tres-frequente",
    zones: ["visage", "cuir_chevelu", "barbe"],
    surPeauNoire:
      "Sur peau noire : plaques BRUN-CLAIR (hypopigmentées!) ou brun foncé, ANNULAIRES en guirlande, à bordure fine squameuse, sur les sourcils, ailes du nez, sillon naso-génien et barbe + cuir chevelu pelliculeux. L'aspect « taches claires du visage » du jeune adulte africain — on la prend pour une mycose.",
    symptomes: ["démangeaisons modérées", "pellicules", "plaques récidivantes"],
    confondAvec: ["pityriasis versicolor (très fine squame, tronc)", "lupus (cicatrice)", "vitiligo"],
    niveau: "institut",
    action:
      "Shampooing doux antifongique 2×/semaine + hydratation légère ; formes étendues/rapides ou récidivantes → dermato (possibilité de fond médical à dépister) ; ne pas utiliser de pommades fortes de rue.",
    education:
      "Ces plaques en guirlandes, tantôt claires tantôt foncées, sur les sourcils et les ailes du nez viennent d'un déséquilibre de la flore cutanée, avec le stress et la fatigue. Un shampooing doux adapté et une crème légère suffisent — l'évolution en taches claires revient à la normale.",
    drapeau: "Éruption soudaine, étendue ou rebelle → avis médical.",
    indicateurs: ["Desquamation (pellicules)", "Irritation du cuir chevelu"],
    glossaire: "dermite séborrhéique",
    vlmHint: "plaques annulaires hypochromiques sourcils/ailes nez, squame fine",
  },
  {
    id: "dermite_periorale",
    nom: "Dermite péri-orale",
    categorie: "eczema",
    frequence: "peu-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Papules et pustules MICRO-VIDÉOIQUES en couronne autour de la bouche (bord de la lèvre respecté), souvent brun-violacé sur peau noire — après utilisation de crèmes corticoïdes (fréquemment cachées dans les crèmes éclaircissantes) ou de sticks occlusifs.",
    symptomes: ["picotements péribuccaux", "aspect « boutons autour de la bouche »", "crème forte utilisée"],
    confondAvec: ["acné", "rosacée (rare sur peau foncée)"],
    niveau: "dermato",
    action:
      "ARRÊT du déclencheur — crème corticoïde/éclaircissante (PROGRESSIF, jamais brutal), zéro soin le temps que la peau se réinitialise ; accompagnement dermato conseillé.",
    education:
      "Ces boutons en couronne autour de la bouche sont une réaction des pores aux crèmes trop fortes ou trop occlusives — souvent une crème « miracle » de la rue. La peau se répare quand on la laisse RESPIRER quelques semaines, avec un arrêt tout en douceur du produit.",
    glossaire: "dermite péri-orale",
    vlmHint: "papules/pustules couronne autour bouche, bord levre respecte",
  },
  {
    id: "dyshidrose",
    nom: "Dyshidrose",
    aliases: ["boutons d'eau des mains"],
    categorie: "eczema",
    frequence: "frequente",
    zones: ["mains"],
    surPeauNoire:
      "Vésicules PROFONDES en « tapioca » sur les flancs des doigts et les paumes, très prurigineuses ; sur peau noire, enflammées violacé, desquamation brune post-crise. Stress, chaleur et sueur déclenchent.",
    symptomes: ["démangeaisons intenses", "petites bulles enfouies", "peau qui pèle après"],
    confondAvec: ["mycose des mains (asymétrique)", "gale (sillons)"],
    niveau: "institut",
    action:
      "Ponction INTERDITE (infection + PIH), compresses fraîches, émollients ; dermato si invalidant ou récidivant ; gérer la chaleur et le stress.",
    education:
      "Ces petites bulles d'eau enfouies dans les paumes sont un eczéma du stress et de la sueur. Elles percent seules et pèlent — c'est leur façon de finir. Ne les perce pas : sur peau noire, chaque bulle crevée laisse une tache. Fraîcheur et patience les éteignent.",
    glossaire: "dyshidrose",
    vlmHint: "vesicules profondes tapioca flancs doigts/paumes, prurigineuses",
  },
  {
    id: "intertrigo",
    nom: "Intertrigo des plis",
    aliases: ["chauffe des plis", "mycose des plis"],
    categorie: "eczema",
    frequence: "tres-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plis rouges-moites RECOUVERTS en réalité brun-violacé « verni », macérés, fissurés au fond (aisselles, aine, sous les seins, nuque), avec bordure Active et collerettes (satellites) si candidose. Douleur de feu au frottement, aggravé par la chaleur et le sucre.",
    symptomes: ["brûlure des plis", "macération", "odeur"],
    confondAvec: ["psoriasis inversé (pas de macération)", "erythrasma"],
    niveau: "institut",
    action:
      "SÉCHER les plis après toilette, textile ample en coton, poudre/ovale anti-macération ; candidose étendue ou récidivante → médecin (chercher un diabète).",
    education:
      "La « chauffe » des plis vient de l'humidité prisonnière sous les seins ou dans l'aîne en climat tropical. Sèche chaque pli, porte du coton ample, et elle s'éteint. Si elle revient sans arrêt, fais contrôler ton sucre : c'est parfois le premier signal.",
    drapeau: "Douleur de feu + suintement + fièvre → médecin VITE.",
    glossaire: "mycose des plis",
    vlmHint: "plis maceres brun-violace vernis, fissure au fond, satellites",
  },
  {
    id: "xerose",
    nom: "Xérose (peau cendrée)",
    aliases: ["peau de croco", "peau cendrée", "craquelures d'harmattan"],
    categorie: "eczema",
    frequence: "tres-frequente",
    zones: ["visage", "mains", "dos", "barbe"],
    surPeauNoire:
      "Peau TERNE-GRISE, mate, couverte de fines squames « cendre » — visibles en lumière rasante surtout sur jambes et dos. Signature du harmattan (air sec + poussière) et des douches brûlantes avec savons décapants. La « peau de croco » des enfants est la même chose.",
    symptomes: ["tiraillements", "démangeaisons", "aspect cendré"],
    confondAvec: ["ichtyose (héréditaire, plaques épaisses en écorce)"],
    niveau: "educatif",
    action:
      "Douches courtes tièdes, nettoyant sans savon, ÉMOLLIENT dans la minute qui suit (règle des 3 minutes) karité/huile sur peau humide ; humidifier la chambre le soir.",
    education:
      "Ta peau « grise comme la cendre » réclame de l'eau AU DEDANS et une couche d'huile au dehors : le harmattan l'assèche, les douches chaudes la décapent. Applique ton karité sur une peau encore humide, dans les trois minutes — c'est toute la différence.",
    indicateurs: ["Hydratation", "Sécheresse cutanée"],
    glossaire: "peau sèche",
    vlmHint: "fin squames grises matees, teint terne-cendre, jambes/dos",
  },

  // ───────────────────── BACTÉRIEN (6) ─────────────────────

  {
    id: "impetigo",
    nom: "Impétigo",
    aliases: ["gale des écoliers", "croûtes de miel"],
    categorie: "bacterien",
    frequence: "tres-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Croûtes jaunes « MIEL » sur fond violacé (impétigo croûteux) ou bulles flasques à bord collerette (impétigo bulleux), autour du nez et de la bouche des enfants. Très contagieux en famille et à l'école ; sur peau noire, laisse des taches claires ou foncées post-croûtes.",
    symptomes: ["croûtes jaunes", "boutons qui coulent", "contagion entre enfants"],
    confondAvec: ["herpès (groupé, récidivant)", "teigne (cheveux touchés)"],
    niveau: "dermato",
    action:
      "Avis médical (traitement antibiotique nécessaire), lésions couvertes, linge/serviettes PERSONNELS lavés à chaud, ongles courts ; ne pas école/piscine jusqu'aux croûtes sèches.",
    education:
      "Ces croûtes couleur miel autour de la bouche de l'enfant sont une infection bactérienne très contagieuse — elle se traite vite et bien avec un traitement médical, pas avec des feuilles. Éloigne les serviettes partagées et couvre les lésions le temps du soin.",
    drapeau: "Gonflement du visage, fièvre ou plaies qui s'étendent → médecin VITE.",
    glossaire: "impétigo",
    vlmHint: "croûtes jaunes miel peribuccales enfant, fond violace",
  },
  {
    id: "ecthyma",
    nom: "Ecthyma",
    categorie: "bacterien",
    frequence: "peu-frequente",
    zones: ["mains"],
    surPeauNoire:
      "Ulcérations POCHEES (« poinçonnées ») à fond nécrotique recouvert d'une croûte épaisse, surtout jambes et pieds des enfants carencés — impétigo profond négligé. Cicatrice brun foncé définitive.",
    symptomes: ["croûtes profondes", "petits trous", "guérison lente"],
    confondAvec: ["Buruli (indolore, bords SOUS-MINÉS)", "leishmaniose"],
    niveau: "dermato",
    action:
      "Avis médical sans tarder (infection profonde), couvrir, ne pas gratter les croûtes ; amélioration de la nutrition générale de l'enfant.",
    education:
      "Ces « petits cratères » croûteux des jambes sont une infection bactérienne qui a creusé trop profond — elle demande un traitement médical. Plus c'est tôt, moins la cicatrice reste. Un enfant qui en fait plusieurs a besoin d'être nourri et suivi.",
    glossaire: "impétigo",
    vlmHint: "ulcerations pochees croûte epaisse jambes/pieds enfant",
  },
  {
    id: "erysipele",
    nom: "Érysipèle / cellulite",
    aliases: ["infection de la peau", "grosse jambe rouge"],
    categorie: "bacterien",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plaque CHAUDE, GONFLÉE, luisante et DOULOUREUSE (rouge « brique » masqué : sur peau noire, chercher CHaleur + Gonflement + Douleur à la palpation, au lieu du rouge), + fièvre/frissons. Jambe (entrée par mycose des orteils) ou visage. URGENCE.",
    symptomes: ["peau chaude et douloureuse", "fièvre", "frissons", "gonflement"],
    confondAvec: ["furoncle", "vipère (morsure)", "lymphangite filarienne"],
    niveau: "urgence",
    action:
      "URGENCE MÉDICALE IMMÉDIATE (traitement antibiotique injectable) ; ne pas masser, ne pas « inciser » ; chercher la porte d'entrée (intertrigo des orteils à traiter ensuite).",
    education:
      "Une zone de peau qui gonfle, chauffe et fait mal avec de la fièvre n'est pas un simple bouton : c'est une infection qui gagne la peau en profondeur. Sur peau noire, le rouge ne se voit pas — c'est la chaleur et la douleur qui parlent. Va vite à l'hôpital, c'est très bien traité.",
    drapeau: "Fièvre + peau chaude/gonflée/douloureuse, bulles ou marbrures → HÔPITAL immédiatement.",
    glossaire: "érysipèle",
    vlmHint: "plaque chaude gonflee luisante douloureuse + fievre, jambe/visage",
  },
  {
    id: "furonculose",
    nom: "Furonculose",
    aliases: ["clous", "petits boils", "furoncles"],
    categorie: "bacterien",
    frequence: "tres-frequente",
    zones: ["visage", "dos", "barbe", "cuir_chevelu"],
    surPeauNoire:
      "Nodules ROUGES-VIOLACÉS douloureux, chauds, « mûrissant » en pointe blanche (clou), sur nuque, aisselles, fesses, cuisses et visage. Récidivants = staphylocoque porté (nez, aisselles, tondeuses partagées). Le triangle du visage (nez/lèvres) : danger de propagation interne.",
    symptomes: ["clou douloureux", "chaleur locale", "récurrences"],
    confondAvec: ["acné nodulaire", "anthrax (furoncle multiple)"],
    niveau: "dermato",
    action:
      "Compresses tièdes, JAMAIS presser (surtout visage) ; furoncles répétés → médecin (dépistage portage + diabète), tondeurs/serviettes personnels, hygiène du linge.",
    education:
      "Le « clou » est un poil infecté qui murit comme un fruit. Compresses tièdes et patience, il perce seul — mais ne le presse JAMAIS, surtout sur le visage. S'ils reviennent en série, fais contrôler ton sucre : le diabète adore les clous à répétition.",
    drapeau: "Furoncle du nez/du triangle facial, fièvre, ou gonflement du visage → médecin VITE.",
    glossaire: "furonculose",
    vlmHint: "nodules douloureux violaces a pointe blanche, nuque/fesses/visage",
  },
  {
    id: "buruli",
    nom: "Ulcère de Buruli",
    categorie: "bacterien",
    frequence: "peu-frequente",
    zones: ["mains"],
    surPeauNoire:
      "Débute en nodule ou plaque INDOLORE (c'est le piège) qui fond en ulcère LARGE à bords SOUS-MINÉS (la peau déborde sur la plaie), fond blanchâtre nécrotique — jambes et bras des enfants en zones rurales humides. Endémique en Côte d'Ivoire. Mycobactérie (cousine de la lèpre et de la TB).",
    symptomes: ["plaie qui ne fait pas mal", "fond blanchâtre", "s'agrandit lentement"],
    confondAvec: ["furoncle (douloureux)", "leishmaniose", "phlegmon"],
    niveau: "urgence",
    action:
      "URGENCE de consultation (antibiothérapie WHO efficace SI précoce — au-delà : chirurgie). Toute plaie indolore qui grandit = médecin SANS attendre.",
    education:
      "Une plaie qui grandit SANS faire mal est un signal d'alerte, pas une chance : l'ulcère de Buruli ronge la peau en silence, surtout chez l'enfant, et il existe dans notre région. Pris tôt, un simple traitement oral le guérit — pris tard, il laisse des cicatrices profondes.",
    drapeau: "Toute ulcération INDOLORE qui s'agrandit depuis > 2 semaines → consultation immédiate.",
    glossaire: "ulcère de Buruli",
    vlmHint: "ulcere bords sous-mines fond blanchatre, INDOLORE, enfant",
  },
  {
    id: "lepre",
    nom: "Lèpre",
    aliases: ["maladie de Hansen", "plaque anesthésique"],
    categorie: "bacterien",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Plaque légèrement PLUS CLAIRE (sur peau noire : cuivrée-terne) au bord ENFÉ, avec PERTE DE SENSIBILITÉ (piqûre/coton non sentis) — parfois plaques infiltrées épaisses, madarosis (perte de sourcils) et oreilles épaissies. Mycobactérie, incubation des années. GUÉRISSABLE, traitement gratuit OMS.",
    symptomes: ["plaque qui ne sent rien", "engourdissements", "mains qui s'abîment sans douleur"],
    confondAvec: ["pityriasis alba (enfant, sensibilité NORMALE)", "vitiligo", "teigne"],
    niveau: "urgence",
    action:
      "Consultation médicale rapide pour confirmation ( examen des nerfs) : traitement multi-médicamenteux GRATUIT (OMS) ; plus tôt = zéro séquelle. Zéro stigmatisation.",
    education:
      "La lèpre commence par une plaque plus claire qui PERD la sensibilité — tu ne sens plus une piqûre dessus. C'est une infection qui se guérit complètement avec le traitement gratuit de l'OMS, et plus elle est prise tôt, moins elle abîme les nerfs. Personne ne « mérite » cette maladie.",
    drapeau: "Plaque anesthésique (ne sent pas le toucher) ou faiblesse des mains/pieds → médecin VITE.",
    glossaire: "lèpre",
    vlmHint: "plaque claire cuivree perte sensibilite, sourcils amincis",
  },

  // ───────────────────── FONGIQUE (6) ─────────────────────

  {
    id: "teigne_capitis",
    nom: "Teigne du cuir chevelu (enfant)",
    aliases: ["teigne", "chauve par plaques de l'enfant"],
    categorie: "fongique",
    frequence: "tres-frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "Plaques SQUAMEUSES grisâtres avec cheveux CASSÉS courts « points noirs » (Trichophyton : teigne tondante de l'enfant africain), petites zones dégarnies arrondies ; parfois KÉRION (plaques à bosse enflammées, huileuses) — urgence. Contagion école/famille, chapeaux et tresses partagés.",
    symptomes: ["plaques sans cheveux", "pellicules localisées", "parfois bosse douloureuse (kerion)"],
    confondAvec: ["alopécie areata (pas de squames)", "dermite séborrhéique", "psoriasis du cuir"],
    niveau: "dermato",
    action:
      "Avis médical (traitement ORAL nécessaire, les produits locaux seuls ne suffisent PAS) ; couvrir/tailler les cheveux, linge et bonnets lavés à chaud, vérifier fratrie/école. Ne pas renvoyer l'enfant à l'école avant traitement.",
    education:
      "Les plaques chauves squameuses de l'enfant sont un champignon qui vit DANS le cheveux — seuls les produits par la bouche le guérissent, les huiles massées ne font que l'étouffer. C'est très contagieux mais très bien soigné ; il faut souvent traiter les petits frères et sœurs en même temps.",
    drapeau: "Kérion (plaques enflammées, suintantes, douloureuses) → médecin VITE, risque de zone chauve définitive.",
    indicateurs: ["Taches alopeciques", "Desquamation (pellicules)"],
    glossaire: "teigne",
    vlmHint: "plaques squameuses grisatres cheveux casses points noirs, enfant",
  },
  {
    id: "teigne_corps",
    nom: "Teigne du corps",
    aliases: ["mycose en cercle", "herpès circiné"],
    categorie: "fongique",
    frequence: "tres-frequente",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Plaque ANNULAIRE en « cercle » : bord ACTIF relevé squameux-pustulaire BRUN-VIOLACÉ, centre plus CLAIR qui repigmente — le cercle grandit en s'agrandissant, souvent chez l'enfant (teigne du visage) ou par le chat/cheval/dog. Cache par crèmes corticoïdes = « tinea incognito » : bord devient étendu, à démasquer.",
    symptomes: ["démangeaisons", "cercle qui grandit", "bordure active"],
    confondAvec: ["psoriasis (pas de bord actif fin)", "pityriasis rosea (herald)", "nummulaire"],
    niveau: "institut",
    action:
      "Antifongique local si petite lésion unique + linge lavé à chaud ; STOPPER toute crème corticoïde suspectée ; étendu, récidivant ou enfant → médecin (traitement oral).",
    education:
      "Le « cercle qui grandit » est un champignon qui ronge le bord et guérit au centre — sur peau noire, le centre repigmente en clair. Ne masque pas avec des crèmes fortes : le cercle « incognito » devient énorme. Deux semaines de produit adapté viennent à bout d'un cercle simple.",
    glossaire: "mycoses",
    vlmHint: "plaque annulaire bord actif releve, centre plus clair, grandit",
  },
  {
    id: "mycose_plis",
    nom: "Intertrigo mycosique (plis)",
    aliases: ["mycose de l'aine", "mycose des seins"],
    categorie: "fongique",
    frequence: "tres-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Plis érythémato-violacés à bord NET, bordure « cordée » avec collerette DESQUAMATIVE et pustules SATELLITES (candidose) ou bordure active annulaire en croissant (dermatophyte) — aines, sous-seins, ombilic, fesses. Chaleur + sueur + frottement + parfois sucre élevé.",
    symptomes: ["démangeaisons des plis", "brûlure", "récidives"],
    confondAvec: ["intertrigo simple (macération pure)", "erythrasma", "psoriasis inversé"],
    niveau: "institut",
    action:
      "Sécher les plis, antifongique local, coton ample ; RÉCIDIVES répétées → médecin (contrôle du sucre) ; ne jamais appliquer de corticoïde seul (aggrave).",
    education:
      "La mycose des plis adore la chaleur et la sueur de notre climat. Elle se reconnaît à sa bordure nette et ses petits boutons autour — et elle ne part PAS avec les crèmes cortisone, elles la nourrissent. Sèche bien les plis, et si elle revient sans arrêt, fais doser ton sucre.",
    glossaire: "mycose des plis",
    vlmHint: "plis violaces bord net collerette + pustules satellites, aine/seins",
  },
  {
    id: "mycose_pieds",
    nom: "Pied d'athlète & onychomycose",
    aliases: ["mycose des pieds", "ongles jaunes"],
    categorie: "fongique",
    frequence: "tres-frequente",
    zones: ["mains"],
    surPeauNoire:
      "Macération BLANCHÂTRE prurigineuse entre les orteils (interdigitale), plantes sèches squameuses « mocassins » ; ongles épaissis jaune-brun friables (onychomycose — fréquente après tontes de pédicure et chaussettes synthétiques). Porte d'entrée de l'érysipèle.",
    symptomes: ["démangeaisons entre orteils", "ongles épais jaunes", "brûlure"],
    confondAvec: ["psoriasis des ongles (pits)", "shoes dermatitis"],
    niveau: "institut",
    action:
      "Sécher entre les orteils après douche, antifongique local + chaussures aérées/chaussettes coton ; ONGLIS → traitement long par la bouche (médical) ; diabétique → avis médical systématique.",
    education:
      "La « chauffe entre les orteils » est un champignon qui adore les chaussures fermées et la sueur. Il se traite localement avec régularité — mais quand l'ONGLE devient jaune et épais, il faut un traitement par la bouche, long, prescrit par un médecin. Sèche bien entre les orteils, surtout.",
    drapeau: "Diabétique + mycose des pieds → avis médical (risque de plaie sérieuse).",
    glossaire: "mycoses",
    vlmHint: "maceration blanche interorteils + plantes squameuses, ongles jaunes epais",
  },
  {
    id: "pityriasis_versicolor",
    nom: "Pityriasis versicolor",
    aliases: ["taches blanches", "tinea versicolor", "levure des taches"],
    categorie: "fongique",
    frequence: "tres-frequente",
    zones: ["visage", "dos"],
    surPeauNoire:
      "Nombreuses macules HYPOCHROMIQUES (blanc plus clair que la peau) à bord flou, couvertes d'une FINE squame « cigarette-paper » visible en grattant légèrement — tronc, épaules, cou, front. Sur peau noire, les « taches blanches » du retour de plage : la levure bloque le bronzage local. NON contagieux.",
    symptomes: ["taches claires finement poudreuses", "reviennent chaque année", "sueur les étend"],
    confondAvec: ["vitiligo (blanc pur, pas de squame)", "pityriasis alba (enfant, joues)", "lèpre"],
    niveau: "educatif",
    action:
      "Shampooing antifongique en application corps (quelques minutes au douche) 1×/semaine quelques semaines ; la REPigmentation prend 2-3 mois après guérison — pas de panique ; éviter les huiles occlusives sur le tronc.",
    education:
      "Les « taches blanches » du dos et des épaules, qui poudrent sous l'ongle, sont une levure bénigne qui bloque la couleur là où elle vit — surtout en climat chaud et humide. Ce n'est pas la lèpre, ni le vitiligo. Un shampooing adapté la tue, mais la couleur revient en 2-3 mois : c'est normal.",
    indicateurs: ["Éclat / Uniformité du teint"],
    glossaire: "pityriasis versicolor",
    vlmHint: "macules hypochromiques fines squames tronc/front, non contagieux",
  },
  {
    id: "candidose",
    nom: "Candidose cutanéo-muqueuse",
    aliases: ["muguet", "mycose à levures"],
    categorie: "fongique",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Enduit BLANC crème sur langue/bouche (muguet du nourrisson ou de l'adulte), perlèches fissurées aux commissures, intertrigo satellites (voir mycose_plis), vulvite prurigineuse (non photographiée). Récurrences = signal à explorer (sucre, grossesse, antibio, défense basse).",
    symptomes: ["enduit blanc bouche", "fissures commissures", "démangeaisons"],
    confondAvec: ["leucoplasie (fixe, raclable)", "perniciose (déficit B12)"],
    niveau: "dermato",
    action:
      "Avis médical/dermato pour confirmation et cause de fond (glycémie à contrôler si récidives) ; hygiène buccale, tétines stérilisées pour bébé ; enduit blanc inextensible ou chronique → médecin VITE.",
    education:
      "Le « blanc » dans la bouche du bébé ou les fissures aux coins des lèvres sont une levure qui pousse quand les défenses ou le sucre déséquilibrent. Chez le bébé c'est fréquent et bénin ; chez l'adulte en récurrences, c'est un message du corps qui mérite une consultation.",
    drapeau: "Muguet de l'adulte qui récidive + amaigrissement/fatigue → consultation (bilan).",
    glossaire: "candidose",
    vlmHint: "enduit blanc creme langue/commissures fissurees, perlèche",
  },

  // ───────────────────── PARASITAIRE (8) ─────────────────────

  {
    id: "gale",
    nom: "Gale (sarcoptes)",
    aliases: ["gale commune", "démangeaisons nocturnes en famille"],
    categorie: "parasitaire",
    frequence: "tres-frequente",
    zones: ["mains", "visage"],
    surPeauNoire:
      "Sillons fins entre les DOIGTS, poignets, aisselles, taille et organes génitaux + nodules brun-foncé prurigineux ; sur peau noire, excoriations et PIH prurigineuses en nappe. Le prurit NOCTURNE en famille est LE signal. En foyer serré (cités, internats), galops épidémiques.",
    symptomes: ["démangeaisons VIVES le soir/nuit", "plusieurs membres de la famille grattent", "sillons"],
    confondAvec: ["atopie (pas de contagion familiale)", "onchocercose (pas de sillons)", "mite bites"],
    niveau: "dermato",
    action:
      "Avis médical (traitement TOUTE la famille en même temps, produits par la bouche/locaux) ; linge de lit/vêtements lavés 60 °C ou isolés 72 h ; griffures désinfectées pour éviter les surinfections.",
    education:
      "Quand toute la maison gratte la nuit, c'est la gale : un acarien microscopique qui creuse sa route sous la peau, surtout entre les doigts. Le traitement marche très bien — mais il faut TRAITER TOUT LE MONDE le même jour et laver les draps à 60°, sinon le cycle recommence.",
    drapeau: "Croûtes épaisses généralisées (gale « norvégienne », très contagieuse) → URGENCE.",
    glossaire: "gale",
    vlmHint: "sillons interdigitaux + prurit nocturne FAMILIAL, nodules brun-fonce",
  },
  {
    id: "tungose",
    nom: "Tungose (chiques)",
    aliases: ["chiques", "puce de sable", "jiggers"],
    categorie: "parasitaire",
    frequence: "frequente",
    zones: ["mains"],
    surPeauNoire:
      "Point NOIR central dans une papule inflammatoire douloureuse du bord des ONGLES/plantes des pieds — la puce femelle s'est enfouie et grossit. Pieds nus sur sable/terre des quartiers non bitumés ; enfants surtout. Multiples chiques = handicap de marche.",
    symptomes: ["point noir douloureux", "gonflement du bout de l'orteil", "douleur à la marche"],
    confondAvec: ["ver de Cayor (trou respiratoire, tronc)", "furoncle", "mycose"],
    niveau: "institut",
    action:
      "Extraction STÉRILE (aiguille nettoyée/alcool) par une personne formée — jamais avec une lame sale au risque du tétanos ; laver, couvrir ; chaussures fermées + sol de la maison traité ; surinfection (rougeur qui monte) → médecin.",
    education:
      "La « chique » est une minuscule puce qui s'enterre dans la peau des pieds quand on marche nu sur la terre et le sable. On la retire proprement avec une aiguille stérile — jamais avec une pointe rouillée : le tétanos guette. Les chaussures fermées et le sol bétonné la chassent pour de bon.",
    drapeau: "Rougeur qui monte, pus, fièvre après extraction → médecin VITE (infection/tétanos).",
    glossaire: "chiques",
    vlmHint: "point noir central papule douloureuse bord ongles/plantes, pieds nus",
  },
  {
    id: "myiase_tumbu",
    nom: "Myiase à tumbu (ver de Cayor)",
    aliases: ["ver sous la peau", "tumba fly"],
    categorie: "parasitaire",
    frequence: "peu-frequente",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Nodule FURUNCULOÏDE (comme un clou) avec CENTRE POREUX qui « respire » (point noir qui bouge), sur tronc, épaules, fesses ou cuir chevelu — la larve de la mouche tumbu, pondue sur le LINGE qui sèche à même le sol/corps. Sur peau noire : nodule violacé avec pointe sombre centrale.",
    symptomes: ["bosse douloureuse", "sensation de MOUVEMENT dedans", "linge séché dehors"],
    confondAvec: ["furoncle (pas de mouvement)", "chique (orteils)"],
    niveau: "institut",
    action:
      "Étouffer la larve (vaseline épaisse occlusive quelques heures : elle remonte respirer) puis extraction stérile COMPLETE ; antiseptique ; REPASSER le linge au fer (tuer les œufs) et sécher sur fil suspendu.",
    education:
      "Cette bosse avec un petit trou qui « respire » est un ver — la larve de la mouche tumbu, qui pond sur les habits qui sèchent sur le sol. On l'étouffe sous une couche de vaseline et il sort se faire tirer proprement. Et désormais : linge sur un FIL, repassé au fer chaud.",
    drapeau: "Zone du VISAGE, fièvre ou inflammation étendue → avis médical.",
    glossaire: "ver de Cayor",
    vlmHint: "nodule furunculoide point noir central qui respire, tronc/epaules",
  },
  {
    id: "larva_migrans",
    nom: "Larva migrans cutanée (larbish)",
    aliases: ["larbish", "sillon qui avance", "ankylostome"],
    categorie: "parasitaire",
    frequence: "tres-frequente",
    zones: ["mains"],
    surPeauNoire:
      "SILLON SERPENTIN qui AVANCE de quelques mm/jour, brun-violacé, très prurigineux — pieds, fesses, jambes après marche pieds nus sur sable/terre souillés par chiens/chats (plages, cours). La larve ne peut pas traverser : elle tourne sous la peau des semaines.",
    symptomes: ["sillon qui grandit", "démangeaisons vives", "pieds nus sur sable"],
    confondAvec: ["gale (sillons fixes interdigitaux)", "creeping eruption myiase"],
    niveau: "institut",
    action:
      "Avis médical ou pharmacie pour antiparasitaire (1 à 2 prises) — accélère une fin qui autrefois prend des semaines ; pieds couverts, sable des plages chiens interdit aux enfants ; ne pas gratter (PIH).",
    education:
      "Le « sillon qui rampe » est un petit ver de chien/chat qui ne peut pas traverser la peau : il tourne dedans en avançant. Il part avec un antiparasitaire simple. La vraie prévention, c'est de ne plus marcher pieds nus là où les bêtes font leurs besoins — surtout pour les petits.",
    glossaire: "larbish",
    vlmHint: "sillon serpentin AVANT brun-violace tres prurigineux, pieds",
  },
  {
    id: "pediculose",
    nom: "Pédiculose du cuir chevelu (poux)",
    aliases: ["poux", "lentes"],
    categorie: "parasitaire",
    frequence: "tres-frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "Démangeaisons de la NUQUE et derrière les oreilles ; sur cheveux crépus/tressés, les poux nichent à la base, on les voit aux LENTES (petits points gris-blanc collés au cheveux, près de la racine, qui ne détachent pas au souffle). École, tresses partagées, bonnets échangés.",
    symptomes: ["grattage de la nuque", "lentes visibles", "nuque écorchée (PIH)"],
    confondAvec: ["pellicules (se détachent au souffle)", "dermite séborrhéique"],
    niveau: "educatif",
    action:
      "Peigne fin métallique sur cheveux démêlés + traitement adapté aux cheveux texturés (applications sur mèches détachées) ; laver bonnets/nappes/taies 60 °C ; lente vivante = pou encore là.",
    education:
      "Les poux ne signifient pas « cheveux sales » — ils adorent les tresses fraîches et les bonnets partagés. Le peigne fin, mèche par mèche, et un traitement adapté en viennent à bout ; il faut répéter à J8, car les lentes survivent souvent au premier passage. Lave les bonnets à part.",
    glossaire: "poux",
    vlmHint: "lentes collees racine cheveux + prurit nuque, enfants",
  },
  {
    id: "onchocercose",
    nom: "Onchocercose",
    aliases: ["peau de léopard", "cécité des rivières"],
    categorie: "parasitaire",
    frequence: "peu-frequente",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Années de PRURIT GÉNÉRALISÉ puis peau ATTEINT : lichenification diffuse « peau de lézard », dépigmentation en MOTIFS (peau de léopard) et plis profondément marqués sur fesses/cuisses/visage + nodules fermes sous-cutanés (crêtes iliaques). Régions de rivières à mouches noires ; risque oculaire (cécité).",
    symptomes: ["démangeaisons années", "peau qui change", "trouble de la vision"],
    confondAvec: ["gale", "atopie diffuse", "pellagre"],
    niveau: "dermato",
    action:
      "Avis médical (ivermectine, programmes nationaux de distribution gratuite) ; dépistage oculaire si troubles visuels ; lutter contre les piqûres (manches longues près des rivières).",
    education:
      "La « peau de léopard » et les démangeaisons sans fin des zones de rivières viennent d'un ver transmis par la mouche noire. Un médicament simple, distribué GRATUITEMENT lors des campagnes, le tue — c'est vital de participer, car le ver peut aussi toucher les yeux.",
    drapeau: "Démangeaisons + Brouillard visuel / vision qui baisse → consultation OPHTALMO VITE.",
    glossaire: "onchocercose",
    vlmHint: "lichenification diffuse + depigmentation motifs (leopard), prurit ancien",
  },
  {
    id: "loase",
    nom: "Loase",
    aliases: ["gonflements de Calabar", "ver de l'oeil"],
    categorie: "parasitaire",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Gonflements TRANSITOIRES (5-10 cm) chauds et douloureux de la face avant de l'avant-bras/poignet/face, migrateurs, qui partent en quelques jours (réaction au ver) ; parfois le ver CROISE L'ŒIL (panique bénigne, mais consulter). Forêts du Gabon/Cameroun, mouche « mangrove ».",
    symptomes: ["gonflements qui viennent et partent", "urticaire profond", "ver dans l'œil"],
    confondAvec: ["angioedème allergique", "cellulite (fièvre, fixe)"],
    niveau: "dermato",
    action:
      "Avis médical (diagnostic sanguin, traitement antiparasitaire adapté — PAS pendant la migration oculaire) ; protection contre les mouches en zone de forêt.",
    education:
      "Des gonflements qui se déplacent au bras ou à la face, qui arrivent et repartent en quelques jours : c'est souvent la loase, un ver des forêts d'Afrique centrale transmis par une mouche. Ça se traite — et si tu vois « quelque chose » traverser ton œil, reste calme et montre-le à un médecin.",
    glossaire: "loase",
    vlmHint: "gonflement transitatoire chaud avant-bras/face, migre",
  },
  {
    id: "leishmaniose",
    nom: "Leishmaniose cutanée",
    categorie: "parasitaire",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Papule qui devient ULCÈRE « EN VOLCAN » : bord relevé DUR, fond granuleux propre, évolution sur des MOIS sans douleur, siège au visage/bras/jambes découverts — piqûre du phlébotome (fin moucheron du soir) en zone sèche/burrows. Zones au nord/est du pays.",
    symptomes: ["plaie chronique indolore", "bord dur relevé", "mois d'évolution"],
    confondAvec: ["Buruli (sous-miné)", "ecthyma", "BA (framboéside tropique rare)"],
    niveau: "dermato",
    action:
      "Avis médical (confirmation + traitement spécifique) — les cosmétiques n'ont AUCUNE prise ; couvrir contre le sable du soir (moustiquaire fine, manches) ; ne jamais appliquer de produits caustiques « qui brûlent la plaie ».",
    education:
      "Cette plaie « en volcan » avec un bord dur qui dure depuis des mois est un parasite transmis par un moucheron du soir. Elle ne guérit pas seule proprement et mérite un traitement médical spécifique — brûler la plaie au produit caustique est une fausse piste qui laisse des trous.",
    glossaire: "leishmaniose",
    vlmHint: "ulcere volcan bord dur releve, chronique, zones decouvertes",
  },

  // ───────────────────── VIRAL (7) ─────────────────────

  {
    id: "herpes_labial",
    nom: "Herpès labial",
    aliases: ["bouton de fièvre", "feu sauvage"],
    categorie: "viral",
    frequence: "tres-frequente",
    zones: ["visage"],
    surPeauNoire:
      "Groupe de VÉSICULES sur base inflammatoire violacée-brune, sensation de BRÛLURE avant l'éruption (la lèvre « chauffe »), croûte brun foncé en 3-4 jours. Réactivé par fièvre, soleil, règles, fatigue. Ultra-contagieux (baisers, serviettes, maquillage partagé).",
    symptomes: ["fourmillement avant", "petites cloquettes groupées", "brûlure"],
    confondAvec: ["impétigo (croûtes miel, enfant)", "furoncle"],
    niveau: "institut",
    action:
      "Ne pas toucher/percer, laver les mains après contact, éviter baisers et partage de baumes ; très fréquent (≥ 5-6 poussées/an) → avis médical (traitement préventif) ; jamais de corticoïde sur l'herpès.",
    education:
      "Le « bouton de fièvre » dort dans le nerf de la lèvre et se réveille aux fatigues, fièvres et grossesses. Il perce, croûte puis part en une semaine. Ne l'embrasse pas et ne partage ni baume ni serviette : il se colle à la moindre lèvre. S'il revient souvent, un médecin peut le calmer pour de bon.",
    glossaire: "herpès labial",
    vlmHint: "vesicules groupees base violace levre, brulure avant, croûte",
  },
  {
    id: "zona",
    nom: "Zona",
    aliases: ["shingles", "feu de Saint-Antoine"],
    categorie: "viral",
    frequence: "frequente",
    zones: ["visage"],
    surPeauNoire:
      "Vésicules GROUPÉES en BANDUETTE UNILATÉRALE (un seul côté du corps/visage, ne TRAVERSE PAS la ligne médiane) sur base violacée + douleur BRÛLANTE en écharpe qui PRÉCÈDE l'éruption. Sur peau noire : croûtes foncées + PIH. Zona ophtalmique (bout du nez) = urgence œil. Zona du jeune adulte = contrôler ses défenses.",
    symptomes: ["douleur brûlante avant les cloques", "un seul côté", "cloques groupées"],
    confondAvec: ["herpès simple", "infection bactérienne", "infarctus (douleur avant éruption)"],
    niveau: "urgence",
    action:
      "Consultation MÉDICALE RAPIDE (traitement d'autant plus efficace débuté < 72 h) ; bout du nez/œil touché → urgence ophtalmo ; zona du jeune adulte → bilan santé incluant VIH ; pas de corticoïde maison.",
    education:
      "La douleur brûlante en demi-ceinture qui précède les cloques est un zona : le virus de la varicelle qui se réveille dans un nerf. Un seul côté du corps. Plus vite il est traité, moins la douleur s'installe durablement. Un zona chez un jeune adulte invite à faire un contrôle de santé.",
    drapeau: "Zona de l'œil/nez, fièvre, ou zona chez l'enfant/jeune → médecin le jour même.",
    glossaire: "zona",
    vlmHint: "vesicules en bande UNILATERALE + douleur pre-existante, ne croise pas",
  },
  {
    id: "varicelle",
    nom: "Varicelle",
    categorie: "viral",
    frequence: "frequente",
    zones: ["visage", "dos"],
    surPeauNoire:
      "Cloques « GOUTTES DE ROSÉE » en COURONNES successives (tous les stades en même temps : taches, cloques, croûtes brun foncé), sur VISAGE+TRONC, avec fièvre. Sur peau noire : croûtes foncées et PIH qui traînent des mois — lutter contre le grattage de l'enfant.",
    symptomes: ["fièvre", "cloques partout", "démangeaisons"],
    confondAvec: ["mpox (adénopathies, lésions SIMULTANÉES)", "gale vésiculeuse"],
    niveau: "dermato",
    action:
      "Avis médical (jamais d'aspirine chez l'enfant), ongles courts + gants la nuit, douches tièdes, calamine ; adulte, femme enceinte ou nouveau-né touché → consultation VITE (formes graves).",
    education:
      "La varicelle fait pousser des « gouttes » partout en vagues successives, avec de la fièvre. Sur peau noire, chaque cloque grattée devient une tache sombre durable : coupe les ongles courts et applique des lotions calmantes. Adulte ou femme enceinte, ce n'est plus un jeu : consulte vite.",
    drapeau: "Fièvre haute + cloques qui saignent, ou adulte/femme enceinte → médecin VITE.",
    glossaire: "varicelle",
    vlmHint: "cloques gouttes rosee tous stades, visage+tronc, fievre enfant",
  },
  {
    id: "molluscum",
    nom: "Molluscum contagiosum",
    aliases: ["petites perles", "molluscum"],
    categorie: "viral",
    frequence: "tres-frequente",
    zones: ["visage", "dos"],
    surPeauNoire:
      "Papules PEARLÉES en « dôme » 2-5 mm avec OMBILICATION centrale (petit creux), couleur chair à brun clair, en GRAPPES sur joues, aisselles et plis des enfants (piscines, draps) ; sur peau noire, volontiers entourées d'un halo d'eczéma sec. Chez l'adulte : zone génitale (autre signification).",
    symptomes: ["petites perles luisantes", "parfois démangeaisons autour", " propagation au grattage"],
    confondAvec: ["DPN (plus sombre, pas de creux)", "verrues planes"],
    niveau: "institut",
    action:
      "Ne pas gratter/pincer, serviettes personnelles, draps lavés ; la moitié part seule en 6-12 mois ; lésions nombreuses ou génitales → dermato (retrait propre) ; traiter l'eczéma du halo diminue la propagation.",
    education:
      "Ces petites « perles » avec un creux au sommet sont des virus bénins qui voyagent d'une peau à l'autre par les draps et les piscines. Elles partent souvent seules en un an ; le grattage, lui, en sème de nouvelles. Un dermatologue les retire proprement quand elles sont trop nombreuses.",
    glossaire: "molluscum",
    vlmHint: "papules perlees ombiliquees 2-5mm, grappes enfant joues/plis",
  },
  {
    id: "verrues",
    nom: "Verrues (vulgaire / plane / plantaire)",
    aliases: ["cor", "verrue"],
    categorie: "viral",
    frequence: "frequente",
    zones: ["visage", "mains", "barbe"],
    surPeauNoire:
      "Papules rugueuses en « chou-fleur » (vulgaire, doigts/genoux), PALES et plates en plaques fines (verrues planes : visage des enfants — souvent en lignes de grattage) ou macules BRUNES ponctuées de points noirs (filiformes) ; plantaires : dôme hyperkératosique DOULOUREUX à la marche, points noirs (thromboses).",
    symptomes: ["rugosité", "douleur à la pression (plantaire)", "propagation par grattage"],
    confondAvec: ["DPN", "cors (pression, pas de points noirs)"],
    niveau: "dermato",
    action:
      "Ne jamais couper/brûler maison (PIH, infection) ; dermato pour retrait (azote/laser) ; plante : chaussettes/chaussons en lieux communs ; baisse immunitaire + verrues multiples → avis médical.",
    education:
      "Les verrues sont des virus qui rentrent par les micro-coupures — tontes, brossages, pieds nus en commun. La plupart partent en 1-2 ans, mais on les retire quand elles gênent ou se multiplient. Jamais de coupe-ongle maison ni de produit qui « brûle » : sur peau noire, ça tache pour longtemps.",
    glossaire: "verrues",
    vlmHint: "papule rugueuse chou-fleur / macule plate pale enfant / dome plantaire",
  },
  {
    id: "mpox",
    nom: "Mpox (variole du singe)",
    aliases: ["variole du singe", "monkeypox"],
    categorie: "viral",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Lésions PUSTULAIRES ombiliquées, FERMES, D'ASPECT UNIFORME (toutes au même stade, contrairement à la varicelle) sur visage, paumes/plantes, zone génitale + ADÉNOPATHIES volumineuses (cous, aines) + fièvre. Contact étroit peau-à-peau / rapports. Flambées africaines actuelles.",
    symptomes: ["fièvre", "gros ganglions", "pustules fermes", "éruption anogénitale possible"],
    confondAvec: ["varicelle (lésions d'âges différents, sans gros ganglions)", "impétigo", "herpès"],
    niveau: "urgence",
    action:
      "URGENCE : ISOLEMENT (chambre + masque + linges dédiés) et centre de santé désigné — dépistage gratuit ; ne toucher les lésions sous AUCUN prétexte ; informer les contacts proches.",
    education:
      "Fièvre, gros ganglions au cou ou à l'aine, et des pustules fermes sur les paumes, le visage ou les parties : pense mpox (variole du singe). Ce n'est pas une honte, mais c'est très contagieux — isole-toi et fais-toi dépister vite : plus tôt c'est confirmé, plus on protège les enfants et le quartier.",
    drapeau: "Fièvre + pustules + gros ganglions → centre de santé le jour même.",
    glossaire: "mpox",
    vlmHint: "pustules ombiliquees memes stades paumes/visage + adenopathies + fievre",
  },
  {
    id: "rougeole",
    nom: "Rougeole",
    categorie: "viral",
    frequence: "rare",
    zones: ["visage"],
    surPeauNoire:
      "Éruption MACULO-PAPULEUSE brun-rouge QUI DESCEND de la tête (derrière les oreilles) vers le tronc, + fièvre haute, toux, rhume, conjonctivite et taches KOPLIK (joue interne, blanc « grain de sucre »). Non-vaccinés ; sur peau noire, l'éruption est brun-violacé et peut desquamer.",
    symptomes: ["fièvre 3 jours", "toux + yeux rouges + nez", "taches qui descendent"],
    confondAvec: ["rubéole (adénopathies, plus léger)", "scarlatine", "éruption médicamenteuse"],
    niveau: "urgence",
    action:
      "Consultation médicale + signalement ; enfant isolé du 4e au 10e jour ; vitamine A selon protocole ; JAMAIS d'aspirine ; vérifier et rattraper les vaccins de la fratrie.",
    education:
      "Trois jours de fièvre + toux + yeux rouges, puis des taches qui descendent du visage vers le corps : c'est la rougeole. Elle peut descendre aux poumons — montre l'enfant vite. La vaccination protège à vie ; si la fratrie n'est pas à jour, c'est le moment de la rattraper.",
    drapeau: "Fièvre > 39 °C + difficultés respiratoires, convulsions, ou enfant < 1 an → URGENCE.",
    glossaire: "rougeole",
    vlmHint: "eruption descendante visage-tronc + fievre 3j + kochkoplik",
  },

  // ───────────────────── VIH (3) ─────────────────────

  {
    id: "prurigo_vih",
    nom: "Éruption papuleuse prurigineuse (VIH)",
    aliases: ["prurigo à éosinophiles", "boutons qui grattent sans fin"],
    categorie: "vih",
    frequence: "peu-frequente",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Papules BRUN-VIOLACÉES ferme, EXCORIÉES au sommet (grattage), symétriques sur faces d'extension des bras et tronc — prurit VOLONTIERS INTENSE ET NOCTURNE, PIH en miroir. C'est LA dermatose-signal de défenses basses chez la patiente africaine (avec la dermite séborrhéique explosive).",
    symptomes: ["démangeaisons terribles", "boutons fermes symétriques", "fatigue générale"],
    confondAvec: ["gale (contagion familiale)", "atopie", "insectes (piqûres)"],
    niveau: "dermato",
    action:
      "Avis médical : « boutons qui grattent des mois » + fatigue/perte de poids → TEST de dépistage (gratuit, anonyme) — sans jamais stigmatiser ; soulager par émollients et ongles courts en attendant.",
    education:
      "Une éruption de boutons fermes qui grattent des mois sans s'arrêter peut être un message des défenses immunitaires. Se faire dépister, c'est un test simple, gratuit et confidentiel — et le traitement actuel, bien suivi, éteint ces démangeaisons en quelques semaines.",
    drapeau: "Prurit chronique + perte de poids ou sueurs nocturnes → consultation + dépistage.",
    glossaire: "prurigo",
    vlmHint: "papules fermes excoriees symetriques, prurit intense chronique",
  },
  {
    id: "folliculite_eosinophile",
    nom: "Folliculite à éosinophiles",
    categorie: "vih",
    frequence: "rare",
    zones: ["visage", "dos"],
    surPeauNoire:
      "Papules FOLLICULAIRES (chaque pore) urticantes du VISAGE et haut du tronc, récidivantes, sur peau foncée — préférentiellement défenses basses. Différent de la folliculite bactérienne : PAS de pustule franche, réponse nulle aux antibiotiques.",
    symptomes: ["démangeaisons du visage", "boutons des pores", "récurrences"],
    confondAvec: ["acné", "folliculite bactérienne", "dermite séborrhéique"],
    niveau: "dermato",
    action:
      "Avis dermatologique (biopsie possible) + bilan immunitaire ; soins : NETTOYAGE doux, EVITER l'occlusion (huiles épaisses) qui aggrave.",
    education:
      "Quand chaque pore du visage devient un petit bouton qui gratte, et que rien ne marche, c'est un motif à faire examiner précisément — la peau parle parfois pour le reste du corps. Un dermatologue reconnaîtra cette forme particulière.",
    glossaire: "folliculite",
    vlmHint: "papules folliculaires urticantes visage/tronc, sans pustule franche",
  },
  {
    id: "kaposi",
    nom: "Sarcome de Kaposi",
    categorie: "vih",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Plaques et nodules BRUN-VIOLACÉ à BRUN-NOIR fermes, souvent sur NEZ, pieds et jambes — sur peau très foncée, chercher la CONSISTANCE ferme et l'extension LENTE (le violet peut ne pas se voir). Œdème autour (pieds). HHV-8 ; classiquement défenses basses avancées.",
    symptomes: ["plaques fermes qui épaississent", "gonflement des pieds", "évolution lente"],
    confondAvec: ["DPN", "baie de vernie (dermatofibrome)", "taches post-trauma"],
    niveau: "urgence",
    action:
      "Consultation médicale RAPIDE (confirmation histologique) ; dépistage VIH ; le traitement de fond fait souvent régresser les lésions — d'où l'urgence à être suivie.",
    education:
      "Des plaques fermes brun sombre qui épaississent lentement sur le nez ou les pieds demandent un examen médical précis — c'est la peau qui sonne une alerte silencieuse. Les traitements actuels des défenses immunitaires font régresser ces lésions : c'est un motif à consulter sans peur.",
    drapeau: "Plaques fermes multiples + œdème des pieds → consultation rapide.",
    glossaire: "sarcome de Kaposi",
    vlmHint: "plaques/nodules fermes brun-violet nez/pieds, evolution lente",
  },

  // ───────────────────── PAPULOSQUAMEUX (5) ─────────────────────

  {
    id: "psoriasis",
    nom: "Psoriasis",
    aliases: ["psoriasis vulgaire"],
    categorie: "papulosquameux",
    frequence: "peu-frequente",
    zones: ["visage", "dos", "mains", "cuir_chevelu"],
    surPeauNoire:
      "Plaques BIEN LIMITEES épaisses squameuses — sur peau noire, les squames sont ARGENTÉES-GRIS sur fond brun-violacé foncé (l'érythème est masqué), parfois SEULEMENT brun foncé lisse « tache historique ». Coudes, genoux, lombaire, cuir chevelu (périphérie frontière nette), ongles (pits). Koebner au grattage.",
    symptomes: ["plaques épaisses qui pèlent", "cuir chevelu qui craquelle", "démangeaisons inégales"],
    confondAvec: ["dermite séborrhéique (squames grasses front)", "lichen (brillant, poignets)", "teigne"],
    niveau: "dermato",
    action:
      "Confirmation dermatologique (traitement de fond possible, gratuit en centre pour formes étendues) ; émollients abondants + savon doux + soleil MODÉRÉ utile ; ne pas gratter les squames (Koebner, PIH).",
    education:
      "Le psoriasis fait des plaques épaisses qui se renouvellent trop vite — ce n'est ni une allergie ni un manque d'hygiène, et ce n'est pas contagieux. Sur peau noire, il fait des zones foncées bien délimitées. Un suivi dermatologique adapté le tient en repos des années.",
    drapeau: "Arthrite des doigts/orteils (gonflement douloureux) → avis médical (rhumatisme psoriasique).",
    glossaire: "psoriasis",
    vlmHint: "plaques bien limitees epaisses squames grises sur brun-violet foncé",
  },
  {
    id: "lichen_plan",
    nom: "Lichen plan",
    categorie: "papulosquameux",
    frequence: "peu-frequente",
    zones: ["mains", "dos", "visage"],
    surPeauNoire:
      "Papules POLYGONALES à FACETTES, BRUN-VIOLACÉ PROFOND à BRUN-NOIR brillantes (sur peau noire, souvent noires et hyperkératosiques), très PRURIGINEUSES : faces internes poignets, chevilles, lombaire — + stries RÉTICULÉES blanches en bouche (muqueuse jugale, 30-50 %) ; cuir chevelu = alopécie cicatricielle possible.",
    symptomes: ["démangeaisons fortes", "papules brillantes noires", "traces blanches en bouche"],
    confondAvec: ["atopie lichénifiée", "psoriasis", "lupus (photo, cicatrice)"],
    niveau: "dermato",
    action:
      "Avis dermatologique (diagnostic + traitement calmant) ; griffures interdites (Koebner, PIH très marquées) ; lésions bouche persistantes à surveiller ; cheveux : ne pas tirer.",
    education:
      "Le lichen fait des petites plaques anguleuses, très foncées et brillantes, qui grattent fort aux poignets et chevilles — avec parfois de fines dentelles blanches dans la bouche. Ça part en des mois, avec des taches résiduelles longues à partir. Un suivi dermatologique accélère la paix.",
    drapeau: "Alopécie du cuir chevelu (démangeaisons + cheveux qui tombent par plaques) → dermato VITE.",
    glossaire: "lichen plan",
    vlmHint: "papules polygonales brillantes brun-noir, prurit, poignets/chevilles",
  },
  {
    id: "pityriasis_rosea",
    nom: "Pityriasis rosé de Gibert",
    categorie: "papulosquameux",
    frequence: "peu-frequente",
    zones: ["dos", "visage"],
    surPeauNoire:
      "« Médaille » initiale (plaque ovale squameuse) puis SAPIN de Noël de petites plaques ovales au tronc ; sur peau noire, plaques souvent HYPOCHROMIQUES (taches claires) — « l'inverse du livre » : repigmente très lentement en post-éruption (parfois > 6 mois), ce qui alarme à tort. Auto-résolutif.",
    symptomes: ["petites plaques claires ovales", "parfois démangeaisons légères", "1ère plaque plus grande"],
    confondAvec: ["pityriasis versicolor (fine squame diffuse, chronique)", "teigne", "syphilis secondaire (paumes/plantes)"],
    niveau: "educatif",
    action:
      "Rassurer (disparaît en 6-8 semaines) ; photoprotection des plaques ; hydratation douce ; persistance > 3 mois → avis médical (reconsidérer).",
    education:
      "Cette « médaille » suivie de petites plaques ovales en sapin sur le torse est une éruption virale bénigne unique — elle part seule en 6-8 semaines. Sur peau noire, elle laisse des taches plus claires qui prennent des mois à se ré-harmoniser : c'est la peau qui reprend sa couleur lentement, pas une maladie qui traine.",
    glossaire: "pityriasis rosé",
    vlmHint: "medaille ovale + petit sapin plaques hypochromiques tronc",
  },
  {
    id: "urticaire",
    nom: "Urticaire",
    aliases: ["plaques qui grattent et partent"],
    categorie: "papulosquameux",
    frequence: "frequente",
    zones: ["visage", "mains", "dos"],
    surPeauNoire:
      "PLAQUES MIGRATRICES surélevées « ortie » — sur peau noire : VIOLET-BRUN en relief, mieux visibles en lumière rasante + PRURIT/brûlure ; chaque plaque CHANGE DE PLACE en < 24 h (signature absolue) ; déclencheurs : aliments (arachide, poisson fumé), médicaments, piqûres, chaleur. Urticaire profonde = angio-oedème (lèvres/paupières) : urgence.",
    symptomes: ["plaques qui bougent", "grattent fort", "partent sans trace"],
    confondAvec: ["papular urticaria (piqûres) : persiste", "dermite de contact"],
    niveau: "dermato",
    action:
      "Urgence si lèvres/gorge/paupières gonflées ou gêne respiratoire ; sinon : antihistaminique par la bouche (médical/pharmacie), rechercher le déclencheur alimentaire ou médicamenteux ; plaques fixes > 24 h → avis (urticaire vasculitique).",
    education:
      "Quand des plaques en relief grattent puis « déménagent » en un jour, c'est l'urticaire : la peau réagit à quelque chose qu'elle n'aime pas (aliment, médicament, piqûre, chaleur). Les plaques ne laissent pas de trace. Si le gonflement touche les lèvres ou la gorge, on ne réfléchit pas : on file à l'hôpital.",
    drapeau: "Gonflement des lèvres/langue, gêne pour respirer, voix changée → URGENCE vitale.",
    glossaire: "urticaire",
    vlmHint: "plaques relief violet-brun MIGRATRICES <24h, prurit",
  },
  {
    id: "prurigo_nodulaire",
    nom: "Prurigo nodulaire",
    aliases: ["boutons du grattage", "nodules du prurit"],
    categorie: "papulosquameux",
    frequence: "frequente",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "NODULES BRUN-NOIR fermes, EXCORIÉS au sommet, LINÉAIRES parfois en « queue de comète », sur FACES D'EXTENSION (bras avant, jambes) — le prurit précède la lésion (« je gratte donc j'ai des boutons », pas l'inverse). La peau noire finit en nappe de PIH sévère. Fréquent avec onchocercose, gale, piqûres, reins, thyroïde.",
    symptomes: ["grattage compulsif", "boutons fermes noirs", "nuit blanche"],
    confondAvec: ["prurigo VIH", "insectes", "acnée excoriée (visage)"],
    niveau: "dermato",
    action:
      "Avis dermatologique (casser le cercle grattage) + chercher la CAUSE du prurit (médical) ; émollients glacés, ongles ultra-cours, gants la nuit ; éviter « l'eau de Javel » et gommages à répétition.",
    education:
      "Le prurigo, ce sont des boutons fermes très foncés nés du grattage lui-même : tu grattes, la peau se défend, elle durcit, ça gratte encore. Le combat se joue à deux : casser la crise (soins frais, ongles courts) ET chercher ce qui fait gratter au départ — ça se soigne très bien quand on trouve la cause.",
    drapeau: "Prurit + perte de poids, sueurs nocturnes, jambes gonflées → bilan médical complet.",
    glossaire: "prurigo",
    vlmHint: "nodules brun-noir fermes excorie faces extension, cercle grattage",
  },

  // ───────────────────── AUTO-IMMUN (3) ─────────────────────

  {
    id: "lupus_discoide",
    nom: "Lupus érythémateux discoïde (LED)",
    categorie: "autoimmun",
    frequence: "peu-frequente",
    zones: ["visage", "cuir_chevelu"],
    surPeauNoire:
      "Plaques en DISQUE, bien délimitées, PHOTOSENSIBLES : pommettes, nez, oreilles, cuir chevelu — sur peau noire, trois couleurs d'années : centre blanchâtre ATROPHIQUE (creux, « cigarette paper ») + bord violacé + périphérie BRUN FONCÉ + bouches folliculaires (comédons INCLUS dans la plaque). CICATRISE (alopecie du cuir). Jeune femme africaine typique.",
    symptomes: ["plaques qui cicatrisent en creux", "démangeaisons/brûlure", " aggravées au soleil", "cheveux qui ne repoussent plus sur la plaque"],
    confondAvec: ["teigne (pas d'atrophie, KOH+)", "psoriasis (pas d'atrophie)", "pityriasis alba"],
    niveau: "dermato",
    action:
      "Dermatologue CONFIRMER (biopsie) : protection solaire STRICTE, éviter de toucher aux lésions, bilan systémique (reins, sang) ; ne jamais exposer la plaque ni appliquer de produits de rue.",
    education:
      "Ces plaques en disque qui cicatrisent en creux sur les joues et le cuir chevelu de la jeune femme africaine sont un lupide cutané : la peau se confond avec elle-même en « marquant » à chaque poussée. C'est le soleil qui allume la plaque — la photoprotection est le premier traitement, et un suivi dermatologique protège aussi les cheveux.",
    drapeau: "Plaques + fatigue/fièvre/articulations douloureuses/ulcères buccaux → avis médical (lupus systémique).",
    glossaire: "lupus discoïde",
    vlmHint: "plaques disque atrophiques central pale + bord violet + hyperpig periph, photosensibles",
  },
  {
    id: "lupus_systemique",
    nom: "Lupus systémique",
    categorie: "autoimmun",
    frequence: "rare",
    zones: ["visage"],
    surPeauNoire:
      "« Aile de papillon » brun-violacée épargnant les sillons naso-géniens + PHOTOSENSIBILITÉ extrême, aphtes buccaux, chute de cheveux diffuse. Touche la femme africaine jeune, plus sévèrement. Signes internes : articulations, reins, fièvre.",
    symptomes: ["visage qui réagit au soleil", "fatigue profonde", "articulations douloureuses"],
    confondAvec: ["mélasma (pas de relief, pas de douleur)", "dermite séborrhéique"],
    niveau: "urgence",
    action:
      "Consultation MÉDICALE complète (bilan sanguin + urinaire) — les reins peuvent être touchés silencieusement ; photoprotection absolue.",
    education:
      "Rougeur violacée « en papillon » sur le nez et les joues au soleil, fatigue profonde, douleurs articulaires : cette combinaison demande un bilan complet chez le médecin. Le lupus systémique se suit très bien aujourd'hui — l'important est de ne pas laisser les reins travailler dans l'ombre.",
    drapeau: "Fièvre + gonflement des jambes/urine mousseuse → consultation RAPIDE.",
    glossaire: "lupus",
    vlmHint: "aile de papillon violet-brun visage + photosensibilite + arthralgies",
  },
  {
    id: "morphoea",
    nom: "Morphée (sclérodermie localisée)",
    categorie: "autoimmun",
    frequence: "rare",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Plaque INDURÉE « BOIS » : ivoire (blanchâtre) au centre, bord violet « LILAC RING » sur brun ; sur peau noire, centre BLANC-PORCELAINE net et périphérie BRUN-VIOLACÉ. En « coup de sabre » sur le front du frontal/du crâne (enfant), ou plaques du tronc. La peau ne plisse plus (signe du pli impossible).",
    symptomes: ["peau dure", "plaque qui ne plie pas", "parfois douleur articulaire dessous"],
    confondAvec: ["lichen scléreux", "vitiligo (souple)", "cicatrice (histoire)"],
    niveau: "dermato",
    action:
      "Dermatologue (biopsie + bilan) — la plaque peut s'étendre des années puis se stabiliser ; massages/émollients en accompagnement ; formes étendues → avis rhumatologique.",
    education:
      "Une plaque d'abord violacée puis dure comme du bois, au centre porcelaine : c'est une morphée, une « sclérose en plaque » de la peau, bénigne mais têtue. Elle s'étend parfois des années avant de s'endormir. Un dermatologue suit son évolution et préserve la souplesse.",
    glossaire: "morphée",
    vlmHint: "plaque induree centre porcelaine + anneau violet, peau bois",
  },

  // ───────────────────── TUMORAL (4) ─────────────────────

  {
    id: "melanome_acral",
    nom: "Mélanome acral (paumes/plantes/ongles)",
    categorie: "tumoral",
    frequence: "rare",
    zones: ["mains", "naevi"],
    surPeauNoire:
      "LE mélanome de la peau noire (70 % des mélanomes des peaux foncées) : bande PIGMENTÉE de l'ongle qui S'ÉLARGIT (pouce/gros orteil, atteignant la cuticule — signe de Hutchinson), tache brun-noir IRRÉGULIÈRE en expansion sur paume/plante ou VOLUMINEUSE lésion fungoïde. Diagnostic souvent TARDIF → pronostic sombre.",
    symptomes: ["bande noire de l'ongle qui grandit", "tache sombre irrégulière paume/plante", "saigne parfois"],
    confondAvec: ["contusion sous-unguéale (remonte avec l'ongle)", "verrue plantaire pigmentée"],
    niveau: "urgence",
    action:
      "URGENCE dermatologique : toute bande unguéale nouvelle qui s'élargit ou atteint la cuticule, toute tache plantaire neuve et irrégulière → faire voir IMMÉDIATEMENT. Diagnostic précoce = guérison simple.",
    education:
      "Sur peau noire, le mélanome se cache là où personne ne regarde : la SEMELLE, la paume, et l'ONGLE — une bande sombre qui grandit et remonte vers la cuticule. Ce n'est pas un « bleu » : un bleu remonte avec la pousse de l'ongle, la bande du mélanome reste. C'est l'urgence silencieuse de nos peaux.",
    drapeau: "Bande unguéale qui S'ÉLARGIT / tache plantaire asymétrique > 6 mm / lésion qui saigne spontanément → dermato urgent.",
    indicateurs: ["Asymétrie (A)", "Bords irréguliers (B)", "Couleurs multiples (C)", "Diamètre > 6 mm (D)", "Évolution (E)"],
    glossaire: "mélanome acral",
    vlmHint: "bande ungueale elargie + cuticule (Hutchinson), tache plantaire irreguliere",
  },
  {
    id: "scc",
    nom: "Carcinome épidermoïde",
    aliases: ["cancer de la peau", "plaie qui ne guérit pas"],
    categorie: "tumoral",
    frequence: "peu-frequente",
    zones: ["mains", "visage", "naevi"],
    surPeauNoire:
      "Ulcère/CRÔTE récurrents qui reviennent au même endroit > 1 mois, bord dur et éversé (bourrelet) — zones SOLEIL (albinisme : RISQUE MAJEUR, tumeurs multiples dès l'adolescence) ou plaies CHRONIQUES/cicatrices anciennes/fistules osteïtes (ulcère de Marjolin, des décennies après). Adénopathie = gravité.",
    symptomes: ["plaie qui ne ferme pas", "croûte qui revient", "bourrelet dur", "saignements répétés"],
    confondAvec: ["Buruli (indolore, bords sous-minés)", "kératose actinique", "verrue"],
    niveau: "urgence",
    action:
      "URGENCE dermatologique — toute plaie > 1 mois OU croûte qui renaît toujours au même endroit → biopsie. ALBINISME : photoprotection TOTALE + examen dermatologique 2×/an dès l'enfance ; protéger les enfants albinos est un enjeu de santé publique.",
    education:
      "Une plaie qui ne ferme jamais, une croûte qui renaît sans cesse au même endroit : la peau demande une biopsie. Chez les personnes albinos, le soleil non filtré multiplie ces tumeurs très tôt — écran total, vêtements longs et contrôles réguliers les évitent presque entièrement.",
    drapeau: "Plaie > 1 mois, bourrelet dur, ganglion dur proche → dermato/chirurgien RAPIDE.",
    glossaire: "carcinome",
    vlmHint: "ulcere/croûte recidivante >1mois, bord dur everse, zone solaire/cicatrice",
  },
  {
    id: "bcc",
    nom: "Carcinome basocellulaire",
    categorie: "tumoral",
    frequence: "rare",
    zones: ["visage", "naevi"],
    surPeauNoire:
      "Nodule TRANSLUCIDE « nacré » à bord Roulé (perle), télangiectasies fines en surface — sur peau noire, aspect plutôt brun foncé à noir poli (pigmented BCC, trompeur, proche d'un nævus) ; ulcère central « rongé » possible. CENTRE du visage, paupières. Localement destructeur, quasi jamais de métastase.",
    symptomes: ["perle foncée qui grandit lentement", "sangmente au contact", "croûte centrale"],
    confondAvec: ["nævus pigmenté", "DPN", "mélanome (irrégulier)"],
    niveau: "dermato",
    action:
      "Avis dermatologique (exérèse simple = guérison quasi totale) — toute lésion faciale qui grandit lentement et saigne facilement se fait vérifier.",
    education:
      "Ce « grain » qui enfle très lentement, luisant comme une perle foncée et qui saigne au moindre coup de brosse, se soigne complètement par une petite intervention — c'est la tumeur de peau la plus paisible, à condition de l'enlever tôt avant qu'elle ne creuse.",
    glossaire: "carcinome basocellulaire",
    vlmHint: "nodule nacre-brun poli bord roule, centre face/paupiere, croûte",
  },
  {
    id: "mycosis_fongoide",
    nom: "Mycosis fongoïde (lymphome cutané)",
    categorie: "tumoral",
    frequence: "rare",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Plaques FINES SQUAMEUSES HYPOCHROMIQUES (la forme hypopigmentée, typique du sujet jeune noir) ou brun-rouge, NON réponses aux dermocorticoïdes ni antifongiques — « pseudo-teigne » ou « pseudo-eczéma » qui dure malgré tout. Poignets/fesses/cuisses. Prurit léger ou absent. Diagnostic = biopsie.",
    symptomes: ["plaques claires qui durent malgré les soins", "pas de douleur", "evolution lente sur années"],
    confondAvec: ["pityriasis versicolor", "eczéma", "teigne", "pityriasis alba (enfant)"],
    niveau: "dermato",
    action:
      "Avis dermatologique pour toute éruption PERSISTANTE > 6 mois malgré traitements bien conduits (biopsie simple) — formes précoces très bien contrôlées par lumière médicale.",
    education:
      "Quand des plaques claires squameuses durent des mois et ne répondent NI aux antifongiques NI aux crèmes d'eczéma, la peau mérite une biopsie : il existe un lymphome de peau, TRÈS lent, dont la forme claire imite les taches banales sur peau noire. Attrapé tôt, il se contrôle remarquablement bien.",
    drapeau: "Plaques > 6 mois réfractaires + tuméfications qui poussent dessus → dermato VITE.",
    glossaire: "mycosis fongoïde",
    vlmHint: "plaques hypochromiques fines squameuses REFRACTAIRES, jeune adulte noir",
  },

  // ───────────────────── CHEVEUX (4) ─────────────────────

  {
    id: "alopécie_traction",
    nom: "Alopécie de traction",
    aliases: ["front qui recule des tresses", "tempes dégarnies"],
    categorie: "cheveux",
    frequence: "tres-frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "RÉCESSION FRONTAL-temporale en deux « cornes » + temples et bordure crânienne DÉGARNIS avec petits papules et kystes autour des follicules tirés (chignon tressé, tissage serré, chignon bun, postiche) — la ligne frontière recule centimètre par centimètre. Chez l'enfant : tresses « mèches-cadennes » très serrées. Stade précoce REVERSIBLE ; tardif : cicatriciel définitif.",
    symptomes: ["front qui s'élargit", "petits boutons le long de la ligne", "tresses qui font mal la nuit"],
    confondAvec: ["CCCA (couronne, pas bord frontal)", "alopécie areata (lisse nette)", "trichotillomanie"],
    niveau: "institut",
    action:
      "DÉTENDRE immédiatement (plus aucun style qui tire pendant 3 mois), lubrifier la ligne (huile de ricin noire + massages doux), tresses EN VOLUME aux enfants ; stade avancé/papules → dermato (sauver les follicules vivants).",
    education:
      "Si ta ligne frontale recule, tes tresses la « tirent » — chaque follicule arraché des années ne repousse pas toujours. La bonne nouvelle : attrapée tôt, la bordure revient en quelques mois de styles lâches. Les tresses d'enfant doivent POUVOIR BOUGER du bout du doigt.",
    drapeau: "Bordure + douleurs/les boutons qui suintent → dermato (folliculite décalvante).",
    indicateurs: ["Taches alopeciques"],
    glossaire: "alopécie de traction",
    vlmHint: "recession frontale-temporale bilaterale + papules ligne cheveux, tresses serrees",
  },
  {
    id: "ccca",
    nom: "Alopécie centrale centrifuge cicatricielle (CCCA)",
    categorie: "cheveux",
    frequence: "frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "ÉCLAIRCISSEMENT PROGRESSIF « couronne » du SOMMET qui s'étend en auréole excentrique, avec parfois BRÛLURES/démangeaisons du vertex, peau luisante « scintillante » où les orifices folliculaires ont disparu (la photo du haut du crâne montre la zone clairsemée en étoile). FRÉQUENT chez la femme noire 30-45 ans — associé à défrisage + tractions + inflammation silencieuse. FOUS follicles meurent SANS prévenir.",
    symptomes: ["sommet qui clairseme depuis des années", "picotements/couronne qui chauffe", "cheveux qui ne repoussent plus au centre"],
    confondAvec: ["alopécie androgénétique (pas de brûlure)", "teigne (squames)", "lupus (plaques)"],
    niveau: "dermato",
    action:
      "Dermatologue TÔT (biopsie du vertex) : tant que les orifices folliculaires existent, on peut SAUVER les cheveux — combiner anti-inflammatoires topiques, arrêt défrisage + tractions, greffe possible au stade stable. Plus c'est tôt, plus on garde de densité.",
    education:
      "Quand le sommet de ta tête s'éclaircit en rond depuis des années, parfois avec des picotements, ce n'est pas « l'âge » tout seul : c'est une alopécie cicatricielle typique de la femme noire. Les racines s'éteignent en silence — mais si on l'attrape pendant qu'il en reste, un dermatologue en préserve beaucoup.",
    drapeau: "Éclaircissement du sommet + brûlure/douleur du vertex → dermato VITE (fenêtre de sauvetage).",
    indicateurs: ["Taches alopeciques"],
    glossaire: "CCCA",
    vlmHint: "claircissement auréole SOMMET/couronne, peau luisante, femme 30-45",
  },
  {
    id: "alopécie_areata",
    nom: "Alopécie areata",
    aliases: ["plaque chauve nette", "pelade"],
    categorie: "cheveux",
    frequence: "frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "Plaque CHAUVE LISSE « jour de lune » apparue en jours, SANS squames ni cicatrice, avec cheveux « en point d'exclamation » (cassés courts à la bordure) ; parfois sourcils/cils. Souvent suite de stress/grosse fatigue. Auto-immune. La majorité repousse en < 1 an.",
    symptomes: ["plaque lisse apparue en jours", "pas de douleur", "parfois ongles piqués"],
    confondAvec: ["teigne (squames, contagieux)", "traction (bordure tireée)", "lupus (cicatrice)"],
    niveau: "dermato",
    action:
      "Dermato pour confirmer (exclure teigne et lichen) et accompagner (repousse stimulable) ; PATIENCE : le stress aggrave ; ne pas masquer avec tresses serrées sur la plaque (traction aggrave).",
    education:
      "Cette plaque lisse « jour de lune » apparue presque du jour au lendemain, c'est le système de défense qui se trompe de cible et endort le bulbe. Ce n'est ni la teigne ni un sort : dans la grande majorité des cas, les cheveux repoussent seuls en moins d'un an. Le calme et un dermato accélèrent.",
    glossaire: "alopécie areata",
    vlmHint: "plaque chauve LISSE nette, cheveux point exclamation bordure",
  },
  {
    id: "pellicules",
    nom: "Pellicules (dermite séborrhéique du cuir)",
    aliases: ["pellicules sèches/grasses"],
    categorie: "cheveux",
    frequence: "tres-frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "Squames BLANCHES (sèches) ou JAUNÂTRES GRASSES (hâtives, croûtes « de lait » collées) + PRURIT du vertex ; avec port de tresses/perruques prolongé : croûtes sous-tresses (irrigation fermée + chaleur + produits gras). Associée à la dermite séborrhéique du visage (guirlandes claires).",
    symptomes: ["épaules blanches", "grattage du crâne", "croûtes sous les tresses"],
    confondAvec: ["teigne (enfant)", "psoriasis (plaques épaisses nettes)", "poux"],
    niveau: "educatif",
    action:
      "Shampooing antifongique doux 2×/semaine (laisser poser 3-5 min), rincer abondamment, hydrater le CUIR (pas seulement les longueurs) ; espacer les tresses/perruques 1 semaine toutes les 6-8, laver le goupillon ; persistance → dermato.",
    education:
      "Les pellicules grasses naissent d'un champignon ami qui se laisse pousser quand le cuir est couvert, gras ou stressé. Un shampooing doux laissé poser quelques minutes, deux fois par semaine, vient à bout de la plupart. Sous les tresses : laisse respirer le cuir une semaine de temps en temps.",
    indicateurs: ["Desquamation (pellicules)"],
    glossaire: "pellicules",
    vlmHint: "squames blanches/jaunes grasses vertex + prurit, croûtes sous tresses",
  },

  // ───────────────────── NUTRITION (3) ─────────────────────

  {
    id: "phrynoderme",
    nom: "Phrynoderme (peau de crapaud)",
    categorie: "nutrition",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Papules KÉRATOSIQUES « piqûres d'ortie » rugueuses sur les faces d'extension (coudes, genoux — et à l'extrême, cuisses/fesses), peau sèche et râpeuse — carence en VITAMINE A (régimes pauvres en fruits/légumes oranges, malabsorption). À différencier de la kératose pilaire banale (familière, limitée bras/joues).",
    symptomes: ["peau râpeuse", "petits grains durs", "fatigue/vision crépusculaire baisse (si carence forte)"],
    confondAvec: ["kératose pilaire (bénigne, familiale)"],
    niveau: "dermato",
    action:
      "Alimentation riche en provitamine A (patate douce orange, mangue, papaye, huile rouge de palme, foie) + avis médical si trouble de la vision nocturne (urgence de carence) ; l'amélioration cutanée prend des semaines.",
    education:
      "Quand la peau devient « crapaud » aux coudes et genoux avec une vue qui baisse au crépuscule, le corps réclame de la vitamine A — patate douce orange, mangue, papaye, huile de palme rouge. La peau se lisse en quelques semaines d'assiettes colorées.",
    drapeau: "Vision crépusculaire abaissée → médecin VITE (carence sévère = risque oculaire).",
    glossaire: "phrynoderme",
    vlmHint: "papules keratosiques rugueuses coudes/genoux + xerose, carence A",
  },
  {
    id: "pellagre",
    nom: "Pellagre",
    categorie: "nutrition",
    frequence: "rare",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Dermatite PHOTOSENSIBLE nettement limitée aux zones SOLEIL : « collier de Casal » autour du cou (net comme une frontière), dos des mains « gants » et visage « masque » — brun foncé desquamant par bandes, bord crénelé. + diarrhées + troubles de l'humeur/insomnie. Carence en NIACINE (régime maïs unique, alcoolisme, HIV).",
    symptomes: ["cou qui pèle au soleil", "main gantée", "diarrhée", "insomnie/confusion"],
    confondAvec: ["photodermatite (topique)", "dermite de contact"],
    niveau: "urgence",
    action:
      "URGENCE médicale (la triade peau-diarrhée-confusion engage le pronostic) : vitaminotherapie B3 IMMÉDIATE en milieu de soins ; régime diversifié (arachides, foie, mil, levure) ; photoprotection stricte en attendant.",
    education:
      "Un « collier » de peau sèche et foncée qui pèle là où le soleil tape, avec des troubles intestinaux et des idées confuses : c'est la pellagre, une grande carence qui se corrige vite avec la vitamine B3 et une vraie alimentation. C'est un motif d'aller consulter, pas de gommer.",
    drapeau: "Confusion mentale + diarrhée + dermatite solaire → URGENCE.",
    glossaire: "pellagre",
    vlmHint: "collier photosensible net cou + gants mains, desquamation en bandes",
  },
  {
    id: "kwashiorkor",
    nom: "Dermatose du kwashiorkor",
    categorie: "nutrition",
    frequence: "rare",
    zones: ["visage"],
    surPeauNoire:
      "Chez le petit enfant : zones de desquamation « PEINTURE ÉCAILLÉE » en plaques sombres claires alternées (jambes/bassin/zone de la couche), cheveux DECOLORÉS roux/cuivrés, fins et cassants + ŒDÈMES (pieds, visage) + ventre. Malnutrition protéique sévère — urgence pédiatrique.",
    symptomes: ["enfant apathique", "pieds gonflés", "cheveux roux", "peau qui pèle en peinture"],
    confondAvec: ["eczéma", "impétigo", "nævus (non)"],
    niveau: "urgence",
    action:
      "URGENCE PÉDIATRIQUE (renutrition hospitalière : la réalimentation doit être PROGRESSIVE et encadrée) ; jamais de « bouillie dense » maison d'emblée ; suivi du cadre alimentaire familial.",
    education:
      "Un petit ventre rond avec des pieds gonflés, une peau qui pèle comme de la vieille peinture et des cheveux devenus roux : c'est le signal d'une malnutrition profonde. L'enfant a besoin d'un hôpital, pas d'une recette — et la réalimentation, elle, se fait doucement, encadrée.",
    drapeau: "Œdème + apathie + desquamation « peinture » → URGENCE pédiatrique.",
    glossaire: "kwashiorkor",
    vlmHint: "desquamation peinture ecailee + oedemes + cheveux roux, enfant",
  },

  // ───────────────────── PRATIQUES & COSMÉTIQUES (5) ─────────────────────

  {
    id: "depigmentation",
    nom: "Dépigmentation volontaire (peau abîmée des crèmes éclaircissantes)",
    aliases: ["crème claire", "xessal", "tchaatcho", "khess-pouss"],
    categorie: "culturel",
    frequence: "tres-frequente",
    zones: ["visage", "mains", "dos"],
    surPeauNoire:
      "Visage et mains PLUS CLAIRS que le cou/le reste du corps (frontière visible à la mâchoire) + vergetures VIOLETTES des plis (aisselles/gorge) + peau fine luisante avec veines visibles + confettis d'hyper et d'hypopigmentation + boutons à corticoïdes ; complications : ochronose, infections faciles, cicatrices, diabète/hypertension iatrogènes (mercure, corticoïdes forts).",
    symptomes: ["claircie inégale", "vergetures violettes des plis", "peau fragile", "boutons/rougeurs cortisoniques"],
    confondAvec: ["vitiligo", "pityriasis versicolor", "atopie"],
    niveau: "dermato",
    action:
      "Accompagner un arrêt PROGRESSIF (jamais brutal : rebond sévère), réparation de la barrière (émollients, photoprotection), avis médical pour les complications ; discours SANS JUGEMENT — l'esthétique évolue, la santé suit ; proposer la beauté du teint NI plus clair NI plus foncé.",
    education:
      "Les crèmes éclaircissantes de la rue promettent un teint clair, mais livrent des zones bicolores, des vergetures violettes et une peau qui s'infecte au moindre rien — et leurs composants fatiguent les reins et le sucre. On peut arrêter en DOUCEUR et reconstruire la barrière ; ta couleur d'origine est la seule qui vieillira bien.",
    drapeau: "Utilisation + urines foncées/maux de ventre/fatigue intense, ou plaies qui ne guérissent pas → médecin.",
    glossaire: "dépigmentation",
    vlmHint: "visage plus clair que cou + vergetures violettes plis + confettis",
  },
  {
    id: "dermite_cortisonique",
    nom: "Dermites aux corticoïdes (crèmes fortes)",
    aliases: ["rougeur de la crème miracle"],
    categorie: "culturel",
    frequence: "tres-frequente",
    zones: ["visage", "mains"],
    surPeauNoire:
      "Visage « rouge-brun » REBOUND dès l'arrêt de la crème forte, télangiectasies (petites veines), peau qui PINCE et devient fine, acné monomorphe (boutons identiques), hypertrichose (poils fins sur les joues) ; sur peau noire : hyper/hypopigmentation en mosaïque. La « crème miracle » de la rue est très souvent un corticoïde fort non étiqueté.",
    symptomes: ["rougeur à l'arrêt", "brûlure", "peau fine", "dépendance à la crème"],
    confondAvec: ["dermite périorale", "rosacée", "atopie du visage"],
    niveau: "dermato",
    action:
      "Arrêt PROGRESSIF espacé (JAMAIS brutal : rebond brûlant), TRAITEMENT DE SOUTIEN par émollients + photoprotection, avis dermato pour la décroissance ; éduquer : « éclaircit en 7 jours = méfiance absolue ».",
    education:
      "Si ta crème « miracle » te rend rouge dès que tu l'arrêtes deux jours, c'est une dépendance : ces crèmes de rue cachent souvent des corticoïdes très forts. On arrête en espaçant sur des semaines — jamais d'un coup, ça brûlerait — et la peau se reconstruit avec des soins simples et un dermato.",
    drapeau: "Rebond sévère avec gonflement du visage, ou usage + enfants → avis médical rapide.",
    glossaire: "dermites des corticoïdes",
    vlmHint: "visage rouge-brun fin + veines + boutons identiques, dependance crème",
  },
  {
    id: "brulure_defrisage",
    nom: "Brûlure du défrisage (chimique)",
    categorie: "culturel",
    frequence: "tres-frequente",
    zones: ["cuir_chevelu"],
    surPeauNoire:
      "Brûlures du cuir chevelu au défrisage (produits alcalins) : rougeurs-violacées, croûtes, suintements le long des raies, ADIEUX follicules — zones définitivement clairsemées sur les bords et sommet si répété. Défrisage sur cheveux déjà fragilisés (teinture la même semaine) = catastrophe combinée.",
    symptomes: ["brûlure pendant la pose", "croûtes", "cheveux qui cassent/clairsement"],
    confondAvec: ["CCCA (silencieuse)", "teigne", "psoriasis du cuir"],
    niveau: "dermato",
    action:
      "Rincer IMMÉDIATEMENT et longuement à l'eau tiède, ne jamais gratter les croûtes, attendre la guérison avant TOUT nouveau produit ; zones restées clairsemées > 6 mois → dermato (greffe possible) ; espacer les défrisages ≥ 8 semaines, PRO exclusivement, jamais défrisage + teinture le même mois.",
    education:
      "Le défrisage brûle parce qu'il « casse » la fibre par chimie forte : quand ça pique, il faut rincer tout de suite, pas « tenir encore cinq minutes pour que ce soit lisse ». Chaque brûlure peut coûter des racines à jamais. Espace les défrisages et confie-les à des mains professionnelles.",
    drapeau: "Brûlure + perte de cheveux localisée ou croûtes qui s'étendent → dermato.",
    glossaire: "brûlure du défrisage",
    vlmHint: "croûtes/rougeurs le long des raies apres defrisage + cassure localisee",
  },
  {
    id: "allergie_ppd",
    nom: "Allergie au PPD (teintures noires & henné)",
    aliases: ["henné noir", "teinture allergique"],
    categorie: "culturel",
    frequence: "frequente",
    zones: ["visage", "cuir_chevelu", "mains"],
    surPeauNoire:
      "Eczéma violent du CUIR CHEVEVELU/visage 48-72 h après teinture noire ou « henné noir » : démangeaisons en feu, œdème des paupières/front, suintement des oreilles, légion de petites croûtes ; sur peau noire, PIH importante en post-crise. Croix : tatouages noirs (PPP puissant sensibilisateur).",
    symptomes: ["brûlure du cuir après teinture", "paupières gonflées", "grattage insupportable"],
    confondAvec: ["dermite séborrhéique", "atopie", "zona (unilatéral)"],
    niveau: "urgence",
    action:
      "Œdème du visage/gêne respiratoire → URGENCE ; sinon : rinçages abondants, avis médical rapide (traitement de la crise) ; ÉVITER le PPD À VIE (teintures « sans PPD » vraiment sans : paraphénylenediamine, tatouages noirs de rue STRICTEMENT interdits — risque de choc).",
    education:
      "Le « henné noir » et les teintures très sombres cachent une molécule (PPD) qui sensibilise pour la vie : la première fois ça va, la deuxième ça brûle. Ne jamais laisser poser un tatouage noir de rue sur la peau des enfants — les réactions vont jusqu'au gonflement du visage et à l'hôpital.",
    drapeau: "Gonflement des lèvres/paupières, gêne respiratoire après teinture/henné → URGENCE.",
    glossaire: "allergie à la teinture noire",
    vlmHint: "eczema violent cuir/visage 48-72h apres teinture noire + oedeme paupieres",
  },
  {
    id: "scarifications",
    nom: "Complications de scarifications",
    aliases: ["cicatrices rituelles"],
    categorie: "culturel",
    frequence: "frequente",
    zones: ["visage", "dos", "mains"],
    surPeauNoire:
      "Sur peau noire, les scarifications cicatrisent en RELIEF (chéloïdes + hypertrophiques) et en PIGMENTATION PLUS FONCÉE nette ; complications : infection à la pose (instruments non stériles — hépatite B/C, VIH, tétanos), chéloïdes volumineuses qui grattent/brûlent, contractures (épaule, cou).",
    symptomes: ["cicatrices en relief", "démangeaisons des bourrelets", "douleur"],
    confondAvec: ["keloides post-boutons", "verrues (non)"],
    niveau: "institut",
    action:
      "Si envisagées : instruments STÉRILES à usage unique, jamais à domicile ; chéloïdes établies → dermato (injections/aplatissement, pas de re-cut) ; photoprotection des cicatrices récentes (foncent au soleil).",
    education:
      "Nos scarifications racontent l'identité — la peau noire, elle, répond en relief : chaque trait peut gonfler en bourrelet et foncer net. Protège-les du soleil en cicatrisation, et si un bourrelet grandit, un dermato peut l'aplanir proprement — le re-couper l'amène à revenir plus grand.",
    glossaire: "cheloïdes",
    vlmHint: "cicatrices rituelles en relief brun-fonce, cheloides + PIH lineaire",
  },

  // ───────────────────── CLIMAT & GROSSESSE (2) ─────────────────────

  {
    id: "miliaria",
    nom: "Sudamina (miliaria)",
    aliases: ["boutons de chaleur", "chauffe de bébé"],
    categorie: "climat",
    frequence: "tres-frequente",
    zones: ["visage", "dos"],
    surPeauNoire:
      "Mini-vésicules CLAIRES « perles d'eau » (miliaria crystallina) ou petites papules ROUGES-BRUNES prurigineuses (miliaria rubra) DENSEMENT sur front, cou, plis et tronc du NOURRISSON en saison chaude — bouchons de sueur dans les canaux. S'efface en quelques jours avec la fraîcheur.",
    symptomes: ["petites perles d'eau", "agitation au chaud", "grattage"],
    confondAvec: ["atopie du bébé", "varicelle débutante", "gale (nourrisson = regarder maman)"],
    niveau: "educatif",
    action:
      "RAFRAÎCHIR (pièce ventilée, coton ample), bains tièdes courts, SÉCHER les plis, PAS de talc occlusif épais ni de huiles épaisses en période chaude ; fièvre ou vésicules qui s'étendent → médecin.",
    education:
      "Les « boutons de chaleur » du bébé sont des perles de sueur coincées sous la peau. Fraîcheur, coton, bains tièdes : ça part en quelques jours. En période chaude, évite les couches de crème épaisse et le talc — ils bouchent encore plus la sortie de la sueur.",
    glossaire: "sudamina",
    vlmHint: "mini-vesicules perles d'eau / papules denses front/plis nourrisson",
  },
  {
    id: "cholestase_gravidique",
    nom: "Cholestase gravidique (prurit de grossesse)",
    categorie: "climat",
    frequence: "rare",
    zones: ["mains"],
    surPeauNoire:
      "PRURIT INTENSE des PAUMES et PLANTES (généralisé ensuite) SANS AUCUNE lésion visible (peau saine) au 3e trimestre — la « démangeaison sans boutons » d'une grossesse avancée. Bilan hépatique anormal ; RISQUE FŒTAL réel (prématurité, mort in utero).",
    symptomes: ["démangeaisons brûlantes paumes/plantes", "pas de boutons", "urines foncées possibles"],
    confondAvec: ["atopie de grossesse (avec lésions)", "urticaire", "gale"],
    niveau: "urgence",
    action:
      "MATERNITÉ le jour même (bilan hépatique + surveillance fœtale) — jamais « attendre l'accouchement » : la surveillance rapprochée protège le bébé. Prurit du 3e trimestre SANS lésion = examen, pas patience.",
    education:
      "Gratter ses paumes et ses plantes à s'en ouvrir la peau, en fin de grossesse, sans AUCUN bouton : c'est un signal du foie qui demande un contrôle à la maternité le jour même. Ce n'est pas « la grossesse qui démange » — c'est une surveillance précise qui protège ton bébé.",
    drapeau: "Prurit des paumes/plantes au 3e trimestre → MATERNITÉ immédiatement (risque fœtal).",
    glossaire: "prurit de grossesse",
    vlmHint: "prurit INTENSE paumes/plantes SANS lesion, 3e trimestre",
  },
];

// ───────────────────── Helpers ─────────────────────

const BY_ID = new Map(ATLAS.map((c) => [c.id, c]));

/** Renvoie une condition par id (exact) — null sinon. */
export function conditionById(id: string): AtlasCondition | null {
  return BY_ID.get(id) ?? null;
}

const FREQ_RANK: Record<AtlasCondition["frequence"], number> = {
  "tres-frequente": 0,
  frequente: 1,
  "peu-frequente": 2,
  rare: 3,
};

/** Conditions plausibles SUR LA PHOTO de cette zone (ordre de fréquence). */
export function conditionsForZone(zone: BodyZone): AtlasCondition[] {
  return ATLAS.filter((c) => c.zones.includes(zone)).sort(
    (a, b) => FREQ_RANK[a.frequence] - FREQ_RANK[b.frequence] || a.nom.localeCompare(b.nom),
  );
}

/** Catalogue compact injecté dans le prompt vision: "id=signature; id=signature…"
 * Cap 26 par zone: les plus fréquentes d'abord (input tokens peu coûteux,
 * la latence du VLM est dominée par la GÉNÉRATION, pas la lecture). */
export function vlmCatalogForZone(zone: BodyZone): string {
  return conditionsForZone(zone)
    .slice(0, 26)
    .map((c) => `${c.id}=${c.vlmHint}`)
    .join(" ; ");
}

function clampConf(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/**
 * Validation ANTI-HALLUCINATION de la sortie VLM (champ `conds` du prompt
 *): ids EXACTS de l'atlas uniquement, zone cohérente, confiance
 * minimale 25, dédoublonnée, triée, cap 2. Renvoie [] si rien de fiable —
 * le diagnostic reste alors muet sur les hypothèses (mieux qu'un faux).
 */
export function hypothesesFromVlm(raw: unknown, zone: BodyZone): SuspectedCondition[] {
  if (!Array.isArray(raw)) return [];
  const zoneOk = new Set(conditionsForZone(zone).map((c) => c.id));
  const out: SuspectedCondition[] = [];
  for (const item of raw) {
    if (!Array.isArray(item)) continue;
    const id = String(item[0] ?? "").trim().toLowerCase();
    const cond = BY_ID.get(id);
    if (!cond || !zoneOk.has(id)) continue; // id inconnu ou hors zone → ignoré
    const confiance = clampConf(item[1]);
    if (confiance < 25) continue;
    out.push({
      id,
      nom: cond.nom,
      categorie: CATEGORY_LABELS[cond.categorie],
      confiance,
      niveau: cond.niveau,
      surPeauNoire: cond.surPeauNoire,
      action: cond.action,
      drapeau: cond.drapeau,
    });
  }
  const dedup = [...new Map(out.map((h) => [h.id, h])).values()];
  return dedup.sort((a, b) => b.confiance - a.confiance).slice(0, 2);
}

/** Stats de l'atlas (affichage pédagogique / réponse à la demande). */
export const ATLAS_STATS = {
  total: ATLAS.length,
  categories: (Object.keys(CATEGORY_LABELS) as AtlasCategory[]).map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
    count: ATLAS.filter((c) => c.categorie === id).length,
  })),
};

/** Digest compact pour le chat Dr Kènè (injecté dans le prompt système):
 * familles + noms AVEC les mots des clientes (alias locaux) + signatures
 * des affections phares — assez pour raccrocher le témoignage d'une
 * cliente (« chiques dans les orteils ») à la bonne affection, assez
 * court pour l'enveloppe du prompt (~2 800 chars). */
const SIGNATURE_IDS = [
  "tungose", "myiase_tumbu", "larbish", "gale", "onchocercose", "mpox", "lepre",
  "buruli", "erysipele", "teigne_capitis", "pityriasis_alba", "acanthosis",
  "melanome_acral", "depigmentation", "dermite_cortisonique", "alopécie_traction",
];

export const ATLAS_DIGEST = [
  `CATALOGUE ATLAS AFRICAIN (${ATLAS.length} affections en ${ATLAS_STATS.categories.length} familles, reconnaissance photo via le Scanner Kènè).`,
  ...ATLAS_STATS.categories
    .map((cat) => {
      const stars = ATLAS.filter((c) => c.categorie === cat.id)
        .sort((a, b) => FREQ_RANK[a.frequence] - FREQ_RANK[b.frequence])
        .slice(0, 5)
        .map((c) => `${c.nom.replace(/\s*\([^)]*\)/g, "").slice(0, 40)}${c.aliases?.[0] ? ` (${c.aliases[0].slice(0, 24)})` : ""}`);
      return `${cat.label} (${cat.count}) : ${stars.join(", ")}`;
    })
    .filter((line) => !line.includes("(0)")),
  `SIGNATURES À RECONNAÎTRE (le témoignage de la cliente suffit) : ${SIGNATURE_IDS.map((id) => {
    const c = BY_ID.get(id);
    return c ? `${c.nom.replace(/\s*\([^)]*\)/g, "")} = ${c.vlmHint.slice(0, 52)}` : "";
  })
    .filter(Boolean)
    .join(" ; ")}.`,
  `Règle : l'utilisateur décrit ou montre une de ces affections → éduque avec les mots simples du glossaire, propose le Scanner de peau pour trier, rouge/urgence → référer immédiatement. Jamais de diagnostic formel.`,
].join("\n");
