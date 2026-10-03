// Kènè — Test Suite: Taxonomie & Organisation des Soins et Produits
import {
  SERVICE_CATEGORIES,
  PRODUCT_CATEGORIES,
  getServiceCategoryMeta,
  getProductCategoryMeta,
  getCategoryToneBadgeClass,
} from "../src/lib/kene/catalog-taxonomy";
import { categoryThread } from "../src/components/kene/weave/threads";
import { SHOP_CATEGORIES } from "../src/components/kene/client/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

console.log("\n🧪 ─── Test 1 : Taxonomie des Soins (Services en Institut) ───");
assert(SERVICE_CATEGORIES.length >= 7, `Au moins 7 catégories de soins définies (${SERVICE_CATEGORIES.length})`);
const soinIds = SERVICE_CATEGORIES.map((c) => c.id);
assert(soinIds.includes("soin"), "Contient 'soin' (Visage)");
assert(soinIds.includes("massage"), "Contient 'massage' (Corps)");
assert(soinIds.includes("gommage"), "Contient 'gommage' (Exfoliations)");
assert(soinIds.includes("diagnostic"), "Contient 'diagnostic' (Bilans de peau)");
assert(soinIds.includes("capillaire"), "Contient 'capillaire' (Soins capillaires)");
assert(soinIds.includes("consultation"), "Contient 'consultation' (Dermo-conseil)");
assert(soinIds.includes("onglerie"), "Contient 'onglerie' (Mains & pieds)");

console.log("\n🧪 ─── Test 2 : Métadonnées et Fallbacks Soins ───");
const visageMeta = getServiceCategoryMeta("soin");
assert(visageMeta.label === "Soins Visage & Éclat", "Label visage correct");
assert(visageMeta.tone === "gold", "Tonalité or pour soin visage");

const customMeta = getServiceCategoryMeta("inconnu_xyz");
assert(customMeta.label === "Inconnu xyz", "Fallback capitalise le nom et remplace les underscores");
assert(customMeta.tone === "gold", "Fallback tone par défaut");

console.log("\n🧪 ─── Test 3 : Taxonomie des Produits (Herboristerie & Cosmétiques) ───");
assert(PRODUCT_CATEGORIES.length >= 8, `Au moins 8 catégories de produits définies (${PRODUCT_CATEGORIES.length})`);
const prodIds = PRODUCT_CATEGORIES.map((c) => c.id);
assert(prodIds.includes("serum"), "Contient 'serum'");
assert(prodIds.includes("creme"), "Contient 'creme'");
assert(prodIds.includes("huile"), "Contient 'huile'");
assert(prodIds.includes("gommage"), "Contient 'gommage'");
assert(prodIds.includes("masque"), "Contient 'masque'");
assert(prodIds.includes("savon"), "Contient 'savon'");
assert(prodIds.includes("solaire"), "Contient 'solaire'");
assert(prodIds.includes("capillaire"), "Contient 'capillaire'");

console.log("\n🧪 ─── Test 4 : Tonalités CSS Tailwind ───");
assert(getCategoryToneBadgeClass("gold").includes("text-gold"), "Badge or a la classe text-gold");
assert(getCategoryToneBadgeClass("terre").includes("text-terre"), "Badge terre a la classe text-terre");
assert(getCategoryToneBadgeClass("bissap").includes("border-bissap"), "Badge bissap a la bordure bissap");
assert(getCategoryToneBadgeClass("blue").includes("text-blue"), "Badge blue a la classe text-blue");

console.log("\n🧪 ─── Test 5 : Fil de Kente & Tissage Boutique ───");
assert(categoryThread("serum") === 1, "Sérum -> fil bissap (1)");
assert(categoryThread("creme") === 3, "Crème -> fil karité (3)");
assert(categoryThread("huile") === 0, "Huile -> fil or (0)");
assert(categoryThread("solaire") === 0, "Solaire -> fil or (0)");
assert(categoryThread("capillaire") === 2, "Capillaire -> fil baobab (2)");
assert(categoryThread("inconnu") === -1, "Inconnu -> aucun fil (-1)");

console.log("\n🧪 ─── Test 6 : Alignement SHOP_CATEGORIES Client ───");
const shopCatIds = SHOP_CATEGORIES.map((c) => c.id);
assert(shopCatIds.includes("solaire"), "ShopCategories inclut 'solaire'");
assert(shopCatIds.includes("capillaire"), "ShopCategories inclut 'capillaire'");

console.log("\n🧪 ─── Test 7 : Prise en charge des catégories personnalisées / libres ───");
const cryoMeta = getServiceCategoryMeta("cryothérapie");
assert(cryoMeta.label === "Cryothérapie", "Libellé personnalisé propre avec majuscule");
assert(cryoMeta.tone === "gold", "Tonalité par défaut pour soin personnalisé");

const brumeMeta = getProductCategoryMeta("brume-parfumee");
assert(brumeMeta.label === "Brume parfumee", "Remplacement des tirets par des espaces");
assert(brumeMeta.tone === "terre", "Tonalité terre par défaut pour produit personnalisé");

const caseInsensitiveMeta = getServiceCategoryMeta("MASSAGE");
assert(caseInsensitiveMeta.id === "massage", "Reconnaissance insensible à la casse d'une catégorie existante");

const emptyMeta = getServiceCategoryMeta("");
assert(emptyMeta.id === "autre", "Fallback pour chaîne vide");

console.log(`\n=============================================`);
console.log(`RÉSULTAT: ${passed} passés, ${failed} échoués`);
console.log(`=============================================\n`);

if (failed > 0) {
  process.exit(1);
}
