// Kènè Pro — Référentiel RH : Postes, Contrats et Rôles métiers
// Prédéfinis et extensibles (postes personnalisés et types de contrats sur-mesure)

export interface HrRoleOption {
  value: string;
  label: string;
  hint: string;
}

export const PREDEFINED_ROLES: HrRoleOption[] = [
  { value: "estheticienne", label: "Esthéticienne", hint: "Agenda et Diagnostics en cabine" },
  { value: "dermo_conseillere", label: "Dermo-conseillère", hint: "Agenda, Diagnostics, CRM et Relances" },
  { value: "coiffeuse", label: "Coiffeuse / Coloriste", hint: "Agenda, Diagnostics capillaires et Soins" },
  { value: "prothesiste_ongulaire", label: "Prothésiste ongulaire", hint: "Agenda, Prestations ongles & soins des mains" },
  { value: "masseuse", label: "Masseuse / Praticienne Spa", hint: "Agenda, Soins corps et massages relaxants" },
  { value: "caissiere", label: "Caissière", hint: "Caisse POS, Catalogue, Ventes et Encaissements" },
  { value: "receptionniste", label: "Réceptionniste / Accueil", hint: "Accueil clientes, Agenda, CRM et Caisse" },
  { value: "responsable_stock", label: "Responsable Stock", hint: "Gestion des produits, entrées/sorties et alertes" },
  { value: "manager", label: "Manager", hint: "Toute la gestion opérationnelle du salon" },
  { value: "apprentie", label: "Apprentie / Stagiaire", hint: "Assistance cabine, apprentissage et accueil" },
];

export const ROLE_LABELS: Record<string, string> = {
  estheticienne: "Esthéticienne",
  dermo_conseillere: "Dermo-conseillère",
  coiffeuse: "Coiffeuse / Coloriste",
  prothesiste_ongulaire: "Prothésiste ongulaire",
  masseuse: "Masseuse / Spa",
  caissiere: "Caissière",
  receptionniste: "Réceptionniste / Accueil",
  responsable_stock: "Responsable Stock",
  manager: "Manager",
  apprentie: "Apprentie",
};

export interface HrContractOption {
  value: string;
  label: string;
  desc: string;
}

export const PREDEFINED_CONTRACTS: HrContractOption[] = [
  { value: "CDI", label: "CDI", desc: "Contrat à Durée Indéterminée (permanent)" },
  { value: "CDD", label: "CDD", desc: "Contrat à Durée Déterminée (terme fixé)" },
  { value: "Stage", label: "Stage", desc: "Stage d'école ou d'immersion professionnelle" },
  { value: "Prestation", label: "Prestation / Freelance", desc: "Rémunération à la prestation ou commission" },
  { value: "Apprentissage", label: "Apprentissage", desc: "Formation pratique et certificat métier" },
  { value: "Extra", label: "Extra / Journalier", desc: "Renfort ponctuel à la journée ou vacation" },
  { value: "Essai", label: "Période d'essai", desc: "Phase probatoire avant titularisation" },
];

export const CONTRACT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  Stage: "Stage",
  Prestation: "Prestation / Freelance",
  Apprentissage: "Apprentissage",
  Extra: "Extra / Journalier",
  Essai: "Période d'essai",
};

/** Formate l'intitulé d'un poste (standard ou personnalisé) */
export function formatRole(role: string | null | undefined): string {
  if (!role) return "Collaboratrice";
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  if (role.startsWith("custom:")) return role.replace(/^custom:/, "");
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/** Formate l'intitulé d'un contrat (standard ou personnalisé) */
export function formatContract(contract: string | null | undefined): string {
  if (!contract) return "CDI";
  if (CONTRACT_LABELS[contract]) return CONTRACT_LABELS[contract];
  if (contract.startsWith("custom:")) return contract.replace(/^custom:/, "");
  return contract;
}

export interface ModulableModule {
  id: string;
  label: string;
  shortLabel: string;
  category: "clinique" | "commerce" | "relation" | "pilotage" | "gestion";
  categoryLabel: string;
  emoji: string;
  description: string;
}

export const MODULABLE_MODULES: ModulableModule[] = [
  // Cabine & Soins
  {
    id: "diagnostic",
    label: "Diagnostic Peau & IA",
    shortLabel: "Diagnostic",
    category: "clinique",
    categoryLabel: "Cabine & Clinique Dermo",
    emoji: "📸",
    description: "Scan facial, biomarqueurs cutanés et ordonnance de soins.",
  },
  {
    id: "dossiers_peau",
    label: "Dossiers Cutanés",
    shortLabel: "Dossiers",
    category: "clinique",
    categoryLabel: "Cabine & Clinique Dermo",
    emoji: "🔬",
    description: "Historique d'évolution, photos HD et suivi cabine.",
  },
  {
    id: "agenda",
    label: "Agenda & Soins",
    shortLabel: "Agenda",
    category: "clinique",
    categoryLabel: "Cabine & Clinique Dermo",
    emoji: "📅",
    description: "Planning des cabines, réservations et rendez-vous du jour.",
  },
  // Caisse, Stock & Commerce
  {
    id: "caisse",
    label: "Ventes & Caisse POS",
    shortLabel: "Caisse",
    category: "commerce",
    categoryLabel: "Caisse, Stock & Offre",
    emoji: "💳",
    description: "Encaissement en espèces, Wave, Orange Money et reçus.",
  },
  {
    id: "stock",
    label: "Inventaire du Stock",
    shortLabel: "Stock",
    category: "commerce",
    categoryLabel: "Caisse, Stock & Offre",
    emoji: "📦",
    description: "Stock cabine & revente, alertes de rupture, réassort et entrées/sorties.",
  },
  {
    id: "catalogue",
    label: "Catalogue des Soins",
    shortLabel: "Catalogue Soins",
    category: "commerce",
    categoryLabel: "Caisse, Stock & Offre",
    emoji: "🛍️",
    description: "Cartes des prestations, tarifs et soins praticables en institut.",
  },
  // Relation & IA
  {
    id: "crm",
    label: "CRM Clientes & Fidélité",
    shortLabel: "CRM Clientes",
    category: "relation",
    categoryLabel: "Relation & Fidélité",
    emoji: "👥",
    description: "Coordonnées des clientes, historique d'achats et notes de cabine.",
  },
  {
    id: "relances",
    label: "Relances Automatiques",
    shortLabel: "Relances",
    category: "relation",
    categoryLabel: "Relation & Fidélité",
    emoji: "🔔",
    description: "Suivi post-soin et rappels WhatsApp ciblés.",
  },
  {
    id: "assistant",
    label: "Secrétaire IA (Maman)",
    shortLabel: "Secrétaire IA",
    category: "relation",
    categoryLabel: "Relation & Fidélité",
    emoji: "👑",
    description: "Rappels WhatsApp 24/7 et débriefing vocal intelligent.",
  },
  // Pilotage & RH
  {
    id: "dashboard",
    label: "Tableau de Bord & KPIs",
    shortLabel: "Dashboard",
    category: "pilotage",
    categoryLabel: "Pilotage & Activité",
    emoji: "📊",
    description: "Chiffre d'affaires en temps réel, fréquentation et analyses.",
  },
  {
    id: "equipe",
    label: "Équipe & Pointage",
    shortLabel: "Pointage Équipe",
    category: "gestion",
    categoryLabel: "Gestion Opérationnelle",
    emoji: "⏰",
    description: "Pointage des arrivées/départs et planning du personnel.",
  },
];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  estheticienne: ["dossiers_peau", "diagnostic", "agenda", "assistant"],
  dermo_conseillere: ["dossiers_peau", "diagnostic", "crm", "agenda", "relances", "assistant"],
  coiffeuse: ["agenda", "diagnostic", "assistant"],
  prothesiste_ongulaire: ["agenda", "diagnostic", "assistant"],
  masseuse: ["agenda", "diagnostic", "assistant"],
  caissiere: ["caisse", "catalogue", "stock", "assistant"],
  receptionniste: ["agenda", "caisse", "crm", "relances", "assistant"],
  responsable_stock: ["stock", "catalogue", "assistant"],
  manager: ["dashboard", "dossiers_peau", "diagnostic", "assistant", "agenda", "caisse", "crm", "relances", "equipe", "catalogue", "stock"],
  apprentie: ["dossiers_peau", "diagnostic", "agenda", "assistant"],
};

export function getDefaultPermissionsForRole(role: string): string[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? ["agenda", "diagnostic", "assistant"];
}

// ─── Horaires de travail & Plannings individuels des employés ───────────────

export interface EmployeeSchedule {
  /** Heure de début au format "HH:MM" (ex: "08:00", "13:00"). null = suit l'heure d'ouverture de l'entreprise */
  workStart: string | null;
  /** Heure de fin au format "HH:MM" (ex: "15:00", "20:00"). null = suit l'heure de fermeture de l'entreprise */
  workEnd: string | null;
  /** Jours travaillés (1=Lundi ... 7=Dimanche). null = tous les jours d'ouverture (Lun-Sam par défaut) */
  workDays: number[] | null;
}

export interface ShiftPresetOption {
  id: string;
  label: string;
  shortLabel: string;
  desc: string;
  workStart: string | null;
  workEnd: string | null;
  workDays: number[] | null;
}

export const SHIFT_PRESETS: ShiftPresetOption[] = [
  {
    id: "company_default",
    label: "Horaires de l'entreprise (Standard)",
    shortLabel: "Horaires entreprise",
    desc: "Suit automatiquement l'ouverture et la fermeture de l'institut",
    workStart: null,
    workEnd: null,
    workDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: "morning",
    label: "Équipe Matin (08h00 – 15h00)",
    shortLabel: "Matin (08h–15h)",
    desc: "Ouverture matinale et première moitié de journée",
    workStart: "08:00",
    workEnd: "15:00",
    workDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: "afternoon",
    label: "Équipe Après-midi / Soir (13h00 – 20h00)",
    shortLabel: "Après-midi (13h–20h)",
    desc: "Relais d'après-midi, sortie de bureau et fermeture",
    workStart: "13:00",
    workEnd: "20:00",
    workDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: "day_standard",
    label: "Journée Classique (09h00 – 18h00)",
    shortLabel: "Journée (09h–18h)",
    desc: "Journée continue standard du lundi au samedi",
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5, 6],
  },
  {
    id: "late_shift",
    label: "Nocturne / Soirée (14h00 – 22h00)",
    shortLabel: "Soirée (14h–22h)",
    desc: "Créneaux tardifs et nocturnes",
    workStart: "14:00",
    workEnd: "22:00",
    workDays: [2, 3, 4, 5, 6],
  },
  {
    id: "weekend_parttime",
    label: "Temps Partiel / Renfort Fin de Semaine (Jeu–Sam)",
    shortLabel: "Temps partiel (Jeu–Sam)",
    desc: "Présence ciblée sur les jours de forte affluence",
    workStart: "09:30",
    workEnd: "19:30",
    workDays: [4, 5, 6],
  },
];

export const WEEKDAYS_SHORT: { day: number; short: string; label: string }[] = [
  { day: 1, short: "Lun", label: "Lundi" },
  { day: 2, short: "Mar", label: "Mardi" },
  { day: 3, short: "Mer", label: "Mercredi" },
  { day: 4, short: "Jeu", label: "Jeudi" },
  { day: 5, short: "Ven", label: "Vendredi" },
  { day: 6, short: "Sam", label: "Samedi" },
  { day: 7, short: "Dim", label: "Dimanche" },
];

const SCHED_START_PREFIX = "__sched_start:";
const SCHED_END_PREFIX = "__sched_end:";
const SCHED_DAYS_PREFIX = "__sched_days:";

export function isValidTimeHHMM(val?: string | null): val is string {
  if (!val || typeof val !== "string") return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(val.trim());
}

export function timeHHMMToMinutes(val?: string | null, fallbackHour = 9): number {
  if (!isValidTimeHHMM(val)) return fallbackHour * 60;
  const [h, m] = val.trim().split(":").map(Number);
  return h * 60 + m;
}

export function hourIntToHHMM(hour?: number | null, fallback = 9): string {
  const h = typeof hour === "number" && Number.isFinite(hour) ? Math.max(0, Math.min(23, Math.floor(hour))) : fallback;
  return `${String(h).padStart(2, "0")}:00`;
}

/**
 * Extrait les horaires personnalisés (`workStart`, `workEnd`, `workDays`)
 * encodés dans le JSON `permissions` d'un employé.
 */
export function parseEmployeeScheduleFromRaw(raw?: string | null): EmployeeSchedule {
  if (!raw) return { workStart: null, workEnd: null, workDays: null };
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return { workStart: null, workEnd: null, workDays: null };
    let workStart: string | null = null;
    let workEnd: string | null = null;
    let workDays: number[] | null = null;
    for (const item of arr) {
      if (typeof item !== "string") continue;
      if (item.startsWith(SCHED_START_PREFIX)) {
        const candidate = item.slice(SCHED_START_PREFIX.length).trim();
        if (isValidTimeHHMM(candidate)) workStart = candidate;
      } else if (item.startsWith(SCHED_END_PREFIX)) {
        const candidate = item.slice(SCHED_END_PREFIX.length).trim();
        if (isValidTimeHHMM(candidate)) workEnd = candidate;
      } else if (item.startsWith(SCHED_DAYS_PREFIX)) {
        const rawDays = item
          .slice(SCHED_DAYS_PREFIX.length)
          .split(",")
          .map((d) => Number(d.trim()))
          .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
        if (rawDays.length > 0) {
          workDays = Array.from(new Set(rawDays)).sort((a, b) => a - b);
        }
      }
    }
    return { workStart, workEnd, workDays };
  } catch {
    return { workStart: null, workEnd: null, workDays: null };
  }
}

/**
 * Sérialise les permissions de modules + les horaires de travail dans la colonne JSON `permissions`
 * sans aucune perte ni besoin de migration SQL.
 */
export function serializePermissionsWithSchedule(
  modulePermissions: string[] | null | undefined,
  schedule?: {
    workStart?: string | null;
    workEnd?: string | null;
    workDays?: number[] | null;
  },
  existingRaw?: string | null
): string | null {
  let baseModules: string[] = [];
  if (Array.isArray(modulePermissions)) {
    baseModules = modulePermissions.filter((x) => typeof x === "string" && !x.startsWith("__sched_"));
  } else if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (Array.isArray(parsed)) {
        baseModules = parsed.filter((x): x is string => typeof x === "string" && !x.startsWith("__sched_"));
      }
    } catch {
      baseModules = [];
    }
  }

  const prevSched = parseEmployeeScheduleFromRaw(existingRaw);
  const workStart = schedule && "workStart" in schedule ? schedule.workStart : prevSched.workStart;
  const workEnd = schedule && "workEnd" in schedule ? schedule.workEnd : prevSched.workEnd;
  const workDays = schedule && "workDays" in schedule ? schedule.workDays : prevSched.workDays;

  const tokens: string[] = [...baseModules];
  if (isValidTimeHHMM(workStart)) {
    tokens.push(`${SCHED_START_PREFIX}${workStart.trim()}`);
  }
  if (isValidTimeHHMM(workEnd)) {
    tokens.push(`${SCHED_END_PREFIX}${workEnd.trim()}`);
  }
  if (Array.isArray(workDays) && workDays.length > 0) {
    const cleanDays = Array.from(
      new Set(workDays.map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))
    ).sort((a, b) => a - b);
    if (cleanDays.length > 0) {
      tokens.push(`${SCHED_DAYS_PREFIX}${cleanDays.join(",")}`);
    }
  }

  if (tokens.length === 0) return null;
  return JSON.stringify(tokens);
}

/**
 * Formate de manière lisible les horaires d'un(e) employé(e) ou de l'entreprise.
 */
export function formatWorkScheduleLabel(
  schedule?: { workStart?: string | null; workEnd?: string | null; workDays?: number[] | null } | null,
  tenantOpeningHour = 9,
  tenantClosingHour = 19
): string {
  const start = isValidTimeHHMM(schedule?.workStart) ? schedule!.workStart! : hourIntToHHMM(tenantOpeningHour, 9);
  const end = isValidTimeHHMM(schedule?.workEnd) ? schedule!.workEnd! : hourIntToHHMM(tenantClosingHour, 19);
  const isCustomHours = isValidTimeHHMM(schedule?.workStart) || isValidTimeHHMM(schedule?.workEnd);
  const days = schedule?.workDays;
  let daysLabel = "";
  if (Array.isArray(days) && days.length > 0 && days.length < 7) {
    if (days.join(",") === "1,2,3,4,5,6") {
      daysLabel = "Lun–Sam";
    } else if (days.join(",") === "1,2,3,4,5") {
      daysLabel = "Lun–Ven";
    } else {
      daysLabel = days
        .map((d) => WEEKDAYS_SHORT.find((w) => w.day === d)?.short ?? "")
        .filter(Boolean)
        .join(", ");
    }
  } else if (Array.isArray(days) && days.length === 7) {
    daysLabel = "7j/7";
  }

  const timePart = `${start.replace(":", "h")} – ${end.replace(":", "h")}`;
  if (!isCustomHours && (!daysLabel || daysLabel === "Lun–Sam")) {
    return `${timePart} (Horaires salon)`;
  }
  return daysLabel ? `${timePart} · ${daysLabel}` : timePart;
}

export interface EvaluatedAttendance {
  /** Heure d'arrivée prévue au format "HH:MM" (soit celle définie pour l'employé, soit l'ouverture de l'entreprise) */
  expectedStart: string;
  /** Heure de départ prévue au format "HH:MM" (soit celle définie pour l'employé, soit la fermeture de l'entreprise) */
  expectedEnd: string;
  /** Vrai si l'employé a ses propres horaires personnalisés différents de l'entreprise */
  isCustomSchedule: boolean;
  /** Vrai si le jour évalué fait partie des jours travaillés de l'employé */
  isWorkDayToday: boolean;
  /** Statut recalculé dynamiquement selon l'heure d'arrivée prévue ("present" | "late" | "absent" | "leave") */
  status: string;
  /** Minutes de retard par rapport à l'heure d'arrivée définie (0 si à l'heure ou en avance) */
  lateMinutes: number;
  /** Minutes d'avance par rapport à l'heure d'arrivée définie (0 si pile à l'heure ou en retard) */
  earlyMinutes: number;
  /** État du service quand l'employé n'a pas encore pointé : "rest_day" | "upcoming" | "pending" | "late_unpointed" | "checked_in" | "completed" | "leave" */
  shiftState: "rest_day" | "upcoming" | "pending" | "late_unpointed" | "checked_in" | "completed" | "leave";
  /** Libellé synthétique prêt à l'affichage (ex: "À l'heure · Prévu 09h00", "Retard +25 min · Prévu 08h00", "Prise de poste à 13h00") */
  punctualityLabel: string;
}

/**
 * Convertit le jour JS (`Date.getDay()`, 0=Dim..6=Sam) en jour ISO (1=Lun..7=Dim).
 */
export function getIsoWeekday(date: Date = new Date()): number {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

/**
 * Évalue le pointage d'un(e) employé(e) en fonction de :
 * 1) L'heure d'arrivée personnelle (`schedule.workStart`) définie pour cet employé, OU
 * 2) L'heure d'arrivée / ouverture (`tenantOpeningHour`) définie par l'entreprise.
 * Tolérance de pointage : 15 minutes après l'heure d'arrivée prévue.
 */
export function evaluateEmployeeAttendance(opts: {
  checkIn?: string | null;
  checkOut?: string | null;
  rawStatus?: string | null;
  schedule?: { workStart?: string | null; workEnd?: string | null; workDays?: number[] | null } | null;
  tenantOpeningHour?: number | null;
  tenantClosingHour?: number | null;
  nowMinutes?: number;
  isoWeekday?: number;
  toleranceMinutes?: number;
}): EvaluatedAttendance {
  const tolerance = typeof opts.toleranceMinutes === "number" ? opts.toleranceMinutes : 15;
  const openH = typeof opts.tenantOpeningHour === "number" ? opts.tenantOpeningHour : 9;
  const closeH = typeof opts.tenantClosingHour === "number" ? opts.tenantClosingHour : 19;

  const expectedStart = isValidTimeHHMM(opts.schedule?.workStart)
    ? opts.schedule!.workStart!.trim()
    : hourIntToHHMM(openH, 9);
  const expectedEnd = isValidTimeHHMM(opts.schedule?.workEnd)
    ? opts.schedule!.workEnd!.trim()
    : hourIntToHHMM(closeH, 19);
  const isCustomSchedule =
    isValidTimeHHMM(opts.schedule?.workStart) ||
    isValidTimeHHMM(opts.schedule?.workEnd) ||
    (Array.isArray(opts.schedule?.workDays) &&
      opts.schedule!.workDays!.length > 0 &&
      opts.schedule!.workDays!.join(",") !== "1,2,3,4,5,6");

  const expectedStartMin = timeHHMMToMinutes(expectedStart, openH);
  const weekday = opts.isoWeekday ?? getIsoWeekday();
  const workDays = opts.schedule?.workDays;
  const isWorkDayToday =
    !Array.isArray(workDays) || workDays.length === 0 ? weekday !== 7 : workDays.includes(weekday);

  const fmtStart = expectedStart.replace(":", "h");

  if (opts.rawStatus === "leave") {
    return {
      expectedStart,
      expectedEnd,
      isCustomSchedule,
      isWorkDayToday,
      status: "leave",
      lateMinutes: 0,
      earlyMinutes: 0,
      shiftState: "leave",
      punctualityLabel: "En congé",
    };
  }

  if (opts.checkIn && isValidTimeHHMM(opts.checkIn)) {
    const checkInMin = timeHHMMToMinutes(opts.checkIn, openH);
    const diff = checkInMin - expectedStartMin;
    const isLate = diff > tolerance;
    const lateMinutes = isLate ? diff : 0;
    const earlyMinutes = diff < 0 ? Math.abs(diff) : 0;
    const status = isLate ? "late" : "present";
    const shiftState = opts.checkOut ? "completed" : "checked_in";

    let punctualityLabel = `À l'heure (prévu ${fmtStart})`;
    if (isLate) {
      const hLate = Math.floor(lateMinutes / 60);
      const mLate = lateMinutes % 60;
      const delayTxt = hLate > 0 ? `${hLate}h${mLate > 0 ? String(mLate).padStart(2, "0") : ""}` : `${lateMinutes} min`;
      punctualityLabel = `Retard +${delayTxt} (prévu ${fmtStart})`;
    } else if (earlyMinutes >= 5) {
      punctualityLabel = `À l'heure · -${earlyMinutes} min (prévu ${fmtStart})`;
    }

    return {
      expectedStart,
      expectedEnd,
      isCustomSchedule,
      isWorkDayToday,
      status,
      lateMinutes,
      earlyMinutes,
      shiftState,
      punctualityLabel,
    };
  }

  // Pas encore pointé(e)
  if (!isWorkDayToday) {
    return {
      expectedStart,
      expectedEnd,
      isCustomSchedule,
      isWorkDayToday: false,
      status: "absent",
      lateMinutes: 0,
      earlyMinutes: 0,
      shiftState: "rest_day",
      punctualityLabel: "Jour de repos",
    };
  }

  const nowMin =
    typeof opts.nowMinutes === "number"
      ? opts.nowMinutes
      : new Date().getHours() * 60 + new Date().getMinutes();

  if (nowMin < expectedStartMin) {
    return {
      expectedStart,
      expectedEnd,
      isCustomSchedule,
      isWorkDayToday: true,
      status: "absent",
      lateMinutes: 0,
      earlyMinutes: 0,
      shiftState: "upcoming",
      punctualityLabel: `Prise de poste à ${fmtStart}`,
    };
  }

  if (nowMin > expectedStartMin + tolerance) {
    const unpointedLate = nowMin - expectedStartMin;
    return {
      expectedStart,
      expectedEnd,
      isCustomSchedule,
      isWorkDayToday: true,
      status: "absent",
      lateMinutes: unpointedLate,
      earlyMinutes: 0,
      shiftState: "late_unpointed",
      punctualityLabel: `Non pointé(e) · Prévu ${fmtStart}`,
    };
  }

  return {
    expectedStart,
    expectedEnd,
    isCustomSchedule,
    isWorkDayToday: true,
    status: "absent",
    lateMinutes: 0,
    earlyMinutes: 0,
    shiftState: "pending",
    punctualityLabel: `Attendu(e) à ${fmtStart}`,
  };
}



