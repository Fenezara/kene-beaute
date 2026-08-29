// Kènè — Moteur comptable SYSCOHADA (révisé)
// Plan comptable pré-chargé, écritures auto depuis caisse/achats/paie,
// grand livre, balance, bilan & compte de résultat simplifiés.

export interface AccountDef {
  code: string;
  classe: number;
  label: string;
  type: "actif" | "passif" | "charge" | "produit";
}

// Sous-ensemble du plan SYSCOHADA révisé utile au MVP
export const SYSCOHADA_TEMPLATE: AccountDef[] = [
  // Classe 1 — Ressources durables
  { code: "101000", classe: 1, label: "Capital social", type: "passif" },
  { code: "106000", classe: 1, label: "Réserves", type: "passif" },
  { code: "121000", classe: 1, label: "Résultat de l'exercice", type: "passif" },
  { code: "165000", classe: 1, label: "Emprunts", type: "passif" },
  // Classe 2 — Actif immobilisé
  { code: "215000", classe: 2, label: "Installations techniques & matériel", type: "actif" },
  { code: "218000", classe: 2, label: "Autres immobilisations corporelles", type: "actif" },
  { code: "281000", classe: 2, label: "Amortissements", type: "actif" },
  // Classe 3 — Stocks
  { code: "311000", classe: 3, label: "Marchandises", type: "actif" },
  { code: "603100", classe: 6, label: "Variation stocks marchandises", type: "charge" },
  // Classe 4 — Tiers
  { code: "411000", classe: 4, label: "Clients", type: "actif" },
  { code: "421000", classe: 4, label: "Personnel — rémunérations dues", type: "passif" },
  { code: "431000", classe: 4, label: "Sécurité sociale (CNPS/IPRES)", type: "passif" },
  { code: "443000", classe: 4, label: "État — TVA facturée", type: "passif" },
  { code: "445000", classe: 4, label: "État — TVA récupérable", type: "actif" },
  { code: "444000", classe: 4, label: "État — IGR/IR à payer", type: "passif" },
  { code: "401000", classe: 4, label: "Fournisseurs", type: "passif" },
  // Classe 5 — Trésorerie
  { code: "521000", classe: 5, label: "Banques", type: "actif" },
  { code: "571000", classe: 5, label: "Caisse (espèces)", type: "actif" },
  { code: "585000", classe: 5, label: "Virements internes Wave/OM", type: "actif" },
  // Classe 6 — Charges
  { code: "601000", classe: 6, label: "Achats de marchandises", type: "charge" },
  { code: "602000", classe: 6, label: "Achats de matières premières (botaniques)", type: "charge" },
  { code: "605000", classe: 6, label: "Autres achats (électricité, eau…)", type: "charge" },
  { code: "613000", classe: 6, label: "Locations", type: "charge" },
  { code: "615000", classe: 6, label: "Entretien & réparations", type: "charge" },
  { code: "622000", classe: 6, label: "Honoraires (comptable…)", type: "charge" },
  { code: "626000", classe: 6, label: "Frais de télécommunications", type: "charge" },
  { code: "628100", classe: 6, label: "Frais de SMS / WhatsApp business", type: "charge" },
  { code: "641000", classe: 6, label: "Rémunérations du personnel", type: "charge" },
  { code: "644000", classe: 6, label: "Cotisations sociales patronales", type: "charge" },
  { code: "651000", classe: 6, label: "Impôts & taxes (patente, TVA…)", type: "charge" },
  { code: "661000", classe: 6, label: "Charges d'intérêts", type: "charge" },
  // Classe 7 — Produits
  { code: "701000", classe: 7, label: "Ventes de prestations de services", type: "produit" },
  { code: "702000", classe: 7, label: "Ventes de produits finis (cosmétiques)", type: "produit" },
  { code: "706000", classe: 7, label: "Prestations de services (diagnostics)", type: "produit" },
  { code: "752000", classe: 7, label: "Revenus des commissions (marketplace)", type: "produit" },
  // Classe 8 — Comptes spéciaux (HSC)
  { code: "891000", classe: 8, label: "Résultat en baisse (bilan)", type: "passif" },
  { code: "892000", classe: 8, label: "Résultat en hausse (bilan)", type: "passif" },
];

export const CLASSES_LABELS: Record<number, string> = {
  1: "Comptes de ressources durables",
  2: "Comptes d'actif immobilisé",
  3: "Comptes de stocks",
  4: "Comptes de tiers",
  5: "Comptes de trésorerie",
  6: "Comptes de charges des activités ordinaires",
  7: "Comptes de produits des activités ordinaires",
  8: "Comptes spéciaux (Hors Système Comptable)",
  9: "Comptes analytiques",
};

export const TVA_RATE = 0.18;

/** Décompose un montant TTC en HT + TVA (TVA 18 % incluse) */
export function splitTVA(ttc: number): { ht: number; tva: number } {
  const ht = Math.round(ttc / (1 + TVA_RATE));
  return { ht, tva: ttc - ht };
}

export interface SimpleLine {
  accountCode: string;
  label?: string;
  debit?: number;
  credit?: number;
}

/** Écriture de journal générée par une vente caisse (CA / BQ) */
export function saleJournalLines(opts: {
  total: number;
  servicesAmount: number; // part prestations
  productsAmount: number; // part produits
  method: "wave" | "orange" | "cash" | "card" | "wallet";
}): SimpleLine[] {
  const { ht, tva } = splitTVA(opts.total);
  const treasCode =
    opts.method === "cash" ? "571000" : opts.method === "card" ? "521000" : "585000";
  const serviceHt = Math.round((opts.servicesAmount / (opts.total || 1)) * ht);
  const productHt = ht - serviceHt;
  const lines: SimpleLine[] = [{ accountCode: treasCode, label: "Encaissement", debit: opts.total }];
  if (serviceHt > 0) lines.push({ accountCode: "701000", label: "Ventes prestations", credit: serviceHt });
  if (productHt > 0) lines.push({ accountCode: "702000", label: "Ventes produits", credit: productHt });
  if (tva > 0) lines.push({ accountCode: "443000", label: "TVA facturée 18 %", credit: tva });
  return lines;
}

/** Écriture d'achat marchandises */
export function purchaseJournalLines(opts: { total: number; supplier?: string }): SimpleLine[] {
  const { ht, tva } = splitTVA(opts.total);
  return [
    { accountCode: "601000", label: "Achat marchandises", debit: ht },
    { accountCode: "445000", label: "TVA récupérable", debit: tva },
    { accountCode: "401000", label: opts.supplier ?? "Fournisseur", credit: opts.total },
  ];
}

/** Écriture de paie mensuelle */
export function payrollJournalLines(opts: {
  grossTotal: number;
  employerContribTotal: number;
  employeeContribTotal: number;
  incomeTaxTotal: number;
}): SimpleLine[] {
  const lines: SimpleLine[] = [
    { accountCode: "641000", label: "Rémunérations du personnel", debit: opts.grossTotal },
  ];
  if (opts.employerContribTotal > 0)
    lines.push({ accountCode: "644000", label: "Charges patronales", debit: opts.employerContribTotal });
  const netTotal = opts.grossTotal - opts.employeeContribTotal - opts.incomeTaxTotal;
  lines.push({ accountCode: "421000", label: "Salaires nets à payer", credit: netTotal });
  if (opts.employeeContribTotal + opts.employerContribTotal > 0)
    lines.push({ accountCode: "431000", label: "Cotisations sociales (sal. + patr.)", credit: opts.employeeContribTotal + opts.employerContribTotal });
  if (opts.incomeTaxTotal > 0)
    lines.push({ accountCode: "444000", label: "IGR/IR retenu à la source", credit: opts.incomeTaxTotal });
  return lines;
}

export interface LedgerLineView {
  entryId: string;
  date: string;
  journalCode: string;
  reference: string;
  description: string;
  accountCode: string;
  accountLabel: string;
  debit: number;
  credit: number;
}

export interface BalanceRow {
  accountCode: string;
  accountLabel: string;
  classe: number;
  type: string;
  totalDebit: number;
  totalCredit: number;
  solde: number; // débiteur (+) ou créditeur (−)
}

/** Calcule la balance des comptes à partir des lignes d'écritures */
export function computeBalance(
  lines: { accountCode: string; debit: number; credit: number }[],
  accounts: Map<string, { code: string; label: string; classe: number; type: string }>
): BalanceRow[] {
  const map = new Map<string, BalanceRow>();
  for (const l of lines) {
    const acc = accounts.get(l.accountCode);
    if (!acc) continue;
    let row = map.get(l.accountCode);
    if (!row) {
      row = { accountCode: acc.code, accountLabel: acc.label, classe: acc.classe, type: acc.type, totalDebit: 0, totalCredit: 0, solde: 0 };
      map.set(l.accountCode, row);
    }
    row.totalDebit += l.debit;
    row.totalCredit += l.credit;
  }
  const rows = [...map.values()].map((r) => ({ ...r, solde: r.totalDebit - r.totalCredit }));
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  return rows;
}

export interface FinancialStatements {
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

/** Génère bilan + compte de résultat depuis la balance */
export function buildStatements(balance: BalanceRow[]): FinancialStatements {
  let tvaCollected = 0;
  let tvaDeductible = 0;
  const actifMap = new Map<string, number>();
  const passifMap = new Map<string, number>();

  let produits = 0;
  let charges = 0;
  for (const r of balance) {
    if (r.type === "produit") produits += -r.solde;
    if (r.type === "charge") charges += r.solde;
    if (r.accountCode === "443000") tvaCollected += -r.solde;
    if (r.accountCode === "445000") tvaDeductible += r.solde;
    if (r.type === "actif") {
      actifMap.set(r.accountLabel, (actifMap.get(r.accountLabel) ?? 0) + r.solde);
    }
    if (r.type === "passif") {
      passifMap.set(r.accountLabel, (passifMap.get(r.accountLabel) ?? 0) + (-r.solde));
    }
  }
  const resultat = produits - charges;
  const actif = [...actifMap.entries()].map(([label, amount]) => ({ label, amount })).filter((x) => x.amount !== 0);
  const passif = [...passifMap.entries()].map(([label, amount]) => ({ label, amount })).filter((x) => x.amount !== 0);
  // SYSCOHADA : le résultat s'équilibre — bénéfice au passif, perte présentée à l'actif
  if (resultat >= 0) {
    passif.push({ label: "Résultat de l'exercice (bénéfice)", amount: resultat });
  } else {
    actif.push({ label: "Résultat de l'exercice (perte)", amount: -resultat });
  }
  const totalActif = actif.reduce((s, x) => s + x.amount, 0);
  const totalPassif = passif.reduce((s, x) => s + x.amount, 0);
  return { produits, charges, resultat, tvaCollected, tvaDeductible, tvaAPayer: Math.max(0, tvaCollected - tvaDeductible), actif, passif, totalActif, totalPassif };
}
