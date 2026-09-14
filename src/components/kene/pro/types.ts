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
  type: "appointment" | "order" | "sale";
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
  kpis: ProKpis;
  chart: { date: string; total: number }[];
  paymentSplit: { method: string; total: number }[];
  topServices: { name: string; count: number; total: number }[];
  todayAppointments: TodayAppointment[];
  stockAlerts: StockAlertItem[];
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
  skinType?: string | null;
  fitzpatrick?: string | null;
  notes?: string | null;
  visitsCount: number;
  totalSpent: number;
  lastVisit?: string | null;
  rfmSegment: string;
  createdAt: string;
  _count?: { sales: number };
}

export interface ProSaleItemView {
  label: string;
  qty: number;
  unitPrice: number;
  total: number;
  kind: string;
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
  product: { name: string };
}

export interface StockResponse {
  products: ProProduct[];
  movements: StockMovement[];
}

// ─────────────── Caisse / Ventes ───────────────
export interface ProSale {
  id: string;
  createdAt: string;
  subtotal?: number;
  discount?: number;
  total: number;
  tvaAmount?: number;
  paymentMethod: PaymentMethod;
  paymentRef?: string | null;
  cashierName?: string;
  clientProfile?: { name: string } | null;
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
