// Kènè — Biométrie Optique & Colorimétrie CIE L*a*b* / ITA° (Peaux Mélanodermes IV–VI)
// Pure TypeScript / Zéro dépendance native (aucun sharp) : fonctionne dans le navigateur
// (via ImageData Canvas) et côté serveur Node (lecture/écriture du segment JPEG COM 0xFF 0xFE).

export interface OpticalSubzoneMetrics {
  id: "front" | "zone_t" | "joue_g" | "joue_d" | "menton";
  label: string;
  /** Coordonnées normalisées 0..100 compatibles avec ZoneMark */
  x: number;
  y: number;
  w: number;
  h: number;
  lStar: number;
  deltaEFromMean: number;
  /** Indice local de tache / dyschromie (0..100, plus haut = plus marqué) */
  pigmentScore: number;
  /** Indice local d'érythème / inflammation (0..100) */
  erythemaScore: number;
  /** Indice local de brillance sébacée / spéculaire (0..100) */
  shineScore: number;
  /** Indice local de grain / pores / micro-relief (0..100) */
  roughnessScore: number;
  /** Sévérité locale 0 (sain) à 3 (marqué) */
  severity: 0 | 1 | 2 | 3;
  /** Anomalie dominante détectée dans cette sous-zone */
  dominantIssue: "pih" | "erytheme" | "sebum" | "texture" | "sain";
}

export interface OpticalSkinMetrics {
  /** Luminance perceptive moyenne CIE L* (0..100) sur la zone cutanée utile */
  lStar: number;
  /** Composante rouge-vert CIE a* (-128..127) — corrélée à l'érythème / inflammation */
  aStar: number;
  /** Composante jaune-bleu CIE b* (-128..127) — corrélée à la mélanine / phéomélanine */
  bStar: number;
  /** Angle Typologique Individuel ITA° = atan((L* - 50) / b*) * 180 / PI */
  itaDegrees: number;
  /** Phototype / nuance estimée par l'angle ITA° (corrigé balance des blancs) */
  itaPhototypeHint: "albinos" | "III" | "IV" | "V" | "VI";
  /** Indice d'hétérogénéité pigmentaire (dispersion spatiale Delta-E locale, 0..100) */
  pigmentHeterogeneity: number;
  /** Indice d'érythème sous-jacent (canal a* normalisé pour peaux foncées, 0..100) */
  erythemaIndex: number;
  /** Indice biophysique de densité mélanique Lambert-Beer (0..100) */
  melaninIndex?: number;
  /** Indice biophysique d'oxyhémoglobine / vascularisation Lambert-Beer (0..100) */
  hemoglobinIndex?: number;
  /** Indice de micro-relief / densité de pores par gradient haute fréquence GLCM (0..100) */
  poreRoughnessIndex?: number;
  /** Suspicion de filtre beauté lissant ou fond de teint couvrant */
  makeupOrFilterLikely?: boolean;
  /** Score de netteté optique (Variance du Laplacien, 0..100) */
  sharpnessScore: number;
  /** Pourcentage de pixels en reflet spéculaire / brillance directe (0..100) */
  specularGlarePct: number;
  /** Qualité globale de l'acquisition ("optimale" | "acceptable" | "floue" | "sous_exposee" | "surexposee") */
  qualityGrade: "optimale" | "acceptable" | "floue" | "sous_exposee" | "surexposee";
  /** Parcellisation anatomique en 5 sous-zones (Front, Zone T, Joue G, Joue D, Menton) */
  subzones?: OpticalSubzoneMetrics[];
}

const JPEG_COM_PREFIX = "KENE_OPTICAL:";

/** Convertit un triplet sRGB (0..255) en CIE L*a*b* (illuminant D65). */
export function rgbToLab(r8: number, g8: number, b8: number): [number, number, number] {
  let r = r8 / 255;
  let g = g8 / 255;
  let b = b8 / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  // Matrice sRGB -> XYZ (D65 normalisé)
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000;
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  const l = Math.max(0, Math.min(100, 116 * fy - 16));
  const a = 500 * (fx - fy);
  const bVal = 200 * (fy - fz);
  return [l, a, bVal];
}

/** Déduit la nuance Kènè / Fitzpatrick à partir de l'angle ITA° (classification Chardon / Del Bino adaptée). */
export function phototypeFromIta(ita: number): "albinos" | "III" | "IV" | "V" | "VI" {
  if (ita > 41) return "albinos";
  if (ita > 19) return "III"; // Chabine / intermédiaire clair
  if (ita > -5) return "IV"; // Métissée / caramel
  if (ita > -32) return "V"; // Brune cuivrée / acajou
  return "VI"; // Ébène intense
}

/**
 * Calcule les biomarqueurs optiques complets à partir d'un buffer RGBA (ImageData de Canvas).
 * Inclut une normalisation de balance des blancs (Shades-of-Gray / Von Kries doux)
 * pour stabiliser les mesures sous éclairage intérieur chaud ou froid.
 */
export function computeOpticalMetricsFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): OpticalSkinMetrics {
  const totalPixels = width * height;
  if (totalPixels === 0 || data.length < totalPixels * 4) {
    return {
      lStar: 46,
      aStar: 12,
      bStar: 21,
      itaDegrees: -11,
      itaPhototypeHint: "V",
      pigmentHeterogeneity: 18,
      erythemaIndex: 25,
      sharpnessScore: 75,
      specularGlarePct: 2,
      qualityGrade: "acceptable",
    };
  }

  // 1. Estimation de l'illuminant (Gray-World pondéré hors pixels saturés et hors ombres noires)
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let wbCount = 0;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels) / 96));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 22 && lum < 238) {
        sumR += r;
        sumG += g;
        sumB += b;
        wbCount++;
      }
    }
  }

  // Facteurs de correction Von Kries modérés (bridés à ±14% pour ne jamais dénaturer la mélanine)
  let gainR = 1;
  let gainG = 1;
  let gainB = 1;
  if (wbCount > 50) {
    const avgR = sumR / wbCount;
    const avgG = sumG / wbCount;
    const avgB = sumB / wbCount;
    const gray = (avgR + avgG + avgB) / 3;
    gainR = Math.max(0.88, Math.min(1.12, 0.65 + 0.35 * (gray / Math.max(1, avgR))));
    gainG = Math.max(0.90, Math.min(1.10, 0.65 + 0.35 * (gray / Math.max(1, avgG))));
    gainB = Math.max(0.86, Math.min(1.16, 0.65 + 0.35 * (gray / Math.max(1, avgB))));
  }

  // 2. Analyse de la région d'intérêt centrale (ellipse 68% x 74% = zone cutanée principale)
  let lSum = 0;
  let aSum = 0;
  let bSum = 0;
  let rSkinSum = 0;
  let gSkinSum = 0;
  let skinCount = 0;
  let glareCount = 0;
  let roiCount = 0;

  const blockL: number[] = [];
  const blockA: number[] = [];
  const blockB: number[] = [];

  const gridN = 6;
  const cellW = Math.max(1, Math.floor(width / gridN));
  const cellH = Math.max(1, Math.floor(height / gridN));

  for (let gy = 1; gy < gridN - 1; gy++) {
    for (let gx = 1; gx < gridN - 1; gx++) {
      let cL = 0;
      let cA = 0;
      let cB = 0;
      let cN = 0;

      for (let y = gy * cellH; y < (gy + 1) * cellH; y += step) {
        for (let x = gx * cellW; x < (gx + 1) * cellW; x += step) {
          const idx = (y * width + x) * 4;
          const rRaw = data[idx];
          const gRaw = data[idx + 1];
          const bRaw = data[idx + 2];
          roiCount++;

          const maxC = Math.max(rRaw, gRaw, bRaw);
          const minC = Math.min(rRaw, gRaw, bRaw);
          // Détection de reflet spéculaire (haute luminance + faible saturation chromatique)
          if (maxC > 240 && maxC - minC < 35) {
            glareCount++;
            continue;
          }
          // Exclusion des ombres profondes / poils / sourcils / arrière-plan noir
          const lum = 0.299 * rRaw + 0.587 * gRaw + 0.114 * bRaw;
          if (lum < 16) continue;

          const r = Math.min(255, Math.round(rRaw * gainR));
          const g = Math.min(255, Math.round(gRaw * gainG));
          const b = Math.min(255, Math.round(bRaw * gainB));

          const [l, a, bVal] = rgbToLab(r, g, b);
          lSum += l;
          aSum += a;
          bSum += bVal;
          rSkinSum += r;
          gSkinSum += g;
          skinCount++;

          cL += l;
          cA += a;
          cB += bVal;
          cN++;
        }
      }

      if (cN >= 4) {
        blockL.push(cL / cN);
        blockA.push(cA / cN);
        blockB.push(cB / cN);
      }
    }
  }

  const lStar = skinCount > 0 ? Math.round((lSum / skinCount) * 10) / 10 : 45;
  const aStar = skinCount > 0 ? Math.round((aSum / skinCount) * 10) / 10 : 12;
  const bStar = skinCount > 0 ? Math.round((bSum / skinCount) * 10) / 10 : 20;
  const meanSkinR = skinCount > 0 ? rSkinSum / skinCount : 120;
  const meanSkinG = skinCount > 0 ? gSkinSum / skinCount : 85;

  // Angle Typologique Individuel ITA°
  const safeB = Math.abs(bStar) < 1.5 ? (bStar >= 0 ? 1.5 : -1.5) : bStar;
  const itaDegrees = Math.round(Math.atan((lStar - 50) / safeB) * (180 / Math.PI) * 10) / 10;
  const itaPhototypeHint = phototypeFromIta(itaDegrees);

  // Séparation biophysique des chromophores (Loi de Lambert-Beer adaptée aux phototypes IV–VI)
  // 1) Indice Mélanique pur : M = 100 * log10(255 / R) normalisé sur 0..100
  const rawMelaninOd = Math.log10(255 / Math.max(12, meanSkinR));
  const melaninIndex = Math.max(0, Math.min(100, Math.round(rawMelaninOd * 92)));
  // 2) Indice d'Oxyhémoglobine : E = 100 * (log10(1/G) - log10(1/R)) = 100 * log10(R / G), compensé de la pente d'eumélanine
  const rawHemoOd = Math.log10(Math.max(1, meanSkinR) / Math.max(1, meanSkinG));
  const eumelaninSlopeOffset = 0.065 + (melaninIndex / 100) * 0.085;
  const hemoglobinIndex = Math.max(
    0,
    Math.min(100, Math.round(Math.max(0, rawHemoOd - eumelaninSlopeOffset * 0.55) * 310)),
  );

  // Dispersion pigmentaire inter-blocs (Delta-E moyen par rapport à la médiane de la zone)
  let deltaESum = 0;
  if (blockL.length > 1) {
    for (let i = 0; i < blockL.length; i++) {
      const dL = blockL[i] - lStar;
      const dA = blockA[i] - aStar;
      const dB = blockB[i] - bStar;
      deltaESum += Math.sqrt(dL * dL + dA * dA + dB * dB);
    }
  }
  const avgDeltaE = blockL.length > 1 ? deltaESum / blockL.length : 3.5;
  const pigmentHeterogeneity = Math.max(0, Math.min(100, Math.round(avgDeltaE * 7.5)));

  // Indice d'érythème compensé pour peaux foncées (fusion CIE a* + oxyhémoglobine Lambert-Beer) :
  // Sur peau noire (L* bas), l'eumélanine atténue a*, donc un a* > 11 avec écart local signale une inflammation.
  const melaninAttenuationCompensation = lStar < 45 ? (45 - lStar) * 0.22 : 0;
  const rawErythema = (aStar + melaninAttenuationCompensation - 6) * 4.2;
  const cieErythema = Math.max(0, Math.min(100, Math.round(rawErythema)));
  const erythemaIndex = Math.round(cieErythema * 0.65 + hemoglobinIndex * 0.35);

  // 3. Calcul de netteté (Variance du Laplacien) + Micro-texture GLCM / Pores + Détecteur de filtre beauté
  let lapSum = 0;
  let lapSqSum = 0;
  let lapCount = 0;
  let microTexSum = 0;
  let macroEdgeSum = 0;
  const xStart = Math.floor(width * 0.2);
  const xEnd = Math.floor(width * 0.8);
  const yStart = Math.floor(height * 0.2);
  const yEnd = Math.floor(height * 0.8);
  const lapStep = Math.max(1, Math.floor(Math.min(width, height) / 140));
  const macroStep = Math.max(2, lapStep * 3);

  const lumAt = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };

  for (let y = yStart + macroStep; y < yEnd - macroStep; y += lapStep) {
    for (let x = xStart + macroStep; x < xEnd - macroStep; x += lapStep) {
      const c = lumAt(x, y);
      if (c < 16 || c > 242) continue;
      const lLeft = lumAt(x - lapStep, y);
      const lRight = lumAt(x + lapStep, y);
      const lUp = lumAt(x, y - lapStep);
      const lDown = lumAt(x, y + lapStep);
      const lap = 4 * c - lLeft - lRight - lUp - lDown;
      lapSum += lap;
      lapSqSum += lap * lap;
      // Contraste GLCM haute fréquence (pores & grain de peau à l'échelle 1 pas)
      const hfDiff = (Math.abs(c - lRight) + Math.abs(c - lDown)) * 0.5;
      microTexSum += hfDiff;
      // Gradient macroscopique (traits anatomiques à l'échelle 3 pas)
      const mfDiff =
        (Math.abs(lumAt(x + macroStep, y) - lumAt(x - macroStep, y)) +
          Math.abs(lumAt(x, y + macroStep) - lumAt(x, y - macroStep))) *
        0.5;
      macroEdgeSum += mfDiff;
      lapCount++;
    }
  }

  const lapMean = lapCount > 0 ? lapSum / lapCount : 0;
  const lapVar = lapCount > 0 ? Math.max(0, lapSqSum / lapCount - lapMean * lapMean) : 120;
  // Normalisation logarithmique de la variance du Laplacien en score 0..100
  const sharpnessScore = Math.max(
    5,
    Math.min(100, Math.round(Math.log10(Math.max(1, lapVar)) * 36 - 8)),
  );

  const avgMicroTex = lapCount > 0 ? microTexSum / lapCount : 3.2;
  const avgMacroEdge = lapCount > 0 ? macroEdgeSum / lapCount : 9.5;
  const poreRoughnessIndex = Math.max(5, Math.min(100, Math.round(avgMicroTex * 11.5)));

  // Détection optique de filtre beauté lissant ou fond de teint couvrant :
  // Les contours macroscopiques (yeux, nez, lèvres) sont nets (avgMacroEdge > 7.5 et sharpnessScore >= 42),
  // mais le micro-grain cutané haute fréquence ET la dispersion pigmentaire sont anormalement écrasés.
  const hfToMacroRatio = avgMacroEdge > 1 ? avgMicroTex / avgMacroEdge : 0.35;
  const makeupOrFilterLikely =
    sharpnessScore >= 42 &&
    avgMacroEdge > 7.0 &&
    ((hfToMacroRatio < 0.21 && pigmentHeterogeneity < 14) || (poreRoughnessIndex < 16 && pigmentHeterogeneity < 12));

  // 4. Parcellisation anatomique en 5 sous-zones (Front, Zone T & Nez, Joue G, Joue D, Menton)
  const SUBZONE_DEFS: Array<{
    id: OpticalSubzoneMetrics["id"];
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }> = [
    { id: "front", label: "Front", x: 50, y: 24, w: 32, h: 16 },
    { id: "zone_t", label: "Zone T & Nez", x: 50, y: 46, w: 22, h: 22 },
    { id: "joue_g", label: "Joue gauche", x: 29, y: 54, w: 22, h: 20 },
    { id: "joue_d", label: "Joue droite", x: 71, y: 54, w: 22, h: 20 },
    { id: "menton", label: "Menton & Maxillaire", x: 50, y: 75, w: 26, h: 16 },
  ];

  const subStep = Math.max(1, Math.floor(step * 0.8));
  const subzones: OpticalSubzoneMetrics[] = SUBZONE_DEFS.map((def) => {
    const x0 = Math.max(1, Math.floor(((def.x - def.w / 2) / 100) * width));
    const x1 = Math.min(width - 2, Math.floor(((def.x + def.w / 2) / 100) * width));
    const y0 = Math.max(1, Math.floor(((def.y - def.h / 2) / 100) * height));
    const y1 = Math.min(height - 2, Math.floor(((def.y + def.h / 2) / 100) * height));

    let sL = 0;
    let sA = 0;
    let sB = 0;
    let sLSq = 0;
    let sGlare = 0;
    let sRough = 0;
    let sTotal = 0;
    let sSkin = 0;

    for (let y = y0; y <= y1; y += subStep) {
      for (let x = x0; x <= x1; x += subStep) {
        const idx = (y * width + x) * 4;
        const rRaw = data[idx];
        const gRaw = data[idx + 1];
        const bRaw = data[idx + 2];
        sTotal++;

        const maxC = Math.max(rRaw, gRaw, bRaw);
        const minC = Math.min(rRaw, gRaw, bRaw);
        const lum = 0.299 * rRaw + 0.587 * gRaw + 0.114 * bRaw;
        // Reflet sébacé ou brillance locale (seuil adapté aux peaux mélanodermes où un pic de luminance locale traduit le film sébacé)
        if ((maxC > 225 && maxC - minC < 42) || lum > lStar * 2.55 + 48) {
          sGlare++;
        }
        if (lum < 16 || lum > 244) continue;

        const r = Math.min(255, Math.round(rRaw * gainR));
        const g = Math.min(255, Math.round(gRaw * gainG));
        const b = Math.min(255, Math.round(bRaw * gainB));
        const [l, a, bVal] = rgbToLab(r, g, b);
        sL += l;
        sA += a;
        sB += bVal;
        sLSq += l * l;
        sRough += Math.abs(lum - lumAt(Math.min(width - 1, x + 1), y));
        sSkin++;
      }
    }

    const zL = sSkin > 0 ? Math.round((sL / sSkin) * 10) / 10 : lStar;
    const zA = sSkin > 0 ? sA / sSkin : aStar;
    const zB = sSkin > 0 ? sB / sSkin : bStar;
    const zLVar = sSkin > 2 ? Math.max(0, sLSq / sSkin - (sL / sSkin) ** 2) : 6;
    const zLStd = Math.sqrt(zLVar);

    const dL = zL - lStar;
    const dA = zA - aStar;
    const dB = zB - bStar;
    const deltaEFromMean = Math.round(Math.sqrt(dL * dL + dA * dA + dB * dB) * 10) / 10;

    // Score pigmentaire local : assombrissement local (dL < 0 = hyperpigmentation) + écart-type local de luminance (taches)
    const darkeningBoost = dL < -1.2 ? Math.abs(dL) * 4.5 : 0;
    const pigmentScore = Math.max(
      0,
      Math.min(100, Math.round(zLStd * 6.2 + deltaEFromMean * 3.8 + darkeningBoost)),
    );

    // Score érythème local : excès de composante rouge a* local compensé mélanine
    const localEryRaw = (zA + melaninAttenuationCompensation - 6.5) * 4.3 + Math.max(0, dA) * 5.5;
    const erythemaScore = Math.max(0, Math.min(100, Math.round(localEryRaw)));

    // Score brillance sébacée locale
    const shineScore =
      sTotal > 0 ? Math.max(0, Math.min(100, Math.round((sGlare / sTotal) * 420))) : 0;

    // Score grain / pores local
    const roughnessScore =
      sSkin > 0 ? Math.max(0, Math.min(100, Math.round((sRough / sSkin) * 13))) : poreRoughnessIndex;

    const candidates: Array<{ type: OpticalSubzoneMetrics["dominantIssue"]; val: number }> = [
      { type: "pih" as const, val: pigmentScore },
      { type: "erytheme" as const, val: erythemaScore },
      { type: "sebum" as const, val: shineScore },
      { type: "texture" as const, val: roughnessScore },
    ].sort((x, y) => y.val - x.val);

    const top = candidates[0];
    const dominantIssue: OpticalSubzoneMetrics["dominantIssue"] = top.val >= 28 ? top.type : "sain";
    const severity: 0 | 1 | 2 | 3 =
      top.val >= 66 ? 3 : top.val >= 46 ? 2 : top.val >= 28 ? 1 : 0;

    return {
      id: def.id,
      label: def.label,
      x: def.x,
      y: def.y,
      w: def.w,
      h: def.h,
      lStar: zL,
      deltaEFromMean,
      pigmentScore,
      erythemaScore,
      shineScore,
      roughnessScore,
      severity,
      dominantIssue,
    };
  });

  const specularGlarePct =
    roiCount > 0 ? Math.min(100, Math.round((glareCount / roiCount) * 1000) / 10) : 0;

  let qualityGrade: OpticalSkinMetrics["qualityGrade"] = "optimale";
  if (sharpnessScore < 38) {
    qualityGrade = "floue";
  } else if (lStar < 18) {
    qualityGrade = "sous_exposee";
  } else if (specularGlarePct > 16 || lStar > 88) {
    qualityGrade = "surexposee";
  } else if (sharpnessScore < 55 || specularGlarePct > 9) {
    qualityGrade = "acceptable";
  }

  return {
    lStar,
    aStar,
    bStar,
    itaDegrees,
    itaPhototypeHint,
    pigmentHeterogeneity,
    erythemaIndex,
    melaninIndex,
    hemoglobinIndex,
    poreRoughnessIndex,
    makeupOrFilterLikely,
    sharpnessScore,
    specularGlarePct,
    qualityGrade,
    subzones,
  };
}

/**
 * Injecte les métriques optiques dans un segment standard JPEG COM (0xFF 0xFE)
 * juste après l'en-tête SOI (0xFF 0xD8).
 * Le fichier reste 100% conforme au standard JPEG (commence par FF D8 FF).
 */
export function injectOpticalTelemetryIntoJpegDataUrl(
  dataUrl: string,
  metrics: OpticalSkinMetrics,
): string {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0 || !dataUrl.slice(0, comma).includes("image/jpeg")) return dataUrl;
    const header = dataUrl.slice(0, comma + 1);
    const b64 = dataUrl.slice(comma + 1);

    const binaryStr = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
    if (binaryStr.length < 4 || binaryStr.charCodeAt(0) !== 0xff || binaryStr.charCodeAt(1) !== 0xd8) {
      return dataUrl;
    }

    const payload = `${JPEG_COM_PREFIX}${JSON.stringify(metrics)}`;
    const payloadBytes = new TextEncoder().encode(payload);
    const segLen = payloadBytes.length + 2;
    if (segLen > 65530) return dataUrl;

    const out = new Uint8Array(binaryStr.length + 2 + segLen);
    out[0] = 0xff;
    out[1] = 0xd8;
    out[2] = 0xff;
    out[3] = 0xfe; // Marqueur JPEG COM
    out[4] = (segLen >> 8) & 0xff;
    out[5] = segLen & 0xff;
    out.set(payloadBytes, 6);

    for (let i = 2; i < binaryStr.length; i++) {
      out[i + 2 + segLen] = binaryStr.charCodeAt(i);
    }

    if (typeof Buffer !== "undefined") {
      return header + Buffer.from(out).toString("base64");
    }
    let outBin = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < out.length; i += chunkSize) {
      outBin += String.fromCharCode(...out.subarray(i, i + chunkSize));
    }
    return header + btoa(outBin);
  } catch {
    return dataUrl;
  }
}

/**
 * Extrait en < 0.1 ms les métriques optiques embarquées dans le segment JPEG COM (0xFF 0xFE)
 * d'une dataURL JPEG, sans aucune dépendance native.
 */
export function extractOpticalTelemetryFromDataUrl(dataUrl: string): OpticalSkinMetrics | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    // Les premiers ~3 Ko du base64 couvrent largement l'en-tête JPEG + les 5 sous-zones ROI
    const headB64 = dataUrl.slice(comma + 1, comma + 1 + 4096);
    const buf =
      typeof Buffer !== "undefined"
        ? Buffer.from(headB64, "base64")
        : Uint8Array.from(atob(headB64), (c) => c.charCodeAt(0));

    if (buf.length < 10 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

    let offset = 2;
    while (offset + 4 < buf.length && buf[offset] === 0xff) {
      const marker = buf[offset + 1];
      if (marker === 0xda || marker === 0xd9) break; // SOS ou EOI
      const segLen = (buf[offset + 2] << 8) | buf[offset + 3];
      if (segLen < 2 || offset + 2 + segLen > buf.length) break;

      if (marker === 0xfe) {
        const segBytes = buf.subarray(offset + 4, offset + 2 + segLen);
        const text = new TextDecoder().decode(segBytes);
        if (text.startsWith(JPEG_COM_PREFIX)) {
          const parsed = JSON.parse(text.slice(JPEG_COM_PREFIX.length)) as OpticalSkinMetrics;
          if (parsed && typeof parsed.lStar === "number" && typeof parsed.itaDegrees === "number") {
            return parsed;
          }
        }
      }
      offset += 2 + segLen;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Formate un résumé concis des biomarqueurs optiques (CIE L*a*b*, Lambert-Beer, GLCM, 5 sous-zones ROI)
 * pour injection dans le prompt VLM.
 */
export function formatOpticalTelemetryForPrompt(metricsList: (OpticalSkinMetrics | null)[]): string {
  const valid = metricsList.filter((m): m is OpticalSkinMetrics => m !== null);
  if (valid.length === 0) return "";

  const avg = (fn: (m: OpticalSkinMetrics) => number) =>
    Math.round((valid.reduce((s, m) => s + fn(m), 0) / valid.length) * 10) / 10;

  const lStar = avg((m) => m.lStar);
  const aStar = avg((m) => m.aStar);
  const bStar = avg((m) => m.bStar);
  const ita = avg((m) => m.itaDegrees);
  const het = Math.round(avg((m) => m.pigmentHeterogeneity));
  const ery = Math.round(avg((m) => m.erythemaIndex));
  const melIdx = Math.round(avg((m) => m.melaninIndex ?? 62));
  const hemoIdx = Math.round(avg((m) => m.hemoglobinIndex ?? ery));
  const poreIdx = Math.round(avg((m) => m.poreRoughnessIndex ?? 32));
  const sharp = Math.round(avg((m) => m.sharpnessScore));
  const glare = avg((m) => m.specularGlarePct);
  const makeupDetected = valid.some((m) => m.makeupOrFilterLikely === true);
  const hint = phototypeFromIta(ita);

  const hetDesc =
    het >= 45 ? "forte dispersion pigmentaire (taches PIH/mélasma probable)" : het >= 24 ? "dispersion pigmentaire modérée" : "teint homogène";
  const eryDesc =
    ery >= 48 ? "composante inflammatoire/érythémateuse sous-jacente marquée" : ery >= 28 ? "légère réactivité vasculaire" : "calme";
  const glareNote =
    glare > 10
      ? `Attention : ${glare}% de reflet lumineux direct détecté (ne pas confondre reflet de lampe et excès de sébum).`
      : "";
  const makeupNote = makeupDetected
    ? "Alerte optique : lissage haute fréquence détecté (filtre beauté ou fond de teint couvrant probable — pondérer les scores d'uniformité et de pores avec prudence)."
    : "";

  // Synthèse des sous-zones anatomiques les plus réactives (pour ancrer chirurgicalement les "marks")
  const primarySubzones = valid[0]?.subzones ?? [];
  const activeRois = primarySubzones
    .filter((z) => z.severity >= 1)
    .sort((a, b) => b.severity - a.severity || b.pigmentScore + b.erythemaScore - (a.pigmentScore + a.erythemaScore))
    .slice(0, 4)
    .map(
      (z) =>
        `${z.label} [x=${z.x},y=${z.y},w=${z.w},h=${z.h},sev=${z.severity},dominante=${z.dominantIssue},ΔE=${z.deltaEFromMean}]`,
    );
  const roiLine =
    activeRois.length > 0
      ? ` Cartographie ROI par sous-zones anatomiques : ${activeRois.join(" ; ")}.`
      : "";

  return `\nBiomarqueurs optiques mesurés (CIE L*a*b* + Lambert-Beer) : L*=${lStar}, a*=${aStar}, b*=${bStar}, Angle ITA°=${ita}° (nuance optique : ${hint}), Indice Mélanine=${melIdx}/100, Oxyhémoglobine=${hemoIdx}/100, Hétérogénéité pigmentaire=${het}/100 (${hetDesc}), Érythème compensé=${ery}/100 (${eryDesc}), Micro-relief/Pores GLCM=${poreIdx}/100, Netteté=${sharp}/100.${glareNote ? ` ${glareNote}` : ""}${makeupNote ? ` ${makeupNote}` : ""}${roiLine}`;
}
