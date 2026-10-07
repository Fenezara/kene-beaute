// Kènè Pro — Catalogue & Clientes de secours hors-ligne
// Assure que la Caisse POS, le Catalogue, le CRM, le Stock et le Tableau de bord
// disposent TOUJOURS de données réelles sélectionnables à Abidjan & Dakar même sans connexion internet.

import type {
  ProCatalog,
  ProClient,
  ProOverview,
  EmployeesResponse,
  StockResponse,
} from "@/components/kene/pro/types";

export const DEFAULT_FALLBACK_TENANT_ID = "cmts1w5ui0008oww7hm3v18oo";

export const DEFAULT_FALLBACK_CATALOG: ProCatalog = {
  services: [
    {
      id: "srv_eclat_visage",
      name: "Soin Éclat Kènè (Visage)",
      category: "soin",
      durationMin: 45,
      price: 15000,
      commissionPct: 10,
      description: "Protocole éclat unifiant aux extraits de kinkeliba et fleur d'hibiscus.",
      active: true,
    },
    {
      id: "srv_nettoyage_profond",
      name: "Nettoyage Profond & Vapeur",
      category: "soin",
      durationMin: 60,
      price: 20000,
      commissionPct: 10,
      description: "Extraction douce des comédons, bain de vapeur et masque purifiant à l'argile.",
      active: true,
    },
    {
      id: "srv_massage_karite",
      name: "Massage Relaxant au Karité Tiède",
      category: "massage",
      durationMin: 60,
      price: 25000,
      commissionPct: 15,
      description: "Modelage corps complet relaxant au beurre de karité bio parfumé.",
      active: true,
    },
    {
      id: "srv_gommage_cafe",
      name: "Gommage Corps Café & Bissap",
      category: "gommage",
      durationMin: 40,
      price: 18000,
      commissionPct: 10,
      description: "Exfoliation tonifiante aux grains de café de Man et fleurs d'hibiscus.",
      active: true,
    },
    {
      id: "srv_soin_capillaire",
      name: "Bain d'Huiles Végétales & Coiffage",
      category: "capillaire",
      durationMin: 50,
      price: 12000,
      commissionPct: 10,
      description: "Soin nourrissant profond pour cheveux texturés, afro et crépus.",
      active: true,
    },
    {
      id: "srv_manucure",
      name: "Manucure & Pose Vernis",
      category: "onglerie",
      durationMin: 35,
      price: 8000,
      commissionPct: 10,
      description: "Soin des ongles et cuticules avec pose de vernis soigné.",
      active: true,
    },
  ],
  products: [
    {
      id: "prd_karite_pur",
      name: "Beurre de Karité Brut Bio (200g)",
      category: "corps",
      description: "Karité artisanal de Côte d'Ivoire, ultra-nourrissant pour peau et pointes.",
      botanicals: "Butyrospermum Parkii",
      price: 5000,
      stock: 25,
      stockAlert: 5,
      image: "/products/karite.jpg",
      active: true,
    },
    {
      id: "prd_savon_noir",
      name: "Savon Noir Authentique au Miel",
      category: "nettoyant",
      description: "Savon doux gommant traditionnel, purifie sans tirailler la barrière cutanée.",
      botanicals: "Cendre de cabosse de cacao, huile de coco, miel",
      price: 3500,
      stock: 40,
      stockAlert: 8,
      image: "/products/savon.jpg",
      active: true,
    },
    {
      id: "prd_serum_eclat",
      name: "Sérum Botanique Éclat & Anti-taches",
      category: "serum",
      description: "Concentré d'actifs dermo-botaniques ciblant l'hyperpigmentation post-inflammatoire.",
      botanicals: "Kinkeliba, Hibiscus, Niacinamide",
      price: 18500,
      stock: 15,
      stockAlert: 3,
      image: "/products/serum.jpg",
      active: true,
    },
    {
      id: "prd_huile_baobab",
      name: "Huile Végétale de Baobab Vierge (100ml)",
      category: "huile",
      description: "Huile précieuse régénérante et protectrice, riche en antioxydants.",
      botanicals: "Adansonia Digitata Seed Oil",
      price: 9000,
      stock: 18,
      stockAlert: 4,
      image: "/products/huile.jpg",
      active: true,
    },
  ],
};

export const DEFAULT_FALLBACK_CLIENTS: ProClient[] = [
  {
    id: "cli_comptoir_express",
    name: "Passage Comptoir (Sans RDV)",
    phone: "+22500000000",
    district: "Plateau",
    visitsCount: 1,
    totalSpent: 0,
    rfmSegment: "Nouveaux",
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_FALLBACK_OVERVIEW: ProOverview = {
  tenant: {
    id: DEFAULT_FALLBACK_TENANT_ID,
    name: "Cabinet LA DERMO",
    city: "Abidjan",
    country: "CI",
    plan: "business",
  },
  tenants: [
    {
      id: DEFAULT_FALLBACK_TENANT_ID,
      name: "Cabinet LA DERMO",
      city: "Abidjan",
      country: "CI",
      plan: "business",
    },
  ],
  kpis: {
    caToday: 0,
    ca7d: 0,
    ca30d: 0,
    avgBasket: 0,
    appointmentsToday: 0,
    newClients30d: 0,
    occupancyPct: 0,
  },
  todayAppointments: [],
  recentReviews: [],
  stockAlerts: [],
  chart: [],
  paymentSplit: [],
  topServices: [],
};

export const DEFAULT_FALLBACK_STOCK: StockResponse = {
  products: DEFAULT_FALLBACK_CATALOG.products,
  movements: [],
};

export const DEFAULT_FALLBACK_TEAM: EmployeesResponse = {
  employees: [
    {
      id: "emp_fondatrice",
      name: "Déborah",
      role: "manager",
      accountPhone: "+2250504195071",
      active: true,
      country: "CI",
      baseSalary: 250000,
      transport: 30000,
      contractType: "CDI",
      hireDate: "2024-01-01",
    },
    {
      id: "emp_estheticienne",
      name: "Aminata",
      role: "estheticienne",
      accountPhone: "+2250700000001",
      active: true,
      country: "CI",
      baseSalary: 150000,
      transport: 25000,
      contractType: "CDI",
      hireDate: "2024-01-01",
    },
  ],
  attendanceToday: [],
};
