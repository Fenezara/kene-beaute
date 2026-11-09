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
    const dashPath = path.join(screensDir, "screen-dashboard-full.jpg");
    const connPath = path.join(screensDir, "screen-connexion.jpg");
    const dermoPath = path.join(screensDir, "screen-dermo.jpg");
    const inciPath = path.join(screensDir, "screen-inci.jpg");
    const rdvPath = path.join(screensDir, "screen-rdv.jpg");
    const accueilPath = path.join(screensDir, "screen-accueil-full.jpg");

    if (fs.existsSync(accueilPath)) {
      doc.addImage("img_accueil", new Uint8Array(fs.readFileSync(accueilPath)), 1200, 750);
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
    if (fs.existsSync(dashPath)) {
      doc.addImage("img_dashboard", new Uint8Array(fs.readFileSync(dashPath)), 1200, 750);
    }
  } catch {}

  // ==========================================
  // PAGE 1 : COUVERTURE OFFICIELLE HAUTE DISTINCTION
  // ==========================================
  let y = 50;
  doc.rect(M_X, y, CONTENT_W, 350, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 350, GOLD, 2);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 6);

  doc.text("KENE PRO 2026", M_X + 28, y + 42, {
    font: "bold",
    size: 24,
    color: GOLD_DARK,
    letterSpace: 3,
  });
  doc.text("MANUEL DE MAITRISE DERMO-COSMETIQUE, PROTOCOLES & GESTION", M_X + 28, y + 62, {
    font: "bold",
    size: 11,
    color: BISSAP_DARK,
    letterSpace: 0.5,
  });
  doc.hline(M_X + 28, M_RIGHT - 28, y + 74, GOLD, 1);

  doc.text("GUIDE PRATIQUE OFFICIEL D EXPLOITATION EN CABINE", M_X + 28, y + 96, {
    font: "bold",
    size: 9.5,
    color: GOLD_DARK,
    letterSpace: 1.5,
  });
  doc.text("Ce manuel definit les standards d excellence therapeutique et d hygiene", M_X + 28, y + 114, {
    font: "regular",
    size: 9,
    color: INK,
  });
  doc.text("dermatologique sur phototypes IV a VI (peaux noires, mates et metissees).", M_X + 28, y + 128, {
    font: "regular",
    size: 9,
    color: INK,
  });

  doc.rect(M_X + 28, y + 148, CONTENT_W - 56, 95, CARD);
  doc.rectStroke(M_X + 28, y + 148, CONTENT_W - 56, 95, GOLD, 0.8);
  doc.text("TITULAIRE DE L ACCREDITATION OFFICIELLE :", M_X + 42, y + 168, { font: "bold", size: 8, color: SOFT, letterSpace: 1 });
  doc.text(data.tenantName.toUpperCase(), M_X + 42, y + 188, { font: "bold", size: 14, color: INK });
  doc.text("Localisation : " + (data.tenantCity || "Abidjan") + " · Agrement Kene Pro Certifie 2026", M_X + 42, y + 206, { font: "regular", size: 9, color: SOFT });
  doc.text("Direction Generale Kene : contact@kene-beaute.com", M_X + 42, y + 224, { font: "bold", size: 9, color: GOLD_DARK });

  doc.text("SOMMAIRE DU GUIDE OFFICIEL EN 6 VOLUMES :", M_X + 28, y + 268, { font: "bold", size: 9.5, color: BISSAP_DARK });
  doc.text("· PAGE 2 : VOLUME 1 — Prise de Poste, Pointage RH & Accueil Clientele", M_X + 28, y + 286, { font: "regular", size: 8.5, color: INK });
  doc.text("· PAGE 3 : VOLUME 2 — Protocole de Consultation Cabine & Diagnostic Dermo-Kene", M_X + 28, y + 302, { font: "regular", size: 8.5, color: INK });
  doc.text("· PAGE 4 : VOLUME 3 — Scanner INCI Botanique & Protection Anti-Perturbateurs", M_X + 28, y + 318, { font: "regular", size: 8.5, color: INK });
  doc.text("· PAGE 5 : VOLUME 4 — Caisse POS, Classification des Recus & Comptabilite SYSCOHADA", M_X + 28, y + 334, { font: "regular", size: 8.5, color: INK });
  doc.text("· PAGE 6 : VOLUME 5 — Supervision Gerante & Tableau de Bord Analytics", M_X + 28, y + 350, { font: "regular", size: 8.5, color: INK });
  doc.text("· PAGE 7 : VOLUME 6 — Traitement des Objections, Ethique & Contact Direction", M_X + 28, y + 366, { font: "regular", size: 8.5, color: INK });

  // Capture accueil en bas de page 1
  y = 425;
  const hAcc = 335;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, hAcc + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, hAcc + 2, GOLD, 1.2);
  doc.drawImage("img_accueil", M_X, y, CONTENT_W, hAcc - 22);
  doc.text("FIGURE 1 : INTERFACE D ACCUEIL KENE & PORTAIL D EXPERIENCE CLIENTE IMMERSIVE", M_X + 14, y + hAcc - 8, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // ==========================================
  // PAGE 2 : VOLUME 1 — PRISE DE POSTE & POINTAGE RH
  // ==========================================
  doc.newPage();
  y = 40;
  doc.text("VOLUME 1 : PRISE DE POSTE, POINTAGE HORODATE & PREPARATION CABINE", M_X, y, { font: "bold", size: 11, color: GOLD_DARK });
  doc.hline(M_X, M_RIGHT, y + 6, GOLD, 1.4);

  y += 20;
  doc.rect(M_X, y, CONTENT_W, 205, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 205, GOLD, 0.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 3);

  doc.text("ETAPE 1 : CONNEXION AU PORTAIL PRATICIENNE & BADGEAGE D ARRIVEE", M_X + 16, y + 20, { font: "bold", size: 9.5, color: BISSAP_DARK });
  doc.text("1. Rendez-vous sur votre tablette ou terminal a l adresse : kene-beaute.com/pro", M_X + 16, y + 38, { font: "bold", size: 8.5, color: INK });
  doc.text("2. Selectionnez votre profil patricienne ou saisissez votre code PIN secret a 4 chiffres.", M_X + 16, y + 54, { font: "regular", size: 8.5, color: INK });
  doc.text("3. Des l ouverture du salon, appuyez imperativement sur le bouton dore [Pointer mon arrivee].", M_X + 16, y + 70, { font: "regular", size: 8.5, color: INK });
  doc.text("   L heure exacte est alors horodatee et transmise sur le registre RH numerique du salon.", M_X + 16, y + 84, { font: "regular", size: 8, color: SOFT });

  doc.text("PREPARATION DU POSTE DE SOIN CABINE (CHECKLIST STERILISATION) :", M_X + 16, y + 108, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text("· Verifier le niveau de charge de la tablette d inspection et la nettete optique du capteur.", M_X + 16, y + 126, { font: "regular", size: 8.5, color: INK });
  doc.text("· Calibrer l eclairage de cabine : lumiere blanche neutre 5000K sans reflets ni eclairage rasant.", M_X + 16, y + 142, { font: "regular", size: 8.5, color: INK });
  doc.text("· Desinfecter les embouts de diagnostic et preparer les coupelles botaniques steriles.", M_X + 16, y + 158, { font: "regular", size: 8.5, color: INK });
  doc.text("· Cloture en fin de journee : cliquer sur [Valider mon depart] pour figer les primes de soin.", M_X + 16, y + 174, { font: "regular", size: 8.5, color: INK });
  doc.text("IMPORTANT : Tout retard non signale bloque l ouverture des cabines connectees.", M_X + 16, y + 192, { font: "bold", size: 8, color: BISSAP_DARK });

  y += 225;
  const hConn = 490;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, hConn + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, hConn + 2, GOLD, 1.2);
  doc.drawImage("img_connexion", M_X, y, CONTENT_W, hConn - 24);
  doc.text("FIGURE 2 : PORTAIL DE CONNEXION PRATICIENNE & SYSTEME DE POINTAGE RH HORODATE", M_X + 14, y + hConn - 8, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // ==========================================
  // PAGE 3 : VOLUME 2 — PROTOCOLE DE CONSULTATION CABINE & DERMO-KENE
  // ==========================================
  doc.newPage();
  y = 40;
  doc.text("VOLUME 2 : PROTOCOLE CLINIQUE DE CONSULTATION & DIAGNOSTIC DERMO-KENE", M_X, y, { font: "bold", size: 11, color: GOLD_DARK });
  doc.hline(M_X, M_RIGHT, y + 6, GOLD, 1.4);

  y += 20;
  doc.rect(M_X, y, CONTENT_W, 205, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 205, GOLD, 0.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 3);

  doc.text("ETAPE 2 : ANAMNESE COMPLETE, SCAN 3 ZONES & CALCUL DES METRIQUES", M_X + 16, y + 20, { font: "bold", size: 9.5, color: BISSAP_DARK });
  doc.text("1. Entretien d anamnese : interroger l historique cutane, antecedents de depigmentation ou corticoides.", M_X + 16, y + 38, { font: "regular", size: 8.5, color: INK });
  doc.text("2. Capture 3 cliches obligatoires : Face centree, Profil Droit (45 degres), Profil Gauche (45 degres).", M_X + 16, y + 54, { font: "bold", size: 8.5, color: INK });
  doc.text("3. Analyse algorithmique Dermo-Kene calibree pour phototypes africains (IV a VI) :", M_X + 16, y + 70, { font: "regular", size: 8.5, color: INK });
  doc.text("   - Score Eclat Global /100 : homogeneite de pigmentation et vitalite cellulaire.", M_X + 16, y + 84, { font: "regular", size: 8, color: SOFT });
  doc.text("   - Cartographie PIH : detection des taches d hyperpigmentation post-inflammatoire.", M_X + 16, y + 98, { font: "regular", size: 8, color: SOFT });
  doc.text("   - Barriere Lipidique : taux d hydratation corneocytaire et sebum trans-epidermique.", M_X + 16, y + 112, { font: "regular", size: 8, color: SOFT });

  doc.text("REMISE DE LA FICHE DE CONSULTATION & ORDONNANCE BOTANIQUE :", M_X + 16, y + 132, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text("· Generation immediate du Passeport de Sante Cutanee avec synthese dermo-cosmetique chiffree.", M_X + 16, y + 150, { font: "regular", size: 8.5, color: INK });
  doc.text("· Prescription sur-mesure d actifs purs : Beurre de Karite sauvage bio, Huile de Moringa, Baobab & SPF50.", M_X + 16, y + 166, { font: "regular", size: 8.5, color: INK });
  doc.text("· Transmission instantanee sur le WhatsApp de la cliente : Fiche PDF complete avec conseils de cure.", M_X + 16, y + 182, { font: "bold", size: 8.5, color: BISSAP_DARK });

  y += 225;
  const hDermo = 490;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, hDermo + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, hDermo + 2, GOLD, 1.2);
  doc.drawImage("img_dermo", M_X, y, CONTENT_W, hDermo - 24);
  doc.text("FIGURE 3 : BILAN DERMO-CUTANE KENE — SCORES, ANAMNESE & ORDONNANCE BOTANIQUE WHATSAPP", M_X + 14, y + hDermo - 8, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // ==========================================
  // PAGE 4 : VOLUME 3 — SCANNER INCI & AUDIT TOXICOLOGIQUE
  // ==========================================
  doc.newPage();
  y = 40;
  doc.text("VOLUME 3 : AUDIT TOXICOLOGIQUE CABINE & SCANNER INCI ANTI-PERTURBATEURS", M_X, y, { font: "bold", size: 11, color: GOLD_DARK });
  doc.hline(M_X, M_RIGHT, y + 6, GOLD, 1.4);

  y += 20;
  doc.rect(M_X, y, CONTENT_W, 205, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 205, GOLD, 0.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 3);

  doc.text("ETAPE 3 : ANALYSE DE LA TROUSSE DE TOILETTE ET INGREDIENTS DE LA CLIENTE", M_X + 16, y + 20, { font: "bold", size: 9.5, color: BISSAP_DARK });
  doc.text("1. Inviter la cliente a photographier la liste des ingredients figurant sur ses pots et flacons personnels.", M_X + 16, y + 38, { font: "regular", size: 8.5, color: INK });
  doc.text("2. Reconnaissance optique INCI en moins de 3 secondes avec mise en evidence tricolore :", M_X + 16, y + 54, { font: "bold", size: 8.5, color: INK });
  doc.text("   · VERT (Recommande) : Beurres vegetaux presses a froid, aloe vera, ceramides, niacinamide pure.", M_X + 16, y + 70, { font: "regular", size: 8, color: GREEN });
  doc.text("   · ORANGE (Vigilance) : Alcools assechants, parfums synthetiques allergisants, silicones occlusifs.", M_X + 16, y + 84, { font: "regular", size: 8, color: GOLD_DARK });
  doc.text("   · ROUGE / BISSAP (Alerte Maximale) : Hydroquinone, Clobetasol, Mercure ammoniacal, Corticoides.", M_X + 16, y + 98, { font: "bold", size: 8, color: BISSAP_DARK });

  doc.text("CONDUITE A TENIR EN CAS DE SUBSTANCE TOXIQUE DETECTEE :", M_X + 16, y + 122, { font: "bold", size: 9, color: BISSAP_DARK });
  doc.text("· Poser calmement le diagnostic d alteration sans culpabiliser la cliente.", M_X + 16, y + 140, { font: "regular", size: 8.5, color: INK });
  doc.text("· Expliquer le mecanisme de rebond pigmentaire (ochronose) et de fragilisation vasculaire.", M_X + 16, y + 156, { font: "regular", size: 8.5, color: INK });
  doc.text("· Proposer un protocole de sevrage cutane progressif relais par karite brut dore et moringa reparateur.", M_X + 16, y + 172, { font: "regular", size: 8.5, color: INK });
  doc.text("· L institut s interdit strictement l usage ou la revente de tout produit contenant ces agents nocifs.", M_X + 16, y + 188, { font: "bold", size: 8, color: INK });

  y += 225;
  const hInci = 490;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, hInci + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, hInci + 2, GOLD, 1.2);
  doc.drawImage("img_inci", M_X, y, CONTENT_W, hInci - 24);
  doc.text("FIGURE 4 : SCANNER INCI KENE — DECRYPTAGE CLINIQUE DES FORMULES & ALERTE SUBSTANCES TOXIQUES", M_X + 14, y + hInci - 8, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // ==========================================
  // PAGE 5 : VOLUME 4 — CAISSE POS, CLASSIFICATION & RECONCILIATION SYSCOHADA
  // ==========================================
  doc.newPage();
  y = 40;
  doc.text("VOLUME 4 : GESTION DE CAISSE POS, CLASSIFICATION DES RECUS & SYSCOHADA", M_X, y, { font: "bold", size: 11, color: GOLD_DARK });
  doc.hline(M_X, M_RIGHT, y + 6, GOLD, 1.4);

  y += 20;
  doc.rect(M_X, y, CONTENT_W, 205, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 205, GOLD, 0.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 3);

  doc.text("ETAPE 4 : ENCAISSEMENT MULTI-FLUX & CLASSIFICATION RIGUREUSE DES ACTES", M_X + 16, y + 20, { font: "bold", size: 9.5, color: BISSAP_DARK });
  doc.text("1. Distinguer sur le terminal de caisse la nature de chaque encaissement :", M_X + 16, y + 38, { font: "bold", size: 8.5, color: INK });
  doc.text("   · CONSULTATION DERMO (15 000 FCFA) : Classement en Prestation Intellectuelle Expert (Compte 706).", M_X + 16, y + 54, { font: "regular", size: 8.5, color: INK });
  doc.text("   · SOIN EN CABINE (25 000 a 45 000 FCFA) : Classement en Prestation Esthetique & Soin (Compte 706).", M_X + 16, y + 68, { font: "regular", size: 8.5, color: INK });
  doc.text("   · VENTE BOUTIQUE (Huiles, Beurres, SPF) : Classement en Vente de Marchandises (Compte 701).", M_X + 16, y + 82, { font: "regular", size: 8.5, color: INK });

  doc.text("2. Modes de reglement acceptes sans coupure :", M_X + 16, y + 102, { font: "bold", size: 8.5, color: GOLD_DARK });
  doc.text("   · Wave Mobile Money : Generation automatique d un QR code dynamique au montant exact.", M_X + 16, y + 118, { font: "regular", size: 8, color: SOFT });
  doc.text("   · Orange Money / MTN MoMo : Envoi du push USSD de securite directement sur le telephone cliente.", M_X + 16, y + 132, { font: "regular", size: 8, color: SOFT });
  doc.text("   · Carte Bancaire (Visa/Mastercard) et Especes avec rendu de monnaie controle.", M_X + 16, y + 146, { font: "regular", size: 8, color: SOFT });

  doc.text("EMISSION IMMEDIATE DU RECU OFFICIEL DE CAISSE :", M_X + 16, y + 166, { font: "bold", size: 9, color: BISSAP_DARK });
  doc.text("· Ticket thermique Bluetooth imprime au comptoir ou transmission numerique par SMS & WhatsApp.", M_X + 16, y + 182, { font: "regular", size: 8.5, color: INK });
  doc.text("· Cloture du soir (Ticket Z) : Export comptable conforme SYSCOHADA pour l expert-comptable.", M_X + 16, y + 196, { font: "bold", size: 8, color: GOLD_DARK });

  y += 225;
  const hRdv = 490;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, hRdv + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, hRdv + 2, GOLD, 1.2);
  doc.drawImage("img_rdv", M_X, y, CONTENT_W, hRdv - 24);
  doc.text("FIGURE 5 : TERMINAL DE CAISSE & CATALOGUE DE PRESTATIONS AVEC RECONCILIATION IMMEDIATE", M_X + 14, y + hRdv - 8, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // ==========================================
  // PAGE 6 : VOLUME 5 — PILOTAGE GERANTE & TABLEAU DE BORD CONSOLIDE
  // ==========================================
  doc.newPage();
  y = 40;
  doc.text("VOLUME 5 : PILOTAGE GERANTE · TABLEAU DE BORD & OCCUPATION CABINES", M_X, y, { font: "bold", size: 11, color: GOLD_DARK });
  doc.hline(M_X, M_RIGHT, y + 6, GOLD, 1.4);

  y += 20;
  doc.rect(M_X, y, CONTENT_W, 205, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 205, GOLD, 0.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 3);

  doc.text("SUPERVISION STRATEGIQUE ET SUIVI DES INDICATEURS DE CROISSANCE DU SALON", M_X + 16, y + 20, { font: "bold", size: 9.5, color: BISSAP_DARK });
  doc.text("1. Vue Temps Reel du Chiffre d Affaires : encaissements du jour ventiles par cabine et patricienne.", M_X + 16, y + 38, { font: "bold", size: 8.5, color: INK });
  doc.text("2. Taux d Occupation des Postes : alertes sur les creneaux creux et relances promotionnelles ciblees.", M_X + 16, y + 54, { font: "regular", size: 8.5, color: INK });
  doc.text("3. Suivi de Fidelite & Parrainage Kene+ : clientes ambassadrices et attribution automatique des commissions.", M_X + 16, y + 70, { font: "regular", size: 8.5, color: INK });
  doc.text("4. Gestion des Stocks Cabine : alerte avant rupture sur les beurres purs et le flaconnage d analyse.", M_X + 16, y + 86, { font: "regular", size: 8.5, color: INK });

  doc.text("REGLES DE GESTION DE SALON ET REPARTITION DES COMMISSIONS :", M_X + 16, y + 114, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text("· 85% du chiffre d affaires des soins et consultations revient directement a votre etablissement.", M_X + 16, y + 132, { font: "regular", size: 8.5, color: INK });
  doc.text("· Versement hebdomadaire automatise sur votre compte bancaire ou compte professionnel Wave.", M_X + 16, y + 148, { font: "regular", size: 8.5, color: INK });
  doc.text("· Assistance prioritaire dediee aux etablissements partenaires accredites 2026.", M_X + 16, y + 164, { font: "regular", size: 8.5, color: INK });
  doc.text("· Canal officiel unique avec la Direction Kene : contact@kene-beaute.com", M_X + 16, y + 184, { font: "bold", size: 9, color: BISSAP_DARK });

  y += 225;
  const hDash = 490;
  doc.rect(M_X - 1, y - 1, CONTENT_W + 2, hDash + 2, KARITE);
  doc.rectStroke(M_X - 1, y - 1, CONTENT_W + 2, hDash + 2, GOLD, 1.2);
  doc.drawImage("img_dashboard", M_X, y, CONTENT_W, hDash - 24);
  doc.text("FIGURE 6 : TABLEAU DE BORD DE SUPERVISION KENE PRO (ANALYTICS EN TEMPS REEL & PERFORMANCE)", M_X + 14, y + hDash - 8, {
    font: "bold",
    size: 7.5,
    color: GOLD_DARK,
    letterSpace: 0.5,
  });

  // ==========================================
  // PAGE 7 : VOLUME 6 — TRAITEMENT DES OBJECTIONS, ETHIQUE & CONTACT DIRECTION
  // ==========================================
  doc.newPage();
  y = 40;
  doc.text("VOLUME 6 : GUIDE DE CONVERSATION CABINE, OBJECTIONS & CONTACT DIRECTION", M_X, y, { font: "bold", size: 11, color: BISSAP_DARK });
  doc.hline(M_X, M_RIGHT, y + 6, GOLD, 1.4);

  y += 24;
  doc.rect(M_X, y, CONTENT_W, 64, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 64, GOLD, 0.8);
  doc.text("OBJECTION 1 : \"LE DIAGNOSTIC CUTANE OU LA CONSULTATION SONT-ILS PAYANTS ?\"", M_X + 16, y + 18, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text("Reponse formee Kene : \"Chere cliente, ce diagnostic de pointe vous est offert des lors que vous reservez", M_X + 16, y + 34, { font: "regular", size: 8.5, color: INK });
  doc.text("un soin en cabine. Il permet de doser avec precision les actifs botaniques adaptes a votre melanine.\"", M_X + 16, y + 48, { font: "regular", size: 8.5, color: SOFT });

  y += 76;
  doc.rect(M_X, y, CONTENT_W, 64, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 64, GOLD, 0.8);
  doc.text("OBJECTION 2 : \"QUE FAITES-VOUS DE MES CLICHES DE VISAGE ET DE MON DOSSIER ?\"", M_X + 16, y + 18, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text("Reponse formee Kene : \"Vos cliches sont strictement confidentiels, chiffres conformement a la loi ivoirienne", M_X + 16, y + 34, { font: "regular", size: 8.5, color: INK });
  doc.text("n 2013-450 et au RGPD. Ils ne sont visibles que par vous et votre praticienne pour mesurer vos progres.\"", M_X + 16, y + 48, { font: "regular", size: 8.5, color: SOFT });

  y += 76;
  doc.rect(M_X, y, CONTENT_W, 64, CARD);
  doc.rectStroke(M_X, y, CONTENT_W, 64, GOLD, 0.8);
  doc.text("OBJECTION 3 : \"POURQUOI DEVEZ-VOUS SCANNER MES CREMES PERSONNELLES ?\"", M_X + 16, y + 18, { font: "bold", size: 9, color: GOLD_DARK });
  doc.text("Reponse formee Kene : \"Certains soins du commerce contiennent a votre insu de l hydroquinone ou des steroides", M_X + 16, y + 34, { font: "regular", size: 8.5, color: INK });
  doc.text("qui detruisent la barriere lipidique. Notre scanner vous garantit une totale innocuite cosmetique.\"", M_X + 16, y + 48, { font: "regular", size: 8.5, color: SOFT });

  y += 82;
  doc.rect(M_X, y, CONTENT_W, 90, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 90, TERRE, 1.2);
  doc.text("CHARTE D ENGAGEMENT DE L ETABLISSEMENT PARTENAIRE KENE 2026", M_X + 18, y + 20, { font: "bold", size: 9.5, color: BISSAP_DARK, letterSpace: 0.5 });
  doc.text("1. Sanctuaire Sans Depigmentation : Interdiction absolue de prescrire ou appliquer des depigmentants.", M_X + 18, y + 38, { font: "regular", size: 8.5, color: INK });
  doc.text("2. Tracabilite des Actifs : Utilisation exclusive de beurres et huiles africains certifiees pures.", M_X + 18, y + 54, { font: "regular", size: 8.5, color: INK });
  doc.text("3. Confidentialite Absolue : Chiffrement bancaire AES-256 de tous les dossiers dermatologiques.", M_X + 18, y + 70, { font: "regular", size: 8.5, color: INK });

  y += 105;
  doc.rect(M_X, y, CONTENT_W, 115, KARITE);
  doc.rectStroke(M_X, y, CONTENT_W, 115, GOLD, 1.8);
  doc.drawBrandRibbon(M_X, y, CONTENT_W, 5);

  doc.text("CONTACT OFFICIEL DIRECTION GENERALE KENE", M_X + 22, y + 26, {
    font: "bold",
    size: 12,
    color: GOLD_DARK,
    letterSpace: 1.5,
  });
  doc.text("Pour toute demande d agrement, renouvellement de terminal, reapprovisionnement cabine", M_X + 22, y + 46, {
    font: "regular",
    size: 9,
    color: INK,
  });
  doc.text("ou question juridique, le canal officiel et exclusif de communication est le suivant :", M_X + 22, y + 60, {
    font: "regular",
    size: 9,
    color: INK,
  });

  doc.text("COURRIEL UNIQUE DE LA DIRECTION KENE :", M_X + 22, y + 80, {
    font: "bold",
    size: 9,
    color: BISSAP_DARK,
  });
  doc.text("contact@kene-beaute.com", M_X + 22, y + 98, {
    font: "bold",
    size: 13,
    color: GOLD_DARK,
    letterSpace: 1,
  });
}
