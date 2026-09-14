// Kènè — « Herbier des Grandes-Mères »: données pures des 8 plantes
// du jardin. Lib SANS React ni three (importable partout, testable, SSR-safe).
// Ton éditorial: sagesse de grand-mère ivoirienne — chaleureux, concret, et
// HONNÊTE. Zéro promesse thérapeutique, zéro posologie médicale; une seule
// précaution claire par plante. `indicateurs` = clés CANONIQUES du glossaire
// (src/lib/kene/glossary.ts) auxquelles la plante répond traditionnellement —
// la carte peut donc afficher le libellé exact compris au diagnostic.

export interface HerbierPlant {
 /** Identifiant stable (clé d'animation, pas affiché). */
  id: string;
 /** Nom français usuel. */
  nom: string;
 /** 1-2 appellations populaires ivoiriennes/ouest-africaines (si sûres),
 * sinon le nom scientifique — affiché « aussi appelé… ». */
  nomsLocaux: string[];
 /** Famille botanique (affichée en surtitre). */
  famille: string;
 /** Vertus traditionnelles — 2-3 phrases simples, niveau grand-mère
 * (« apaise », « nourrit », « calme les rougeurs »…). */
  vertus: string;
 /** Forme d'usage concrète et douce (beurre, décoction refroidie…). */
  usage: string;
 /** UNE phrase honnête de prudence (test pli du coude, jamais sur plaie…). */
  precaution: string;
 /** Clés d'indicateurs du diagnostic (glossary.ts) « soignées » par la plante. */
  indicateurs: string[];
 /** Citation de grand-mère — une phrase, ton juste et tendre. */
  sagesse: string;
 /** Couleur signature (feuillage / calice) — hex, pilote la 3D et le médaillon. */
  couleur: string;
}

export const HERBIER_PLANTS: HerbierPlant[] = [
  {
    id: "karite",
    nom: "Karité",
    nomsLocaux: ["Si (dioula)", "Vitellaria paradoxa"],
    famille: "Sapotacées",
    vertus:
      "Nourrit très profondément les peaux sèches et apaise les tiraillements. Aide la barrière de la peau à se réparer et à garder son eau. Adoucit les zones rugueuses — coudes, genoux, talons.",
    usage:
      "Beurre brut non raffiné, en fine couche sur peau propre après la douche, ou fondu au bain-marie dans une préparation maison.",
    precaution:
      "Teste au pli du coude avant la première utilisation, et n'en mets jamais sur une plaie ouverte.",
    indicateurs: ["secheresse", "barriere_cutanee", "irritation_eczema"],
    sagesse: "Le karité, c'est la main de la grand-mère : il rend à la peau ce que le soleil lui prend.",
    couleur: "#4E7A34",
  },
  {
    id: "aloe",
    nom: "Aloès",
    nomsLocaux: ["Aloka", "Aloe vera"],
    famille: "Asphodélacées",
    vertus:
      "Calme les rougeurs et la chaleur de la peau irritée. Rafraîchit et hydrate en surface, et aide la peau à s'apaiser après un coup de soleil.",
    usage:
      "Gel clair prélevé dans une feuille coupée, rincé à l'eau claire, posé frais sur la peau nettoyée.",
    precaution:
      "N'utilise que la chair transparente : le jus jaune collé à l'écorce irrite — et fais un test au pli du coude.",
    indicateurs: ["rougeurs_inflammation", "irritation_eczema", "hydratation"],
    sagesse: "L'aloka ne crie pas, il soulage : une feuille, de l'eau, et la chaleur s'en va.",
    couleur: "#7FA36B",
  },
  {
    id: "moringa",
    nom: "Moringa",
    nomsLocaux: ["Moringa oleifera"],
    famille: "Moringacées",
    vertus:
      "Nourrit la peau de l'intérieur : ses feuilles regorgent de vitamines. En soin, l'huile de moringa aide la peau fatiguée à retrouver douceur et éclat.",
    usage:
      "Feuilles séchées en poudre dans une pâte douce avec du miel, ou huile de moringa en soin du soir sur peau humide.",
    precaution: "Évite le soleil juste après l'application d'huile — le soir, ta peau en profite mieux.",
    indicateurs: ["eclat_uniformite", "secheresse", "barriere_cutanee"],
    sagesse: "Le moringa, c'est l'arbre qui veille : ses feuilles nourrissent, ses graines gardent.",
    couleur: "#8FAF5E",
  },
  {
    id: "baobab",
    nom: "Baobab",
    nomsLocaux: ["Adansonia digitata"],
    famille: "Malvacées",
    vertus:
      "L'huile de baobab hydrate les peaux très sèches et fragilisées. Riche et douce à la fois, elle nourrit sans alourdir, et la pulpe du fruit réconforte de l'intérieur.",
    usage:
      "Quelques gouttes d'huile en massage léger sur peau encore humide, ou pulpe de fruit séchée en boisson fraîche.",
    precaution: "Garde l'huile au frais et à l'abri de la lumière pour qu'elle ne rancisse pas.",
    indicateurs: ["secheresse", "hydratation", "barriere_cutanee"],
    sagesse: "Le baobab garde l'eau de la saison sèche — ta peau, elle aussi, a droit à ses réserves.",
    couleur: "#5E7B48",
  },
  {
    id: "bissap",
    nom: "Bissap",
    nomsLocaux: ["Bissap", "Hibiscus sabdariffa"],
    famille: "Malvacées",
    vertus:
      "Riche en antioxydants, le bissap aide le teint à rester net et lumineux. En compresse tiède, la fleur apaise et rafraîchit la peau fatiguée des joues.",
    usage:
      "Décoction refroidie de fleurs séchées, en compresse douce sur le visage — ou en boisson peu sucrée, avec modération.",
    precaution: "Bois-le avec mesure si ta tension est basse, et teste la compresse au pli du coude.",
    indicateurs: ["eclat_uniformite", "taches_pih"],
    sagesse: "Une carafe de bissap sur la table, une fleur dans l'eau du bain : toute la maison respire.",
    couleur: "#8B1A3B",
  },
  {
    id: "nere",
    nom: "Néré",
    nomsLocaux: ["Soumbala (dioula)", "Parkia biglobosa"],
    famille: "Mimosacées",
    vertus:
      "Le jus des gousses réconforte et reminéralise — la peau boit d'abord dans le verre. Les feuilles servent aussi, de génération en génération, à des compresses apaisantes.",
    usage: "Feuilles en décoction refroidie pour compresses douces ; pulpe des gousses en boisson.",
    precaution:
      "Les graines fermentées restent un condiment de cuisine, pas un soin — et rince bien les feuilles avant infusion.",
    indicateurs: ["hydratation", "eclat_uniformite"],
    sagesse: "Le néré nourrit deux fois : la table en saison sèche, et la peau de celles qui savent l'attendre.",
    couleur: "#6B7A3F",
  },
  {
    id: "neem",
    nom: "Neem",
    nomsLocaux: ["Margousier", "Azadirachta indica"],
    famille: "Méliacées",
    vertus:
      "Réputé depuis toujours pour assainir les peaux à boutons. En eau de rinçage, il purifie le cuir chevelu et apaise les démangeaisons.",
    usage:
      "Poignée de feuilles bouillies, eau refroidie et filtrée, en rinçage du visage ou du cuir chevelu — jamais de jus pur directement.",
    precaution:
      "Le neem est puissant : dilue toujours, évite le visage des enfants, et n'en fais pas un usage quotidien.",
    indicateurs: ["acne_active", "acne_dorsale", "folliculite"],
    sagesse: "Le neem soigne sans caresse — dilue-le, respecte-le, et il te rendra service.",
    couleur: "#3F6B35",
  },
  {
    id: "plantain",
    nom: "Plantain",
    nomsLocaux: ["Banane plantain", "Musa paradisiaca"],
    famille: "Musacées",
    vertus:
      "Ses grandes feuilles refroidissent les zones chauffées ou irritées. La pulpe du fruit mûr, écrasée, fait un masque doux et nourrissant.",
    usage:
      "Feuille bien nettoyée, passée un instant sur la flamme pour l'assouplir, posée lisse sur la zone — ou pulpe écrasée en masque.",
    precaution: "Lave bien la feuille avant de la poser, et ne l'utilise jamais sur une plaie ouverte.",
    indicateurs: ["rougeurs_inflammation", "irritation_eczema"],
    sagesse:
      "Quand la peau brûle de fatigue, pose-lui une feuille de plantain : elle connaît la chaleur, elle sait la calmer.",
    couleur: "#4F7A2E",
  },
];

/** Texte lu par le TTS « Écouter » d'une plante (< 1024 caractères). */
export function plantSpoken(p: HerbierPlant): string {
  return `${p.nom}. ${p.vertus} En usage : ${p.usage} Précaution : ${p.precaution} ${p.sagesse}`;
}
