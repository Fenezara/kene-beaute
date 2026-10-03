// Kènè Pro — Générateur ESC/POS & texte pour le Ticket Z de Clôture de Caisse Journalière
// Impression thermique 80mm & 58mm pour les imprimantes de salon (Bluetooth / USB)

import type { ThermalFormat } from "@/lib/accounting/receipt-thermal";
import { splitTVA } from "@/lib/accounting/syscohada";

export interface CashClosureData {
  tenantName: string;
  tenantCity: string;
  tenantPhone?: string;
  taxExempt?: boolean;
  closureDate: Date | string;
  closedBy: string;
  openingCash: number;
  cashSales: number;
  countedCash: number;
  cashVariance: number;
  waveSales: number;
  orangeSales: number;
  cardSales: number;
  walletSales: number;
  totalSales: number;
  salesCount: number;
  notes?: string | null;
}

function encodeAscii(text: string): Uint8Array {
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r]/g, " ");

  const bytes = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    bytes[i] = clean.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

const fmtFcfa = (n: number): string => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

/**
 * Construit le flux binaire ESC/POS du ticket Z de clôture de caisse
 */
export function buildCashClosureEscPosBinary(data: CashClosureData, format: ThermalFormat = "80mm"): Uint8Array {
  const maxCols = format === "58mm" ? 32 : 48;
  const chunks: Uint8Array[] = [];

  const write = (str: string) => chunks.push(encodeAscii(str));
  const raw = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));

  const padCols = (left: string, right: string) => {
    const space = maxCols - (left.length + right.length);
    if (space <= 0) return left.slice(0, maxCols - right.length - 1) + " " + right;
    return left + " ".repeat(space) + right;
  };

  const line = (char = "-") => char.repeat(maxCols);

  // 1. Initialisation imprimante
  raw(0x1b, 0x40);

  // 2. En-tête centré
  raw(0x1b, 0x61, 0x01); // Centre
  raw(0x1b, 0x45, 0x01); // Gras ON
  raw(0x1d, 0x21, 0x11); // Double taille
  write("KENE PRO\n");
  raw(0x1d, 0x21, 0x00); // Taille normale
  write(`${data.tenantName}\n`);
  raw(0x1b, 0x45, 0x00); // Gras OFF
  write(data.tenantPhone ? `${data.tenantCity} - Tel: ${data.tenantPhone}\n` : `${data.tenantCity}\n`);
  raw(0x1b, 0x45, 0x01);
  write("================================\n");
  write("CLOTURE DE CAISSE - RAPPORT Z\n");
  write("================================\n\n");
  raw(0x1b, 0x45, 0x00);

  // 3. Infos séance (Aligné à gauche)
  raw(0x1b, 0x61, 0x00);
  const d = new Date(data.closureDate);
  const dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  write(padCols(`Date: ${dateStr} ${timeStr}`, `Tickets: ${data.salesCount}`) + "\n");
  write(`Responsable de caisse: ${data.closedBy}\n`);
  write(line("-") + "\n\n");

  // 4. Pointage Espèces & Écart
  raw(0x1b, 0x45, 0x01);
  write("1. POINTAGE TIROIR-CAISSE (ESPECES)\n");
  raw(0x1b, 0x45, 0x00);
  write(padCols("Fond de caisse initial :", fmtFcfa(data.openingCash)) + "\n");
  write(padCols("Ventes especes journe :", `+${fmtFcfa(data.cashSales)}`) + "\n");
  write(padCols("Especes theoriques attendues :", fmtFcfa(data.openingCash + data.cashSales)) + "\n");
  raw(0x1b, 0x45, 0x01);
  write(padCols("Especes physiques comptees :", fmtFcfa(data.countedCash)) + "\n");
  raw(0x1b, 0x45, 0x00);

  const varianceLabel = data.cashVariance === 0 ? "0 FCFA (PARFAIT)" : data.cashVariance > 0 ? `+${fmtFcfa(data.cashVariance)} (EXCEDENT)` : `${fmtFcfa(data.cashVariance)} (DEFICIT)`;
  raw(0x1b, 0x45, 0x01);
  write(padCols("ECART DE CAISSE :", varianceLabel) + "\n");
  raw(0x1b, 0x45, 0x00);
  write(line("-") + "\n\n");

  // 5. Ventilation des Règlements
  raw(0x1b, 0x45, 0x01);
  write("2. VENTILATION DES ENCAISSEMENTS\n");
  raw(0x1b, 0x45, 0x00);
  write(padCols("Especes :", fmtFcfa(data.cashSales)) + "\n");
  write(padCols("Wave :", fmtFcfa(data.waveSales)) + "\n");
  write(padCols("Orange Money :", fmtFcfa(data.orangeSales)) + "\n");
  if (data.cardSales > 0) write(padCols("Carte Bancaire :", fmtFcfa(data.cardSales)) + "\n");
  if (data.walletSales > 0) write(padCols("Wallet Kene :", fmtFcfa(data.walletSales)) + "\n");
  write(line("-") + "\n");

  // 6. Total Chiffre d'Affaires Journalier
  raw(0x1b, 0x45, 0x01);
  raw(0x1d, 0x21, 0x01); // Double hauteur
  write(padCols("TOTAL CA JOURNEE :", fmtFcfa(data.totalSales)) + "\n");
  raw(0x1d, 0x21, 0x00);
  const { tva, ht } = splitTVA(data.totalSales);
  if (data.taxExempt) {
    write(padCols("Regime fiscal :", "Exonere de TVA") + "\n");
  } else {
    write(padCols("Dont TVA (18% SYSCOHADA) :", fmtFcfa(tva)) + "\n");
    write(padCols("Total Hors Taxes (HT) :", fmtFcfa(ht)) + "\n");
  }
  raw(0x1b, 0x45, 0x00);
  write(line("=") + "\n\n");

  // 7. Signature
  write("Emargement Caissiere / Gerante :\n\n\n");
  write("..........................................\n");
  raw(0x1b, 0x61, 0x01);
  write("Kene Pro - Gestion de Caisse Homologuee\n\n\n");

  // 8. Découpe papier
  raw(0x1d, 0x56, 0x42, 0x00);

  return concatBytes(...chunks);
}

/**
 * Génère le code HTML thermique prêt à l'impression pour le Rapport Z
 */
export function generateCashClosureHtml(data: CashClosureData, format: ThermalFormat = "80mm"): string {
  const widthMm = format === "58mm" ? 48 : 72;
  const fontSizePx = format === "58mm" ? 10 : 12;
  const d = new Date(data.closureDate);
  const dateStr = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeStr = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const { tva, ht } = splitTVA(data.totalSales);

  const varianceClass = data.cashVariance === 0 ? "color:#16a34a;" : data.cashVariance > 0 ? "color:#2563eb;" : "color:#dc2626;";
  const varianceLabel = data.cashVariance === 0 ? "0 FCFA (CONFORME)" : data.cashVariance > 0 ? `+${fmtFcfa(data.cashVariance)} (EXCÉDENT)` : `${fmtFcfa(data.cashVariance)} (DÉFICIT)`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Clôture de Caisse - Rapport Z</title>
  <style>
    @page { margin: 0; size: ${widthMm}mm auto; }
    body {
      font-family: 'Courier New', Courier, monospace, ui-monospace;
      font-size: ${fontSizePx}px;
      line-height: 1.35;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 6px 8px;
      width: ${widthMm}mm;
      box-sizing: border-box;
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .flex-row { display: flex; justify-content: space-between; gap: 4px; }
    .dashed { border-top: 1px dashed #000; margin: 5px 0; }
    .double { border-top: 2px solid #000; margin: 6px 0; }
    .box { border: 1px solid #000; padding: 4px 6px; margin: 5px 0; }
    @media print {
      body { width: 100%; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="bold" style="font-size: ${fontSizePx + 2}px; text-transform: uppercase;">${data.tenantName}</div>
    <div style="font-size: 9px;">${data.tenantCity} ${data.tenantPhone ? `· Tél: ${data.tenantPhone}` : ""}</div>
    <div class="dashed"></div>
    <div class="bold" style="font-size: ${fontSizePx + 1}px;">RAPPORT Z DE CLÔTURE DE CAISSE</div>
    <div style="font-size: 10px;">Date : ${dateStr} à ${timeStr}</div>
    <div style="font-size: 10px;">Responsable : ${data.closedBy}</div>
    <div style="font-size: 10px;">Nombre de transactions : ${data.salesCount}</div>
  </div>

  <div class="double"></div>
  <div class="bold">1. POINTAGE TIROIR-CAISSE (ESPÈCES)</div>
  <div class="flex-row"><span>Fond de caisse initial :</span><span>${fmtFcfa(data.openingCash)}</span></div>
  <div class="flex-row"><span>Ventes espèces journée :</span><span>+${fmtFcfa(data.cashSales)}</span></div>
  <div class="flex-row" style="font-style: italic;"><span>Espèces théoriques attendues :</span><span>${fmtFcfa(data.openingCash + data.cashSales)}</span></div>
  <div class="flex-row bold" style="margin-top: 2px;"><span>Espèces physiques comptées :</span><span>${fmtFcfa(data.countedCash)}</span></div>
  
  <div class="box" style="${varianceClass}">
    <div class="flex-row bold">
      <span>ÉCART DE CAISSE :</span>
      <span>${varianceLabel}</span>
    </div>
  </div>

  <div class="dashed"></div>
  <div class="bold">2. VENTILATION DES RÈGLEMENTS</div>
  <div class="flex-row"><span>Espèces :</span><span>${fmtFcfa(data.cashSales)}</span></div>
  <div class="flex-row"><span>Wave :</span><span>${fmtFcfa(data.waveSales)}</span></div>
  <div class="flex-row"><span>Orange Money :</span><span>${fmtFcfa(data.orangeSales)}</span></div>
  ${data.cardSales > 0 ? `<div class="flex-row"><span>Carte Bancaire :</span><span>${fmtFcfa(data.cardSales)}</span></div>` : ""}
  ${data.walletSales > 0 ? `<div class="flex-row"><span>Wallet Kènè :</span><span>${fmtFcfa(data.walletSales)}</span></div>` : ""}

  <div class="double"></div>
  <div class="flex-row bold" style="font-size: ${fontSizePx + 1}px;">
    <span>TOTAL CA ENCAISSÉ :</span>
    <span>${fmtFcfa(data.totalSales)}</span>
  </div>
  ${data.taxExempt ? `
    <div class="flex-row" style="font-size: 9px; color: #333; margin-top: 2px;">
      <span>Régime fiscal :</span>
      <span>Exonéré de TVA</span>
    </div>
  ` : `
    <div class="flex-row" style="font-size: 9px; color: #333; margin-top: 2px;">
      <span>Dont TVA 18% SYSCOHADA :</span>
      <span>${fmtFcfa(tva)}</span>
    </div>
    <div class="flex-row" style="font-size: 9px; color: #333;">
      <span>Montant net Hors Taxes (HT) :</span>
      <span>${fmtFcfa(ht)}</span>
    </div>
  `}

  ${data.notes ? `
    <div class="dashed"></div>
    <div style="font-size: 9px;"><strong>Notes / Justificatif écart :</strong> ${data.notes}</div>
  ` : ""}

  <div class="double"></div>
  <div style="margin-top: 8px; font-size: 9px;">
    <div>Émargement Caissière / Direction :</div>
    <div style="margin-top: 25px; border-top: 1px dotted #000; text-align: center; padding-top: 2px;">
      Signature &amp; Cachet
    </div>
  </div>

  <div class="text-center" style="margin-top: 8px; font-size: 8px; color: #555;">
    Kènè POS · Traçabilité Fiscale SYSCOHADA · Certifié
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { window.print(); }, 250);
    });
  </script>
</body>
</html>`;
}

/**
 * Ouvre une fenêtre popup d'impression pour le Rapport Z
 */
export function openCashClosurePrintWindow(data: CashClosureData, format: ThermalFormat = "80mm"): void {
  const html = generateCashClosureHtml(data, format);
  const win = window.open("", "_blank", "width=440,height=650,scrollbars=yes,resizable=yes");
  if (!win) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
}
