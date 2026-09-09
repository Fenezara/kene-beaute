// Kènè — « cerveau » du Dr Kènè : base de connaissances structurée.
// Lib PURE (aucune dépendance React/serveur). Deux usages :
//  1. Les données typées ci-dessous (conditions, dépigmentation, botaniques,
//     actifs, signes rouges, contexte ivoirien) : richesse pour l'app
//     (futurs écrans pédagogiques, croissements questionnaire/glossaire).
//  2. KNOWLEDGE_DIGEST : version CONDENSÉE (≤ ~900 mots) assemblée par code
//     depuis ces données — injectée dans le prompt système du chat LLM
//     (POST /api/dermato/chat).
// Positionnement : le Dr Kènè ÉDUQUE et ORIENTE. Elle ne pose JAMAIS de
// diagnostic formel et ne prescrit JAMAIS de médicament (voir CHARACTER_RULES).

// ─────────────────────────── Types ───────────────────────────

/** Niveau d'une condition : « éducatif » (conseils doux possibles) ou
 *  « référer » (orientation professionnelle immédiate). */
export type KnowledgeLevel = "educatif" | "referer";

export interface KnowledgeCondition {
  id: string;
  name: string;
  level: KnowledgeLevel;
  /** Résumé 2-3 phrases, niveau patiente (mots du quotidien). */
  summary: string;
  /** Signes d'alerte : ce qui doit faire sortir du cadre « éducatif ». */
  redFlags: string[];
  /** Conduite à tenir par Kènè (hygiène, soins doux, prévention). */
  action: string;
  /** Quand référer (dermatologue / médecin / urgence). */
  refer: string;
  /** Ligne ultra-compacte (≈ 15-20 mots) pour le digest LLM. */
  digest: string;
}

export interface KnowledgeBotanical {
  id: string;
  name: string;
  /** Vertus principales. */
  virtues: string;
  /** Forme d'usage. */
  usage: string;
  /** Précautions d'emploi. */
  caution: string;
  digest: string;
}

export interface KnowledgeActive {
  id: string;
  name: string;
  /** Rôle sur peau foncée. */
  role: string;
  /** Conseil d'introduction. */
  advice: string;
  digest: string;
}

export interface KnowledgeRedFlag {
  id: string;
  /** Le signe, décrit simplement. */
  sign: string;
  /** Conduite : qui voir, à quelle vitesse. */
  action: string;
  digest: string;
}

export interface DepigmentationDanger {
  id: string;
  title: string;
  products: string;
  complications: string[];
  message: string;
  approach: string[];
  refer: string;
  digest: string;
}

/** Entrée de contexte ivoirien : texte complet + version compacte (digest). */
export interface IvoryContextEntry {
  /** Version complète (app / futurs écrans). */
  text: string;
  /** Version compacte (digest LLM). */
  digest: string;
}

export interface IvoryContext {
  climate: IvoryContextEntry;
  harmattan: IvoryContextEntry;
  sun: IvoryContextEntry;
  economy: IvoryContextEntry;
  institutes: IvoryContextEntry;
}

// ─────────────────────────── A. Conditions ───────────────────────────

export const CONDITIONS: KnowledgeCondition[] = [
  {
    id: "acne",
    name: "Acné & marques PIH",
    level: "educatif",
    summary:
      "L'acné bouche les pores : boutons rouges, points noirs, microkystes. Sur peau noire, chaque bouton guéri laisse souvent une tache brune (PIH) qui reste des mois. Le grattage et les produits agressifs font plus de taches, pas moins.",
    redFlags: [
      "Nodules profonds douloureux (acné sévère)",
      "Aggravation malgré une routine douce après 2-3 mois",
      "Boutons + fièvre ou gonflement du visage",
    ],
    action:
      "Nettoyage doux matin et soir, jamais percer ni gratter, soin non comédogène, écran solaire quotidien, UN actif à la fois (acide azélaïque ou niacinamide) introduit lentement.",
    refer:
      "Acné sévère, nodulaire, douloureuse ou très marquante → dermatologue : des traitements existent et le retard laisse des cicatrices définitives.",
    digest:
      "Boutons, points noirs ; chaque bouton laisse une tache brune (PIH) des mois sur peau noire. Douceur, écran, UN actif doux. Dermato si nodules.",
  },
  {
    id: "melasma",
    name: "Mélasma",
    level: "educatif",
    summary:
      "Taches brunes symétriques sur les joues, le front, la mâchoire. Liées aux hormones (grossesse, pilule) et au soleil. Bénignes mais tenaces : elles reviennent dès que la peau prend du soleil sans écran.",
    redFlags: ["Étalement rapide", "Doute avec une autre tache", "Grossesse + apparition récente (avis médical)"],
    action:
      "Écran solaire quotidien non négociable (même gris), niacinamide ou acide azélaïque en douceur, éviter la chaleur directe prolongée (feu de cuisine, vapeur).",
    refer: "Pas d'amélioration après 3 mois de routine douce, ou doute diagnostique → dermatologue.",
    digest:
      "Taches brunes symétriques (joues/front) : hormones + soleil, tenaces. Écran quotidien + niacinamide/azélaïque. Dermato si doute ou échec 3 mois.",
  },
  {
    id: "dpn",
    name: "DPN (dermatosis papulosa nigra)",
    level: "educatif",
    summary:
      "Petites excroissances noires, lisses et molles sur les joues et le cou. Très fréquentes et bénignes sur peau noire, souvent familiales. Elles apparaissent avec l'âge et ne partent pas avec les crèmes.",
    redFlags: ["Une excroissance qui change, saigne ou fait mal", "Poussée rapide", "Doute avec un grain de beauté"],
    action:
      "Aucun soin maison ne les efface. Ne jamais les couper, gratter ou brûler soi-même : risque de tache et de keloïde.",
    refer: "Si elles gênent esthétiquement, un dermatologue les retire proprement (le retrait se fait en cabinet).",
    digest:
      "Excroissances noires lisses (joues/cou), bénignes, familiales, avec l'âge. Aucun soin maison, jamais couper soi-même. Dermato pour retrait si gêne.",
  },
  {
    id: "keloides",
    name: "Keloïdes",
    level: "educatif",
    summary:
      "Une cicatrice qui déborde la blessure d'origine et continue de pousser, en bourrelet dur. Fréquent sur peau noire : le corps fabrique trop de cicatrice. Ce n'est pas cancéreux, mais ça peut démanger, faire mal et gêner.",
    redFlags: [
      "Keloïde qui continue de grandir",
      "Démangeaisons ou douleurs importantes",
      "Localisation visage, oreille, articulation",
    ],
    action:
      "Prévention : éviter piercings et tatouages si la famille fait des keloïdes, soigner proprement les petites plaies, ne pas exposer les cicatrices neuves au soleil ni les frotter (vêtements serrés).",
    refer:
      "Dermatologue pour toute keloïde établie (injections, pansements pressifs). Ne jamais la faire couper « simplement » : elle repousse souvent plus grosse.",
    digest:
      "Cicatrice qui déborde et pousse (peau noire). Prudence piercings/tatouages si antécédents. Dermato si croissance — jamais excision simple.",
  },
  {
    id: "vitiligo",
    name: "Vitiligo",
    level: "referer",
    summary:
      "Des taches blanches bien nettes qui apparaissent et s'étendent par zones : la peau perd son pigment. Ni contagieux, ni dangereux, souvent familial — mais visible et parfois difficile à vivre.",
    redFlags: ["Étalement rapide", "Taches autour des yeux ou de la bouche", "Retentissement moral fort"],
    action:
      "Rassurer : ça ne se attrape pas. Écran solaire sur les zones blanches (elles brûlent vite) et sur tout le corps (limite le contraste). Écouter et soutenir.",
    refer:
      "Dermatologue dès le doute ou l'extension : des traitements existent et marchent mieux pris tôt.",
    digest:
      "Taches blanches nettes qui s'étendent — ni contagieux ni grave. Écran sur zones blanches. Dermato tôt : traitements ; écouter le moral.",
  },
  {
    id: "eczema",
    name: "Eczéma / atopie & dermite de contact",
    level: "educatif",
    summary:
      "Plaques sèches qui démangent, par crises. Chez l'enfant : plis des coudes et genoux (atopie). Chez l'adulte : souvent après contact d'un produit — savon dur, teinture, bijou fantaisie, détergent (dermite de contact).",
    redFlags: [
      "Plaques suintantes ou croûtes jaunes (surinfection)",
      "Éruption très étendue",
      "Bébé de moins de 3 mois",
    ],
    action:
      "Savon sans savon, douches tièdes et courtes, crème grasse deux fois par jour sur tout le corps, repérer et éliminer le produit en cause. Coton ample, ongles courts.",
    refer:
      "Surinfection, extension, sommeil cassé par les démangeaisons → dermatologue. Bébé < 3 mois ou crise d'asthme associée → médecin.",
    digest:
      "Plaques sèches qui démangent : plis des enfants (atopie) ou après produit (contact). Savon sans savon, crème grasse 2×/j. Référer si suintement/bébé < 3 mois.",
  },
  {
    id: "mycoses_plis",
    name: "Mycose des plis et des pieds",
    level: "educatif",
    summary:
      "Un champignon qui adore la chaleur et l'humidité : démangeaisons entre les orteils, rougeur sombre à bord net dans les plis (aisselles, aine, sous les seins). Très fréquent sous notre climat.",
    redFlags: [
      "Plusieurs plis + ongles jaunis/épaissis",
      "Extension vers la cuisse ou le dos",
      "Diabète connu",
    ],
    action:
      "Sécher soigneusement tous les plis après la douche, coton ample, changer chaussettes et sous-vêtements quotidiennement, savon antifongique doux du commerce ; ne jamais gratter.",
    refer:
      "Mycose étendue, ongles atteints, diabète, ou qui persiste après 4 semaines → dermatologue (le traitement des ongles se prend par voie orale).",
    digest:
      "Démange orteils/plis (chaleur + humidité). Sécher, coton ample, antifongique doux du commerce. Référer si ongles/diabète/4 semaines.",
  },
  {
    id: "pityriasis",
    name: "Pityriasis versicolor (« taches blanches »)",
    level: "educatif",
    summary:
      "Petites taches plus claires (parfois plus foncées) qui pèlent très fin, sur le torse, les épaules, le cou. Un champignon de surface qui se déclenche avec la chaleur et la transpiration. Bénin, mais récidive souvent.",
    redFlags: ["Taches qui persistent après 4 semaines de soins doux", "Extension au visage", "Doute avec le vitiligo"],
    action:
      "Savon au soufre ou shampoing antifongique du commerce quelques semaines, bien sécher après la transpiration. Astuce d'orientation : ça pèle fin au doigt, le vitiligo non.",
    refer: "Si ça ne part pas, s'étend, ou si doute avec le vitiligo → dermatologue.",
    digest:
      "Taches claires fines qui PÈLENT (torse/épaules) — champignon bénin, récidivant. Savon soufre. Vitiligo ne pèle pas. Dermato si persiste.",
  },
  {
    id: "teigne",
    name: "Teigne du cuir chevelu (enfant)",
    level: "referer",
    summary:
      "Chez l'enfant : plaques sans cheveux avec petites croûtes et démangeaisons du cuir chevelu, parfois des ganglions dans le cou. Un champignon du cuir chevelu, très contagieux à l'école et en famille.",
    redFlags: [
      "Croûtes purulentes ou gonflement douloureux (kérion)",
      "Fièvre",
      "Plusieurs enfants atteints à la maison",
    ],
    action:
      "Ne pas appliquer seul une crème « anti-champignon » : le parasite vit DANS le cheveux, il faut un traitement par voie orale. Prévenir l'école, ne pas partager bonnets/peignes/brosses, laver la literie à l'eau chaude.",
    refer: "Médecin ou dermatologue rapidement — guérison rapide bien traitée, chute définitive si tard.",
    digest:
      "Plaques chauves/croûtes du cuir chez l'enfant, très contagieux. Crèmes insuffisantes (traitement oral) → médecin vite ; laver bonnets/literie.",
  },
  {
    id: "folliculite_barbe",
    name: "Folliculite & pseudofolliculose de la barbe (poils incarnés)",
    level: "educatif",
    summary:
      "Après le rasage ou l'épilation, les cheveux crépus recourbés et percent la peau : petites bosses dures, parfois rouges et infectées, avec le poil enroulé dedans. Ça laisse des taches et parfois des keloïdes.",
    redFlags: [
      "Abcès douloureux ou fièvre",
      "Folliculite du cuir chevelu qui s'étend (bactérienne)",
      "Bourrelet cicatriciel qui grossit",
    ],
    action:
      "Préférer la tondeuse courte au rasoir de lame, raser dans le sens du poil (jamais à contre-poil), exfoliation douce une fois par semaine, jamais déterger les poils avec l'ongle.",
    refer: "Infection, abcès, ou poils qui ne repoussent plus → dermatologue.",
    digest:
      "Poils incarnés du rasage : bosses qui marquent. Tondeuse > rasoir, exfoliation douce. Référer si abcès/fièvre.",
  },
  {
    id: "gale",
    name: "Gale",
    level: "referer",
    summary:
      "Des démangeaisons très fortes, surtout la NUIT, et souvent toute la famille en même temps, avec petits sillons entre les doigts, poignets, aisselles. Un tout petit parasite se transmet par contact et la literie.",
    redFlags: [
      "Toute la famille gratte",
      "Plaies de grattage infectées (croûtes)",
      "Nourrisson ou femme enceinte atteints",
    ],
    action:
      "C'est contagieux et très bien guérissable : consulter. Laver à l'eau chaude draps et vêtements de TOUTE la maison le même jour, traiter tous les membres ensemble — sinon ça revient.",
    refer: "Médecin ou dermatologue pour confirmer et traiter toute la famille en même temps.",
    digest:
      "Démangeaisons NOCTURNES, TOUTE la famille, sillons des doigts — parasite. Consulter, traiter tous ensemble, literie à chaud.",
  },
  {
    id: "impetigo",
    name: "Impétigo",
    level: "referer",
    summary:
      "Plaques rouges puis croûtes jaunes comme du miel, autour de la bouche, du nez ou sur une gratture — surtout chez l'enfant. Une bactérie, très contagieux, mais qui guérit vite avec le bon traitement.",
    redFlags: ["Fièvre", "Croûtes qui s'étendent vite", "Gonflement douloureux rouge"],
    action:
      "Ne pas gratter, laver doucement à l'eau et au savon doux, couper les ongles courts, ne pas partager serviettes. Éviter l'école/cantine jusqu'à 24 h de traitement médical commencé.",
    refer: "Médecin rapidement — le traitement (selon étendue) n'est jamais prescrit par Kènè.",
    digest:
      "Croûtes jaunes « miel » (enfant) : bactérie très contagieuse, guérit vite traitée. Laver doucement. Médecin vite.",
  },
  {
    id: "urticaire",
    name: "Urticaire",
    level: "educatif",
    summary:
      "Des plaques gonflées, rosées, qui démangent : elles apparaissent et partent en quelques heures, se déplacent sur le corps. Souvent une réaction allergique — aliment, médicament, piqûre, chaleur.",
    redFlags: [
      "Gonflement des lèvres, langue ou gorge, gêne à respirer → URGENCE",
      "Malaise, vomissements",
      "Éruption douloureuse avec fièvre",
    ],
    action:
      "Compresse fraîche, éviter la source suspectée, noter ce qui a été mangé/touché avant. Vêtements amples, frais.",
    refer: "Lèvres/gorge gonflés ou gêne respiratoire = hôpital IMMÉDIATEMENT. Urticaire qui dure > 6 semaines → médecin.",
    digest:
      "Plaques gonflées qui migrent en heures (allergie). Compresse fraîche. Lèvres/gorge gonflés = URGENCE hôpital ; > 6 semaines → médecin.",
  },
  {
    id: "acanthosis",
    name: "Acanthosis nigricans",
    level: "referer",
    summary:
      "La peau devient épaisse, sombre et douce comme du velours sur le cou, la nuque, les aisselles, les plis. Souvent le signe d'une résistance à l'insuline — un terrain de diabète. Ce n'est pas une saleté.",
    redFlags: [
      "Installation rapide",
      "Soif intense, fatigue, perte/gain de poids (signes de diabète)",
      "Enfant en surpoids atteint",
    ],
    action:
      "Ne pas frotter ni gommer : ça ne part pas et ça irrite. Douceur sur la zone ; c'est un signal du corps, pas un problème de toilette. Une perte de poids progressive, avec le médecin, l'atténue.",
    refer: "MÉDECIN pour bilan (glycémie, insuline) — dépister tôt évite le diabète déclaré.",
    digest:
      "Cou/nuque/aisselles épais, sombres, veloutés : insulinorésistance (terrain diabète). Ne pas frotter. MÉDECIN bilan sucre.",
  },
  {
    id: "alopecie_traction",
    name: "Alopécie de traction",
    level: "educatif",
    summary:
      "La chute de cheveux causée par des coiffures TROP serrées — tresses, tissages, extensions, chignons tirés. Ça commence aux tempes et devant le front. Le follicule fatigue des années puis meurt définitivement.",
    redFlags: [
      "Front qui se dégarnit de plus en plus",
      "Petits boutons/pustules le long de la ligne",
      "Zone chauve qui persiste",
    ],
    action:
      "Desserrer les tresses, varier les coiffures, couper les extensions quelques mois pour reposer la ligne frontale, ne jamais dormir avec des mèches tendues, huiler la ligne.",
    refer: "Zone chauve > 6 mois après l'arrêt de la traction → dermatologue.",
    digest:
      "Chute tempes/front : tresses/tissages trop serrés. Desserrer, varier, reposer. Dermato si chauve > 6 mois après arrêt.",
  },
  {
    id: "ccca",
    name: "CCCA (alopécie centrale cicatricielle)",
    level: "referer",
    summary:
      "Le SOMMET du crâne se dégarnit lentement chez la femme noire, souvent avec picotements, démangeaisons ou petites croûtes. Le follicule se détruit et se remplace par une cicatrice — la perte est définitive.",
    redFlags: [
      "Picotements ou douleurs du sommet",
      "Clairsemé central qui s'étend",
      "Croûtes ou pustules du vertex",
    ],
    action:
      "Arrêter relaxeurs, chaleur excessive et tensions sur le sommet : toute inflammation accélère la destruction. Coiffures douces, hydratation du cuir.",
    refer: "DERMATOLOGUE VITE : pris tôt on freine l'évolution ; les follicules morts ne repoussent jamais.",
    digest:
      "Sommet du crâne dégarni + picotements (femme noire) : cicatriciel. STOP relaxeurs/tension. DERMATOLOGUE VITE — tôt = freinable.",
  },
  {
    id: "alopecie_areata",
    name: "Alopécie areata (plaques)",
    level: "referer",
    summary:
      "Des plaques chauves rondes, lisses, sans croûtes ni douleur, qui apparaissent en quelques jours ou semaines. Le système immunitaire attaque les cheveux, souvent après un gros stress. La repousse spontanée est fréquente.",
    redFlags: [
      "Plusieurs plaques qui grandissent",
      "Ongles piquetés",
      "Perte des sourcils ou des cils",
    ],
    action:
      "Rassurer : repousse spontanée fréquente. Foulard/coiffures couvrantes en attendant ; éviter les tresses serrées sur la zone.",
    refer: "Dermatologue pour confirmer et proposer un traitement (plus efficace tôt).",
    digest:
      "Plaques chauves RONDES, lisses, sans croûte, en jours (souvent stress). Repousse fréquente : rassurer. Dermato si plaques multiples.",
  },
  {
    id: "pellicules",
    name: "Pellicules / desquamation du cuir",
    level: "educatif",
    summary:
      "Des peaux mortes blanches sur les épaules et des démangeaisons du cuir chevelu. Trois causes possibles : sécheresse, excès de sébum, ou un champignon. Ça répond bien aux shampoings adaptés.",
    redFlags: [
      "Croûtes épaisses jaunâtres qui suintent",
      "Chute de cheveux associée",
      "Enfant atteint (teigne possible)",
    ],
    action:
      "Shampoing antipelliculaire 2 fois/semaine, rincer TRÈS abondamment (les résidus aggravent), soin huileux pré-shampoing (karité, ricin) si le cuir est sec.",
    refer: "Croûtes épaisses, chute de cheveux, ou enfant → dermatologue (teigne à éliminer).",
    digest:
      "Cuir qui pèle/démange. Shampoing adapté 2×/semaine, bien rincer. Référer si croûtes/chute/enfant (teigne ?).",
  },
  {
    id: "hyperpigmentation_globale",
    name: "Hyperpigmentation globale",
    level: "educatif",
    summary:
      "Le teint fonce de façon large et irrégulière, sans taches nettes. Causes fréquentes : soleil, inflammation répétée, produits agressifs (citron, gommages à grains durs, brossage) ou éclaircissements à répétition.",
    redFlags: [
      "Foncé rapide du visage et du cou avec produits éclaircissants (voir dépigmentation)",
      "Teint qui devient gris-noir terne",
    ],
    action:
      "STOP aux agressions (citron, gommages durs, brossage), écran quotidien, niacinamide en douceur, patience 3-6 mois. Le foncé d'irritation part lentement.",
    refer: "Teint gris-noir terne après des années d'éclaircissement → dermatologue (ochronose possible).",
    digest:
      "Teint foncé global : soleil/inflammation/citron. STOP agressions, écran, niacinamide. Gris-noir après éclaircissement → dermato (ochronose).",
  },
  {
    id: "melanome_acral",
    name: "Mélanome acral (paumes, plantes, ongles)",
    level: "referer",
    summary:
      "Rare mais grave : un mélanome qui pousse sur les PAUMES, les PLANTES et les ONGLES. Signe clé : une bande foncée verticale sur UN SEUL ongle qui s'élargit vers la base, ou une tache sombre irrégulière d'une paume/plante qui change.",
    redFlags: [
      "Ligne sombre longitudinale d'un seul ongle qui s'élargit",
      "Tache sombre des paumes/plantes qui change (ABCDE)",
      "Tache qui saigne, gratte ou ne guérit pas",
    ],
    action:
      "Appliquer la règle ABCDE, montrer TOUTE tache nouvelle ou changeante des paumes/plantes/ongles. Pas d'attentisme, pas de « remède maison ».",
    refer: "DERMATOLOGUE sans délai : pris tôt, la guérison est très bonne.",
    digest:
      "GRAVE, rare : paumes/plantes/ongles. Ligne sombre d'UN ongle qui s'élargit, tache changeante (ABCDE) → dermato SANS délai.",
  },
  {
    id: "carcinome_cicatrice",
    name: "Cancer sur cicatrice ou ulcère chronique",
    level: "referer",
    summary:
      "Une vieille cicatrice (brûlure, plaie) ou une plaie chronique de la jambe qui se met à bourgeonner, saigner, ou ne guérit pas depuis plus d'un mois, peut cacher un cancer de peau. Rare sur peau noire, mais réel.",
    redFlags: [
      "Ulcère qui ne guérit pas > 1 mois",
      "Bourgeon qui saigne sur cicatrice ancienne",
      "Croûte qui revient toujours au même endroit",
    ],
    action: "Ne pas « re-soigner » à répétition sans avis : photo de suivi et avis médical rapide.",
    refer: "Médecin/dermatologue — une biopsie tranche ; guérison très bonne prise tôt.",
    digest:
      "Cicatrice/ulcère qui saigne, bourgeonne ou > 1 mois sans guérir : cancer possible. Pas de re-soins → médecin (biopsie).",
  },
];

// ─────────────────────────── B. Danger dépigmentation ───────────────────────────

export const DEPIGMENTATION: DepigmentationDanger = {
  id: "depigmentation",
  title: "Danger de la dépigmentation volontaire",
  products:
    "Sachets et crèmes éclaircissantes du marché informel : hydroquinone à haute dose, corticoïdes topiques puissants, mercure. Elles éclaircissent vite… et abîment profondément.",
  complications: [
    "Peau fine, fragile, qui se déchire au moindre choc",
    "Vergetures violacées larges (aisselles, aine)",
    "Infections à répétition : mycoses, impétigo",
    "Ochronose exogène : teint gris-noir terreux, souvent irréversible",
    "Photosensibilité sévère : coups de soleil violents",
    "Acné aggravée, foncé paradoxal des jointures (coudes, genoux, doigts)",
  ],
  message:
    "Zéro jugement : une femme qui éclaircit ne cherche pas à « devenir blanche », elle cherche une peau lisse, éclatante, sans taches. Kènè répond à ce besoin SAINEMENT.",
  approach: [
    "Arrêt PROGRESSIF et doux — jamais de stop brutal : rebond inflammatoire et taches",
    "Réparer la barrière : nettoyant doux, crème grasse riche, patience de plusieurs mois",
    "Photoprotection stricte : la peau est devenue très sensible au soleil",
    "Estomper les taches sainement : niacinamide/acide azélaïque en douceur",
  ],
  refer:
    "Toute lésion sur peau dépigmentée — plaie, infection, teint gris-noir, vergetures douloureuses — → dermatologue SANS délai, sans honte.",
  digest:
    "Sachets/crèmes éclaircissants (hydroquinone forte, corticoïdes, mercure) : peau fine, vergetures, infections, ochronose (gris-noir), photosensibilité. ZÉRO jugement — elle cherche lisse/éclat. Arrêt PROGRESSIF, réparer la barrière, écran strict. Lésion → dermato.",
};

// ─────────────────────────── C. Botaniques africaines ───────────────────────────

export const BOTANICALS: KnowledgeBotanical[] = [
  {
    id: "karite",
    name: "Karité",
    virtues: "Répare et nourrit intensément la peau sèche, apaise les irritations, protège du dessèchement.",
    usage: "Beurre pur sur le corps, les lèvres, les pieds gercés ; en masque capillaire pré-shampoing ; pour les bébés.",
    caution:
      "Trop riche pour un visage qui fait des boutons (comédogène en couche épaisse) — privilégier corps et cheveux. Choisir du beurre brut non raffiné.",
    digest: "nourrit/répare peau sèche (corps, lèvres, cheveux, bébés) ; trop riche visage acnéique.",
  },
  {
    id: "moringa",
    name: "Moringa",
    virtues: "Riche en vitamines A, C, E : antioxydant, éclat du teint, anti-âge doux ; fortifie cheveux et ongles.",
    usage: "Huile de moringa en soin visage/cheveux (légère) ; poudre de feuilles en masque ou en rinçage.",
    caution: "Huile légère mais éviter sur acné active du visage ; toujours tester avant l'usage régulier.",
    digest: "antioxydant éclat ; huile légère visage/cheveux, poudre en masque ; tester.",
  },
  {
    id: "baobab",
    name: "Baobab",
    virtues: "Huile « sèche » qui pénètre vite : régénère la peau sèche, assouplit les cicatrices anciennes, fortifie les cheveux cassants.",
    usage: "Huile de baobab en massage corps, sur les marques, en soin des pointes.",
    caution: "Usage corps et cheveux de préférence ; tester sur une petite zone.",
    digest: "huile sèche pénétrante : peaux sèches, marques, cheveux cassants.",
  },
  {
    id: "bissap",
    name: "Bissap (hibiscus)",
    virtues: "Riche en acides de fruits (AHA naturels) : affine le grain, unifie, ravive l'éclat.",
    usage: "Infusion refroidie en lotion finale, fleurs en poudre en masque court ; les fleurs séchées s'achètent au marché.",
    caution:
      "AHA = photosensibilisant : jamais d'application pure prolongée sur le visage, toujours rincer, écran solaire ensuite. Pas sur peau lésée.",
    digest: "AHA éclat/unification ; rinçage ou masque court ; photosensibilisant → rincer + écran.",
  },
  {
    id: "aloka",
    name: "Aloka (aloès)",
    virtues: "Apaise, hydrate, calme irritations et petits coups de soleil ; favorise la réparation.",
    usage: "Gel frais de la feuille coupée, appliqué au frais sur peau propre ; feuille conservée au réfrigérateur.",
    caution: "Des allergies à l'aloès existent : test au pli du coude 48 h ; jamais sur plaie ouverte profonde.",
    digest: "gel frais apaise irritations/coups de soleil ; test 48 h, jamais plaie ouverte.",
  },
  {
    id: "nere",
    name: "Néré",
    virtues: "Poudre et beurre traditionnels : apaisent la peau sèche, assouplissent la peau et les cheveux.",
    usage: "Poudre de néré en gommage mou/cataplasme, beurre sur corps et cheveux — tradition ouest-africaine.",
    caution: "Usage corps et cheveux ; rincer le cataplasme à l'eau claire ; tester.",
    digest: "poudre/beurre apaisant (tradition ouest-africaine) ; corps/cheveux, rincer.",
  },
  {
    id: "neem",
    name: "Neem (margousier)",
    virtues: "Antibactérien et antifongique naturel : aide sur boutons, pellicules, mycoses légères.",
    usage: "Décoction de feuilles en rinçage du cuir chevelu, savons au neem pour le corps.",
    caution:
      "Puissant et asséchant : pas d'usage quotidien du visage, jamais sur femme enceinte sans avis médical, et ne remplace JAMAIS un traitement médical d'une vraie infection.",
    digest: "antibactérien/antifongique (boutons, pellicules) ; asséchant, pas visage quotidien, pas traitement médical.",
  },
  {
    id: "savon_noir",
    name: "Savon noir (alata)",
    virtues: "Nettoyant traditionnel à base de cendres végétales (cacao, palmier, karité) : décape en douceur, affine la peau du corps.",
    usage: "Savon noir pour la douche du corps, 2-4 fois/semaine selon tolérance.",
    caution:
      "Peut assécher : bien rincer, hydrater juste après ; éviter le visage fragile en usage quotidien ; choisir sans additifs industriels.",
    digest: "nettoyant traditionnel ; corps/imperfections ; assèche → hydrater après.",
  },
  {
    id: "plantain",
    name: "Plantain (pulpe)",
    virtues: "La pulpe mûre apaise et adoucit la peau ; riche en amidon nourrissant.",
    usage: "Masque frais de pulpe écrasée, 10-15 minutes, une à deux fois par semaine.",
    caution: "Préparer frais et jeter le reste ; pas sur peau lésée ; rincer à l'eau claire.",
    digest: "pulpe mûre apaisante en masque frais ; rincer, pas sur peau lésée.",
  },
  {
    id: "tamanu",
    name: "Tamanu",
    virtues: "Huile réparatrice réputée sur les marques et cicatrices ; favorise la régénération.",
    usage: "Huile de tamanu en application localisée sur cicatrices et taches anciennes.",
    caution: "Odeur forte, allergie possible : test 48 h obligatoire ; application en touches, pas en couche sur acné active.",
    digest: "huile cicatrisante sur marques ; test 48 h, application localisée.",
  },
];

// ─────────────────────────── D. Actifs cosmétiques ───────────────────────────

export const ACTIVES: KnowledgeActive[] = [
  {
    id: "niacinamide",
    name: "Niacinamide (vitamine B3)",
    role: "Atténue les taches brunes ET renforce la barrière — double action très bien tolérée sur peau foncée.",
    advice: "5 % (parfois 10 %), matin et/ou soir, dès la fin de l'adolescence ; excellent premier actif.",
    digest: "taches + barrière, 5 %, très bien toléré — le meilleur premier actif.",
  },
  {
    id: "azelaic",
    name: "Acide azélaïque",
    role: "Calme l'acné ET estompe les taches PIH : double emploi idéal sur peau noire boutonneuse.",
    advice: "Commencer 1×/jour le soir, augmenter à 2×/jour si bien toléré ; patience 8-12 semaines.",
    digest: "acné + PIH, doux ; 1×/jour au début, résultats 8-12 semaines.",
  },
  {
    id: "aha_bha",
    name: "AHA / BHA doux",
    role: "Unifient le teint (AHA : acide lactique) et débouchent les pores (BHA : acide salicylique).",
    advice:
      "Basses concentrations, 1-2 fois/semaine, rincer les masques acides ; préférer les acides doux aux gommages à grains (grains durs = micro-coupures = taches).",
    digest: "unifient/débouchent ; 1-2×/semaine basse dose, préférables aux grains durs.",
  },
  {
    id: "retinol",
    name: "Rétinol (progressif)",
    role: "Anti-imperfections et anti-âge ; affine les marques en accélérant le renouvellement.",
    advice: "Commencer 0,3 %, 2 soirs/semaine, augmenter lentement ; toujours hydrater après. Rétinol mal dosé = irritation = PIH.",
    digest: "0,3 %, 2 soirs/semaine, augmenter lentement ; irritation = taches.",
  },
  {
    id: "vitamine_c",
    name: "Vitamine C stabilisée",
    role: "Éclat et atténuation des taches, antioxydant de jour.",
    advice: "Forme stabilisée (ascorbyl glucoside, phosphate), le matin sous l'écran ; commencer 3×/semaine.",
    digest: "éclat + taches, forme stabilisée, matin sous écran.",
  },
  {
    id: "spf",
    name: "Écran solaire (SPF)",
    role: "INDISPENSABLE même sur peau noire : prévient mélasma, PIH, foncé global — sans lui, rien ne tient.",
    advice: "SPF 30+ chaque matin, réappliqué si transpiration forte ; texture fluide non grasse pour les peaux mixtes.",
    digest: "indispensable même peau noire ; SPF 30+ quotidien, réappliqué si transpiration.",
  },
  {
    id: "hydratation",
    name: "Hydratation (sérum + crème)",
    role: "La base avant tout actif : une barrière solide pigmente moins et supporte mieux les soins.",
    advice: "Sérum hydratant (glycérine, acide hyaluronique) + crème scellante ; jamais de routine à 8 produits.",
    digest: "base avant tout actif ; barrière solide = moins de taches.",
  },
];

export const GOLDEN_RULE_ACTIVES =
  "Règle d'or : UN actif à la fois, introduit toutes les 2-4 semaines — la peau noire réagit par la pigmentation à l'irritation.";

// ─────────────────────────── E. Signes rouges + règles du personnage ───────────────────────────

export const RED_FLAGS: KnowledgeRedFlag[] = [
  {
    id: "cellulite",
    sign: "Fièvre + rougeur douloureuse et chaude qui s'étend (jambe, visage, plaie)",
    action: "Médecin ou hôpital LE JOUR MÊME (cellulite/érysipèle : infection profonde qui avance vite).",
    digest: "Fièvre + rougeur douloureuse qui s'étend : médecin VITE (cellulite/érysipèle).",
  },
  {
    id: "plaie_chronique",
    sign: "Toute plaie, ulcère ou bouton qui ne guérit pas après 1 mois",
    action: "Consulter — jamais de « re-soins » à répétition sans avis.",
    digest: "Plaie/bouton qui ne guérit pas > 1 mois : consulter (cancer possible).",
  },
  {
    id: "tache_abcde",
    sign: "Une tache qui change : asymétrie, bords irréguliers, plusieurs couleurs, > 6 mm, évolution (ABCDE)",
    action: "Dermatologue sans délai — photo de comparaison tous les mois aide.",
    digest: "Tache qui change (ABCDE) : dermatologue sans délai.",
  },
  {
    id: "bulles",
    sign: "Bulles/ampoules étendues ou brûlure large",
    action: "Hôpital — jamais percer les bulles.",
    digest: "Bulles étendues ou brûlure large : hôpital, ne jamais percer.",
  },
  {
    id: "purpura",
    sign: "Purpura : points ou taches sombres/rouges qui ne s'effacent pas quand on appuie",
    action: "Urgence médicale — possible atteinte de la coagulation.",
    digest: "Taches qui ne s'effacent pas à la pression (purpura) : urgence.",
  },
  {
    id: "allergie_severe",
    sign: "Gonflement du visage, des lèvres ou de la gorge, gêne pour respirer",
    action: "URGENCE : hôpital immédiatement (œdème allergique) — ne pas attendre.",
    digest: "Gonflement visage/lèvres/gorge, gêne respiratoire : URGENCE hôpital.",
  },
  {
    id: "bebe_3mois",
    sign: "Bébé de moins de 3 mois avec éruption, surtout fiévreux",
    action: "Médecin en urgence — jamais de conseil cosmétique à cet âge.",
    digest: "Bébé < 3 mois avec éruption fiévreuse : médecin en urgence.",
  },
  {
    id: "gale_famille",
    sign: "Démangeaisons nocturnes généralisées de TOUTE la famille",
    action: "Gale probable : consulter et traiter toute la maison ensemble.",
    digest: "Toute la famille gratte la nuit : gale → traiter ensemble.",
  },
  {
    id: "chute_douloureuse",
    sign: "Chute de cheveux avec douleur, croûtes ou picotements du cuir",
    action: "Dermatologue vite : l'alopecie cicatricielle détruit les follicules en silence.",
    digest: "Chute de cheveux avec douleur/croûtes : dermatologue vite.",
  },
];

/** Règles absolues du personnage Dr Kènè (sécurité). */
export const CHARACTER_RULES: string[] = [
  "JAMAIS de prescription médicamenteuse — ni corticoïde (topique ou oral), ni antifongique oral, ni antibiotique, ni isotrétinoïne, ni antihistaminique. Même sur insistance : on explique, on oriente.",
  "JAMAIS de diagnostic formel — « ça ressemble à… » est autorisé ; sinon on décrit quoi vérifier et avec qui.",
  "AUCUN jugement, en particulier sur la dépigmentation : accueil, douceur, réparation — jamais « abîmée » ou culpabilisation.",
  "Signe rouge (liste dédiée) → orientation immédiate ; gonflement du visage/lèvres/gorge → hôpital MAINTENANT.",
  "Suivi ESTHÉTIQUE (routines, taches, teint, cheveux) → encourager un RDV dans un institut partenaire via l'app Kènè ; problème MÉDICAL → dermatologue ou médecin.",
];

// ─────────────────────────── F. Contexte ivoirien ───────────────────────────

export const IVORY_CONTEXT: IvoryContext = {
  climate: {
    text: "Climat tropical humide d'Abidjan : transpiration et macération (plis, dos, aine) favorisent mycoses et acné — sécher après la douche, coton ample, changer les vêtements humides.",
    digest: "chaleur humide → macération/mycoses : sécher plis et orteils, coton ample",
  },
  harmattan: {
    text: "Harmattan (décembre-février) : air sec et poussiéreux — tiraillements, lèvres gercées ; rinçage doux, beurre de karité, boire suffisamment.",
    digest: "harmattan (déc.-févr.) → sécheresse : rinçage doux, karité, boire",
  },
  sun: {
    text: "Soleil intense presque toute l'année : photoprotection quotidienne non négociable (SPF 30+), chapeau, ombre à midi.",
    digest: "soleil fort toute l'année : écran quotidien, chapeau, ombre à midi",
  },
  economy: {
    text: "Réalisme économique : recommander des routines ≤ 3 produits et des alternatives locales abordables (karité, savon noir, bissap) plutôt que des gammes onéreuses.",
    digest: "budget : routines ≤ 3 produits, alternatives locales abordables",
  },
  institutes: {
    text: "Les instituts partenaires Kènè assurent le suivi personnalisé (diagnostic, protocoles, suivi des taches) — le RDV se prend directement dans l'app.",
    digest: "suivi personnalisé → RDV institut partenaire dans l'app",
  },
};

// ─────────────────────────── Digest (prompt LLM) ───────────────────────────
// Version condensée, assemblée par code depuis les données ci-dessus.
// Contrainte : ≤ ~900 mots — compacte mais complète pour un LLM.

const levelTag = (c: KnowledgeCondition): string => (c.level === "referer" ? "RÉFÉRER" : "éducatif");

const digestConditions = CONDITIONS.map((c) => `- ${c.name} [${levelTag(c)}] : ${c.digest}`).join("\n");

const digestBotanicals = BOTANICALS.map((b) => `- ${b.name} : ${b.digest}`).join("\n");

const digestActives = ACTIVES.map((a) => `- ${a.name} : ${a.digest}`).join("\n");

const digestRedFlags = RED_FLAGS.map((r) => `- ${r.digest}`).join("\n");

export const KNOWLEDGE_DIGEST: string = [
  "════ CONNAISSANCES DR KÈNÈ — dermatologie des peaux noires (Afrique de l'Ouest) ════",
  "",
  "— CONDITIONS FRÉQUENTES (éducatif = conseils doux · RÉFÉRER = orientation pro) —",
  digestConditions,
  "",
  "— DANGER DÉPIGMENTATION VOLONTAIRE —",
  DEPIGMENTATION.digest,
  "",
  "— BOTANIQUES AFRICAINES —",
  digestBotanicals,
  "Précautions : jamais sur peau lésée · test pli du coude 48 h · pas d'huile pure sur acné active du visage.",
  "",
  "— ACTIFS COSMÉTIQUES peaux foncées —",
  digestActives,
  GOLDEN_RULE_ACTIVES,
  "",
  "— SIGNES ROUGES : référer sans délai —",
  digestRedFlags,
  "",
  "— CONTEXTE IVOIRIEN (Abidjan) —",
  `- ${IVORY_CONTEXT.climate.digest}`,
  `- ${IVORY_CONTEXT.harmattan.digest}`,
  `- ${IVORY_CONTEXT.sun.digest}`,
  `- ${IVORY_CONTEXT.economy.digest}`,
  `- ${IVORY_CONTEXT.institutes.digest}`,
].join("\n");
