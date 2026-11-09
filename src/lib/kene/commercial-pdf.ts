// Kènè Pro — Moteur de génération PDF natif pour supports commerciaux & marketing d'impression.
// Construit sur le moteur zero-dependency PdfDoc (src/lib/accounting/pdf.ts).
// Génère des fichiers PDF imprimables vectoriels aux standards imprimerie :
// 1. FLYER A5 : « Votre Peau Mérite la Vérité » (Bilan Cutané Cabine & Rituels Botaniques)
// 2. PASS DÉCOUVERTE A6 : Carte d'invitation privilège & diagnostic offert
// 3. CARTE PARRAINAGE & VIP (85x55mm format standard carte de visite/fidélité)
// 4. ATTESTATION D'AGRÉMENT OFFICIEL A4 : Label d'excellence Institut Partenaire

import fs from "fs";
import path from "path";
import {
  PdfDoc,
  textWidth,
  wrapText,
  INK,
  SOFT,
  BISSAP,
  BISSAP_DARK,
  BISSAP_SOFT,
  GOLD,
  GOLD_DARK,
  GOLD_BAND,
  TERRE,
  GREEN,
  KARITE,
  CARD,
  LINE,
  M_X,
  M_RIGHT,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
  type RGB,
} from "@/lib/accounting/pdf";

export type CommercialDocType = "flyer-a5" | "pass-a6" | "parrainage-carte" | "attestation-a4" | "manuel-pro";

export interface CommercialPdfOptions {
  type: CommercialDocType;
  tenantName: string;
  tenantCity?: string | null;
  tenantPhone?: string | null;
  tenantAddress?: string | null;
  referralCode?: string;
  appUrl?: string;
}

export interface CommercialPdfResult {
  data: Uint8Array;
  filename: string;
}

export function generateCommercialPdf(options: CommercialPdfOptions): CommercialPdfResult {
  const tenantName = options.tenantName || "Institut Partenaire";
  const tenantCity = options.tenantCity || "Abidjan";
  const tenantPhone = options.tenantPhone || "+225 07 00 00 00 00";
  const tenantAddress = options.tenantAddress || "Plateau / Cocody";
  const referralCode = options.referralCode || "KENE-VIP-2026";
  const appUrl = options.appUrl || "https://kene-beaute.com";
  const type = options.type;

  const doc = new PdfDoc(`Kènè Pro — Support Commercial (${type})`);
  doc.setFooter(`Kènè Technologies SAS · Support Officiel Partenaire · ${tenantName}`);

  if (type === "flyer-a5") {
    buildFlyerA5(doc, { tenantName, tenantCity, tenantPhone, tenantAddress, appUrl });
    return {
      data: doc.finish().data,
      filename: `kene-flyer-a5-${sanitize(tenantName)}.pdf`,
    };
  }

  if (type === "pass-a6") {
    buildPassA6(doc, { tenantName, tenantCity, tenantPhone, referralCode, appUrl });
    return {
      data: doc.finish().data,
      filename: `kene-pass-decouverte-a6-${sanitize(tenantName)}.pdf`,
    };
  }

  if (type === "parrainage-carte") {
    buildParrainageCarte(doc, { tenantName, tenantCity, tenantPhone, referralCode, appUrl });
    return {
      data: doc.finish().data,
      filename: `kene-carte-parrainage-${sanitize(tenantName)}.pdf`,
    };
  }

  if (type === "manuel-pro") {
    buildManuelPro(doc, { tenantName, tenantCity, tenantPhone, appUrl });
    return {
      data: doc.finish().data,
      filename: `kene-manuel-utilisation-${sanitize(tenantName)}.pdf`,
    };
  }

  // Fallback / Attestation A4
  buildAttestationA4(doc, { tenantName, tenantCity, tenantPhone, tenantAddress });
  return {
    data: doc.finish().data,
    filename: `kene-attestation-agrement-${sanitize(tenantName)}.pdf`,
  };
}

function sanitize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "institut";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. FLYER A5 : BILAN CABINE & BOTANIQUE (Rendu sur page A4 avec repères de coupe)
// ─────────────────────────────────────────────────────────────────────────────
function buildFlyerA5(
  doc: PdfDoc,
  data: { tenantName: string; tenantCity: string | null; tenantPhone: string; tenantAddress: string; appUrl: string }
) {
  // En-tête Flyer
  const startY = 40;
  doc.rect(M_X, startY, CONTENT_W, 110, KARITE);
  doc.rectStroke(M_X, startY, CONTENT_W, 110, GOLD, 1.2);
  doc.drawBrandRibbon(M_X, startY, CONTENT_W, 4);

  doc.text("KENE BEAUTE & BIEN-ETRE", M_X + 20, startY + 28, {
    font: "bold",
    size: 16,
    color: GOLD_DARK,
    letterSpace: 1.2,
  });
  doc.text(`INSTITUT PARTENAIRE AGREE · ${data.tenantName.toUpperCase()}`, M_X + 20, startY + 44, {
    font: "bold",
    size: 9,
    color: BISSAP_DARK,
    letterSpace: 0.5,
  });
  doc.text(
    `Prestations Dermo-Cosmetiques Certifiees & Bilan d'Epiderme Haute Precision · ${data.tenantCity || "Abidjan"}`,
    M_X + 20,
    startY + 58,
    { font: "regular", size: 8.5, color: SOFT }
  );

  // Badge Offre
  doc.rect(M_RIGHT - 165, startY + 22, 145, 26, BISSAP);
  doc.text("BILAN DE PEAU OFFERT", M_RIGHT - 157, startY + 38, {
    font: "bold",
    size: 9.5,
    color: [1, 1, 1],
    letterSpace: 0.5,
  });

  // Titre d'accroche percutant
  let y = startY + 130;
  doc.text("VOTRE PEAU MERITE LA VERITE SCIENTIFIQUE", M_X, y, {
    font: "bold",
    size: 15,
    color: INK,
    letterSpace: 0.8,
  });
  y += 18;
  doc.text(
    "Fini les devinettes cosmetiques et les produits inadaptes. Venez decouvrir la sante reelle de votre visage.",
    M_X,
    y,
    { font: "regular", size: 9.5, color: SOFT }
  );

  // 3 Colonnes de piliers cliniques
  y += 24;
  const colW = (CONTENT_W - 20) / 3;

  // Pilier 1
  doc.rect(M_X, y, colW, 115, CARD);
  doc.rectStroke(M_X, y, colW, 115, LINE, 0.8);
  doc.rect(M_X, y, colW, 4, BISSAP);
  doc.text("[1] SCANNER CUTANE", M_X + 10, y + 20, { font: "bold", size: 10, color: BISSAP_DARK });
  doc.text("Diagnostic Instantane", M_X + 10, y + 34, { font: "bold", size: 8.5, color: INK });
  doc.text("Cartographie complete en", M_X + 10, y + 50, { font: "regular", size: 8, color: SOFT });
  doc.text("10 secondes : analyse des", M_X + 10, y + 62, { font: "regular", size: 8, color: SOFT });
  doc.text("taches, hydratation,", M_X + 10, y + 74, { font: "regular", size: 8, color: SOFT });
  doc.text("sebum et pores melanes.", M_X + 10, y + 86, { font: "regular", size: 8, color: SOFT });
  doc.text("Score Eclat /100", M_X + 10, y + 102, { font: "bold", size: 8, color: GOLD_DARK });

  // Pilier 2
  const x2 = M_X + colW + 10;
  doc.rect(x2, y, colW, 115, CARD);
  doc.rectStroke(x2, y, colW, 115, LINE, 0.8);
  doc.rect(x2, y, colW, 4, GOLD);
  doc.text("[2] SOINS CABINE", x2 + 10, y + 20, { font: "bold", size: 10, color: GOLD_DARK });
  doc.text("Rituels d'Excellence", x2 + 10, y + 34, { font: "bold", size: 8.5, color: INK });
  doc.text("Rituels botaniques purs :", x2 + 10, y + 50, { font: "regular", size: 8, color: SOFT });
  doc.text("Karite brut sauvage,", x2 + 10, y + 62, { font: "regular", size: 8, color: SOFT });
  doc.text("Baobab, Moringa d'Afrique.", x2 + 10, y + 74, { font: "regular", size: 8, color: SOFT });
  doc.text("Praticiennes formees aux", x2 + 10, y + 86, { font: "regular", size: 8, color: SOFT });
  doc.text("phototypes IV a VI.", x2 + 10, y + 98, { font: "regular", size: 8, color: SOFT });

  // Pilier 3
  const x3 = x2 + colW + 10;
  doc.rect(x3, y, colW, 115, CARD);
  doc.rectStroke(x3, y, colW, 115, LINE, 0.8);
  doc.rect(x3, y, colW, 4, GREEN);
  doc.text("[3] SUIVI KENE+ VIP", x3 + 10, y + 20, { font: "bold", size: 10, color: GREEN });
  doc.text("30 Jours Inclus", x3 + 10, y + 34, { font: "bold", size: 8.5, color: INK });
  doc.text("Votre passeport de peau", x3 + 10, y + 50, { font: "regular", size: 8, color: SOFT });
  doc.text("sur votre smartphone :", x3 + 10, y + 62, { font: "regular", size: 8, color: SOFT });
  doc.text("routine personnalisee,", x3 + 10, y + 74, { font: "regular", size: 8, color: SOFT });
  doc.text("detecteur de faux cosmetiques", x3 + 10, y + 86, { font: "regular", size: 8, color: SOFT });
  doc.text("& suivi hebdomadaire.", x3 + 10, y + 98, { font: "regular", size: 8, color: SOFT });

  // Encadré Invitation & Coupon Détachable
  y += 135;
  doc.rect(M_X, y, CONTENT_W, 130, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 130, GOLD, 1.2);

  // Ligne pointillée de découpe
  doc.hline(M_X + 15, M_RIGHT - 15, y + 1, GOLD, 0.8);

  doc.text("BON PRIVILEGE INSTITUT · VALABLE DES AUJOURD'HUI", M_X + 20, y + 22, {
    font: "bold",
    size: 11,
    color: GOLD_DARK,
    letterSpace: 0.8,
  });

  doc.text("Presentez ce flyer a l'accueil du salon pour profiter de :", M_X + 20, y + 38, {
    font: "bold",
    size: 9,
    color: INK,
  });
  doc.text("[x] Votre Bilan Dermo-Biometrique complet offert (valeur habituelle 10 000 FCFA)", M_X + 25, y + 52, {
    font: "regular",
    size: 8.5,
    color: BISSAP_DARK,
  });
  doc.text("[x] -15% de reduction immediate sur votre premier soin cabine d'excellence", M_X + 25, y + 64, {
    font: "regular",
    size: 8.5,
    color: INK,
  });
  doc.text("[x] Votre ordonnance de soins botaniques personnalisee remise par la praticienne", M_X + 25, y + 76, {
    font: "regular",
    size: 8.5,
    color: INK,
  });

  // Coordonnées & Prise de RDV
  doc.rect(M_X + 20, y + 88, CONTENT_W - 40, 32, CARD);
  doc.rectStroke(M_X + 20, y + 88, CONTENT_W - 40, 32, LINE, 0.7);

  doc.text(`SALON : ${data.tenantName.toUpperCase()} · ${data.tenantCity || "ABIDJAN"}`, M_X + 30, y + 102, {
    font: "bold",
    size: 8.5,
    color: INK,
  });
  doc.text(`CONTACT & RDV : ${data.tenantPhone}  |  ADRESSE : ${data.tenantAddress}`, M_X + 30, y + 114, {
    font: "regular",
    size: 8,
    color: SOFT,
  });

  // Signature & Mention légale
  y += 145;
  doc.text(
    "Kene Technologies · 100% sans hydroquinone, sans corticoides, sans mercure · Ethique dermo-botanique africaine.",
    M_X,
    y,
    { font: "oblique", size: 7.5, color: SOFT }
  );
  doc.textRight(`Lien d'acces direct : ${data.appUrl.replace(/^https?:\/\//, "")}`, M_RIGHT, y, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PASS DÉCOUVERTE A6 : INVITATION & DIAGNOSTIC DE SORTIE
// ─────────────────────────────────────────────────────────────────────────────
function buildPassA6(
  doc: PdfDoc,
  data: { tenantName: string; tenantCity: string | null; tenantPhone: string; referralCode: string; appUrl: string }
) {
  const startY = 40;
  const passW = CONTENT_W;
  const passH = 250;

  // Fond du Pass
  doc.rect(M_X, startY, passW, passH, CARD);
  doc.rectStroke(M_X, startY, passW, passH, GOLD, 1.5);
  doc.drawBrandRibbon(M_X, startY, passW, 4);

  // En-tête du Pass
  doc.text("KENE VIP · PASS DECOUVERTE & SUIVI", M_X + 20, startY + 28, {
    font: "bold",
    size: 13,
    color: GOLD_DARK,
    letterSpace: 1,
  });
  doc.text(`Etabli par : ${data.tenantName.toUpperCase()} (${data.tenantCity || "Abidjan"})`, M_X + 20, startY + 42, {
    font: "bold",
    size: 8.5,
    color: INK,
  });

  // Badge Privilège
  doc.rect(M_RIGHT - 130, startY + 18, 115, 22, GOLD_BAND);
  doc.rectStroke(M_RIGHT - 130, startY + 18, 115, 22, GOLD, 0.8);
  doc.text("30 JOURS OFFERTS", M_RIGHT - 120, startY + 32, {
    font: "bold",
    size: 8.5,
    color: GOLD_DARK,
  });

  // Ligne de séparation
  doc.hline(M_X + 20, M_RIGHT - 20, startY + 52, LINE, 0.8);

  // Cadre d'écriture manuelle pour la praticienne
  let y = startY + 68;
  doc.text("RELEVE DE VOTRE CONSULTATION EN CABINE :", M_X + 20, y, {
    font: "bold",
    size: 9.5,
    color: BISSAP_DARK,
  });

  y += 18;
  doc.text("Nom de la Cliente : _______________________________________________", M_X + 20, y, {
    font: "regular",
    size: 8.5,
    color: INK,
  });

  y += 18;
  doc.text("Score Sante Peau : [       / 100 ]     |     Hydratation : [       % ]", M_X + 20, y, {
    font: "bold",
    size: 8.5,
    color: GOLD_DARK,
  });

  y += 18;
  doc.text("Besoin Principal : [  ] Taches & Eclat   [  ] Hydratation   [  ] Sebum & Pores   [  ] Barriere", M_X + 20, y, {
    font: "regular",
    size: 8,
    color: INK,
  });

  y += 18;
  doc.text("Soin recommande a domicile : ________________________________________", M_X + 20, y, {
    font: "regular",
    size: 8.5,
    color: INK,
  });

  y += 18;
  doc.text("Prochain rendez-vous de controle : _____ / _____ / 2026 a _____ h _____", M_X + 20, y, {
    font: "bold",
    size: 8.5,
    color: BISSAP_DARK,
  });

  // Encadré Code d'activation Kènè+
  y += 28;
  doc.rect(M_X + 20, y, passW - 40, 52, KARITE);
  doc.rectStroke(M_X + 20, y, passW - 40, 52, GOLD, 1);

  doc.text("ACTIVATION DE VOTRE APPLICATION KENE (OFFERTE PAR LE SALON) :", M_X + 30, y + 16, {
    font: "bold",
    size: 8.5,
    color: GOLD_DARK,
  });
  doc.text(`1. Rendez-vous sur : ${data.appUrl.replace(/^https?:\/\//, "")}`, M_X + 30, y + 28, {
    font: "bold",
    size: 8,
    color: INK,
  });
  doc.text(
    `2. Renseignez votre code privilege : [ ${data.referralCode} ] pour activer vos 30 jours`,
    M_X + 30,
    y + 40,
    { font: "bold", size: 8, color: BISSAP_DARK }
  );

  // Bas de pass
  y += 66;
  doc.text(`Contact salon : ${data.tenantPhone}  ·  Conservez precieusement cette carte pour vos visites.`, M_X + 20, y, {
    font: "oblique",
    size: 7.5,
    color: SOFT,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CARTE PARRAINAGE & VIP (Grille de 4 cartes format 85x55mm découpables)
// ─────────────────────────────────────────────────────────────────────────────
function buildParrainageCarte(
  doc: PdfDoc,
  data: { tenantName: string; tenantCity: string | null; tenantPhone: string; referralCode: string; appUrl: string }
) {
  doc.text("PLANCHE D'IMPRESSION · 4 CARTES PARRAINAGE & FIDELITE VIP (85 x 55 mm)", M_X, 35, {
    font: "bold",
    size: 11,
    color: GOLD_DARK,
    letterSpace: 0.8,
  });
  doc.text("Imprimez sur papier epais (250g - 350g), decoupez selon les repere traits pleins.", M_X, 48, {
    font: "regular",
    size: 8,
    color: SOFT,
  });

  const cardW = 230;
  const cardH = 150;
  const gapX = 40;
  const gapY = 30;

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x = M_X + col * (cardW + gapX);
      const y = 70 + row * (cardH + gapY);

      // Fond de carte
      doc.rect(x, y, cardW, cardH, CARD);
      doc.rectStroke(x, y, cardW, cardH, GOLD, 1.2);
      doc.drawBrandRibbon(x, y, cardW, 3);

      // Titre
      doc.text("KENE BEAUTE", x + 12, y + 20, { font: "bold", size: 10, color: GOLD_DARK, letterSpace: 1 });
      doc.text("CARTE PRIVILEGE & PARRAINAGE", x + 12, y + 32, { font: "bold", size: 7.5, color: BISSAP_DARK });

      // Offre
      doc.rect(x + 12, y + 40, cardW - 24, 28, KARITE);
      doc.rectStroke(x + 12, y + 40, cardW - 24, 28, LINE, 0.7);
      doc.text("-5 000 FCFA POUR VOUS & VOTRE AMIE", x + 18, y + 53, { font: "bold", size: 8, color: GOLD_DARK });
      doc.text("Valable des 20 000 FCFA de soins chez :", x + 18, y + 63, { font: "regular", size: 7, color: SOFT });

      // Salon
      doc.text(data.tenantName.toUpperCase(), x + 12, y + 80, { font: "bold", size: 8, color: INK });
      doc.text(`Tel : ${data.tenantPhone}`, x + 12, y + 90, { font: "regular", size: 7, color: SOFT });

      // Remplissage manuscrit
      doc.hline(x + 12, x + cardW - 12, y + 102, LINE, 0.5);
      doc.text("Offert de la part de : ________________________", x + 12, y + 112, {
        font: "regular",
        size: 7,
        color: INK,
      });
      doc.text("A l'attention de : ____________________________", x + 12, y + 124, {
        font: "regular",
        size: 7,
        color: INK,
      });

      // Code
      doc.text(`Code : ${data.referralCode} · ${data.appUrl.replace(/^https?:\/\//, "")}`, x + 12, y + 140, {
        font: "bold",
        size: 6.5,
        color: GOLD_DARK,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. ATTESTATION D'AGRÉMENT OFFICIEL A4 (Pour cadre mural dans l'institut)
// ─────────────────────────────────────────────────────────────────────────────
function buildAttestationA4(
  doc: PdfDoc,
  data: { tenantName: string; tenantCity: string | null; tenantPhone: string; tenantAddress: string }
) {
  const startY = 40;
  doc.rect(M_X, startY, CONTENT_W, PAGE_H - 100, KARITE);
  doc.rectStroke(M_X, startY, CONTENT_W, PAGE_H - 100, GOLD, 2);
  doc.rectStroke(M_X + 6, startY + 6, CONTENT_W - 12, PAGE_H - 112, LINE, 0.8);
  doc.drawBrandRibbon(M_X + 6, startY + 6, CONTENT_W - 12, 5);

  let y = startY + 45;
  doc.text("REPUBLIQUE DE COTE D'IVOIRE", M_X + 40, y, {
    font: "bold",
    size: 9,
    color: SOFT,
    letterSpace: 1.5,
  });
  y += 18;
  doc.text("ECOSYSTEME DERMO-BOTANIQUE AFRICAIN KENE", M_X + 40, y, {
    font: "bold",
    size: 13,
    color: GOLD_DARK,
    letterSpace: 1,
  });

  y += 40;
  doc.text("ATTESTATION D'AGREMENT OFFICIEL", M_X + 40, y, {
    font: "bold",
    size: 18,
    color: BISSAP_DARK,
    letterSpace: 1.2,
  });
  y += 16;
  doc.text("LABEL QUALITE & SECURITE CUTANEE KENE PRO 2026", M_X + 40, y, {
    font: "bold",
    size: 10,
    color: GOLD_DARK,
  });

  y += 45;
  doc.text("La Direction de Kene Technologies SAS certifie par la presente que l'etablissement :", M_X + 40, y, {
    font: "regular",
    size: 10,
    color: INK,
  });

  y += 28;
  doc.rect(M_X + 40, y, CONTENT_W - 80, 52, CARD);
  doc.rectStroke(M_X + 40, y, CONTENT_W - 80, 52, GOLD, 1.2);
  doc.text(data.tenantName.toUpperCase(), M_X + 60, y + 25, {
    font: "bold",
    size: 14,
    color: INK,
    letterSpace: 0.8,
  });
  doc.text(`Situe a : ${data.tenantAddress} · ${data.tenantCity || "Abidjan"} · Tel : ${data.tenantPhone}`, M_X + 60, y + 40, {
    font: "regular",
    size: 8.5,
    color: SOFT,
  });

  y += 75;
  doc.text("Est officiellement agree comme INSTITUT PARTENAIRE KENE CERTIFIE.", M_X + 40, y, {
    font: "bold",
    size: 10.5,
    color: BISSAP_DARK,
  });
  y += 18;
  doc.text(
    "A ce titre, les praticiennes ont ete auditees et formees a la delivrance des bilans dermo-biometriques",
    M_X + 40,
    y,
    { font: "regular", size: 9, color: INK }
  );
  y += 14;
  doc.text(
    "et a l'application stricte de la charte de deontologie cosmeceutique africaine :",
    M_X + 40,
    y,
    { font: "regular", size: 9, color: INK }
  );

  y += 26;
  const engagements = [
    "[1] ZERO DEPIGMENTATION : Interdiction stricte de l'hydroquinone, corticoides et derives mercuriels.",
    "[2] TRAILBOTANIQUE CERTIFIEE : Formulations a base de Karite sauvage, Baobab et Moringa d'Afrique.",
    "[3] TRANSPARENCE DIAGNOSTIQUE : Remise systematique du score de peau et de l'ordonnance personnalisee.",
    "[4] CONFORMITE COMMERCIALE & COMPTABLE : Tickets de caisse et registre aux normes SYSCOHADA.",
  ];

  for (const eng of engagements) {
    doc.text(eng, M_X + 45, y, { font: "bold", size: 8.5, color: INK });
    y += 18;
  }

  // Signatures et Sceau
  y += 60;
  doc.hline(M_X + 40, M_RIGHT - 40, y, LINE, 0.8);
  y += 20;

  doc.text("Fait pour servir et valoir ce que de droit.", M_X + 40, y, { font: "oblique", size: 8.5, color: SOFT });

  y += 25;
  doc.text("Pour KENE TECHNOLOGIES SAS", M_X + 40, y, { font: "bold", size: 9.5, color: GOLD_DARK });
  doc.text("Dr. A. Traore, Directeur Scientifique", M_X + 40, y + 14, { font: "regular", size: 8.5, color: SOFT });
  doc.text("Cachet electronique certifie SHA-256", M_X + 40, y + 26, { font: "oblique", size: 7.5, color: GREEN });

  doc.textRight("Pour L'INSTITUT PARTENAIRE", M_RIGHT - 40, y, { font: "bold", size: 9.5, color: INK });
  doc.textRight("La Direction / Gerante", M_RIGHT - 40, y + 14, { font: "regular", size: 8.5, color: SOFT });
  doc.textRight("Signature & Cachet de l'etablissement", M_RIGHT - 40, y + 26, { font: "oblique", size: 7.5, color: SOFT });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MANUEL D'UTILISATION OFFICIEL A4 (Multi-pages haute définition)
// ─────────────────────────────────────────────────────────────────────────────
function buildManuelPro(
  doc: PdfDoc,
  data: { tenantName: string; tenantCity: string | null; tenantPhone: string; appUrl: string }
) {
  try {
    const screensDir = path.join(process.cwd(), "public", "docs", "manual-screens");
    const dashPath = path.join(screensDir, "screen-dashboard.jpg");
    const connPath = path.join(screensDir, "screen-connexion.jpg");
    const dermoPath = path.join(screensDir, "screen-dermo.jpg");
    const inciPath = path.join(screensDir, "screen-inci.jpg");
    const rdvPath = path.join(screensDir, "screen-rdv.jpg");

    if (fs.existsSync(dashPath)) {
      doc.addImage("img_dashboard", new Uint8Array(fs.readFileSync(dashPath)), 900, 563);
    }
    if (fs.existsSync(connPath)) {
      doc.addImage("img_connexion", new Uint8Array(fs.readFileSync(connPath)), 900, 563);
    }
    if (fs.existsSync(dermoPath)) {
      doc.addImage("img_dermo", new Uint8Array(fs.readFileSync(dermoPath)), 900, 563);
    }
    if (fs.existsSync(inciPath)) {
      doc.addImage("img_inci", new Uint8Array(fs.readFileSync(inciPath)), 900, 563);
    }
    if (fs.existsSync(rdvPath)) {
      doc.addImage("img_rdv", new Uint8Array(fs.readFileSync(rdvPath)), 900, 563);
    }
  } catch {}

  const HALF_W = (CONTENT_W - 14) / 2;
  const HALF_H = 92;

  // PAGE 1 : COUVERTURE & VOLUME 1 (CABINE & CONSULTATION)
  let y = 35;
  doc.rect(M_X, y, CONTENT_W, 110, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 110, GOLD, 1.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 5);

  doc.text("KENE PRO 2026", M_X + 20, y + 30, {
    font: "bold",
    size: 19,
    color: GOLD_DARK,
    letterSpace: 2,
  });
  doc.text("MANUEL DE MAITRISE DERMO-COSMETIQUE, CONSULTATION & GESTION", M_X + 20, y + 46, {
    font: "bold",
    size: 9.5,
    color: BISSAP_DARK,
    letterSpace: 0.5,
  });
  doc.hline(M_X + 20, M_RIGHT - 20, y + 54, GOLD, 0.8);

  doc.text("DOCUMENT OFFICIEL CONFIDENTIEL · ACCREDITATION 2026", M_X + 20, y + 68, {
    font: "bold",
    size: 8,
    color: GOLD_DARK,
    letterSpace: 1,
  });
  doc.text(`Etablissement Partenaire Titulaire : ${data.tenantName.toUpperCase()}`, M_X + 20, y + 82, {
    font: "bold",
    size: 9.5,
    color: INK,
  });
  doc.text(`Localisation : ${data.tenantCity || "Abidjan"} · Courriel Direction : contact@kene-beaute.com`, M_X + 20, y + 96, {
    font: "regular",
    size: 8.5,
    color: SOFT,
  });

  y = 160;
  doc.text("VOLUME 1 : GUIDE PRATICIENNE · CABINE, CONSULTATION & DIAGNOSTIC", M_X, y, { font: "bold", size: 10.5, color: BISSAP_DARK });
  doc.hline(M_X, M_RIGHT, y + 5, GOLD, 1.2);

  const xRight = M_X + HALF_W + 14;

  // 1. Connexion
  y += 16;
  doc.rect(M_X, y, HALF_W, HALF_H, CARD);
  doc.rectStroke(M_X, y, HALF_W, HALF_H, GOLD, 0.7);
  doc.text("1. CONNEXION & POINTAGE DU PERSONNEL", M_X + 10, y + 16, { font: "bold", size: 8, color: GOLD_DARK });
  doc.text("- Connexion : kene-beaute.com/pro avec PIN cabine.", M_X + 10, y + 29, { font: "regular", size: 7, color: INK });
  doc.text("- Arrivee : Cliquez sur [Pointer mon arrivee].", M_X + 10, y + 40, { font: "regular", size: 7, color: INK });
  doc.text("  L'heure est horodatee sur le registre RH.", M_X + 10, y + 50, { font: "regular", size: 7, color: INK });
  doc.text("- Depart : Validation des heures et primes du jour.", M_X + 10, y + 62, { font: "regular", size: 7, color: SOFT });

  doc.rect(xRight - 1, y - 1, HALF_W + 2, HALF_H + 2, KARITE);
  doc.rectStroke(xRight - 1, y - 1, HALF_W + 2, HALF_H + 2, GOLD, 0.8);
  doc.drawImage("img_connexion", xRight, y, HALF_W, HALF_H - 12);
  doc.text("ECRAN 1 : PORTAIL PRO & POINTAGE HORODATE", xRight + 6, y + HALF_H - 3, { font: "bold", size: 6, color: GOLD_DARK });

  // 2. Consultation & Bilan
  y += HALF_H + 12;
  doc.rect(M_X, y, HALF_W, HALF_H, CARD);
  doc.rectStroke(M_X, y, HALF_W, HALF_H, GOLD, 0.7);
  doc.text("2. CONSULTATION & BILAN DERMO CABINE", M_X + 10, y + 16, { font: "bold", size: 8, color: GOLD_DARK });
  doc.text("- Anamnese : Questionnaire cutane complet.", M_X + 10, y + 29, { font: "regular", size: 7, color: INK });
  doc.text("- Scan 3 cliches : Face, Profil Droit, Profil Gauche.", M_X + 10, y + 40, { font: "regular", size: 7, color: INK });
  doc.text("- Phototypes IV a VI : Score Eclat /100, taches PIH,", M_X + 10, y + 51, { font: "regular", size: 7, color: INK });
  doc.text("  taux d'hydratation et indice de sebum cutane.", M_X + 10, y + 62, { font: "regular", size: 7, color: SOFT });

  doc.rect(xRight - 1, y - 1, HALF_W + 2, HALF_H + 2, KARITE);
  doc.rectStroke(xRight - 1, y - 1, HALF_W + 2, HALF_H + 2, GOLD, 0.8);
  doc.drawImage("img_dermo", xRight, y, HALF_W, HALF_H - 12);
  doc.text("ECRAN 2 : DIAGNOSTIC DERMO-CUTANE SUR TABLETTE", xRight + 6, y + HALF_H - 3, { font: "bold", size: 6, color: GOLD_DARK });

  // 3. Fiche Consultation & INCI
  y += HALF_H + 12;
  doc.rect(M_X, y, HALF_W, HALF_H, CARD);
  doc.rectStroke(M_X, y, HALF_W, HALF_H, GOLD, 0.7);
  doc.text("3. FICHE DE CONSULTATION & ACTIFS NOBLES", M_X + 10, y + 16, { font: "bold", size: 8, color: GOLD_DARK });
  doc.text("- Fiche officielle : Compte-rendu avec scores & signature.", M_X + 10, y + 29, { font: "regular", size: 7, color: INK });
  doc.text("- Ordonnance : Karite sauvage, Baobab, Moringa, SPF50.", M_X + 10, y + 40, { font: "regular", size: 7, color: INK });
  doc.text("- Envoi WhatsApp : Fiche chiffree transmise a la cliente.", M_X + 10, y + 51, { font: "regular", size: 7, color: INK });
  doc.text("- Scanner INCI : Alerte anti-hydroquinone et mercure.", M_X + 10, y + 62, { font: "regular", size: 7, color: SOFT });

  doc.rect(xRight - 1, y - 1, HALF_W + 2, HALF_H + 2, KARITE);
  doc.rectStroke(xRight - 1, y - 1, HALF_W + 2, HALF_H + 2, GOLD, 0.8);
  doc.drawImage("img_inci", xRight, y, HALF_W, HALF_H - 12);
  doc.text("ECRAN 3 : SCANNER INCI BOTANIQUE ANTI-TOXIQUE", xRight + 6, y + HALF_H - 3, { font: "bold", size: 6, color: GOLD_DARK });

  // PAGE 2 : VOLUME 2 (PILOTAGE GERANTE, CAISSE & SYSCOHADA)
  doc.newPage();
  y = 70;
  doc.text("VOLUME 2 : PILOTAGE GERANTE · CAISSE POS, REÇUS & SYSCOHADA", M_X, y, { font: "bold", size: 11, color: GOLD_DARK });
  doc.hline(M_X, M_RIGHT, y + 5, GOLD, 1.2);

  y += 16;
  doc.rect(M_X, y, HALF_W, 110, CARD);
  doc.rectStroke(M_X, y, HALF_W, 110, GOLD, 0.7);
  doc.text("1. CAISSE POS : ENCAISSEMENT DES CONSULTATIONS", M_X + 10, y + 16, { font: "bold", size: 8, color: GOLD_DARK });
  doc.text("- Categorie Caisse : Selectionnez 'Consultations'", M_X + 10, y + 29, { font: "regular", size: 7, color: INK });
  doc.text("  (ex: Consultation Dermo 15 000 FCFA).", M_X + 10, y + 39, { font: "regular", size: 7, color: INK });
  doc.text("- Reglements multi-flux : Wave (QR Code direct),", M_X + 10, y + 51, { font: "regular", size: 7, color: INK });
  doc.text("  Orange Money, MTN MoMo, Carte bancaire, Especes.", M_X + 10, y + 61, { font: "regular", size: 7, color: INK });
  doc.text("- Emission du recu : Ticket thermique Bluetooth ou", M_X + 10, y + 73, { font: "regular", size: 7, color: INK });
  doc.text("  recu numerique SMS / WhatsApp officiel.", M_X + 10, y + 83, { font: "regular", size: 7, color: SOFT });
  doc.text("- Acomptes en ligne : Deduits automatiquement.", M_X + 10, y + 96, { font: "bold", size: 7, color: GOLD_DARK });

  doc.rect(xRight - 1, y - 1, HALF_W + 2, 110 + 2, KARITE);
  doc.rectStroke(xRight - 1, y - 1, HALF_W + 2, 110 + 2, GOLD, 0.8);
  doc.drawImage("img_rdv", xRight, y, HALF_W, 110 - 14);
  doc.text("ECRAN 4 : TARIFICATION DES SERVICES & ACOMPTES", xRight + 6, y + 110 - 4, { font: "bold", size: 6, color: GOLD_DARK });

  y += 122;
  doc.rect(M_X, y, CONTENT_W, 44, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 44, GOLD, 0.7);
  doc.text("2. TABLEAU DE BORD EN DIRECT & RECONCILIATION COMPTABLE SYSCOHADA", M_X + 12, y + 14, { font: "bold", size: 8.5, color: GOLD_DARK });
  doc.text("Le journal de bord consolide le CA du jour, l'occupation des cabines et la cloture de caisse (Ticket Z).", M_X + 12, y + 26, { font: "regular", size: 7.5, color: INK });
  doc.text("Ventilation : Consultations portees au compte 706 (Prestations) et cremes au compte 701 (Marchandises).", M_X + 12, y + 36, { font: "regular", size: 7.5, color: SOFT });

  y += 54;
  const dashH = 190;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, dashH + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, dashH + 2, GOLD, 1.2);
  doc.drawImage("img_dashboard", M_X, y, CONTENT_W, dashH - 16);
  doc.text("ECRAN 5 : TABLEAU DE BORD PILOTAGE KENE PRO (ACTIVITE DU JOUR, CABINES & ALERTES)", M_X + 12, y + dashH - 5, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // PAGE 3 : VOLUME 3 (RELATIONS, OBJECTIONS & CONTACT DIRECTION)
  doc.newPage();
  y = 70;
  doc.text("VOLUME 3 : RELATIONS CLIENTES, OBJECTIONS & CONTACT DIRECTION", M_X, y, { font: "bold", size: 11, color: BISSAP_DARK });
  doc.hline(M_X, M_RIGHT, y + 5, GOLD, 1.2);

  y += 18;
  doc.rect(M_X, y - 4, CONTENT_W, 42, CARD);
  doc.rectStroke(M_X, y - 4, CONTENT_W, 42, GOLD, 0.8);
  doc.text("OBJECTION 1 : 'LE BILAN OU LA CONSULTATION EST-IL PAYANT ?'", M_X + 14, y + 10, { font: "bold", size: 8.5, color: GOLD_DARK });
  doc.text("Reponse recommandee : 'Madame, chez nous ce diagnostic de pointe vous est offert lors de votre soin.", M_X + 14, y + 23, { font: "regular", size: 8, color: INK });
  doc.text("Il permet de calibrer les actifs exactement a votre peau pour garantir des resultats sans risque.'", M_X + 14, y + 33, { font: "regular", size: 8, color: SOFT });

  y += 50;
  doc.rect(M_X, y - 4, CONTENT_W, 42, CARD);
  doc.rectStroke(M_X, y - 4, CONTENT_W, 42, GOLD, 0.8);
  doc.text("OBJECTION 2 : 'QUE FAITES-VOUS DE MES PHOTOS DE VISAGE ?'", M_X + 14, y + 10, { font: "bold", size: 8.5, color: GOLD_DARK });
  doc.text("Reponse recommandee : 'Vos photos sont chiffrees conformement a la loi n 2013-450 et au RGPD.", M_X + 14, y + 23, { font: "regular", size: 8, color: INK });
  doc.text("Elles restent strictement confidentielles dans votre Passeport personnel pour mesurer votre progression.'", M_X + 14, y + 33, { font: "regular", size: 8, color: SOFT });

  y += 50;
  doc.rect(M_X, y - 4, CONTENT_W, 42, CARD);
  doc.rectStroke(M_X, y - 4, CONTENT_W, 42, GOLD, 0.8);
  doc.text("OBJECTION 3 : 'POURQUOI UTILISER L'APPLICATION A LA MAISON ?'", M_X + 14, y + 10, { font: "bold", size: 8.5, color: GOLD_DARK });
  doc.text("Reponse recommandee : 'Pour prolonger l'effet cabine, verifier vos produits avec le scanner anti-contrefacon,", M_X + 14, y + 23, { font: "regular", size: 8, color: INK });
  doc.text("et beneficier de soins gratuits en invitant vos amies dans le cercle VIP Kene+.'", M_X + 14, y + 33, { font: "regular", size: 8, color: SOFT });

  y += 52;
  doc.rect(M_X, y, CONTENT_W, 44, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 44, TERRE, 1);
  doc.text("CHARTE DE CONFORMITE ET PROTECTION DES DONNEES CLIENTES", M_X + 16, y + 15, { font: "bold", size: 8.5, color: BISSAP_DARK });
  doc.text("Les dossiers cutanes sont chifftes de bout en bout (AES-256). L'institut s'engage a ne faire aucun", M_X + 16, y + 28, { font: "regular", size: 8, color: INK });
  doc.text("usage commercial externe des photographies ou informations de sante renseignees.", M_X + 16, y + 38, { font: "regular", size: 8, color: INK });

  y += 58;
  doc.rect(M_X, y, CONTENT_W, 90, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 90, GOLD, 1.6);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 4);

  doc.text("DIRECTION OFFICIELLE & EDITEUR KENE TECHNOLOGIES", M_X + 20, y + 27, {
    font: "bold",
    size: 11,
    color: GOLD_DARK,
    letterSpace: 1,
  });
  doc.text("Assistance technique d'urgence, agrement de salon ou commande de materiel :", M_X + 20, y + 44, {
    font: "regular",
    size: 8.5,
    color: INK,
  });
  doc.text("CANAL DIRECT UNIQUE DIRECTION KENE :", M_X + 20, y + 59, {
    font: "bold",
    size: 8.5,
    color: BISSAP_DARK,
  });
  doc.text("COURRIEL OFFICIEL : contact@kene-beaute.com", M_X + 20, y + 74, {
    font: "bold",
    size: 11,
    color: GOLD_DARK,
    letterSpace: 0.6,
  });
}
