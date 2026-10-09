// Kènè Cliente — Types de réponse du contrat API
import type { BodyZone } from "@/lib/kene/types";

export interface ApiUser {
  id: string;
  phone: string;
  name: string;
  role: string;
  city?: string | null;
  district?: string | null;
  birthDate?: string | null;
  pregnant?: boolean | null;
  preferredChannel?: string | null;
  beautyBudget?: string | null;
  skinType?: string | null;
  fitzpatrick?: string | null;
  allergies?: string | null;
  goals?: string | null; // JSON [{id,label}]
  consentHealth?: boolean;
  consentTs?: string | null;
  hasPin?: boolean;
}

export interface ApiDiagnosis {
  id: string;
  userId: string;
  zone: BodyZone;
  imageData: string; // "data:..." ou "file:/skin/..."
  resultJson: string;
  scoreGlobal: number;
  status: string;
  createdAt: string;
  // — diagnostics réalisés EN INSTITUT (fusionnés dans l'historique):
  // nom de l'entreprise + praticienne éventuelle. Absents sur les self-scans.
  institut?: string | null;
  practitioner?: string | null;
}

export interface ApiInstitute {
  id: string;
  name: string;
  city: string;
  country: string;
  rating: number;
  reviewCount: number;
  description?: string | null;
  openingHour: number;
  closingHour: number;
  image: string;
  // — numéro officiel (bouton WhatsApp) + vitrine réelle éventuelle
  phone?: string;
  ownerName?: string | null;
  ownerPhone?: string | null;
  hasPhoto?: boolean;
  address?: string | null;
  distanceKm?: number | null;
  coords?: { lat: number; lng: number };
  _count?: { services?: number; reviews?: number };
}

export interface ApiService {
  id: string;
  tenantId: string;
  name: string;
  category: string;
  durationMin: number;
  price: number;
  description?: string | null;
  botanicals?: string | null;
  hasPhoto?: boolean; // — visuel du soin (/api/media/service/:id)
}

export interface ApiResource {
  id: string;
  name: string;
  role: string;
  color: string;
}

export interface ApiReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  user?: { name: string } | null;
  serviceName?: string | null;
}

export interface ApiReviewSummary {
  averageRating: number;
  totalCount: number;
  breakdown: Record<number, number>;
  satisfactionRate: number;
}

export interface ApiSlot {
  time: string;
  available: boolean;
  resourceIds?: string[];
}

export interface ApiAppointment {
  id: string;
  tenantId: string;
  serviceId: string;
  resourceId: string;
  startAt: string;
  durationMin: number;
  status: string; // pending | confirmed | completed | cancelled | no_show
  price: number;
  depositAmount: number;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  tenant?: { id?: string; name: string; city: string; country: string } | null;
  service?: { name: string; durationMin: number; price: number } | null;
  resource?: { name: string } | null;
  review?: { id: string; rating: number; comment?: string | null; createdAt: string } | null;
}

export interface ApiProduct {
  id: string;
  name: string;
  brandLine: string;
  category: string;
  description: string;
  botanicals: string;
  price: number;
  compareAt?: number | null;
  stock: number;
  image: string;
  rating: number;
  reviewCount: number;
  // — marketplace: chaque produit est vendu par une entreprise partenaire (institut, cabinet, spa)
  tenantId?: string | null;
  tenant?: { id: string; name: string; city: string; type: string; hasPhoto?: boolean } | null;
  // — photo réelle du produit prise par l'institut (prime sur `image`)
  hasPhoto?: boolean;
}

/** Vendeur du marché: un institut ou établissement partenaire certifié.
 * Dérivé des produits réellement en stock (jamais de vendeur vide). */
export interface ApiSeller {
  key: string; // tenantId
  name: string;
  city: string | null;
  maison?: boolean;
  count: number;
  hasPhoto?: boolean; // — vitrine réelle de l'institut vendeur
}

export interface ApiOrder {
  id: string;
  subtotal: number;
  shippingFee?: number;
  deliveryCity?: string | null;
  deliveryArea?: string | null;
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  deliveryNotes?: string | null;
  discount?: number;
  couponCode?: string | null;
  cashback: number;
  total: number;
  status: string;
  createdAt: string;
  items?: { id: string; label: string; qty: number; unitPrice: number; total: number }[];
}


export interface ApiPayment {
  id: string;
  purpose: string;
  method: string;
  amount: number;
  status: string;
  ref: string;
  createdAt?: string;
 /** Jeton de confirmation des paiements mobile money en attente (wave/orange):
 * fourni par la création (orders / appointments), exigé par
 * POST /api/payments/confirm. Absent sur un paiement pending → la cliente
 * ne doit PAS tenter le confirm (contrat 63-b/63-c). */
  confirmToken?: string;
}

/* ── Compte entreprise (POST /api/auth/pro/register — contrat figé) ── */
export interface ApiProTenant {
  id: string;
  name: string;
  city: string;
  country: string;
  type: string; // institut | spa | dermo_conseil
  plan: string;
}

export interface ApiProRegisterResponse {
  ok: boolean;
  tenant: ApiProTenant;
  user: ApiUser; // objet User Prisma (mêmes champs qu'ApiUser)
}

/* ── Session (GET /api/auth/session?userId=) ──
 * Le contrat exact n'est pas figé côté front: la réponse peut être
 * { user, tenant? } ou l'utilisateur nu — readSession accepte les deux. */
interface ApiSessionShape {
  user?: unknown;
  tenant?: { id?: unknown; name?: unknown } | null;
  proTenantId?: unknown;
  id?: unknown;
  phone?: unknown;
  // — poste de l'employée connectée (null pour une gérante).
  employeeRole?: unknown;
}

export interface ApiSession {
  user: ApiUser | null;
  tenantId: string | null;
  tenantName: string | null;
  employeeRole: string | null;
}

/** Lecture tolérante d'une réponse /api/auth/session: normalise
 * { user, tenant? } comme l'utilisateur brut en ApiSession. */
export function readSession(payload: unknown): ApiSession {
  const o = (payload && typeof payload === "object" ? payload : {}) as ApiSessionShape;
  const raw = (o.user && typeof o.user === "object" ? o.user : o) as Partial<ApiUser> | null;
  const user = raw && typeof raw.id === "string" && typeof raw.phone === "string" ? (raw as ApiUser) : null;
  const tenant = o.tenant && typeof o.tenant === "object" ? o.tenant : null;
  const tenantId = typeof tenant?.id === "string" ? tenant.id : typeof o.proTenantId === "string" ? o.proTenantId : null;
  const tenantName = typeof tenant?.name === "string" ? tenant.name : null;
  const employeeRole = typeof o.employeeRole === "string" ? o.employeeRole : null;
  return { user, tenantId, tenantName, employeeRole };
}

export interface ApiWallet {
  id: string;
  userId: string;
  balance: number;
  cashbackRate: number;
  referralCode: string;
}

export interface ApiWalletTx {
  id: string;
  type: "credit" | "debit" | string;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind?: "text" | "photo" | "audio";
  photo?: string; // dataURL côté user (photo unique)
  photos?: string[]; // dataURLs multiples (envoi de plusieurs photos)
  audioUrl?: string; // URL ou dataURL de la note vocale pour réécoute
  audioDuration?: number; // durée en secondes
  transcription?: string; // texte transcrit mot à mot
  niveau?: "vert" | "jaune" | "rouge";
  time: number;
}

/* ── Rappels automatiques (GET /api/notifications) ── */
export interface ApiReminder {
  id: string;
  channel: string;
  message: string;
  status: string; // sent | scheduled
  scheduledAt: string | null;
  metaJson: string | null;
  readAt: string | null; // lecture cliente (status sent uniquement)
  createdAt: string;
}

export interface ApiReminderFeed {
  scheduled: ApiReminder[]; // à venir (encore pertinents)
  sent: ApiReminder[]; // historique 30 j
  created: number; // rappels matérialisés par le backfill
  unread: number; // envoyées non lues (badge cloche, fenêtre 30 j)
}

/** Parse sûr d'un resultJson de diagnostic */
export function parseDiagnosis(resultJson: string): import("@/lib/kene/types").DiagnosisResult | null {
  try {
    const r = JSON.parse(resultJson) as import("@/lib/kene/types").DiagnosisResult;
    if (typeof r.score_global !== "number" || !Array.isArray(r.indicateurs)) return null;
    // Assainissement des indicateurs: les anciens resultJson peuvent omettre
    // severite/pourcentage → NaN dans les index/clamps des consommateurs
    // (IndicatorBar, SkinTwin, Evolution, CRM). On normalise une fois ici.
    const indicateurs = r.indicateurs
      .filter((i) => !!i && typeof i.nom === "string")
      .map((i) => ({
        ...i,
        severite: Number.isFinite(i.severite) ? Math.min(3, Math.max(0, Math.trunc(i.severite))) : 0,
        pourcentage: Number.isFinite(i.pourcentage) ? Math.min(100, Math.max(0, Math.trunc(i.pourcentage))) : 0,
      }));
    return { ...r, indicateurs };
  } catch {
    return null;
  }
}

/** imageData "data:..." (upload), "file:/skin/x.webp" (seed) ou JSON stringifié ["data:..."] → src utilisable */
export function diagImgSrc(imageData: string): string {
  if (!imageData) return "";
  if (imageData.startsWith("[")) {
    try {
      const arr = JSON.parse(imageData);
      if (Array.isArray(arr) && arr[0]) return diagImgSrc(arr[0]);
    } catch {
      // ignore
    }
  }
  if (imageData.startsWith("data:")) return imageData;
  return imageData.replace(/^file:/, "");
}

/** Récupère la liste de tous les angles d'images d'un diagnostic */
export function diagImgSources(imageData: string): string[] {
  if (!imageData) return [];
  if (imageData.startsWith("[")) {
    try {
      const arr = JSON.parse(imageData);
      if (Array.isArray(arr)) return arr.map((item) => diagImgSrc(String(item))).filter(Boolean);
    } catch {
      // ignore
    }
  }
  const single = diagImgSrc(imageData);
  return single ? [single] : [];
}

export const SHOP_CATEGORIES = [
  { id: "", label: "Tout" },
  { id: "serum", label: "Sérums" },
  { id: "creme", label: "Crèmes & Baumes" },
  { id: "huile", label: "Huiles" },
  { id: "gommage", label: "Gommages" },
  { id: "masque", label: "Masques" },
  { id: "savon", label: "Savons" },
  { id: "solaire", label: "Solaires" },
  { id: "capillaire", label: "Capillaire" },
] as const;

export const SKIN_TYPES = [
  { id: "grasse", label: "Grasse" },
  { id: "seche", label: "Sèche" },
  { id: "mixte", label: "Mixte" },
  { id: "normale", label: "Normale" },
] as const;

export const SKIN_GOALS = [
  { id: "pih", label: "Taches PIH" },
  { id: "acne", label: "Acné" },
  { id: "eclat", label: "Éclat" },
  { id: "hydratation", label: "Hydratation" },
  { id: "anti_age", label: "Anti-âge" },
  { id: "cuir_chevelu", label: "Cuir chevelu" },
] as const;

export const FITZPATRICK_CARDS = [
  {
    id: "IV",
    label: "IV — Brun méditerranéen / métissé",
    desc: "Brunit facilement, hyperpigmentations fréquentes",
    gradient: "linear-gradient(135deg,#8D5524 0%,#6B4226 100%)",
  },
  {
    id: "V",
    label: "V — Brun foncé",
    desc: "Peau brune, PIH marquées, chéloïdes possibles",
    gradient: "linear-gradient(135deg,#5C3A21 0%,#43291A 100%)",
  },
  {
    id: "VI",
    label: "VI — Noir profond",
    desc: "Mélanine riche, sécheresse et ashy skin fréquentes",
    gradient: "linear-gradient(135deg,#3A2C1C 0%,#241A10 100%)",
  },
] as const;
