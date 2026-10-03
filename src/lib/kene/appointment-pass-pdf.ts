// Kènè — Pass Rendez-Vous & Reçu d'Acompte Institut
// Moteur natif zéro dépendance (construit sur src/lib/accounting/pdf.ts)
// Document officiel de réservation A4 pour les soins en institut partenaire

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

export interface AppointmentPassData {
  appointment: {
    id: string;
    startAt: Date | string;
    durationMin: number;
    status: string;
    price: number;
    depositAmount: number;
    clientName: string;
    clientPhone: string;
    notes?: string | null;
  };
  service: {
    name: string;
    category: string;
    durationMin: number;
    price: number;
    description?: string | null;
  };
  tenant: {
    name: string;
    city: string;
    address?: string | null;
    phone?: string | null;
  };
  resource: {
    name: string;
    role: string;
  };
  user?: {
    id: string;
    name: string;
    phone: string;
    skinType?: string | null;
  } | null;
  payment?: {
    ref: string;
    method: string;
  } | null;
}

export interface AppointmentPassResult {
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

const fmtDate = (d: Date | string): string => {
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "—";
  return n.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

const fmtTime = (d: Date | string): string => {
  const n = new Date(d);
  if (Number.isNaN(n.getTime())) return "—";
  return n.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};

/**
 * Génère le Pass Rendez-Vous & Reçu d'acompte officiel.
 */
export function appointmentPassPdf(data: AppointmentPassData): AppointmentPassResult {
  const passCode = `RDV-${data.appointment.id.slice(-6).toUpperCase()}`;
  const doc = new PdfDoc(`Kènè Pro — Pass Rendez-Vous · ${passCode}`);
  doc.setFooter(
    `Kènè · Plateforme éditée par Dermo TIC · Soin dispensé exclusivement par ${data.tenant.name} · Pass ${passCode}`
  );

  // 1. En-tête officiel Kènè Pro
  const topY = doc.cursorY;
  doc.rect(M_X, topY, CONTENT_W, 58, GOLD);

  doc.text("KÈNÈ PRO", M_X + 16, topY + 22, {
    font: "bold",
    size: 20,
    color: CREAM,
    letterSpace: 3,
  });
  doc.text("RÉSEAU D'INSTITUTS & PRATICIENNES DE SANTÉ CUTANÉE", M_X + 16, topY + 36, {
    font: "bold",
    size: 7.5,
    color: CREAM,
    letterSpace: 0.8,
  });
  doc.text("Pass officiel certifié · Confirmation d'acompte", M_X + 16, topY + 48, {
    size: 7,
    color: CREAM,
  });

  // Bloc droite du Pass
  const rightX = M_RIGHT - 16;
  doc.textRight("PASS RENDEZ-VOUS CABINE", rightX, topY + 20, {
    font: "bold",
    size: 13,
    color: CREAM,
    letterSpace: 1,
  });
  doc.textRight(passCode, rightX, topY + 34, {
    font: "bold",
    size: 11,
    color: CREAM,
  });
  doc.textRight(data.appointment.status.toUpperCase(), rightX, topY + 47, {
    font: "bold",
    size: 8,
    color: CREAM,
  });

  doc.advance(70);

  // 2. Encart signature « Créneau réservé » (Mise en valeur or)
  const slotY = doc.cursorY;
  doc.rect(M_X, slotY, CONTENT_W, 44, CREAM);
  doc.rectStroke(M_X, slotY, CONTENT_W, 44, GOLD, 1);

  doc.text("CRÉNEAU CONFIRMÉ", M_X + 14, slotY + 15, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 1,
  });

  const dateStr = fmtDate(data.appointment.startAt);
  const timeStr = fmtTime(data.appointment.startAt);
  const dateFull = `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)} à ${timeStr}`;
  doc.text(dateFull, M_X + 14, slotY + 32, {
    font: "bold",
    size: 13,
    color: INK,
  });

  doc.textRight(`Durée estimée : ${data.appointment.durationMin} minutes`, M_RIGHT - 14, slotY + 32, {
    font: "bold",
    size: 9.5,
    color: GOLD_DARK,
  });

  doc.advance(56);

  // 3. Détails Institut & Praticienne + Soin (Deux colonnes)
  const infoY = doc.cursorY;
  const colW = (CONTENT_W - 14) / 2;

  // Colonne Gauche : Institut & Praticienne
  doc.rect(M_X, infoY, colW, 86, CARD);
  doc.rectStroke(M_X, infoY, colW, 86, LINE, 0.5);

  doc.text("INSTITUT & PRATICIENNE", M_X + 10, infoY + 14, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.text(data.tenant.name, M_X + 10, infoY + 28, { font: "bold", size: 10, color: INK });
  doc.text(data.tenant.address ?? `Ville : ${data.tenant.city}`, M_X + 10, infoY + 41, { size: 8, color: SOFT, maxW: colW - 20 });
  if (data.tenant.phone) {
    doc.text(`Tél : ${data.tenant.phone}`, M_X + 10, infoY + 53, { size: 8, color: SOFT });
  }

  doc.hline(M_X + 10, M_X + colW - 10, infoY + 62, LINE, 0.4);
  doc.text(`Praticienne : ${data.resource.name} (${data.resource.role})`, M_X + 10, infoY + 74, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
  });

  // Colonne Droite : Prestation & Cliente
  const clientX = M_X + colW + 14;
  doc.rect(clientX, infoY, colW, 86, CARD);
  doc.rectStroke(clientX, infoY, colW, 86, LINE, 0.5);

  doc.text("SOIN RÉSERVÉ & BÉNÉFICIAIRE", clientX + 10, infoY + 14, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.text(data.service.name, clientX + 10, infoY + 28, { font: "bold", size: 10, color: INK });
  doc.text(`Catégorie : ${data.service.category.toUpperCase()}`, clientX + 10, infoY + 41, { size: 8, color: SOFT });

  doc.hline(clientX + 10, clientX + colW - 10, infoY + 50, LINE, 0.4);
  doc.text(`Cliente : ${data.appointment.clientName}`, clientX + 10, infoY + 62, { font: "bold", size: 8.5, color: INK });
  doc.text(`Tél : ${data.appointment.clientPhone}`, clientX + 10, infoY + 74, { size: 8, color: SOFT });

  doc.advance(98);

  // 4. Bilan Financier (Tarif soin, Acompte réglé, Reste dû sur place)
  doc.ensure(85);
  const finY = doc.cursorY;
  doc.rect(M_X, finY, CONTENT_W, 68, CARD);
  doc.rectStroke(M_X, finY, CONTENT_W, 68, LINE, 0.7);

  doc.rect(M_X, finY, CONTENT_W, 20, GOLD_BAND);
  doc.text("RÉCAPITULATIF FINANCIER DE LA PRESTATION", M_X + 10, finY + 13, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  const row1Y = finY + 33;
  doc.text("Tarif de la prestation", M_X + 14, row1Y, { size: 8.5, color: SOFT });
  doc.textRight(fmtFcfa(data.service.price), M_RIGHT - 14, row1Y, { font: "bold", size: 9, color: INK });

  const row2Y = finY + 46;
  const payMethodText = data.payment?.method ? ` (${data.payment.method.toUpperCase()})` : "";
  doc.text(`Acompte de confirmation réglé${payMethodText}`, M_X + 14, row2Y, { size: 8.5, color: GREEN });
  doc.textRight(`-${fmtFcfa(data.appointment.depositAmount)} [ACQUITTÉ]`, M_RIGHT - 14, row2Y, {
    font: "bold",
    size: 9,
    color: GREEN,
  });

  const remaining = Math.max(0, data.service.price - data.appointment.depositAmount);
  const row3Y = finY + 59;
  doc.hline(M_X + 10, M_RIGHT - 10, row3Y - 5, LINE, 0.5);
  doc.text("SOLDE RESTANT À RÉGLER SUR PLACE EN CABINE", M_X + 14, row3Y + 3, {
    font: "bold",
    size: 9,
    color: GOLD_DARK,
  });
  doc.textRight(fmtFcfa(remaining), M_RIGHT - 14, row3Y + 3, {
    font: "bold",
    size: 10.5,
    color: GOLD_DARK,
  });

  doc.advance(80);

  // 5. Consignes pour la séance en cabine
  doc.ensure(70);
  const guideY = doc.cursorY;
  doc.rect(M_X, guideY, CONTENT_W, 60, CARD);
  doc.rectStroke(M_X, guideY, CONTENT_W, 60, LINE, 0.5);

  doc.text("CONSIGNES & RECOMMANDATIONS POUR VOTRE SOIN", M_X + 10, guideY + 14, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  doc.text("• Arrivée recommandée : Merci de vous présenter 10 minutes avant l'heure prévue pour l'accueil.", M_X + 10, guideY + 26, { size: 7.5, color: INK });
  doc.text("• Préparation de la peau : Évitez tout gommage ou acide fort dans les 24h précédant votre rendez-vous.", M_X + 10, guideY + 37, { size: 7.5, color: INK });
  doc.text("• Modification ou report : Possible sans frais jusqu'à 24h avant le créneau depuis l'application Kènè.", M_X + 10, guideY + 48, { size: 7.5, color: INK });

  doc.advance(72);

  // 6. Bloc de validation accueil
  doc.ensure(54);
  const checkY = doc.cursorY;
  doc.rect(M_X, checkY, CONTENT_W, 42, CREAM);
  doc.rectStroke(M_X, checkY, CONTENT_W, 42, GOLD, 0.7);

  doc.text("VALIDATION À L'ACCUEIL DU SALON", M_X + 12, checkY + 15, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });
  doc.text(
    `Présentez ce pass sur votre smartphone ou imprimé. Code de contrôle : ${passCode}`,
    M_X + 12,
    checkY + 29,
    { font: "bold", size: 8, color: INK }
  );

  doc.textRight("Validé par Kènè Platform (Dermo TIC)", M_RIGHT - 12, checkY + 22, {
    font: "bold",
    size: 7.5,
    color: GREEN,
  });

  return doc.finish();
}
