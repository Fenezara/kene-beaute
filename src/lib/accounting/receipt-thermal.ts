// Kènè Pro — Générateur de ticket de caisse thermique (80mm & 58mm)
// Compatible imprimantes thermiques ESC/POS (Epson, Star Micronics, Sunmi, Xprinter, etc.)
// Conforme SYSCOHADA : ventilation HT / TVA 18 % / TTC et traçabilité de caisse.

import { splitTVA } from "./syscohada";

export type ThermalFormat = "80mm" | "58mm";

export interface ThermalReceiptData {
  tenantName: string;
  tenantAddress?: string;
  tenantPhone?: string;
  tenantTaxId?: string; // RCCM, NIF ou IFU
  receiptNumber: string;
  createdAt: Date | string;
  cashierName?: string;
  clientName?: string;
  clientPhone?: string;
  items: Array<{
    label: string;
    qty: number;
    unitPrice: number;
    total: number;
    kind?: "service" | "product";
  }>;
  subtotal: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  paymentRef?: string;
  taxExempt?: boolean;
  currency?: string;
  customFooter?: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatFcfa(amount: number): string {
  return Math.round(amount).toLocaleString("fr-FR");
}

function formatDateTime(d: Date | string): { dateStr: string; timeStr: string } {
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) {
    return { dateStr: "Date inconnue", timeStr: "--:--" };
  }
  const dateStr = date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { dateStr, timeStr };
}

const PAYMENT_LABELS: Record<string, string> = {
  wave: "Wave Mobile Money",
  orange: "Orange Money",
  cash: "Espèces",
  card: "Carte bancaire",
  wallet: "Compte Kènè",
};

/**
 * Génère le code HTML complet et autonome optimisé pour impression thermique ESC/POS
 */
export function generateThermalReceiptHtml(data: ThermalReceiptData, format: ThermalFormat = "80mm"): string {
  const widthMm = format === "58mm" ? 58 : 80;
  const printableWidthPx = format === "58mm" ? 220 : 310;
  const fontSizePx = format === "58mm" ? 11 : 12;
  const isCompact = format === "58mm";

  const { dateStr, timeStr } = formatDateTime(data.createdAt);
  const payMethodLabel = PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod;
  const tvaCalc = splitTVA(data.total);
  const currency = data.currency || "FCFA";

  // Simulation code-barres ticket
  const barPattern = [3, 1, 2, 2, 1, 3, 2, 1, 1, 3, 2, 2, 3, 1, 2, 1, 3, 1, 2, 3, 1, 2, 2, 1, 3];
  const barSvg = `
    <svg width="${printableWidthPx - 40}" height="32" viewBox="0 0 ${barPattern.length * 3.5} 30" style="display:block;margin:6px auto;" preserveAspectRatio="none">
      ${barPattern
        .map((w, idx) => {
          const x = idx * 3.5;
          return `<rect x="${x}" y="0" width="${w * 0.9}" height="30" fill="#000" />`;
        })
        .join("")}
    </svg>
  `;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket ${escapeHtml(data.receiptNumber)} - ${escapeHtml(data.tenantName)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    @page {
      size: ${widthMm}mm auto;
      margin: 0;
    }
    body {
      background-color: #f5f5f5;
      color: #000;
      font-family: 'Courier New', Courier, monospace, 'Lucida Console', monospace;
      font-size: ${fontSizePx}px;
      line-height: 1.35;
      font-weight: 500;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .receipt-container {
      width: ${printableWidthPx}px;
      margin: 10px auto;
      background: #fff;
      padding: ${isCompact ? "8px 6px" : "12px 10px"};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .bold { font-weight: 700; }
    .uppercase { text-transform: uppercase; }
    .store-title {
      font-size: ${fontSizePx + 3}px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .receipt-badge {
      display: inline-block;
      border: 1px solid #000;
      padding: 1px 6px;
      font-size: ${fontSizePx - 1}px;
      font-weight: 700;
      margin: 4px 0;
    }
    .dashed-divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .flex-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 2px 0;
    }
    .item-label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding-right: 4px;
    }
    .item-total {
      white-space: nowrap;
      text-align: right;
    }
    .total-banner {
      font-size: ${fontSizePx + 3}px;
      font-weight: 800;
      padding: 4px 0;
    }
    .legal-notice {
      font-size: ${fontSizePx - 2}px;
      color: #333;
      margin-top: 4px;
      line-height: 1.25;
    }
    .no-print-toolbar {
      max-width: ${printableWidthPx}px;
      margin: 10px auto 0 auto;
      display: flex;
      gap: 8px;
    }
    .btn {
      flex: 1;
      padding: 8px 12px;
      font-family: system-ui, sans-serif;
      font-size: 13px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      text-align: center;
    }
    .btn-primary { background: #000; color: #fff; }
    .btn-secondary { background: #e5e7eb; color: #111; }

    @media print {
      body {
        background: #fff;
      }
      .no-print-toolbar {
        display: none !important;
      }
      .receipt-container {
        width: 100% !important;
        margin: 0 !important;
        padding: 4px 2px !important;
        box-shadow: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print-toolbar">
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimer (${format})</button>
    <button class="btn btn-secondary" onclick="window.close()">Fermer</button>
  </div>

  <div class="receipt-container">
    <!-- EN-TETE ETABLISSEMENT -->
    <div class="text-center">
      <div class="store-title uppercase">${escapeHtml(data.tenantName)}</div>
      ${data.tenantAddress ? `<div style="font-size:${fontSizePx - 1}px;">${escapeHtml(data.tenantAddress)}</div>` : ""}
      ${data.tenantPhone ? `<div style="font-size:${fontSizePx - 1}px;">Tél : ${escapeHtml(data.tenantPhone)}</div>` : ""}
      ${data.tenantTaxId ? `<div style="font-size:${fontSizePx - 2}px;">NIF/RCCM : ${escapeHtml(data.tenantTaxId)}</div>` : ""}
      <div><span class="receipt-badge">TICKET DE CAISSE</span></div>
    </div>

    <!-- METADONNEES TICKET -->
    <div class="dashed-divider"></div>
    <div class="flex-row">
      <span>Date : ${dateStr}</span>
      <span>${timeStr}</span>
    </div>
    <div class="flex-row">
      <span>Ticket N° :</span>
      <span class="bold">${escapeHtml(data.receiptNumber.toUpperCase())}</span>
    </div>
    ${data.cashierName ? `
    <div class="flex-row">
      <span>Opérateur :</span>
      <span>${escapeHtml(data.cashierName)}</span>
    </div>` : ""}
    ${data.clientName ? `
    <div class="flex-row">
      <span>Cliente :</span>
      <span class="bold">${escapeHtml(data.clientName)}</span>
    </div>` : ""}

    <!-- LIGNES ARTICLES / SOINS -->
    <div class="dashed-divider"></div>
    <div class="flex-row bold" style="font-size:${fontSizePx - 1}px; margin-bottom:4px;">
      <span class="item-label">DÉSIGNATION</span>
      <span class="item-total">TOTAL (${currency})</span>
    </div>

    ${data.items
      .map(
        (it) => `
      <div class="flex-row">
        <span class="item-label">${it.qty > 1 ? `${it.qty}x ` : ""}${escapeHtml(it.label)}</span>
        <span class="item-total bold">${formatFcfa(it.total)}</span>
      </div>
      ${it.qty > 1 ? `<div style="font-size:${fontSizePx - 2}px; color:#555; margin-top:-2px; margin-bottom:2px;">PU: ${formatFcfa(it.unitPrice)}</div>` : ""}
    `
      )
      .join("")}

    <!-- TOTAUX & REMISE -->
    <div class="dashed-divider"></div>
    ${(data.discount && data.discount > 0) ? `
      <div class="flex-row">
        <span>Sous-total brut</span>
        <span>${formatFcfa(data.subtotal)}</span>
      </div>
      <div class="flex-row" style="color:#222;">
        <span>Remise commerciale</span>
        <span>-${formatFcfa(data.discount)}</span>
      </div>
    ` : ""}

    <div class="double-divider"></div>
    <div class="flex-row total-banner">
      <span>TOTAL NET</span>
      <span>${formatFcfa(data.total)} ${currency}</span>
    </div>
    <div class="double-divider"></div>

    <!-- VENTILATION SYSCOHADA TVA -->
    <div style="font-size:${fontSizePx - 1}px; margin: 4px 0;">
      ${data.taxExempt ? `
        <div class="flex-row">
          <span>Régime fiscal :</span>
          <span>Exonéré de TVA</span>
        </div>
      ` : `
        <div class="flex-row">
          <span>Montant HT :</span>
          <span>${formatFcfa(tvaCalc.ht)} ${currency}</span>
        </div>
        <div class="flex-row">
          <span>TVA (18 %) :</span>
          <span>${formatFcfa(tvaCalc.tva)} ${currency}</span>
        </div>
        <div class="flex-row bold">
          <span>Montant TTC :</span>
          <span>${formatFcfa(data.total)} ${currency}</span>
        </div>
      `}
    </div>

    <!-- REGLEMENT -->
    <div class="dashed-divider"></div>
    <div class="flex-row">
      <span>Règlement :</span>
      <span class="bold">${escapeHtml(payMethodLabel)}</span>
    </div>
    ${data.paymentRef ? `
      <div class="flex-row" style="font-size:${fontSizePx - 1}px;">
        <span>Réf. Trans. :</span>
        <span>${escapeHtml(data.paymentRef.slice(-12).toUpperCase())}</span>
      </div>
    ` : ""}

    <!-- CODE BARRE / SECURITE -->
    <div style="margin-top: 6px;">
      ${barSvg}
      <div class="text-center" style="font-size:9px; letter-spacing:1px; margin-top:-2px;">
        *${escapeHtml(data.receiptNumber.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase())}*
      </div>
    </div>

    <!-- PIED DE TICKET -->
    <div class="dashed-divider"></div>
    <div class="text-center legal-notice">
      <div class="bold">MERCI DE VOTRE CONFIANCE !</div>
      <div>${escapeHtml(data.customFooter || "Les soins et cosmétiques ne sont ni repris ni échangés.")}</div>
      <div style="margin-top:4px; font-weight:bold;">KÈNÈ PRO · ${escapeHtml(data.tenantName)}</div>
      <div style="font-size:8px; color:#555;">Solution logicielle Dermo TIC · Vente directe par l'établissement</div>
    </div>
  </div>

  <script>
    // Déclenchement automatique pour les flux de caisse rapide
    if (window.location.search.includes('autoprint=1')) {
      window.addEventListener('load', () => {
        setTimeout(() => { window.print(); }, 250);
      });
    }
  </script>
</body>
</html>`;
}

/**
 * Ouvre une fenêtre popup ou un onglet dédié et imprime directement le ticket de caisse
 */
export function openThermalPrintWindow(data: ThermalReceiptData, format: ThermalFormat = "80mm"): void {
  const html = generateThermalReceiptHtml(data, format);
  const win = window.open("", "_blank", "width=420,height=600,scrollbars=yes,resizable=yes");
  if (!win) {
    // Popup bloquée par le navigateur : fallback via blob URL
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
