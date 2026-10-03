// Kènè Pro — Types des réponses API (contrat /api/pro/* & /api/admin/stats)
import type { PayrollLine } from "@/lib/payroll";

export type { PayrollLine };

// ─────────────── Common ───────────────
export interface ProTenant {
  id: string;
  name: string;
  city: string;
  country: string; // CI | SN
  plan: string;
  rating?: number;
  reviewCount?: number;
  openingHour?: number;
  closingHour?: number;
  phone?: string;
  [k: string]: unknown;
}

export type PaymentMethod = "wave" | "orange" | "cash" | "card";

// ─────────────── Flux temps réel institut (/api/pro/live) ───────────────
export interface ProLiveEvent {
  type: "appointment" | "order" | "sale" | "review";
  id: string;
  at: string;
  label: string;
  status?: string; // RDV: pending = réservé côté cliente (à confirmer)
}

export interface ProLive {
  tenantId: string;
  pendingAppts: number; // RDV à confirmer → badge Agenda
  apptsToday: number;
  salesToday: number; // CA POS du jour (KPI live)
  ordersToday: number; // commandes boutique contenant un produit de l'institut
  last: ProLiveEvent | null;
}

// ─────────────── Overview ───────────────
export interface ProKpis {
  caToday: number;
  ca7d: number;
  ca30d: number;
  avgBasket: number;
  appointmentsToday: number;
  newClients30d: number;
  occupancyPct: number;
}

export interface TodayAppointment {
  id: string;
  clientName: string;
  serviceName: string;
  resourceName: string;
  startAt: string;
  status: string;
  price: number;
}

export interface StockAlertItem {
  id: string;
  name: string;
  stock: number;
  stockAlert: number;
}

export interface ProOverview {
  tenant: ProTenant;
  tenants?: ProTenant[];
  kpis: ProKpis;
  chart: { date: string; total: number }[];
  paymentSplit: { method: string; total: number }[];
  topServices: { name: string; count: number; total: number }[];
  todayAppointments: TodayAppointment[];
  stockAlerts: StockAlertItem[];
  recentReviews?: ProReviewView[];
}

// ─────────────── Agenda ───────────────
export interface ProResource {
  id?: string;
  name: string;
  color: string;
}

export interface ProAppointment {
  id: string;
  startAt: string;
  durationMin: number;
  status: string; // pending | confirmed | completed | cancelled | no_show
  price: number;
  notes?: string | null;
  clientName: string;
  clientPhone: string;
  clientProfileId?: string | null;
  resourceId?: string; // id réel de la praticienne (présent au niveau RDV)
  service: { id?: string; name: string; durationMin: number; price: number; color?: string };
  resource: ProResource;
  clientProfile?: { name: string } | null;
}

// ─────────────── CRM ───────────────
export interface ProClient {
  id: string;
  userId?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  district?: string | null;
  birthDate?: string | null;
  pregnant?: boolean | null;
  preferredChannel?: string | null;
  beautyBudget?: string | null;
  skinType?: string | null;
  fitzpatrick?: string | null;
  notes?: string | null;
  cosmeticsUsed?: string | null;
  productObservations?: string | null;
  visitsCount: number;
  totalSpent: number;
  lastVisit?: string | null;
  rfmSegment: string;
  createdAt: string;
  _count?: { sales: number };
}

export interface ProSaleItemView {
  id?: string;
  saleId?: string;
  label: string;
  qty: number;
  unitPrice: number;
  total: number;
  kind: string;
  productId?: string | null;
  productBotanicals?: string | null;
  productCategory?: string | null;
  customPriceReason?: string | null;
  createdAt?: string;
}

export interface ProClientDetail {
  client: ProClient;
  sales: {
    id: string;
    createdAt: string;
    total: number;
    paymentMethod: string;
    items: ProSaleItemView[];
  }[];
  appointments: ProAppointment[];
  diagnoses: {
    id: string;
    zone: string;
    scoreGlobal: number;
    createdAt: string;
    imageData: string;
    resultJson: string;
  }[];
  proDiagnoses: ProDiagnosisItem[];
  orders: ProOrderView[];
  reviews: ProReviewView[];
  /** la cliente a-t-elle partagé ses self-scans avec CET institut ? */
  scansShared: boolean;
}

// ─────────────── Commandes boutique (/api/pro/orders) ───────────────

export interface ProOrderItemView {
  label: string;
  qty: number;
  unitPrice: number;
  total: number;
  mine: boolean; // article de CET institut (commande mixte possible)
}

export interface ProOrderView {
  id: string;
  createdAt: string;
  status: string; // pending | paid | delivered | cancelled
  clientName: string;
  clientPhone: string;
  deliveryCity?: string;
  deliveryAddress?: string;
  items: ProOrderItemView[];
  total: number;
  discount: number;
  couponCode?: string | null;
  ownTotal: number; // CA de cet institut dans la commande
  payment: { method: string; status: string; ref: string } | null;
}

export interface ProOrdersKpis {
  today: number;
  toPay: number;
  toDeliver: number;
  revenue30d: number;
}

export interface ProOrdersResponse {
  orders: ProOrderView[];
  kpis: ProOrdersKpis;
}

// ─────────────── Avis clientes ───────────────

export interface ProReviewView {
  id: string;
  clientName?: string; // absent dans la fiche 360° (le nom est déjà dans l'en-tête)
  clientPhone?: string | null;
  rating: number;
  comment?: string | null;
  serviceName?: string | null;
  practitionerName?: string | null;
  appointmentDate?: string | null;
  createdAt: string;
  /** fiche 360°: le RDV d'où vient l'avis (soin concerné) */
  appointment?: { service?: { name?: string | null } | null } | null;
}

export interface ProReviewSummary {
  averageRating: number;
  totalCount: number;
  breakdown: Record<number, number>;
  satisfactionRate: number;
}

export interface ProReviewsResponse {
  summary: ProReviewSummary;
  reviews: ProReviewView[];
}

// ─────────────── Diagnostic en institut (questionnaire ± photo) ───────────────

export interface ProDiagnosisItem {
  id: string;
  zone: string;
  practitioner?: string | null;
  scoreGlobal: number;
  vlmUsed: boolean;
  photoUsed: boolean;
  createdAt: string;
  clientProfileId: string;
  clientName: string;
  resultJson: string;
  questionnaireJson?: string;
  photoData?: string | null;
  userId?: string | null;
  [k: string]: unknown;
}

export interface ProDiagnosesKpis {
  monthCount: number;
  avgScore: number;
  photoShare: number;
  total: number;
}

export interface ProDiagnosesResponse {
  diagnoses: ProDiagnosisItem[];
  kpis: ProDiagnosesKpis;
}

// ─────────────── Catalogue ───────────────
export interface ProService {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  price: number;
  commissionPct: number;
  description?: string | null;
  botanicals?: string | null;
  hasPhoto?: boolean; // — visuel du soin (/api/media/service/:id)
  active: boolean;
}

export interface ProProduct {
  id: string;
  name: string;
  brandLine?: string;
  category: string;
  description: string;
  botanicals: string;
  price: number;
  compareAt?: number | null;
  stock: number;
  stockAlert: number;
  image: string;
  hasPhoto?: boolean; // — photo réelle (/api/media/product/:id, prime sur image)
  active: boolean;
}

export interface ProCatalog {
  services: ProService[];
  products: ProProduct[];
}

// ─────────────── Stock ───────────────
export interface StockMovement {
  id: string;
  type: string; // in | out | loss | adjust
  qty: number;
  reason: string;
  createdAt: string;
  product: { name: string; category?: string; image?: string };
}

export interface StockResponse {
  products: ProProduct[];
  movements: StockMovement[];
}

// ─────────────── Caisse / Ventes ───────────────
export interface ProSale {
  id: string;
  tenantId?: string;
  createdAt: string;
  subtotal?: number;
  discount?: number;
  total: number;
  tvaAmount?: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string | null;
  cashierName?: string;
  practitionerName?: string | null;
  appointmentId?: string | null;
  depositDeducted?: number;
  clientProfile?: { name: string; phone?: string } | null;
  items?: ProSaleItemView[];
}

export interface SalesResponse {
  sales: ProSale[];
}

// ─────────────── Paie ───────────────
export interface ProEmployee {
  id: string;
  name: string;
  role: string; // estheticienne | dermo_conseillere | caissiere | manager
  contractType: string; // CDI | CDD | Stage
  country: string; // CI | SN
  baseSalary: number;
  transport: number;
  housing?: number;
  cadres?: boolean;
  cnpsNumber?: string | null;
  bankAccount?: string | null;
  active: boolean;
  hireDate: string;
  endDate?: string | null;
  accountPhone?: string | null;
}

export interface AttendanceRow {
  employeeId: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string; // present | late | absent | leave
  hours: number;
}

export interface EmployeesResponse {
  employees: ProEmployee[];
  attendanceToday: AttendanceRow[];
}

// ─────────────── Congés ───────────────
export interface ProLeave {
  id: string;
  employeeId: string;
  employeeName: string;
  type: string; // conge | maladie | maternite
  startDate: string;
  endDate: string;
  days: number;
  status: string; // pending | approved | rejected
  reason?: string | null;
  note?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  current?: boolean; // en cours aujourd'hui
}

export interface LeaveBalance {
  employeeId: string;
  earned: number;
  taken: number;
  balance: number;
}

export interface LeavesResponse {
  leaves: ProLeave[];
  balances: LeaveBalance[];
}

export interface ProPayslip {
  id: string;
  employee: { name: string; role: string; cnpsNumber?: string | null };
  baseSalary: number;
  grossSalary: number;
  cnpsEmployee: number;
  cnpsEmployer: number;
  incomeTax: number;
  cn: number;
  netSalary: number;
  detailsJson: string;
}

export interface ProPayPeriod {
  id: string;
  period: string; // "2025-06"
  country: string;
  status: string; // open | validated
  totalsJson?: string | null;
  payslips: ProPayslip[];
}

export interface PayrollResponse {
  payPeriods: ProPayPeriod[];
}

/** Détail décodé de detailsJson d'un bulletin */
export interface PayslipDetails {
  lines: PayrollLine[];
  regime?: string;
  [k: string]: unknown;
}

// ─────────────── Compta SYSCOHADA ───────────────
export interface ProAccount {
  id: string;
  code: string;
  classe: number;
  label: string;
  type: string; // actif | passif | charge | produit
  system: boolean;
}

export interface ProJournalLine {
  account: { code: string; label: string };
  debit: number;
  credit: number;
  label?: string | null;
}

export interface ProJournalEntry {
  id: string;
  journalCode: string; // CA | BQ | PA | OD | VE
  date: string;
  reference: string;
  description: string;
  lines: ProJournalLine[];
}

export interface ProBalanceRow {
  accountCode: string;
  accountLabel: string;
  classe: number;
  type: string;
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

export interface ProStatements {
  produits: number;
  charges: number;
  resultat: number;
  tvaCollected: number;
  tvaDeductible: number;
  tvaAPayer: number;
  actif: { label: string; amount: number }[];
  passif: { label: string; amount: number }[];
  totalActif: number;
  totalPassif: number;
}

export interface AccountingResponse {
  tenant: ProTenant;
  accounts: ProAccount[];
  entries: ProJournalEntry[];
  balance: ProBalanceRow[];
  statements: ProStatements;
}

// ─────────────── Coupons / promos boutique ───────────────

export interface ProCoupon {
  id: string;
  tenantId: string | null;
  code: string;
  label: string | null;
  kind: "percent" | "fixed";
  value: number;
  minOrder: number;
  maxUses: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string | null;
  active: boolean;
  status: string; // actif | programmé | expiré | épuisé | inactif
  redemptions: number;
  createdAt: string;
}

export interface ProCoupons {
  coupons: ProCoupon[];
}

// ─────────────── Admin ───────────────
export interface AdminStats {
  users: number;
  tenants: number;
  diagnoses: number;
  orders: number;
  gmvBoutique: number;
  commissionTotal: number;
  referrals: number;
  chart: { date: string; count: number }[];
  topTenants: { name: string; city: string; country?: string; ca30: number }[];
  // t. 135 — monétisation (fallbacks 0: le cache mémoire 60 s peut servir
  // un snapshot calculé avant ce chantier).
  activeSubs: number;
  subsMrrFcfa: number;
}

// ─────────────── Admin — visionneuse Sécurité ───────────────
// GET /api/admin/security: journal d'audit (80 plus récents, ts desc) +
// compteurs. `phone` est déjà masqué côté serveur (ex. « +225 07•••••04 »).
export interface AdminSecurityEvent {
  id: string;
  ts: string; // ISO
  kind: string; // otp_request | login_success | login_failed | login_locked | logout | pro_register | payment_confirm | admin_access | push_subscribe | upload_reject
  phone?: string | null;
  ip?: string | null;
  detail?: string | null;
}

export interface AdminSecurityStats {
  total: number;
  last24h: number;
  failedLogins24h: number;
  locked24h: number;
}

export interface AdminSecurity {
  events: AdminSecurityEvent[];
  stats: AdminSecurityStats;
}

// ─────────────── Admin — console de gestion (t. 128) ───────────────

// GET /api/admin/tenants — ligne de la liste des instituts.
export interface AdminTenantRow {
  id: string;
  name: string;
  city: string;
  country: string;
  phone: string;
  ownerName: string;
  ownerPhone: string;
  plan: string; // trial | pro | business
  commissionRate: number; // 0..0.30
  rating: number;
  reviewCount: number;
  active: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  caBoutique30: number;
  caPos30: number;
  orders30: number;
  pendingOrders: number;
  clientsCrm: number;
  employees: number;
  products: number;
  isDemo?: boolean;
}

// GET /api/admin/tenants/[id] — fiche de gestion détaillée.
export interface AdminTenantDetail extends AdminTenantRow {
  type: string;
  address: string | null;
  description: string | null;
  openingHour: number;
  closingHour: number;
  proDiag30: number;
  upcomingAppointments: number;
  team: { name: string; role: string }[];
  topProducts: { name: string; qty: number; ca: number }[];
  lastSales: { id: string; total: number; clientName: string | null; createdAt: string }[];
  lastOrders: { id: string; status: string; total: number; clientName: string; createdAt: string }[];
}

// PATCH /api/admin/tenants/[id] — réponse (aussi utilisée pour le POST optimiste).
export interface AdminTenantPatchResult {
  ok: boolean;
  changed: boolean;
  message?: string;
  tenant?: {
    id: string;
    name: string;
    active: boolean;
    commissionRate: number;
    plan: string;
    suspendedAt: string | null;
    suspendedReason: string | null;
  };
}

// GET /api/admin/users — ligne de l'annuaire des comptes.
export interface AdminUserRow {
  id: string;
  name: string;
  phone: string;
  role: string; // client | pro | admin
  city: string | null;
  createdAt: string;
  lockedAt: string | null;
  lockedReason: string | null;
  orders: number;
  diagnoses: number;
  tenantName: string | null; // institut des comptes pro
  isDemo?: boolean;
}

// PATCH /api/admin/users/[id] — réponse (verrouillage t. 128, accès Console t. 141).
export interface AdminUserPatchResult {
  ok: boolean;
  user?: {
    id: string;
    name: string;
    role?: string; // présent après promote/demote (t. 141)
    lockedAt: string | null;
    lockedReason: string | null;
  };
}

// ─────────────── Admin — abonnements Kènè+ / Pro (t. 135) ───────────────

// GET /api/admin/subscriptions — ligne de la liste des abonnements.
// `derived` est calculé serveur (jamais stocké — IFRS 15: la ligne d'origine
// reste intacte): active | expiring (≤ 7 j) | expired | cancelled.
export interface AdminSubRow {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userRole: string;
  plan: string; // kene_plus | pro_essentiel | pro_complexe
  planLabel: string;
  status: string; // active | cancelled (état brut de la ligne)
  derived: "active" | "expiring" | "expired" | "cancelled";
  priceFcfa: number; // 0 = offert (Console ou parrainage)
  source: string; // momo_sim | console_gift | referral_gift
  startedAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface AdminSubsKpis {
  activeCount: number;
  mrrFcfa: number;
  expiringSoon: number;
  giftActive: number;
}

// GET /api/admin/subscriptions — payload complet.
export interface AdminSubsPayload {
  kpis: AdminSubsKpis;
  byPlan: { plan: string; label: string; count: number; mrr: number }[];
  subs: AdminSubRow[];
}

// PATCH /api/admin/subscriptions/[id] — réponse.
export interface AdminSubPatchResult {
  ok: boolean;
  changed: boolean;
  message?: string;
  subscription?: { id: string; status: string; expiresAt: string };
}
