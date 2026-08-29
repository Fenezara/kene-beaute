// Kènè — Moteur de paie CI (CNPS + IGR + CN) & SN (IPM + IPRES + IR)
// Barèmes PRD §8.1 – 8.3 (simplifiés MVP, XOF)

export interface PayrollInput {
  country: "CI" | "SN";
  baseSalary: number;
  transport?: number;
  housing?: number;
  hoursWorked?: number; // heures payées du mois
  cadres?: boolean; // SN : IPRES cadres
  month?: number; // pour abattement IGR éventuel
}

export interface PayrollLine {
  libelle: string;
  base?: number;
  taux?: string;
  gain?: number;
  retenue?: number;
  employeur?: number;
}

export interface PayrollResult {
  country: "CI" | "SN";
  baseSalary: number;
  transport: number;
  housing: number;
  brut: number;
  brutCotisable: number;
  lines: PayrollLine[];
  cnpsEmployee: number;
  cnpsEmployer: number;
  incomeTax: number;
  cn: number;
  totalRetenues: number;
  net: number;
  coutEmployeur: number;
  regimeLabel: string;
}

const r = (n: number) => Math.round(n);

// ───────────── CI — IGR barème mensuel ─────────────
const IGR_CI = [
  { upTo: 75_000, rate: 0 },
  { upTo: 240_000, rate: 0.16 },
  { upTo: 800_000, rate: 0.21 },
  { upTo: 2_400_000, rate: 0.24 },
  { upTo: 8_000_000, rate: 0.28 },
  { upTo: Infinity, rate: 0.36 },
];

export function computeIGRCI(netImposable: number): { tax: number; brackets: { from: number; to: number; rate: number; amount: number }[] } {
  let remaining = netImposable;
  let previous = 0;
  let tax = 0;
  const brackets: { from: number; to: number; rate: number; amount: number }[] = [];
  for (const b of IGR_CI) {
    const span = Math.min(remaining, b.upTo - previous);
    if (span > 0) {
      const amount = span * b.rate;
      tax += amount;
      brackets.push({ from: previous, to: b.upTo === Infinity ? -1 : b.upTo, rate: b.rate, amount: r(amount) });
      remaining -= span;
    }
    previous = b.upTo;
    if (remaining <= 0) break;
  }
  return { tax: r(tax), brackets };
}

// ───────────── CI — CNPS ─────────────
// Pensions : employeur 7,7 % + salarié 6,3 % (plafond 3 375 000)
// Prestations familiales : employeur 5 % (plafond 70 000)
// Maternité : employeur 0,75 % (plafond 70 000)
// AT/MP : employeur 2 % (plafond 70 000)
// Congés payés : employeur 8 %
// CN (Contribution Nationale) : salarié 1,5 %
export function computePayrollCI(input: PayrollInput): PayrollResult {
  const baseSalary = input.baseSalary;
  const transport = input.transport ?? 0;
  const housing = input.housing ?? 0;
  const brut = baseSalary + transport + housing;

  const pensionCeiling = 3_375_000;
  const smallCeiling = 70_000; // base prestations

  const pensionBase = Math.min(brut, pensionCeiling);
  const pensionEmployee = r(pensionBase * 0.063);
  const pensionEmployer = r(pensionBase * 0.077);

  const pfBase = Math.min(brut, smallCeiling);
  const prestationsFamiliales = r(pfBase * 0.05);
  const maternite = r(pfBase * 0.0075);
  const atmp = r(pfBase * 0.02);
  const congesPayes = r(baseSalary * 0.08);

  const cnpsEmployer = pensionEmployer + prestationsFamiliales + maternite + atmp + congesPayes;
  const cnpsEmployee = pensionEmployee;

  // Base IGR : brut cotisable − cotisations sociales salarié (pension) ; abattement 75 000 intégré au barème
  const netImposable = Math.max(0, brut - pensionEmployee);
  const { tax: igr } = computeIGRCI(netImposable);
  const cn = r(Math.max(0, netImposable) * 0.015);

  const totalRetenues = cnpsEmployee + igr + cn;
  const net = brut - totalRetenues;

  const lines: PayrollLine[] = [
    { libelle: "Salaire de base", gain: baseSalary },
    ...(transport ? [{ libelle: "Indemnité de transport", gain: transport }] : []),
    ...(housing ? [{ libelle: "Indemnité de logement", gain: housing }] : []),
    { libelle: "Salaire brut", gain: brut, base: brut },
    { libelle: "CNPS Pension vieillesse (salarié)", base: pensionBase, taux: "6,30 %", retenue: pensionEmployee },
    { libelle: "CNPS Pension vieillesse (employeur)", base: pensionBase, taux: "7,70 %", employeur: pensionEmployer },
    { libelle: "CNPS Prestations familiales", base: pfBase, taux: "5,00 %", employeur: prestationsFamiliales },
    { libelle: "CNPS Maternité", base: pfBase, taux: "0,75 %", employeur: maternite },
    { libelle: "CNPS Accidents du travail (AT/MP)", base: pfBase, taux: "2,00 %", employeur: atmp },
    { libelle: "CNPS Congés payés", base: baseSalary, taux: "8,00 %", employeur: congesPayes },
    { libelle: "IGR — Impôt Général sur le Revenu", base: netImposable, taux: "barème progressif", retenue: igr },
    { libelle: "CN — Contribution Nationale", base: netImposable, taux: "1,50 %", retenue: cn },
    { libelle: "Total retenues", retenue: totalRetenues },
    { libelle: "NET À PAYER", gain: net },
  ];

  return {
    country: "CI",
    baseSalary,
    transport,
    housing,
    brut,
    brutCotisable: pensionBase,
    lines,
    cnpsEmployee,
    cnpsEmployer,
    incomeTax: igr,
    cn,
    totalRetenues,
    net,
    coutEmployeur: brut + cnpsEmployer,
    regimeLabel: "CNPS Côte d'Ivoire + IGR + CN",
  };
}

// ───────────── SN — IR barème mensuel (traitements & salaires) ─────────────
const IR_SN = [
  { upTo: 20_000, rate: 0 },
  { upTo: 30_000, rate: 0.2 },
  { upTo: 40_000, rate: 0.3 },
  { upTo: 60_000, rate: 0.4 },
  { upTo: 90_000, rate: 0.5 },
  { upTo: 130_000, rate: 0.6 },
  { upTo: Infinity, rate: 0.65 },
];

export function computeIRSN(netImposable: number): number {
  let remaining = netImposable;
  let previous = 0;
  let tax = 0;
  for (const b of IR_SN) {
    const span = Math.min(remaining, b.upTo - previous);
    if (span > 0) {
      tax += span * b.rate;
      remaining -= span;
    }
    previous = b.upTo;
    if (remaining <= 0) break;
  }
  return r(tax);
}

// ───────────── SN — IPM (Prestations familiales 7 % plafond 63 000) + IPRES ─────────────
// IPRES retraite : employeur 8,4 % + salarié 5,6 % (plafond 432 000)
// IPRES cadres : employeur 3,6 % + salarié 2,4 %
export function computePayrollSN(input: PayrollInput): PayrollResult {
  const baseSalary = input.baseSalary;
  const transport = input.transport ?? 0;
  const housing = input.housing ?? 0;
  const brut = baseSalary + transport + housing;
  const cadres = input.cadres ?? false;

  const pfBase = Math.min(brut, 63_000);
  const prestationsFamiliales = r(pfBase * 0.07);

  const ipresBase = Math.min(brut, 432_000);
  const ipresEmployee = r(ipresBase * (cadres ? 0.024 : 0.056));
  const ipresEmployer = r(ipresBase * (cadres ? 0.036 : 0.084));

  const cnpsEmployer = prestationsFamiliales + ipresEmployer;
  const cnpsEmployee = ipresEmployee;

  const netImposable = Math.max(0, brut - ipresEmployee);
  const ir = computeIRSN(netImposable);

  const totalRetenues = cnpsEmployee + ir;
  const net = brut - totalRetenues;

  const lines: PayrollLine[] = [
    { libelle: "Salaire de base", gain: baseSalary },
    ...(transport ? [{ libelle: "Indemnité de transport", gain: transport }] : []),
    ...(housing ? [{ libelle: "Indemnité de logement", gain: housing }] : []),
    { libelle: "Salaire brut", gain: brut, base: brut },
    { libelle: "IPM Prestations familiales", base: pfBase, taux: "7,00 %", employeur: prestationsFamiliales },
    ...(cadres
      ? [
          { libelle: "IPRES Cadres (salarié)", base: ipresBase, taux: "2,40 %", retenue: ipresEmployee },
          { libelle: "IPRES Cadres (employeur)", base: ipresBase, taux: "3,60 %", employeur: ipresEmployer },
        ]
      : [
          { libelle: "IPRES Retraite (salarié)", base: ipresBase, taux: "5,60 %", retenue: ipresEmployee },
          { libelle: "IPRES Retraite (employeur)", base: ipresBase, taux: "8,40 %", employeur: ipresEmployer },
        ]),
    { libelle: "IR — Impôt sur le Revenu (Sénégal)", base: netImposable, taux: "barème progressif", retenue: ir },
    { libelle: "Total retenues", retenue: totalRetenues },
    { libelle: "NET À PAYER", gain: net },
  ];

  return {
    country: "SN",
    baseSalary,
    transport,
    housing,
    brut,
    brutCotisable: ipresBase,
    lines,
    cnpsEmployee,
    cnpsEmployer,
    incomeTax: ir,
    cn: 0,
    totalRetenues,
    net,
    coutEmployeur: brut + cnpsEmployer,
    regimeLabel: cadres ? "IPM + IPRES Cadres + IR (Sénégal)" : "IPM + IPRES Retraite + IR (Sénégal)",
  };
}

export function computePayroll(input: PayrollInput): PayrollResult {
  return input.country === "CI" ? computePayrollCI(input) : computePayrollSN(input);
}

// ───────────── Export e-CNPS (XML, format simplifié DSN-CI) ─────────────
export function buildECnpsXml(payslips: { employee: { name: string; cnpsNumber: string | null }; net: number; cnpsEmployee: number; cnpsEmployer: number; gross: number }[], period: string, siret: string): string {
  const rows = payslips
    .map(
      (p, i) => `    <salarie ordre="${i + 1}">
      <matricule>${p.employee.cnpsNumber ?? "NON_ATTRIBUE"}</matricule>
      <nom>${p.employee.name}</nom>
      <remuneration>${p.gross}</remuneration>
      <cotisations_salarie>${p.cnpsEmployee}</cotisations_salarie>
      <cotisations_employeur>${p.cnpsEmployer}</cotisations_employeur>
      <net>${p.net}</net>
    </salarie>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<declaration_cnps period="${period}" siret="${siret}" xmlns="e-cnps.ci">
  <effectif>${payslips.length}</effectif>
  <total_cotisations>${payslips.reduce((s, p) => s + p.cnpsEmployee + p.cnpsEmployer, 0)}</total_cotisations>
${rows}
</declaration_cnps>`;
}
