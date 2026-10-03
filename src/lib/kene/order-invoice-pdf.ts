// Kènè — Générateur PDF de Facture & Reçu d'Achat Boutique
// Moteur natif zéro dépendance (construit sur src/lib/accounting/pdf.ts)
// Document officiel A4 pour les achats réalisés sur la boutique Kènè
// Conforme aux normes commerciales et comptables UEMOA (Côte d'Ivoire & Sénégal).

import {
  PdfDoc,
  textWidth,
  INK,
  SOFT,
  GOLD,
  GOLD_DARK,
  GOLD_BAND,
  CREAM,
  CARD,
  LINE,
  GREEN,
  RED,
  M_X,
  M_RIGHT,
  CONTENT_W,
  type RGB,
} from "@/lib/accounting/pdf";

export interface OrderInvoiceData {
  order: {
    id: string;
    createdAt: Date | string;
    status: string;
    subtotal: number;
    shippingFee?: number;
    deliveryCity?: string | null;
    deliveryArea?: string | null;
    deliveryAddress?: string | null;
    deliveryPhone?: string | null;
    discount: number;
    couponCode?: string | null;
    cashback: number;
    total: number;
    paymentId?: string | null;
  };
  items: Array<{
    id: string;
    label: string;
    qty: number;
    unitPrice: number;
    total: number;
    botanicals?: string | null;
  }>;
  user: {
    id: string;
    name: string;
    phone: string;
    city?: string | null;
    email?: string | null;
  };
  tenant?: {
    id: string;
    name: string;
    city?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
  payment?: {
    id: string;
    ref: string;
    method: string;
    status: string;
    confirmedAt?: Date | string | null;
  } | null;
}

export interface OrderPdfResult {
  data: Uint8Array;
  pages: number;
}

function fmtAmount(n: number): string {
  const r = Math.round(Number.isFinite(n) ? n : 0);
  const a = Math.abs(r);
  const s = a === 0 ? "0" : String(a).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return r < 0 ? `-${s}` : s;
}

const fmtFcfa = (n: number): string => `${fmtAmount(n)} FCFA`;

const fmtDate = (d: Date | string | null | undefined): string => {
  if (!d) return "—";
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "—";
  return n.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function paymentMethodLabel(method?: string | null): string {
  switch (method?.toLowerCase()) {
    case "wave":
      return "Wave Mobile Money";
    case "orange":
      return "Orange Money";
    case "wallet":
      return "Wallet Kènè (Solde interne)";
    case "cash":
      return "Espèces en caisse";
    case "card":
      return "Carte bancaire";
    default:
      return method ? method.toUpperCase() : "Paiement Mobile Money";
  }
}

function statusLabel(status: string): { text: string; color: RGB; bg: RGB } {
  switch (status.toLowerCase()) {
    case "paid":
    case "completed":
      return { text: "PAYÉE / ACQUITTÉE", color: GREEN, bg: [0.9, 0.96, 0.92] };
    case "delivered":
      return { text: "LIVRÉE", color: GREEN, bg: [0.9, 0.96, 0.92] };
    case "pending":
      return { text: "EN ATTENTE DE PAIEMENT", color: GOLD_DARK, bg: GOLD_BAND };
    case "cancelled":
      return { text: "ANNULÉE", color: RED, bg: [0.98, 0.91, 0.91] };
    default:
      return { text: status.toUpperCase(), color: SOFT, bg: CARD };
  }
}

/**
 * Génère le reçu / la facture d'achat boutique au format PDF.
 */
export function orderInvoicePdf(data: OrderInvoiceData): OrderPdfResult {
  const shortId = data.order.id.slice(-6).toUpperCase();
  const invoiceNum = `FA-${shortId}`;
  const doc = new PdfDoc(`Kènè — Facture N° ${invoiceNum}`);
  doc.setFooter(
    `Kènè Boutique · Plateforme éditée par Dermo TIC · Vente assurée par ${data.tenant ? data.tenant.name : "l'établissement partenaire agréé"} · Facture N° ${invoiceNum}`
  );

  // 1. En-tête de prestige Kènè
  const topY = doc.cursorY;
  doc.rect(M_X, topY, CONTENT_W, 58, GOLD);

  // Titre KÈNÈ et emblème
  doc.text("KÈNÈ", M_X + 16, topY + 22, {
    font: "bold",
    size: 20,
    color: CREAM,
    letterSpace: 3,
  });
  doc.text("BEAUTÉ & BIEN-ÊTRE MÉLANODERME · COSMÉTOPÉE PANAFRICAINE", M_X + 16, topY + 36, {
    font: "bold",
    size: 7.5,
    color: CREAM,
    letterSpace: 0.8,
  });
  doc.text("Plateforme certifiée · Abidjan (CI) · Dakar (SN)", M_X + 16, topY + 48, {
    size: 7,
    color: CREAM,
  });

  // Bloc Facture droite
  const rightX = M_RIGHT - 16;
  doc.textRight("FACTURE / REÇU D'ACHAT", rightX, topY + 20, {
    font: "bold",
    size: 13,
    color: CREAM,
    letterSpace: 1,
  });
  doc.textRight(`N° ${invoiceNum}`, rightX, topY + 34, {
    font: "bold",
    size: 10,
    color: CREAM,
  });
  doc.textRight(fmtDate(data.order.createdAt), rightX, topY + 47, {
    size: 8,
    color: CREAM,
  });

  doc.advance(70);

  // 2. Bloc Vendeur & Client (Deux colonnes)
  const infoY = doc.cursorY;
  const colW = (CONTENT_W - 14) / 2;

  // Colonne Gauche: Vendeur
  doc.rect(M_X, infoY, colW, 74, CARD);
  doc.rectStroke(M_X, infoY, colW, 74, LINE, 0.5);
  doc.text("ÉMETTEUR / VENDEUR", M_X + 10, infoY + 14, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  if (data.tenant) {
    doc.text(data.tenant.name, M_X + 10, infoY + 28, { font: "bold", size: 9.5, color: INK });
    doc.text(data.tenant.city ? `Ville: ${data.tenant.city}` : "Institut Partenaire Agréé Kènè", M_X + 10, infoY + 40, { size: 8, color: SOFT });
    if (data.tenant.address) {
      doc.text(data.tenant.address, M_X + 10, infoY + 52, { size: 8, color: SOFT, maxW: colW - 20 });
    }
    if (data.tenant.phone) {
      doc.text(`Tél: ${data.tenant.phone}`, M_X + 10, infoY + 64, { size: 8, color: SOFT });
    }
  } else {
    doc.text("ÉTABLISSEMENT PARTENAIRE KÈNÈ", M_X + 10, infoY + 28, { font: "bold", size: 9.5, color: INK });
    doc.text("Vendeur Indépendant Partenaire Agréé", M_X + 10, infoY + 40, { size: 8, color: SOFT });
    doc.text("Compte Entreprise Certifié sur Kènè", M_X + 10, infoY + 52, { size: 8, color: SOFT });
    doc.text("Plateforme technique: Dermo TIC", M_X + 10, infoY + 64, { size: 8, color: SOFT });
  }

  // Colonne Droite: Cliente Acheteuse
  const clientX = M_X + colW + 14;
  doc.rect(clientX, infoY, colW, 74, CARD);
  doc.rectStroke(clientX, infoY, colW, 74, LINE, 0.5);
  doc.text("CLIENTE / DESTINATAIRE", clientX + 10, infoY + 14, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.text(data.user.name, clientX + 10, infoY + 28, { font: "bold", size: 9.5, color: INK });
  doc.text(`Tél: ${data.user.phone}`, clientX + 10, infoY + 40, { size: 8, color: SOFT });
  if (data.user.city) {
    doc.text(`Localité: ${data.user.city}`, clientX + 10, infoY + 52, { size: 8, color: SOFT });
  }
  doc.text(`Réf. Cliente: ${data.user.id.slice(-6).toUpperCase()}`, clientX + 10, infoY + 64, { size: 8, color: SOFT });

  doc.advance(86);

  // 3. Badge État du Règlement
  const st = statusLabel(data.order.status);
  const badgeY = doc.cursorY;
  doc.rect(M_X, badgeY, CONTENT_W, 22, st.bg);
  doc.rectStroke(M_X, badgeY, CONTENT_W, 22, st.color, 0.8);
  doc.text(`STATUT DU RÈGLEMENT : ${st.text}`, M_X + 12, badgeY + 14, {
    font: "bold",
    size: 8.5,
    color: st.color,
    letterSpace: 0.5,
  });

  const payInfo = data.payment
    ? `Règlement : ${paymentMethodLabel(data.payment.method)} · Réf ${data.payment.ref}`
    : `Moyen de paiement : ${paymentMethodLabel(null)}`;
  doc.textRight(payInfo, M_RIGHT - 12, badgeY + 14, {
    size: 8,
    color: INK,
  });

  doc.advance(34);

  // 4. Tableau des articles commandés
  doc.ensure(60);
  const tableY = doc.cursorY;

  // En-tête du tableau
  doc.rect(M_X, tableY, CONTENT_W, 20, GOLD_BAND);
  doc.text("DÉSIGNATION DU PRODUIT", M_X + 8, tableY + 13, { font: "bold", size: 8, color: GOLD_DARK });
  doc.textRight("QTÉ", M_X + 330, tableY + 13, { font: "bold", size: 8, color: GOLD_DARK });
  doc.textRight("P.U. (FCFA)", M_X + 410, tableY + 13, { font: "bold", size: 8, color: GOLD_DARK });
  doc.textRight("TOTAL (FCFA)", M_RIGHT - 8, tableY + 13, { font: "bold", size: 8, color: GOLD_DARK });

  doc.advance(22);

  // Lignes d'articles
  data.items.forEach((it, idx) => {
    doc.ensure(26);
    const rowY = doc.cursorY;
    if (idx % 2 === 1) {
      doc.rect(M_X, rowY - 2, CONTENT_W, 22, CREAM);
    }

    doc.text(it.label, M_X + 8, rowY + 11, {
      font: "bold",
      size: 8.5,
      color: INK,
      maxW: 280,
    });
    if (it.botanicals) {
      doc.text(it.botanicals, M_X + 8, rowY + 19, {
        size: 7,
        color: SOFT,
        maxW: 280,
      });
    }

    doc.textRight(String(it.qty), M_X + 330, rowY + 11, { font: "regular", size: 8.5, color: INK });
    doc.textRight(fmtAmount(it.unitPrice), M_X + 410, rowY + 11, { font: "regular", size: 8.5, color: INK });
    doc.textRight(fmtAmount(it.total), M_RIGHT - 8, rowY + 11, { font: "bold", size: 8.5, color: INK });

    doc.hline(M_X, M_RIGHT, rowY + 21, LINE, 0.4);
    doc.advance(24);
  });

  doc.advance(10);

  // 5. Bloc Récapitulatif Financier (Aligné à droite)
  doc.ensure(110);
  const finY = doc.cursorY;
  const finBoxW = 230;
  const finBoxX = M_RIGHT - finBoxW;

  doc.rect(finBoxX, finY, finBoxW, 94, CARD);
  doc.rectStroke(finBoxX, finY, finBoxW, 94, LINE, 0.6);

  let curFinY = finY + 14;

  // Sous-total
  doc.text("Sous-total brut", finBoxX + 10, curFinY, { size: 8.5, color: SOFT });
  doc.textRight(fmtFcfa(data.order.subtotal), M_RIGHT - 10, curFinY, { font: "regular", size: 8.5, color: INK });
  curFinY += 15;

  // Remise Coupon (si présente)
  if (data.order.discount > 0) {
    const couponLabel = data.order.couponCode ? `Remise (${data.order.couponCode})` : "Remise commerciale";
    doc.text(couponLabel, finBoxX + 10, curFinY, { size: 8.5, color: RED });
    doc.textRight(`-${fmtFcfa(data.order.discount)}`, M_RIGHT - 10, curFinY, { font: "bold", size: 8.5, color: RED });
    curFinY += 15;
  }

  // Frais de livraison urbaine
  if (data.order.shippingFee && data.order.shippingFee > 0) {
    doc.text("Livraison urbaine express", finBoxX + 10, curFinY, { size: 8.5, color: SOFT });
    doc.textRight(`+${fmtFcfa(data.order.shippingFee)}`, M_RIGHT - 10, curFinY, { font: "regular", size: 8.5, color: INK });
    curFinY += 15;
  }

  // Mention TVA UEMOA (18% incluse)
  const tvaEstimee = Math.round((data.order.total * 18) / 118);
  doc.text("Dont TVA 18% (UEMOA incluse)", finBoxX + 10, curFinY, { size: 7.5, color: SOFT });
  doc.textRight(fmtFcfa(tvaEstimee), M_RIGHT - 10, curFinY, { size: 7.5, color: SOFT });
  curFinY += 15;

  // Séparateur
  doc.hline(finBoxX + 8, M_RIGHT - 8, curFinY - 4, GOLD, 1);

  // Total TTC Payé
  doc.text("TOTAL NET PAYÉ", finBoxX + 10, curFinY + 4, { font: "bold", size: 10, color: GOLD_DARK });
  doc.textRight(fmtFcfa(data.order.total), M_RIGHT - 10, curFinY + 4, { font: "bold", size: 11, color: GOLD_DARK });

  // 6. Bloc Cashback fidélité (à gauche du récapitulatif)
  if (data.order.cashback > 0 && data.order.status !== "pending") {
    const cashBoxW = CONTENT_W - finBoxW - 14;
    doc.rect(M_X, finY, cashBoxW, 94, CREAM);
    doc.rectStroke(M_X, finY, cashBoxW, 94, GOLD, 0.6);

    doc.text("PROGRAMME FIDÉLITÉ & AVANTAGES KÈNÈ", M_X + 12, finY + 16, {
      font: "bold",
      size: 8,
      color: GOLD_DARK,
      letterSpace: 0.5,
    });

    doc.text("Cashback crédité sur le Wallet :", M_X + 12, finY + 34, {
      size: 8.5,
      color: INK,
    });
    doc.text(`+${fmtFcfa(data.order.cashback)}`, M_X + 12, finY + 52, {
      font: "bold",
      size: 14,
      color: GREEN,
    });
    doc.text("Ce montant est immédiatement utilisable pour vos", M_X + 12, finY + 68, {
      size: 7.5,
      color: SOFT,
    });
    doc.text("prochains soins en institut ou commandes boutique.", M_X + 12, finY + 79, {
      size: 7.5,
      color: SOFT,
    });
  }

  doc.advance(114);

  // 7. Mention légale et cachet de certification
  doc.ensure(64);
  const footY = doc.cursorY;
  doc.rect(M_X, footY, CONTENT_W, 46, CARD);
  doc.rectStroke(M_X, footY, CONTENT_W, 46, LINE, 0.5);

  doc.text("CERTIFICATION D'AUTHENTICITÉ & CONFORMITÉ KÈNÈ", M_X + 10, footY + 12, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.text(
    "Plateforme technologique éditée par Dermo TIC. Vente et délivrance des soins et cosmétiques assurées",
    M_X + 10,
    footY + 23,
    { size: 7, color: SOFT }
  );
  doc.text(
    "exclusivement par les établissements partenaires agréés, formulés selon les standards de la cosmétopée africaine.",
    M_X + 10,
    footY + 33,
    { size: 7, color: SOFT }
  );

  doc.textRight(
    "Validé via Kènè Platform (Dermo TIC)",
    M_RIGHT - 10,
    footY + 23,
    { font: "bold", size: 7.5, color: GREEN }
  );

  return doc.finish();
}
