// Kènè Pro — Générateur d'image pour Ticket de Caisse Thermique (HTML5 Canvas)
// Permet d'exporter et de partager le reçu sous forme d'image PNG nette directement sur WhatsApp (Web Share API)
// ou par téléchargement direct si Web Share de fichiers n'est pas supporté sur l'appareil.

import { ThermalReceiptData, ThermalFormat } from "./receipt-thermal";
import { splitTVA } from "./syscohada";

const PAYMENT_LABELS: Record<string, string> = {
  wave: "Wave Mobile Money",
  orange: "Orange Money",
  cash: "Espèces",
  card: "Carte bancaire",
  wallet: "Compte Kènè",
};

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

/**
 * Dessine un ticket de caisse thermique fidèle au reçu papier sur un canvas haute définition et renvoie un Blob PNG
 */
export async function renderThermalReceiptToBlob(
  data: ThermalReceiptData,
  format: ThermalFormat = "80mm"
): Promise<Blob> {
  const isCompact = format === "58mm";
  const canvasWidth = isCompact ? 380 : 480;
  const paddingX = 24;
  const contentWidth = canvasWidth - paddingX * 2;
  const currency = data.currency || "FCFA";
  const payMethodLabel = PAYMENT_LABELS[data.paymentMethod] || data.paymentMethod;
  const { dateStr, timeStr } = formatDateTime(data.createdAt);
  const tvaCalc = splitTVA(data.total);

  // Estimation dynamique de la hauteur
  const itemsCount = data.items.length;
  const estimatedHeight = 560 + itemsCount * 36;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = estimatedHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D non disponible");

  // Fond papier ticket
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvasWidth, estimatedHeight);

  // Ombre subtile et bordure papier
  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvasWidth - 2, estimatedHeight - 2);

  let y = 32;

  // 1. En-tête de l'institut
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.font = "bold 20px 'Courier New', Courier, monospace";
  ctx.fillText(data.tenantName.toUpperCase(), canvasWidth / 2, y);
  y += 20;

  if (data.tenantAddress) {
    ctx.font = "13px 'Courier New', Courier, monospace";
    ctx.fillText(data.tenantAddress, canvasWidth / 2, y);
    y += 18;
  }

  if (data.tenantPhone) {
    ctx.font = "13px 'Courier New', Courier, monospace";
    ctx.fillText(`Tél : ${data.tenantPhone}`, canvasWidth / 2, y);
    y += 18;
  }

  y += 6;
  // Badge Ticket de caisse
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  const badgeText = "TICKET DE CAISSE";
  ctx.font = "bold 13px 'Courier New', Courier, monospace";
  const badgeWidth = ctx.measureText(badgeText).width + 16;
  ctx.strokeRect((canvasWidth - badgeWidth) / 2, y - 14, badgeWidth, 20);
  ctx.fillText(badgeText, canvasWidth / 2, y);
  y += 20;

  // Séparateur pointillé
  const drawDashedLine = (currY: number) => {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(paddingX, currY);
    ctx.lineTo(canvasWidth - paddingX, currY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const drawDoubleLine = (currY: number) => {
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(paddingX, currY);
    ctx.lineTo(canvasWidth - paddingX, currY);
    ctx.stroke();
  };

  drawDashedLine(y);
  y += 18;

  // Métadonnées
  ctx.font = "13px 'Courier New', Courier, monospace";
  ctx.textAlign = "left";
  ctx.fillText(`Date : ${dateStr}`, paddingX, y);
  ctx.textAlign = "right";
  ctx.fillText(timeStr, canvasWidth - paddingX, y);
  y += 18;

  ctx.textAlign = "left";
  ctx.fillText("Ticket N° :", paddingX, y);
  ctx.textAlign = "right";
  ctx.font = "bold 14px 'Courier New', Courier, monospace";
  ctx.fillText(data.receiptNumber.toUpperCase(), canvasWidth - paddingX, y);
  y += 18;

  if (data.cashierName) {
    ctx.font = "13px 'Courier New', Courier, monospace";
    ctx.textAlign = "left";
    ctx.fillText("Opérateur :", paddingX, y);
    ctx.textAlign = "right";
    ctx.fillText(data.cashierName, canvasWidth - paddingX, y);
    y += 18;
  }

  if (data.clientName) {
    ctx.font = "13px 'Courier New', Courier, monospace";
    ctx.textAlign = "left";
    ctx.fillText("Cliente :", paddingX, y);
    ctx.textAlign = "right";
    ctx.font = "bold 13px 'Courier New', Courier, monospace";
    ctx.fillText(data.clientName, canvasWidth - paddingX, y);
    y += 18;
  }

  y += 6;
  drawDashedLine(y);
  y += 18;

  // Colonnes
  ctx.font = "bold 12px 'Courier New', Courier, monospace";
  ctx.textAlign = "left";
  ctx.fillText("DÉSIGNATION", paddingX, y);
  ctx.textAlign = "right";
  ctx.fillText(`TOTAL (${currency})`, canvasWidth - paddingX, y);
  y += 20;

  // Articles
  ctx.font = "14px 'Courier New', Courier, monospace";
  for (const it of data.items) {
    ctx.textAlign = "left";
    const label = (it.qty > 1 ? `${it.qty}x ` : "") + it.label;
    // Tronquer si trop long
    let displayLabel = label;
    while (ctx.measureText(displayLabel).width > contentWidth - 110 && displayLabel.length > 5) {
      displayLabel = displayLabel.slice(0, -4) + "...";
    }
    ctx.fillText(displayLabel, paddingX, y);

    ctx.textAlign = "right";
    ctx.font = "bold 14px 'Courier New', Courier, monospace";
    ctx.fillText(formatFcfa(it.total), canvasWidth - paddingX, y);
    ctx.font = "14px 'Courier New', Courier, monospace";
    y += 20;
  }

  y += 4;
  drawDashedLine(y);
  y += 16;

  // Total Net
  drawDoubleLine(y);
  y += 20;
  ctx.font = "bold 18px 'Courier New', Courier, monospace";
  ctx.textAlign = "left";
  ctx.fillText("TOTAL NET", paddingX, y);
  ctx.textAlign = "right";
  ctx.fillText(`${formatFcfa(data.total)} ${currency}`, canvasWidth - paddingX, y);
  y += 8;
  drawDoubleLine(y);
  y += 20;

  // TVA / Régime fiscal
  ctx.font = "13px 'Courier New', Courier, monospace";
  if (data.taxExempt) {
    ctx.textAlign = "left";
    ctx.fillText("Régime fiscal :", paddingX, y);
    ctx.textAlign = "right";
    ctx.fillText("Exonéré de TVA", canvasWidth - paddingX, y);
    y += 18;
  } else {
    ctx.textAlign = "left";
    ctx.fillText("Montant HT :", paddingX, y);
    ctx.textAlign = "right";
    ctx.fillText(`${formatFcfa(tvaCalc.ht)} ${currency}`, canvasWidth - paddingX, y);
    y += 18;

    ctx.textAlign = "left";
    ctx.fillText("TVA (18 %) :", paddingX, y);
    ctx.textAlign = "right";
    ctx.fillText(`${formatFcfa(tvaCalc.tva)} ${currency}`, canvasWidth - paddingX, y);
    y += 18;

    ctx.textAlign = "left";
    ctx.font = "bold 13px 'Courier New', Courier, monospace";
    ctx.fillText("Montant TTC :", paddingX, y);
    ctx.textAlign = "right";
    ctx.fillText(`${formatFcfa(data.total)} ${currency}`, canvasWidth - paddingX, y);
    ctx.font = "13px 'Courier New', Courier, monospace";
    y += 18;
  }

  y += 4;
  drawDashedLine(y);
  y += 18;

  // Règlement
  ctx.textAlign = "left";
  ctx.fillText("Règlement :", paddingX, y);
  ctx.textAlign = "right";
  ctx.font = "bold 13px 'Courier New', Courier, monospace";
  ctx.fillText(payMethodLabel, canvasWidth - paddingX, y);
  ctx.font = "13px 'Courier New', Courier, monospace";
  y += 18;

  if (data.paymentRef) {
    ctx.textAlign = "left";
    ctx.fillText("Réf. Trans. :", paddingX, y);
    ctx.textAlign = "right";
    ctx.fillText(data.paymentRef.slice(-12).toUpperCase(), canvasWidth - paddingX, y);
    y += 18;
  }

  y += 10;
  // Code-barre simulation
  const barPattern = [3, 1, 2, 2, 1, 3, 2, 1, 1, 3, 2, 2, 3, 1, 2, 1, 3, 1, 2, 3, 1, 2, 2, 1, 3];
  const barXStart = (canvasWidth - barPattern.length * 5) / 2;
  for (let i = 0; i < barPattern.length; i++) {
    const barW = barPattern[i];
    ctx.fillStyle = "#000000";
    ctx.fillRect(barXStart + i * 5, y, barW * 1.3, 30);
  }
  y += 42;

  // Pied de page
  drawDashedLine(y);
  y += 18;
  ctx.textAlign = "center";
  ctx.font = "bold 12px 'Courier New', Courier, monospace";
  ctx.fillText("MERCI DE VOTRE CONFIANCE !", canvasWidth / 2, y);
  y += 16;
  ctx.font = "11px 'Courier New', Courier, monospace";
  ctx.fillText(data.customFooter || "Les soins et cosmétiques ne sont ni repris ni échangés.", canvasWidth / 2, y);
  y += 16;
  ctx.font = "bold 11px 'Courier New', Courier, monospace";
  ctx.fillText(`KÈNÈ PRO · ${data.tenantName}`, canvasWidth / 2, y);
  y += 14;
  ctx.font = "10px 'Courier New', Courier, monospace";
  ctx.fillStyle = "#555555";
  ctx.fillText("Solution logicielle Dermo TIC · Vente directe", canvasWidth / 2, y);
  y += 24;

  // Ajuster canvas final à la hauteur réelle
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = canvasWidth;
  finalCanvas.height = y;
  const finalCtx = finalCanvas.getContext("2d");
  if (!finalCtx) throw new Error("Canvas final 2D non disponible");
  finalCtx.drawImage(canvas, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    finalCanvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Impossible de générer l'image du ticket"));
    }, "image/png");
  });
}
