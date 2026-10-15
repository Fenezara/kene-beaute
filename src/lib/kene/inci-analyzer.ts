// Kènè — Moteur d'Analyse INCI & Cosmétovigilance Anti-Dépigmentation
// Détection automatique des corticoïdes, hydroquinone, métaux lourds (mercure) et actifs cutanés
// Spécifiquement calibré pour les peaux mélanodermes (phototypes Fitzpatrick IV à VI).

export type InciToxicityVerdict = "danger" | "vigilance" | "sain" | "non_trace";

export interface DetectedSubstance {
  id: string;
  name: string;
  matchedTerm: string;
  category: "hydroquinone" | "corticoid" | "mercury" | "caustic" | "irritant" | "beneficial";
  severity: "critique" | "moderee" | "benefique";
  dangerLabel: string;
  explanation: string;
}

export interface InciAnalysisResult {
  isProduct: boolean;
  productName?: string;
  verdict: InciToxicityVerdict;
  badgeLabel: string;
  title: string;
  summary: string;
  detectedDangers: DetectedSubstance[];
  detectedIrritants: DetectedSubstance[];
  detectedBeneficial: DetectedSubstance[];
  actionPlan: {
    title: string;
    weaningProtocol?: string[]; // Étapes d'arrêt progressif (sevrage) sans rebond
    safeAlternatives: string[]; // Alternatives saines (karité, moringa, etc.)
    medicalAdvice: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DICTIONNAIRES TOXICOLOGIQUES & SUBSTANCES INTERDITES / DANGEREUSES
// ─────────────────────────────────────────────────────────────────────────────

interface ToxicPattern {
  id: string;
  name: string;
  category: "hydroquinone" | "corticoid" | "mercury" | "caustic";
  dangerLabel: string;
  explanation: string;
  patterns: RegExp[];
}

const DANGEROUS_SUBSTANCES: ToxicPattern[] = [
  // ── HYDROQUINONE ET SES NOMS CAMOUFLÉS ──
  {
    id: "hydroquinone",
    name: "Hydroquinone & dérivés",
    category: "hydroquinone",
    dangerLabel: "Substance dépigmentante toxique interdite en cosmétique",
    explanation:
      "Détruit les mélanocytes et bloque brutalement la mélanine. Responsable d'ochronose exogène (coloration bleu-noirâtre irréversible de la peau), d'amincissement cutané et d'effet rebond hyperpigmentaire sévère à l'arrêt.",
    patterns: [
      /\bhydroquinone\b/i,
      /\b1[,.-]4[- ]benzenediol\b/i,
      /\bbenzene[- ]1[,.-]4[- ]diol\b/i,
      /\bp[- ]diphenol\b/i,
      /\bp[- ]dihydroxybenzene\b/i,
      /\bquinol\b/i,
      /\bhydrochinon[e]?\b/i,
      /\bp[- ]hydroxyphenol\b/i,
      /\btequinol\b/i,
      /\beldopaque\b/i,
      /\bsolaquin\b/i,
    ],
  },

  // ── DERMOCORTICOÏDES FORTS À TRÈS FORTS (CLASSES I À IV DÉTOURNÉES) ──
  {
    id: "clobetasol",
    name: "Propionate de Clobétasol (Corticoïde classe IV)",
    category: "corticoid",
    dangerLabel: "Dermocorticoïde d'activité très forte — Danger extrême pour la peau",
    explanation:
      "Médicament de réserve pour dermatoses sévères, strictement interdit en cosmétique libre. Provoque une atrophie cutanée irrémédiable, des vergetures violacées géantes, des infections fongiques et bactériennes à répétition et un passage systémique (diabète, hypertension).",
    patterns: [
      /\bclobetasol\b/i,
      /\bclobetasone\b/i,
      /\bdermoval\b/i,
      /\bdermovate\b/i,
      /\bmovate\b/i,
      /\btemovate\b/i,
    ],
  },
  {
    id: "betamethasone",
    name: "Bétaméthasone & dérivés (Corticoïde classe III)",
    category: "corticoid",
    dangerLabel: "Dermocorticoïde puissant détourné en produit éclaircissant",
    explanation:
      "Stéroïde synthétique qui blanchit par vasoconstriction capillaire intense. Entraîne télangiectasies (vaisseaux sanguins apparents éclatés), fragilité cutanée extrême et dépendance corticoïde.",
    patterns: [
      /\bbetamethasone\b/i,
      /\bdiprosone\b/i,
      /\bdiproson\b/i,
      /\bcelestene\b/i,
    ],
  },
  {
    id: "fluocinonide",
    name: "Fluocinonide & Fluocinolone",
    category: "corticoid",
    dangerLabel: "Corticoïde fluoré de haute puissance",
    explanation:
      "Corticoïde puissant pénétrant très vite l'épiderme. Risque de dépigmentation anarchique en damier et vulnérabilité solaire aiguë.",
    patterns: [
      /\bfluocinonide\b/i,
      /\bfluocinolone\b/i,
      /\bsynalar\b/i,
    ],
  },
  {
    id: "general_corticoids",
    name: "Dermocorticoïdes divers (Dexaméthasone, Hydrocortisone forte, Triamcinolone)",
    category: "corticoid",
    dangerLabel: "Anti-inflammatoire stéroïdien non déclaré",
    explanation:
      "Usage chronique dévié provoquant folliculites, peau fine qui se déchire au moindre frottement et altération immunitaire locale.",
    patterns: [
      /\bdexamethasone\b/i,
      /\btriamcinolone\b/i,
      /\bdesoximetasone\b/i,
      /\bprednisolone\b/i,
      /\bdiflucortolone\b/i,
      /\bhalobetasol\b/i,
    ],
  },

  // ── SELS DE MERCURE ET MÉTAUX LOURDS ──
  {
    id: "mercury",
    name: "Sels de Mercure & dérivés mercuriels",
    category: "mercury",
    dangerLabel: "Poison cellulaire lourd et neurotoxique",
    explanation:
      "Bloque la tyrosinase par empoisonnement cellulaire. S'accumule dans les reins et le foie, cause des neuropathies et noircit les plis cutanés (ongles, gencives) à terme.",
    patterns: [
      /\bmercur(?:y|e)\b/i,
      /\bcalomel\b/i,
      /\bmercurous chloride\b/i,
      /\bmercuric chloride\b/i,
      /\bammoniated mercury\b/i,
      /\bmercuric oxide\b/i,
      /\bhydrargyri\b/i,
    ],
  },

  // ── CAUSTIQUES & DÉPIGMENTANTS DÉFINITIFS ──
  {
    id: "monobenzone",
    name: "Monobenzone (Éther monobenzylique d'hydroquinone)",
    category: "caustic",
    dangerLabel: "Destructeur définitif de pigments mélaniques",
    explanation:
      "Médicament de dernier recours pour dépigmentation complète dans le vitiligo universel. Provoque une dépigmentation irréversible en confettis sur tout le corps.",
    patterns: [
      /\bmonobenzone\b/i,
      /\bmonobenzyl ether\b/i,
      /\bbenoquin\b/i,
    ],
  },
];

// ── SUSPICION SUR PRODUITS ARTISANAUX SANS INCI (« CRÈMES DE MARCHÉ ») ──
const SUSPICIOUS_CLAIMS = [
  /\bblanchiment rapide\b/i,
  /\bblanchissant(?:e)? express\b/i,
  /\bteint m[ée]tisse(?: express| rapide)?\b/i,
  /\b[ée]claircissant 7 jours\b/i,
  /\baction rapide m[ée]tisse\b/i,
  /\bd[ée]caper\b/i,
  /\bpeeling jaune m[ée]tisse\b/i,
  /\bteint blanc sans tache\b/i,
  /\bconcentr[ée] magique blanchissant\b/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. ACTIFS IRRITANTS OU À SURVEILLER SUR PEAUX NOIRES (NIVEAU ORANGE)
// ─────────────────────────────────────────────────────────────────────────────

interface IrritantPattern {
  id: string;
  name: string;
  explanation: string;
  patterns: RegExp[];
}

const IRRITANT_PATTERNS: IrritantPattern[] = [
  {
    id: "strong_glycolic",
    name: "Acide glycolique à forte dose (> 10-15%)",
    explanation: "Pénétration très rapide pouvant causer des brûlures superficielles et déclencher une hyperpigmentation post-inflammatoire rebond sur phototype foncé.",
    patterns: [/\bglycolic acid\b/i, /\bacide glycolique\b/i],
  },
  {
    id: "denatured_alcohol",
    name: "Alcool dénaturé (Alcohol Denat) en tête de formule",
    explanation: "Assèche le film hydrolipidique de surface et induit une hypersécrétion réactionnelle de sébum et un teint terne cendré.",
    patterns: [/\balcohol denat\b/i, /\balcool d[ée]natur[ée]\b/i],
  },
  {
    id: "heavy_fragrance",
    name: "Parfums et huiles essentielles photosensibilisantes",
    explanation: "Risque accru de dermite de contact allergique et de taches sombres lors de l'exposition au soleil ouest-africain.",
    patterns: [/\bfragrance\b/i, /\bparfum\b/i, /\blimonene\b/i, /\blinalool\b/i, /\beugenol\b/i],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. ACTIFS BÉNÉFIQUES & RECOMMANDÉS POUR PEAUX MÉLANODERMES (NIVEAU VERT)
// ─────────────────────────────────────────────────────────────────────────────

interface BeneficialPattern {
  id: string;
  name: string;
  role: string;
  patterns: RegExp[];
}

const BENEFICIAL_PATTERNS: BeneficialPattern[] = [
  {
    id: "niacinamide",
    name: "Niacinamide (Vitamine B3)",
    role: "Régulateur de sébum, bloque le transfert des taches sans détruire la mélanine et renforce les céramides.",
    patterns: [/\bniacinamide\b/i, /\bnicotinamide\b/i, /\bvitamin(?:e)? b3\b/i],
  },
  {
    id: "azelaic_acid",
    name: "Acide Azélaïque",
    role: "Actif roi sur peau noire : cible sélectivement les cellules hyperpigmentées sans blanchir la peau saine, anti-acné.",
    patterns: [/\bazelaic acid\b/i, /\bacide az[ée]la[ïi]que\b/i],
  },
  {
    id: "shea_butter",
    name: "Beurre de Karité brut (Butyrospermum Parkii)",
    role: "Nourrit intensément, relipide la barrière cutanée éprouvée et protège contre le vent sec et l'harmattan.",
    patterns: [/\bbutyrospermum parkii\b/i, /\bkarit[ée]\b/i, /\bshea butter\b/i],
  },
  {
    id: "moringa",
    name: "Huile de Moringa (Moringa Oleifera)",
    role: "Antioxydant puissant riche en acide béhénique, régulateur du sébum et protecteur antipollution.",
    patterns: [/\bmoringa oleifera\b/i, /\bmoringa\b/i],
  },
  {
    id: "baobab",
    name: "Huile de Baobab (Adansonia Digitata)",
    role: "Huile régénératrice riche en oméga-3-6-9, assouplit la peau et prévient les cicatrices.",
    patterns: [/\badansonia digitata\b/i, /\bbaobab\b/i],
  },
  {
    id: "aloe_vera",
    name: "Gel d'Aloès / Aloka (Aloe Barbadensis)",
    role: "Apaisant immédiat, hydratation profonde sans effet gras.",
    patterns: [/\baloe barbadensis\b/i, /\baloe vera\b/i, /\baloka\b/i],
  },
  {
    id: "tranexamic_acid",
    name: "Acide Tranexamique",
    role: "Régulateur vasculaire et pigmentaire très doux pour mélasma et taches anciennes résistantes.",
    patterns: [/\btranexamic acid\b/i, /\bacide tranexamique\b/i],
  },
  {
    id: "alpha_arbutin",
    name: "Alpha-Arbutine",
    role: "Dérivé végétal doux inhibant la tyrosinase de manière progressive et sûre.",
    patterns: [/\balpha[- ]arbutin\b/i, /\barbutine\b/i],
  },
  {
    id: "ceramides",
    name: "Céramides (NP, AP, EOP)",
    role: "Ciment intercellulaire essentiel qui efface l'aspect gris cendré de la peau sèche.",
    patterns: [/\bceramide\b/i, /\bc[ée]ramide\b/i],
  },
  {
    id: "hyaluronic_acid",
    name: "Acide Hyaluronique (Sodium Hyaluronate)",
    role: "Humectant suprême captant jusqu'à 1000 fois son poids en eau.",
    patterns: [/\bhyaluronic acid\b/i, /\bsodium hyaluronate\b/i, /\bacide hyaluronique\b/i],
  },
  {
    id: "zinc",
    name: "Zinc PCA",
    role: "Assainissant antibactérien et matifiant pour pores dilatés et brillances.",
    patterns: [/\bzinc pca\b/i, /\bzinc gluconate\b/i, /\bzinc oxide\b/i],
  },
  {
    id: "clean_sunscreen",
    name: "Filtres solaires modernes photostables (Tinosorb, Mexoryl)",
    role: "Protection large spectre indispensable contre la lumière bleue et les UV qui fabriquent les taches.",
    patterns: [/\btinosorb\b/i, /\bmexoryl\b/i, /\buvinul\b/i],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. FONCTION PRINCIPALE : ANALYSE D'UN TEXTE INCI / TRANSCRIPTION DE FLACON
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeInciText(rawText: string): InciAnalysisResult {
  const text = rawText.toLowerCase().replace(/\s+/g, " ");

  const detectedDangers: DetectedSubstance[] = [];
  const detectedIrritants: DetectedSubstance[] = [];
  const detectedBeneficial: DetectedSubstance[] = [];

  // 1. Recherche des poisons dépigmentants (Hydroquinone, Corticoïdes, Mercure, etc.)
  for (const item of DANGEROUS_SUBSTANCES) {
    for (const pat of item.patterns) {
      const match = text.match(pat);
      if (match) {
        detectedDangers.push({
          id: item.id,
          name: item.name,
          matchedTerm: match[0],
          category: item.category,
          severity: "critique",
          dangerLabel: item.dangerLabel,
          explanation: item.explanation,
        });
        break;
      }
    }
  }

  // 2. Détection des promesses suspectes sans liste INCI formelle
  const hasSuspiciousClaim = SUSPICIOUS_CLAIMS.some((rx) => rx.test(text));

  // 3. Recherche des actifs irritants à surveiller
  for (const item of IRRITANT_PATTERNS) {
    for (const pat of item.patterns) {
      const match = text.match(pat);
      if (match) {
        detectedIrritants.push({
          id: item.id,
          name: item.name,
          matchedTerm: match[0],
          category: "irritant",
          severity: "moderee",
          dangerLabel: "Actif à manier avec précaution sur peau noire",
          explanation: item.explanation,
        });
        break;
      }
    }
  }

  // 4. Recherche des actifs sains et bénéfiques
  for (const item of BENEFICIAL_PATTERNS) {
    for (const pat of item.patterns) {
      const match = text.match(pat);
      if (match) {
        detectedBeneficial.push({
          id: item.id,
          name: item.name,
          matchedTerm: match[0],
          category: "beneficial",
          severity: "benefique",
          dangerLabel: "Actif sain validé pour peau mélanoderme",
          explanation: item.role,
        });
        break;
      }
    }
  }

  // ── DÉTERMINATION DU VERDICT DE SANTÉ CUTANÉE ──
  if (detectedDangers.length > 0) {
    const mainDangerNames = detectedDangers.map((d) => d.name).join(", ");
    return {
      isProduct: true,
      verdict: "danger",
      badgeLabel: "ALERTE SANTÉ CUTANÉE",
      title: "Substance toxique ou décapante détectée",
      summary: `Attention ma chérie : ce produit contient ${mainDangerNames}. Ces molécules sont des dépigmentants toxiques qui abîment gravement la mélanine (risque d'ochronose gris-noir irréversible, vergetures violacées et destruction de la barrière cutanée).`,
      detectedDangers,
      detectedIrritants,
      detectedBeneficial,
      actionPlan: {
        title: "Protocole d'arrêt progressif et de régénération",
        weaningProtocol: [
          "Ne stoppe PAS brutalement du jour au lendemain si tu l'utilises depuis des semaines : cela déclencherait un rebond inflammatoire sévère avec poussée de boutons noirs.",
          "Semaine 1 : Réduis l'application à un jour sur deux, et compense les autres soirs par du beurre de karité pur ou une crème neutre aux céramides.",
          "Semaine 2 : Espace à deux fois par semaine seulement, en appliquant généreusement de l'huile de moringa pure matin et soir pour calmer l'inflammation.",
          "Semaine 3 : Arrêt définitif. Passe à une routine 100% réparatrice : nettoyant doux sans savon + beurre de karité brut + écran solaire SPF 50 non négociable.",
        ],
        safeAlternatives: [
          "Beurre de Karité brut non raffiné de Korhogo (pour cicatriser et relipider)",
          "Huile pure de Moringa d'Afrique de l'Ouest (antioxydant protecteur)",
          "Sérum Niacinamide 5% ou Acide Azélaïque 10% (pour réguler le teint en toute sécurité sans blanchir)",
          "Crème solaire SPF 50 invisible",
        ],
        medicalAdvice:
          "Si tu remarques des vergetures douloureuses, une plaie ouverte ou une tache bleu-noirâtre foncée, consulte un médecin dermatologue sans délai ni gêne.",
      },
    };
  }

  if (hasSuspiciousClaim && detectedBeneficial.length === 0) {
    return {
      isProduct: true,
      verdict: "non_trace",
      badgeLabel: "VIGILANCE : PRODUIT NON TRACÉ",
      title: "Absence de composition officielle / Promesse décapante",
      summary:
        "Ce produit affiche des allégations de blanchiment rapide sans fournir de liste d'ingrédients conforme (INCI). Sur les marchés, ces formules artisanales contiennent presque toujours des mélanges non dosés de corticoïdes ou d'hydroquinone. La plus grande prudence est recommandée.",
      detectedDangers: [],
      detectedIrritants,
      detectedBeneficial,
      actionPlan: {
        title: "Recommandations de sécurité Kènè",
        weaningProtocol: [
          "Évite d'appliquer ce produit sur le visage ou sur de grandes zones du corps.",
          "Privilégie des soins cosmétiques certifiés avec liste d'ingrédients transparente et traçable.",
        ],
        safeAlternatives: [
          "Beurre de Karité brut de Korhogo",
          "Huile de Baobab régénérante",
          "Savon noir traditionnel doux d'Afrique de l'Ouest",
        ],
        medicalAdvice: "Demande conseil à une dermo-conseillère en institut partenaire Kènè.",
      },
    };
  }

  if (detectedIrritants.length > 0 && detectedBeneficial.length === 0) {
    return {
      isProduct: true,
      verdict: "vigilance",
      badgeLabel: "VIGILANCE DERMATOLOGIQUE",
      title: "Actifs potentiellement irritants sur peau mélanoderme",
      summary:
        "Ce produit ne contient pas de poison dépigmentant, mais renferme des composants qui peuvent décaper ou agresser une peau noire sensible (acides exfoliants forts ou alcool asséchant).",
      detectedDangers: [],
      detectedIrritants,
      detectedBeneficial,
      actionPlan: {
        title: "Comment l'utiliser sans danger",
        weaningProtocol: [
          "Introduis ce produit très lentement (1 seul soir par semaine pour commencer).",
          "Hydrate toujours intensément juste après.",
          "Ne combine jamais avec un autre produit exfoliant le même jour.",
        ],
        safeAlternatives: [
          "Acide Mandélique doux",
          "Gluconolactone (PHA doux non photosensibilisant)",
          "Huile de Moringa pure",
        ],
        medicalAdvice: "En cas de tiraillements ou de brûlures, stoppe immédiatement l'usage.",
      },
    };
  }

  // Formule conforme et saine
  return {
    isProduct: true,
    verdict: "sain",
    badgeLabel: "FORMULE CERTIFIÉE SAINE",
    title: "Composition respectueuse de la peau mélanoderme",
    summary:
      detectedBeneficial.length > 0
        ? `Excellente nouvelle ma chérie ! Cette formule respecte la physiologie de ta peau. Elle contient des actifs bénéfiques reconnus (${detectedBeneficial.map((b) => b.name).join(", ")}) qui subliment la mélanine sans l'agresser.`
        : "Ce produit ne contient aucune substance dépigmentante toxique connue ni corticoïde masqué. Sa composition est sûre pour ta routine quotidienne.",
    detectedDangers: [],
    detectedIrritants,
    detectedBeneficial,
    actionPlan: {
      title: "Conseils d'intégration à ta routine",
      safeAlternatives: [
        "À appliquer sur peau propre matin ou soir selon le protocole",
        "Toujours sceller l'hydratation avec ta crème de jour ou une touche de karité",
        "Ne pas oublier l'écran solaire le matin",
      ],
      medicalAdvice: "Tu peux utiliser ce soin en toute sérénité !",
    },
  };
}
