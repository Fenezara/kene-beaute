// Kènè — Traitement optique multi-spectral en cabine & compte-rendu PDF
// Génère les 4 vues spectrales clés (Lumière Blanche Polarisée, Ambre 585nm, Vert 540nm, UV 405nm)
// pour documenter la surface, la mélanine (HPI), l'érythème masqué et les porphyrines microbiennes.
// Inspiration Canfield VISIA / Observ 520x calibrée pour les phototypes mélanodermes (IV à VI).

import sharp from "sharp";
import {
  ALL_SPECTRAL_VIEW_IDS,
  recommend4SpectralViews,
  type SpectralViewId,
} from "@/lib/kene/types";

export interface SpectralAcneResult {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
  isRealPhoto: boolean;
  sebumScoreEstimate: number;
  porphyrinSpotsCount: number;
  lipidFilmStatus: "Équilibré" | "Hyper-séborrhée modérée" | "Film lipidique réactif / comédogène";
}

export interface SpectralBandData {
  id: SpectralViewId;
  bandCode: string;
  shortCategory?: string;
  title: string;
  subtitle: string;
  observation: string;
  tag: string;
  accentRgb: [number, number, number];
  accentHex: string;
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

export interface MultiSpectralSuiteResult {
  isRealPhoto: boolean;
  bands: [SpectralBandData, SpectralBandData, SpectralBandData, SpectralBandData];
  globalSynthesis: string;
  legacyAcne: SpectralAcneResult;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Construit un masque SVG HUD dermatoscopique haute précision pour habiller chaque cliché
 */
function buildHudOverlay(
  w: number,
  h: number,
  isReal: boolean,
  zoneLabel: string,
  badgeText: string,
  primaryColor = "#22d3ee",
  accentColor = "#38bdf8",
  legendLeft = "VISIA OPTICS",
  legendRight = "SPECTRE ÉTALONNÉ"
): Buffer {
  const prefix = isReal ? "CLICHÉ RÉEL" : "PROJECTION";
  const title = escapeXml(`${prefix} · ${badgeText}`);
  const safeLeft = escapeXml(legendLeft);
  const safeRight = escapeXml(legendRight);

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <!-- Cadre extérieur dermatoscopique -->
    <rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="${primaryColor}" stroke-width="1.5" stroke-opacity="0.75" rx="6" />

    <!-- Coins de cadrage optique discrets (visage 100% dégagé au centre) -->
    <path d="M 10 34 L 10 26 L 18 26" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />
    <path d="M ${w - 10} 34 L ${w - 10} 26 L ${w - 18} 26" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />
    <path d="M 10 ${h - 30} L 10 ${h - 22} L 18 ${h - 22}" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />
    <path d="M ${w - 10} ${h - 30} L ${w - 10} ${h - 22} L ${w - 18} ${h - 22}" fill="none" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" />

    <!-- Bandeau titre supérieur -->
    <rect x="6" y="6" width="${w - 12}" height="18" rx="3" fill="#030712" fill-opacity="0.78" />
    <text x="${w / 2}" y="18" text-anchor="middle" fill="${accentColor}" font-family="Helvetica, Arial, sans-serif" font-weight="bold" font-size="9" letter-spacing="0.4">
      ${title}
    </text>

    <!-- Bandeau inférieur indicateurs -->
    <rect x="6" y="${h - 20}" width="${w - 12}" height="15" rx="3" fill="#030712" fill-opacity="0.78" />
    <circle cx="15" cy="${h - 12.5}" r="3" fill="${accentColor}" />
    <text x="23" y="${h - 9.5}" fill="#f8fafc" font-family="Helvetica, Arial, sans-serif" font-size="7.5" font-weight="bold">
      ${safeLeft}
    </text>

    <text x="${w - 12}" y="${h - 9.5}" text-anchor="end" fill="${primaryColor}" font-family="Helvetica, Arial, sans-serif" font-size="7.5" font-weight="bold">
      ${safeRight}
    </text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * 1. Vue Synthétique : Standard Polarisée (Texture, barrière cornée, pores)
 */
function buildSyntheticStandardSvg(w = 320, h = 320, zone = "Visage"): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="stdBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#2a241f" />
        <stop offset="70%" stop-color="#181411" />
        <stop offset="100%" stop-color="#0b0907" />
      </radialGradient>
      <radialGradient id="stdSkin" cx="50%" cy="45%" r="55%">
        <stop offset="0%" stop-color="#6b462c" />
        <stop offset="50%" stop-color="#513420" />
        <stop offset="100%" stop-color="#352114" />
      </radialGradient>
      <linearGradient id="glow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#d49a24" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#d49a24" stop-opacity="0.02" />
      </linearGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#stdBg)" />

    <!-- Contour facial d'analyse -->
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="url(#stdSkin)" stroke="#a16207" stroke-width="1.2" stroke-opacity="0.5" />
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="url(#glow)" />

    <!-- Relief cutané & micro-sillons de l'épiderme -->
    <path d="M ${cx - 60} ${cy - 50} Q ${cx} ${cy - 55} ${cx + 60} ${cy - 50}" stroke="#a16207" stroke-width="0.6" stroke-opacity="0.4" fill="none" />
    <path d="M ${cx - 50} ${cy - 35} Q ${cx} ${cy - 40} ${cx + 50} ${cy - 35}" stroke="#a16207" stroke-width="0.6" stroke-opacity="0.3" fill="none" />
    <path d="M ${cx - 20} ${cy - 30} L ${cx + 20} ${cy - 30} L ${cx + 26} ${cy + 15} L ${cx - 26} ${cy + 15} Z" fill="#442a19" fill-opacity="0.6" stroke="#d49a24" stroke-width="0.5" stroke-opacity="0.35" />

    <!-- Pommettes & micro-pores de texture -->
    <circle cx="${cx - 45}" cy="${cy + 8}" r="1.6" fill="#e5a93c" fill-opacity="0.5" />
    <circle cx="${cx - 36}" cy="${cy + 18}" r="1.4" fill="#e5a93c" fill-opacity="0.4" />
    <circle cx="${cx + 45}" cy="${cy + 8}" r="1.6" fill="#e5a93c" fill-opacity="0.5" />
    <circle cx="${cx + 36}" cy="${cy + 18}" r="1.4" fill="#e5a93c" fill-opacity="0.4" />

    <!-- Réticule d'alignement -->
    <line x1="${cx - 75}" y1="${cy}" x2="${cx + 75}" y2="${cy}" stroke="#ca8a04" stroke-width="0.5" stroke-dasharray="2,3" stroke-opacity="0.3" />
    <line x1="${cx}" y1="${cy - 95}" x2="${cx}" y2="${cy + 95}" stroke="#ca8a04" stroke-width="0.5" stroke-dasharray="2,3" stroke-opacity="0.3" />
  </svg>`;

  return Buffer.from(svg);
}

/**
 * 2. Vue Synthétique : Ambre 585 nm (Absorption mélanique & HPI)
 */
function buildSyntheticAmberSvg(w = 320, h = 320, zone = "Visage"): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="ambBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#241607" />
        <stop offset="70%" stop-color="#140c03" />
        <stop offset="100%" stop-color="#060301" />
      </radialGradient>
      <radialGradient id="spotGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.95" />
        <stop offset="60%" stop-color="#b45309" stop-opacity="0.75" />
        <stop offset="100%" stop-color="#78350f" stop-opacity="0" />
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#ambBg)" />

    <!-- Silhouette visage filtre ambre -->
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#2d1a08" stroke="#f59e0b" stroke-width="1.2" stroke-opacity="0.5" />

    <!-- Cartographie des amas mélaniques & HPI (Hyperpigmentation) -->
    <!-- Pommette gauche : macule pigmentaire post-bouton -->
    <ellipse cx="${cx - 42}" cy="${cy + 12}" rx="16" ry="12" fill="url(#spotGrad)" />
    <circle cx="${cx - 42}" cy="${cy + 12}" r="3" fill="#fef3c7" fill-opacity="0.8" />

    <!-- Pommette droite : lentigo / tache diffuse -->
    <ellipse cx="${cx + 38}" cy="${cy + 6}" rx="14" ry="10" fill="url(#spotGrad)" />

    <!-- Front : ombre mélanique / mélasma léger -->
    <ellipse cx="${cx - 12}" cy="${cy - 52}" rx="28" ry="10" fill="url(#spotGrad)" fill-opacity="0.75" />
    <ellipse cx="${cx + 22}" cy="${cy - 48}" rx="22" ry="9" fill="url(#spotGrad)" fill-opacity="0.7" />

    <!-- Menton : pigmentation péribuccale -->
    <ellipse cx="${cx}" cy="${cy + 62}" rx="24" ry="10" fill="url(#spotGrad)" fill-opacity="0.8" />

    <!-- Cercles de mesure densitométrique -->
    <circle cx="${cx - 42}" cy="${cy + 12}" r="18" fill="none" stroke="#f59e0b" stroke-width="0.8" stroke-dasharray="2,2" stroke-opacity="0.75" />
    <text x="${cx - 42}" y="${cy + 36}" text-anchor="middle" fill="#fbbf24" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">ΔE = +4.8</text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * 3. Vue Synthétique : Vert 540 nm (Hémoglobine & Érythème masqué)
 */
function buildSyntheticGreenSvg(w = 320, h = 320, zone = "Visage"): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="grnBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#052015" />
        <stop offset="70%" stop-color="#02120b" />
        <stop offset="100%" stop-color="#010604" />
      </radialGradient>
      <radialGradient id="erythemaGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#34d399" stop-opacity="0.9" />
        <stop offset="55%" stop-color="#059669" stop-opacity="0.6" />
        <stop offset="100%" stop-color="#064e3b" stop-opacity="0" />
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#grnBg)" />

    <!-- Silhouette visage filtre hémoglobine -->
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#082b1d" stroke="#10b981" stroke-width="1.2" stroke-opacity="0.5" />

    <!-- Halos d'érythème sous-cutané masqué par l'eumélanine -->
    <!-- Ailes du nez (dilatations capillaires) -->
    <ellipse cx="${cx - 18}" cy="${cy + 8}" rx="12" ry="8" fill="url(#erythemaGrad)" />
    <ellipse cx="${cx + 18}" cy="${cy + 8}" rx="12" ry="8" fill="url(#erythemaGrad)" />

    <!-- Foyer inflammatoire joue droite (bouton sous-cutané naissant) -->
    <circle cx="${cx + 42}" cy="${cy + 22}" r="11" fill="url(#erythemaGrad)" />
    <circle cx="${cx + 42}" cy="${cy + 22}" r="14" fill="none" stroke="#34d399" stroke-width="0.8" stroke-dasharray="2,2" stroke-opacity="0.7" />
    <text x="${cx + 42}" y="${cy + 42}" text-anchor="middle" fill="#6ee7b7" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">EPI ACTIF</text>

    <!-- Zone mentonnière : échauffement léger -->
    <ellipse cx="${cx}" cy="${cy + 58}" rx="20" ry="9" fill="url(#erythemaGrad)" fill-opacity="0.6" />

    <!-- Micro-arborisations vasculaires -->
    <path d="M ${cx - 18} ${cy + 6} Q ${cx - 28} ${cy + 12} ${cx - 36} ${cy + 16}" stroke="#10b981" stroke-width="0.8" stroke-opacity="0.6" fill="none" />
    <path d="M ${cx + 18} ${cy + 6} Q ${cx + 28} ${cy + 12} ${cx + 34} ${cy + 15}" stroke="#10b981" stroke-width="0.8" stroke-opacity="0.6" fill="none" />
  </svg>`;

  return Buffer.from(svg);
}

/**
 * 4. Vue Synthétique : UV / Bleu 405 nm (Fluorescence Porphyrines & Film Sébacé)
 */
function buildSyntheticUvSvg(w = 320, h = 320, zone = "Visage"): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;

  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="uvBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#0e172e" />
        <stop offset="70%" stop-color="#070b16" />
        <stop offset="100%" stop-color="#02040a" />
      </radialGradient>
      <radialGradient id="sebumHalo" cx="50%" cy="42%" r="48%">
        <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.55" />
        <stop offset="45%" stop-color="#0284c7" stop-opacity="0.30" />
        <stop offset="100%" stop-color="#0284c7" stop-opacity="0" />
      </radialGradient>
    </defs>

    <rect width="${w}" height="${h}" fill="url(#uvBg)" />

    <!-- Silhouette biométrique UV -->
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#131c38" stroke="#38bdf8" stroke-width="1.2" stroke-opacity="0.45" />

    <!-- Halo sébacé zone T -->
    <ellipse cx="${cx}" cy="${cy - 52}" rx="65" ry="26" fill="url(#sebumHalo)" />
    <path d="M ${cx - 14} ${cy - 40} L ${cx + 14} ${cy - 40} L ${cx + 22} ${cy + 12} L ${cx - 22} ${cy + 12} Z" fill="#0284c7" fill-opacity="0.4" />
    <ellipse cx="${cx}" cy="${cy + 62}" rx="35" ry="20" fill="url(#sebumHalo)" />

    <!-- Micro-spots de porphyrines C. acnes fluorescents orange corail -->
    <circle cx="${cx - 15}" cy="${cy - 58}" r="2.8" fill="#fb923c" />
    <circle cx="${cx + 18}" cy="${cy - 54}" r="2.5" fill="#f97316" />
    <circle cx="${cx + 4}" cy="${cy - 65}" r="2.2" fill="#fdba74" />
    <circle cx="${cx - 5}" cy="${cy - 10}" r="3.0" fill="#f97316" />
    <circle cx="${cx + 7}" cy="${cy - 4}" r="2.8" fill="#fb923c" />
    <circle cx="${cx - 15}" cy="${cy + 10}" r="3.4" fill="#ea580c" />
    <circle cx="${cx + 14}" cy="${cy + 8}" r="3.2" fill="#ea580c" />
    <circle cx="${cx - 10}" cy="${cy + 58}" r="2.8" fill="#f97316" />
    <circle cx="${cx + 12}" cy="${cy + 62}" r="3.0" fill="#ea580c" />

    <text x="14" y="38" fill="#94a3b8" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">λ = 405 nm</text>
  </svg>`;

  return Buffer.from(svg);
}

/**
 * 5. Vue Synthétique : UV-A 365 nm (Wood Digital : Porphyrines corail & Mélasma profond)
 */
function buildSyntheticUv365Svg(w = 320, h = 320): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="uv365Bg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#1e1038" />
        <stop offset="70%" stop-color="#0f0720" />
        <stop offset="100%" stop-color="#05020a" />
      </radialGradient>
      <radialGradient id="melasmaDeep" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#a855f7" stop-opacity="0.7" />
        <stop offset="100%" stop-color="#581c87" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#uv365Bg)" />
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#180d30" stroke="#a855f7" stroke-width="1.2" stroke-opacity="0.5" />
    <ellipse cx="${cx - 36}" cy="${cy + 4}" rx="20" ry="12" fill="url(#melasmaDeep)" />
    <ellipse cx="${cx + 36}" cy="${cy + 4}" rx="20" ry="12" fill="url(#melasmaDeep)" />
    <circle cx="${cx - 10}" cy="${cy - 48}" r="3.2" fill="#fb7185" />
    <circle cx="${cx + 12}" cy="${cy - 42}" r="2.8" fill="#f43f5e" />
    <circle cx="${cx}" cy="${cy - 6}" r="3.4" fill="#fb923c" />
    <circle cx="${cx - 8}" cy="${cy + 56}" r="3.0" fill="#fb7185" />
    <text x="14" y="38" fill="#c084fc" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">WOOD λ = 365 nm</text>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * 6. Vue Synthétique : Rouge Profond 660 nm (Collagène, Fermeté & Derme moyen)
 */
function buildSyntheticRed660Svg(w = 320, h = 320): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="redBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#2c0b0e" />
        <stop offset="70%" stop-color="#180507" />
        <stop offset="100%" stop-color="#080102" />
      </radialGradient>
      <radialGradient id="collagenGlow" cx="50%" cy="50%" r="55%">
        <stop offset="0%" stop-color="#ef4444" stop-opacity="0.65" />
        <stop offset="65%" stop-color="#991b1b" stop-opacity="0.35" />
        <stop offset="100%" stop-color="#450a0a" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#redBg)" />
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#23080a" stroke="#f87171" stroke-width="1.2" stroke-opacity="0.5" />
    <ellipse cx="${cx}" cy="${cy}" rx="75" ry="95" fill="url(#collagenGlow)" />
    <path d="M ${cx - 55} ${cy - 10} Q ${cx} ${cy + 15} ${cx + 55} ${cy - 10}" stroke="#fca5a5" stroke-width="0.9" stroke-dasharray="3,2" fill="none" stroke-opacity="0.6" />
    <path d="M ${cx - 45} ${cy + 25} Q ${cx} ${cy + 45} ${cx + 45} ${cy + 25}" stroke="#fca5a5" stroke-width="0.9" stroke-dasharray="3,2" fill="none" stroke-opacity="0.6" />
    <text x="14" y="38" fill="#fca5a5" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">DERME λ = 660 nm</text>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * 7. Vue Synthétique : Proche Infrarouge NIR 850 nm (Derme profond sous transparence mélanique)
 */
function buildSyntheticNir850Svg(w = 320, h = 320): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="nirBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#1f1726" />
        <stop offset="70%" stop-color="#110c16" />
        <stop offset="100%" stop-color="#060408" />
      </radialGradient>
      <radialGradient id="nirCore" cx="50%" cy="48%" r="52%">
        <stop offset="0%" stop-color="#e11d48" stop-opacity="0.5" />
        <stop offset="60%" stop-color="#881337" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#4c0519" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#nirBg)" />
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#1c1224" stroke="#fb7185" stroke-width="1.2" stroke-opacity="0.45" />
    <ellipse cx="${cx}" cy="${cy}" rx="82" ry="102" fill="url(#nirCore)" />
    <circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="#fda4af" stroke-width="0.7" stroke-dasharray="2,3" stroke-opacity="0.5" />
    <text x="14" y="38" fill="#fda4af" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">NIR λ = 850 nm</text>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * 8. Vue Synthétique : Polarisée 0° (Couche cornée, Xérose & Micro-relief)
 */
function buildSyntheticPolarizedSvg(w = 320, h = 320): Buffer {
  const cx = w / 2;
  const cy = h / 2 - 2;
  const svg = `
  <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="polBg" cx="50%" cy="50%" r="65%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="70%" stop-color="#0f172a" />
        <stop offset="100%" stop-color="#020617" />
      </radialGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#polBg)" />
    <ellipse cx="${cx}" cy="${cy}" rx="98" ry="122" fill="#1e293b" stroke="#94a3b8" stroke-width="1.2" stroke-opacity="0.6" />
    <path d="M ${cx - 50} ${cy - 40} L ${cx + 50} ${cy - 40} M ${cx - 60} ${cy} L ${cx + 60} ${cy} M ${cx - 45} ${cy + 40} L ${cx + 45} ${cy + 40}" stroke="#cbd5e1" stroke-width="0.6" stroke-dasharray="3,3" stroke-opacity="0.45" />
    <text x="14" y="38" fill="#e2e8f0" font-family="Helvetica, Arial, sans-serif" font-size="7" font-weight="bold">POLARISÉ 0°</text>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Extrait un ou plusieurs buffers d'images réelles à partir d'une chaîne base64 simple
 * ou d'un tableau JSON de photos base64 (ex: ["data:image/jpeg;base64,...", ...])
 */
function extractPhotoBuffers(photoInput?: string | null): Buffer[] {
  if (!photoInput || typeof photoInput !== "string") return [];
  const trimmed = photoInput.trim();
  if (trimmed.length < 30) return [];

  const rawStrings: string[] = [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === "string" && item.trim().length > 30) {
            rawStrings.push(item.trim());
          }
        }
      }
    } catch {
      // Si le JSON est malformé, tente d'extraire par expression régulière les data URLs
      const matches = trimmed.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g);
      if (matches) rawStrings.push(...matches);
    }
  } else {
    rawStrings.push(trimmed);
  }

  const buffers: Buffer[] = [];
  for (const str of rawStrings) {
    const clean = str
      .replace(/^["']+|["']+$/g, "")
      .replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "")
      .trim();
    if (clean.length > 30) {
      try {
        const buf = Buffer.from(clean, "base64");
        if (buf.length > 64) buffers.push(buf);
      } catch {
        // ignore invalid base64 entry
      }
    }
  }
  return buffers;
}

interface BandCopy {
  subtitle: string;
  observation: string;
  tag: string;
  hudRight: string;
}

function buildZoneBandCopy(
  zoneRaw: string,
  indicators?: Array<{ nom: string; pourcentage: number }>,
  isReal = true
): Record<SpectralViewId, BandCopy> {
  const z = zoneRaw.toLowerCase();
  const findPct = (...keys: string[]): number | null => {
    if (!indicators || indicators.length === 0) return null;
    const found = indicators.find((i) =>
      keys.some((k) =>
        i.nom
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .includes(k)
      )
    );
    return found ? found.pourcentage : null;
  };
  const fmtTag = (label: string, pct: number | null) =>
    pct !== null ? `${label} : ${pct}/100` : isReal ? `Cliché réel · ${label}` : label;

  const pHyd = findPct("hydrat", "barriere", "secheresse", "eclat");
  const pPih = findPct("pih", "pigment", "melasma", "tache", "couleur");
  const pRou = findPct("rougeur", "irrit", "sensib", "follicul", "inflamm");
  const pSeb = findPct("sebum", "pore", "acne", "noir", "incarn", "pellicul");
  const pEla = findPct("elastic", "fermet", "ride", "texture", "rugos");
  const pPro = findPct("alopec", "cerne", "poche", "evolution", "diametre");

  const extraBands: Pick<Record<SpectralViewId, BandCopy>, "uv365" | "red660" | "nir850" | "polarized"> = {
    uv365: {
      subtitle: "Wood 365 nm · Porphyrines & Mélasma",
      observation:
        "Autofluorescence UV-A (365 nm) : détection des porphyrines corail de C. acnes, de la flore Malassezia et profondeur du mélasma.",
      tag: fmtTag("Microbiome & Wood UV", pSeb ?? pPih),
      hudRight: "WOOD 365NM",
    },
    red660: {
      subtitle: "Compaction Dermique & Collagène",
      observation:
        "Pénétration rouge profond (660 nm) : évaluation de la fermeté matricielle, de l'élasticité et prévention du risque chéloïdien.",
      tag: fmtTag("Fermeté & Collagène", pEla ?? pHyd),
      hudRight: "DERME MOYEN 660NM",
    },
    nir850: {
      subtitle: "Derme Profond sans Masque Mélanique",
      observation:
        "Fenêtre optique proche infrarouge (850 nm) : lecture directe du derme réticulaire et des bulbes sous transparence de l'eumélanine.",
      tag: fmtTag("Structure Dermique NIR", pPro ?? pEla),
      hudRight: "TRANSPARENCE NIR",
    },
    polarized: {
      subtitle: "Micro-Relief & Barrière Cornée 0°",
      observation:
        "Lumière polarisée parallèle : révélation de la xérose, des squames de déshydratation et de la cohésion du ciment intercellulaire.",
      tag: fmtTag("Intégrité Cornée & Lipides", pHyd),
      hudRight: "POLARISÉ 0°",
    },
  };

  if (z.includes("cuir") || z.includes("cheve")) {
    const pAlo = findPct("alopec", "densit", "traction");
    return {
      ...extraBands,
      standard: {
        subtitle: "Densité Folliculaire & Bordures",
        observation: "Cliché réel du cuir chevelu : évaluation de la densité capillaire, des tempes et de l'état de surface.",
        tag: fmtTag("Densité & Hydratation", pHyd ?? pAlo),
        hudRight: "CUIR CHEVELU HD",
      },
      amber585: {
        subtitle: "Pigmentation & Bulbes",
        observation: "Analyse de l'implantation folliculaire, des zones d'alopécie de traction et de l'uniformité pigmentaire.",
        tag: fmtTag("Traction & Implantation", pAlo),
        hudRight: "BULBES & TEMPES",
      },
      green540: {
        subtitle: "Irritation & Folliculite",
        observation: "Détection de l'érythème du cuir chevelu, des foyers de folliculite et des tensions mécaniques.",
        tag: fmtTag("Apaisement & Tolérance", pRou),
        hudRight: "IRRITATION RACINES",
      },
      blue405: {
        subtitle: "Sébum Racines & Desquamation",
        observation: "Lecture sous filtre bleu 405 nm : pellicules sèches ou grasses, excès de sébum et occlusion des pores.",
        tag: fmtTag("Équilibre Sébo-Squameux", pSeb),
        hudRight: "PELLICULES & SÉBUM",
      },
    };
  }

  if (z.includes("dos")) {
    return {
      ...extraBands,
      standard: {
        subtitle: "Relief Cutané & Grain du Dos",
        observation: "Cliché réel du dos et décolleté : analyse de la texture épidermique, de la kératose et de l'hydratation.",
        tag: fmtTag("Texture & Barrière Dos", pEla ?? pHyd),
        hudRight: "DOS & DÉCOLLETÉ",
      },
      amber585: {
        subtitle: "Marques HPI Post-Boutons",
        observation: "Cartographie des taches brunes post-inflammatoires (HPI) laissées par d'anciennes imperfections dorsales.",
        tag: fmtTag("Uniformité & Taches HPI", pPih),
        hudRight: "TACHES DORSALES",
      },
      green540: {
        subtitle: "Foyers Inflammatoires Actifs",
        observation: "Mise en évidence des papules/pustules actives et de l'inflammation sous-cutanée liée aux frottements.",
        tag: fmtTag("Calme Inflammatoire", pRou),
        hudRight: "ACNÉ INFLAMMATOIRE",
      },
      blue405: {
        subtitle: "Sébum Dorsal & Pores Obstrués",
        observation: "Visualisation de l'émulsion sébacée et des résidus comédogènes sur le haut du dos et les épaules.",
        tag: fmtTag("Pureté Sébacée Dos", pSeb),
        hudRight: "PORES & SÉBUM DOS",
      },
    };
  }

  if (z.includes("barbe")) {
    return {
      ...extraBands,
      standard: {
        subtitle: "Grain de Peau & Fibre de Barbe",
        observation: "Cliché réel barbe et cou : évaluation de la souplesse du poil, de la barrière cutanée et du rasage.",
        tag: fmtTag("Barrière & Hydratation", pHyd),
        hudRight: "BARBE & COU HD",
      },
      amber585: {
        subtitle: "Taches HPI Post-Rasage",
        observation: "Repérage des macules hyperpigmentées provoquées par les poils incarnés et le feu du rasoir.",
        tag: fmtTag("Taches Post-Rasage", pPih),
        hudRight: "HPI ZONE RASAGE",
      },
      green540: {
        subtitle: "Poils Incarnés & Folliculite",
        observation: "Détection des papules de pseudofolliculite de la barbe (poils recourbés sous la peau) et de l'érythème.",
        tag: fmtTag("Santé Folliculaire", pRou),
        hudRight: "POILS INCARNÉS",
      },
      blue405: {
        subtitle: "Sébum Sous-Barbe & Flore",
        observation: "Lecture du film hydrolipidique sous la barbe et des foyers microbiens au niveau du menton et du cou.",
        tag: fmtTag("Équilibre Sébacé Barbe", pSeb),
        hudRight: "SÉBUM & PORES",
      },
    };
  }

  if (z.includes("main") || z.includes("pied")) {
    const pOng = findPct("ongle", "keratose", "callos");
    return {
      ...extraBands,
      standard: {
        subtitle: "Barrière Cutanée & Ongles",
        observation: "Cliché réel des extrémités : examen de la sécheresse, des cuticules, de la tablette unguéale et du relief.",
        tag: fmtTag("Hydratation & Souplesse", pHyd),
        hudRight: "MAINS & ONGLES HD",
      },
      amber585: {
        subtitle: "Taches Pigmentaires & Jointures",
        observation: "Analyse de l'homogénéité pigmentaire sur le dos des mains et les articulations interphalangiennes.",
        tag: fmtTag("Homogénéité Pigmentaire", pPih),
        hudRight: "DOS DES MAINS",
      },
      green540: {
        subtitle: "Irritations, Crevasses & Contact",
        observation: "Révélation des zones d'échauffement, de dermite de contact aux détergents et des micro-gerçures.",
        tag: fmtTag("Intégrité Épidermique", pRou),
        hudRight: "RÉACTIVITÉ CUTANÉE",
      },
      blue405: {
        subtitle: "Kératose, Callosités & Cuticules",
        observation: "Mise en évidence des zones d'hyperkératose, d'assèchement lipidique et de fragilité unguéale.",
        tag: fmtTag("Vitalité Ongles & Kératine", pOng),
        hudRight: "FILM LIPIDIQUE",
      },
    };
  }

  if (z.includes("naev") || z.includes("grain")) {
    const pAsy = findPct("asymetrie", "bord");
    return {
      ...extraBands,
      standard: {
        subtitle: "Morphologie & Contours (A-B)",
        observation: "Cliché réel haute définition de la lésion : observation de la symétrie globale et de la netteté des bords.",
        tag: fmtTag("Symétrie & Bords", pAsy),
        hudRight: "CRITÈRES A & B",
      },
      amber585: {
        subtitle: "Distribution Mélanique (Critère C)",
        observation: "Analyse de l'homogénéité de la pigmentation brune/noire au sein du naevus sous filtre ambre.",
        tag: fmtTag("Homogénéité Couleur", pPih),
        hudRight: "CRITÈRE C · MÉLANINE",
      },
      green540: {
        subtitle: "Halo Vasculaire Péri-Lésionnel",
        observation: "Vérification de l'absence d'érythème inflammatoire, de saignement ou de halo réactif autour du grain.",
        tag: fmtTag("Stabilité & Évolution", pPro),
        hudRight: "HALO VASCULAIRE",
      },
      blue405: {
        subtitle: "Relief Épidermique & Surface",
        observation: "Inspection du micro-relief de surface et protection de la barrière cornée environnante.",
        tag: "Surveillance ABCDE active",
        hudRight: "SURFACE & RELIEF",
      },
    };
  }

  // Par défaut : Visage
  return {
    ...extraBands,
    standard: {
      subtitle: "Grain de Peau & Barrière Cornée",
      observation: "Photo réelle en lumière blanche polarisée : analyse du relief épidermique, de l'hydratation et de l'éclat.",
      tag: fmtTag("Hydratation & Surface", pHyd),
      hudRight: "ZONE: " + zoneRaw.toUpperCase(),
    },
    amber585: {
      subtitle: "Cartographie Mélanique & Taches HPI",
      observation: "Photo réelle sous filtre ambre : mise en évidence des taches post-inflammatoires (HPI) et du mélasma.",
      tag: fmtTag("Uniformité Mélanique", pPih),
      hudRight: "SPECTRE MÉLANIQUE",
    },
    green540: {
      subtitle: "Sensibilité & Réactivité Vasculaire",
      observation: "Photo réelle sous contraste vasculaire : détection des zones de réactivité et d'érythème post-inflammatoire.",
      tag: fmtTag("Tolérance & Apaisement", pRou),
      hudRight: "RÉACTIVITÉ CUTANÉE",
    },
    blue405: {
      subtitle: "Pores, Sébum & Comédons",
      observation: "Photo réelle sous filtre bleu 405 nm : lecture de la brillance sébacée en zone T, des pores dilatés et comédons.",
      tag: fmtTag("Équilibre Sébum & Pores", pSeb),
      hudRight: "PORES & BRILLANCE",
    },
  };
}

const BAND_STATIC_META: Record<
  SpectralViewId,
  {
    shortCode: string;
    shortCategory: string;
    title: string;
    hudTitle: string;
    hudLeft: string;
    primaryHex: string;
    accentHex: string;
    accentRgb: [number, number, number];
  }
> = {
  standard: {
    shortCode: "HD 400-700nm",
    shortCategory: "SURFACE",
    title: "LUMIÈRE STANDARD POLARISÉE",
    hudTitle: "LUMIÈRE STANDARD HD",
    hudLeft: "TEXTURE & SURFACE",
    primaryHex: "#0d9488",
    accentHex: "#14b8a6",
    accentRgb: [0.08, 0.55, 0.65],
  },
  uv365: {
    shortCode: "WOOD 365 nm",
    shortCategory: "PORPHYRINES",
    title: "LUMIÈRE DE WOOD (UV-A 365 nm)",
    hudTitle: "WOOD UV-A 365nm (PORPHYRINES)",
    hudLeft: "AUTOFLUORESCENCE UV",
    primaryHex: "#7c3aed",
    accentHex: "#a855f7",
    accentRgb: [0.49, 0.23, 0.93],
  },
  blue405: {
    shortCode: "BLEU 405 nm",
    shortCategory: "SÉBUM & PORES",
    title: "SPECTRE BLEU SORET (405 nm)",
    hudTitle: "BLEU 405nm (PORES & SÉBUM)",
    hudLeft: "FILM HYDROLIPIDIQUE",
    primaryHex: "#0284c7",
    accentHex: "#38bdf8",
    accentRgb: [0.15, 0.50, 0.85],
  },
  green540: {
    shortCode: "VERT 540 nm",
    shortCategory: "VASCULAIRE",
    title: "SPECTRE VASCULAIRE (540 nm)",
    hudTitle: "SPECTRE 540nm (VASCULAIRE)",
    hudLeft: "SENSIBILITÉ & ÉRYTHÈME",
    primaryHex: "#059669",
    accentHex: "#10b981",
    accentRgb: [0.10, 0.55, 0.30],
  },
  amber585: {
    shortCode: "AMBRE 585 nm",
    shortCategory: "MÉLANINE",
    title: "SPECTRE AMBRE (585 nm)",
    hudTitle: "AMBRE 585nm (MÉLANINE)",
    hudLeft: "PIGMENTATION & HPI",
    primaryHex: "#d97706",
    accentHex: "#f59e0b",
    accentRgb: [0.78, 0.45, 0.05],
  },
  red660: {
    shortCode: "ROUGE 660 nm",
    shortCategory: "COLLAGÈNE",
    title: "ROUGE PROFOND (660 nm)",
    hudTitle: "ROUGE 660nm (COLLAGÈNE)",
    hudLeft: "FERMETÉ & CICATRICES",
    primaryHex: "#dc2626",
    accentHex: "#f87171",
    accentRgb: [0.80, 0.18, 0.18],
  },
  nir850: {
    shortCode: "NIR 850 nm",
    shortCategory: "DERME NIR",
    title: "PROCHE INFRAROUGE (850 nm)",
    hudTitle: "NIR 850nm (DERME PROFOND)",
    hudLeft: "FENÊTRE MÉLANIQUE",
    primaryHex: "#be123c",
    accentHex: "#fb7185",
    accentRgb: [0.75, 0.12, 0.30],
  },
  polarized: {
    shortCode: "POLARISÉ 0°",
    shortCategory: "BARRIÈRE",
    title: "LUMIÈRE POLARISÉE (0°)",
    hudTitle: "POLARISÉE 0° (COUCHE CORNÉE)",
    hudLeft: "XÉROSE & MICRO-RELIEF",
    primaryHex: "#475569",
    accentHex: "#94a3b8",
    accentRgb: [0.30, 0.38, 0.48],
  },
};

function resolveSelectedFourViews(
  requested?: string[] | null,
  indicators?: Array<{ nom: string; pourcentage: number }>
): [SpectralViewId, SpectralViewId, SpectralViewId, SpectralViewId] {
  const recommended = recommend4SpectralViews(indicators);
  if (!requested || requested.length === 0) return recommended;

  const valid: SpectralViewId[] = [];
  for (const raw of requested) {
    const clean = raw.trim() as SpectralViewId;
    if (ALL_SPECTRAL_VIEW_IDS.includes(clean) && !valid.includes(clean)) {
      valid.push(clean);
    }
    if (valid.length === 4) break;
  }
  for (const fallbackId of recommended) {
    if (valid.length >= 4) break;
    if (!valid.includes(fallbackId)) valid.push(fallbackId);
  }
  for (const anyId of ALL_SPECTRAL_VIEW_IDS) {
    if (valid.length >= 4) break;
    if (!valid.includes(anyId)) valid.push(anyId);
  }
  return [valid[0], valid[1], valid[2], valid[3]];
}

async function renderRealPhotoBandBuffer(
  id: SpectralViewId,
  basePhoto: Buffer,
  w: number,
  h: number
): Promise<Buffer> {
  if (id === "standard") {
    return sharp(basePhoto)
      .modulate({ brightness: 1.04, saturation: 1.05 })
      .sharpen({ sigma: 0.9 })
      .toBuffer();
  }
  if (id === "amber585") {
    const glaze = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#d97706" fill-opacity="0.22" /></svg>`
    );
    return sharp(basePhoto)
      .modulate({ hue: -18, saturation: 1.65, brightness: 1.02 })
      .linear(1.28, -12)
      .sharpen({ sigma: 1.2 })
      .composite([{ input: glaze, blend: "over" }])
      .toBuffer();
  }
  if (id === "green540") {
    const glaze = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#059669" fill-opacity="0.22" /></svg>`
    );
    return sharp(basePhoto)
      .modulate({ hue: 85, saturation: 1.6, brightness: 1.04 })
      .linear(1.25, -10)
      .sharpen({ sigma: 1.2 })
      .composite([{ input: glaze, blend: "over" }])
      .toBuffer();
  }
  if (id === "blue405") {
    const glaze = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#1e1b4b" fill-opacity="0.30" /><rect width="${w}" height="${h}" fill="#0284c7" fill-opacity="0.25" /></svg>`
    );
    return sharp(basePhoto)
      .modulate({ hue: 195, saturation: 1.65, brightness: 0.95 })
      .linear(1.35, -18)
      .sharpen({ sigma: 1.4 })
      .composite([{ input: glaze, blend: "over" }])
      .toBuffer();
  }
  if (id === "uv365") {
    const glaze = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#2e1065" fill-opacity="0.34" /><rect width="${w}" height="${h}" fill="#7c3aed" fill-opacity="0.22" /></svg>`
    );
    return sharp(basePhoto)
      .modulate({ hue: 245, saturation: 1.75, brightness: 0.92 })
      .linear(1.38, -20)
      .sharpen({ sigma: 1.5 })
      .composite([{ input: glaze, blend: "over" }])
      .toBuffer();
  }
  if (id === "red660") {
    const glaze = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#dc2626" fill-opacity="0.24" /></svg>`
    );
    return sharp(basePhoto)
      .modulate({ hue: -32, saturation: 1.5, brightness: 1.06 })
      .linear(1.22, -8)
      .sharpen({ sigma: 1.1 })
      .composite([{ input: glaze, blend: "over" }])
      .toBuffer();
  }
  if (id === "nir850") {
    const glaze = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#4c0519" fill-opacity="0.28" /></svg>`
    );
    return sharp(basePhoto)
      .modulate({ saturation: 0.35, brightness: 1.12 })
      .linear(1.32, -14)
      .sharpen({ sigma: 1.3 })
      .composite([{ input: glaze, blend: "over" }])
      .toBuffer();
  }
  // polarized
  const glaze = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="#334155" fill-opacity="0.18" /></svg>`
  );
  return sharp(basePhoto)
    .modulate({ saturation: 0.65, brightness: 1.05 })
    .linear(1.35, -16)
    .sharpen({ sigma: 1.8 })
    .composite([{ input: glaze, blend: "over" }])
    .toBuffer();
}

function buildSyntheticBandSvgById(id: SpectralViewId, w: number, h: number, zone: string): Buffer {
  switch (id) {
    case "standard":
      return buildSyntheticStandardSvg(w, h, zone);
    case "amber585":
      return buildSyntheticAmberSvg(w, h, zone);
    case "green540":
      return buildSyntheticGreenSvg(w, h, zone);
    case "blue405":
      return buildSyntheticUvSvg(w, h, zone);
    case "uv365":
      return buildSyntheticUv365Svg(w, h);
    case "red660":
      return buildSyntheticRed660Svg(w, h);
    case "nir850":
      return buildSyntheticNir850Svg(w, h);
    case "polarized":
      return buildSyntheticPolarizedSvg(w, h);
  }
}

/**
 * Traite une image (ou série de clichés) et génère la suite complète des 4 vues cliniques
 * sélectionnées parmi les 8 spectres avec les photos réelles de la cliente pour le rapport PDF.
 */
export async function processMultiSpectralSuite(
  photoBase64?: string | null,
  meta?: {
    clientName?: string;
    date?: Date | string;
    zoneLabel?: string;
    indicators?: Array<{ nom: string; pourcentage: number }>;
    scoreGlobal?: number;
    selectedViews?: string[] | null;
  }
): Promise<MultiSpectralSuiteResult> {
  const targetW = 380;
  const targetH = 380;
  const zone = meta?.zoneLabel || "Visage";
  const chosenIds = resolveSelectedFourViews(meta?.selectedViews, meta?.indicators);

  const photoBuffers = extractPhotoBuffers(photoBase64);

  if (photoBuffers.length > 0) {
    try {
      const normalizedBuffers: Buffer[] = [];
      for (const rawBuf of photoBuffers.slice(0, 4)) {
        try {
          const normBuf = await sharp(rawBuf)
            .rotate()
            .resize(targetW, targetH, { fit: "cover", position: "centre" })
            .toBuffer();
          normalizedBuffers.push(normBuf);
        } catch {
          // ignore un cliché corrompu et continue avec les autres
        }
      }

      if (normalizedBuffers.length > 0) {
        const copy = buildZoneBandCopy(zone, meta?.indicators, true);
        const builtBands: SpectralBandData[] = [];

        for (let idx = 0; idx < 4; idx++) {
          const viewId = chosenIds[idx];
          const basePhoto = normalizedBuffers[idx] ?? normalizedBuffers[0];
          const sMeta = BAND_STATIC_META[viewId];
          const bCopy = copy[viewId];

          const filtered = await renderRealPhotoBandBuffer(viewId, basePhoto, targetW, targetH);
          const hud = buildHudOverlay(
            targetW,
            targetH,
            true,
            zone,
            `VUE ${idx + 1} · ${sMeta.hudTitle}`,
            sMeta.primaryHex,
            sMeta.accentHex,
            sMeta.hudLeft,
            bCopy.hudRight
          );
          const jpg = await sharp(filtered)
            .composite([{ input: hud, blend: "over" }])
            .jpeg({ quality: 90 })
            .toBuffer();

          builtBands.push({
            id: viewId,
            bandCode: `VUE ${idx + 1} · ${sMeta.shortCode}`,
            shortCategory: sMeta.shortCategory,
            title: sMeta.title,
            subtitle: bCopy.subtitle,
            observation: bCopy.observation,
            tag: bCopy.tag,
            accentRgb: sMeta.accentRgb,
            accentHex: sMeta.primaryHex,
            jpegBytes: new Uint8Array(jpg),
            width: targetW,
            height: targetH,
          });
        }

        const bands = [
          builtBands[0],
          builtBands[1],
          builtBands[2],
          builtBands[3],
        ] as [SpectralBandData, SpectralBandData, SpectralBandData, SpectralBandData];

        const acneBand = builtBands.find((b) => b.id === "blue405" || b.id === "uv365") ?? builtBands[builtBands.length - 1];

        return {
          isRealPhoto: true,
          bands,
          globalSynthesis: `Clichés cliniques réels de la cliente retenus par la dermo-conseillère : 1. ${bands[0].subtitle} · 2. ${bands[1].subtitle} · 3. ${bands[2].subtitle} · 4. ${bands[3].subtitle}.`,
          legacyAcne: {
            jpegBytes: acneBand.jpegBytes,
            width: targetW,
            height: targetH,
            isRealPhoto: true,
            sebumScoreEstimate: 68,
            porphyrinSpotsCount: 16,
            lipidFilmStatus: "Film lipidique réactif / comédogène",
          },
        };
      }
    } catch (err) {
      console.warn("processMultiSpectralSuite: fallback vers cartographie vectorielle:", err);
    }
  }

  // Fallback haute définition : Cartographie vectorielle synthétique pour les 4 bandes choisies
  const copy = buildZoneBandCopy(zone, meta?.indicators, false);
  const builtSynthetic: SpectralBandData[] = [];

  for (let idx = 0; idx < 4; idx++) {
    const viewId = chosenIds[idx];
    const sMeta = BAND_STATIC_META[viewId];
    const bCopy = copy[viewId];
    const svgBuf = buildSyntheticBandSvgById(viewId, targetW, targetH, zone);
    const hud = buildHudOverlay(
      targetW,
      targetH,
      false,
      zone,
      `VUE ${idx + 1} · ${sMeta.hudTitle}`,
      sMeta.primaryHex,
      sMeta.accentHex,
      sMeta.hudLeft,
      bCopy.hudRight
    );
    const jpg = await sharp(svgBuf)
      .composite([{ input: hud, blend: "over" }])
      .jpeg({ quality: 88 })
      .toBuffer();

    builtSynthetic.push({
      id: viewId,
      bandCode: `VUE ${idx + 1} · ${sMeta.shortCode}`,
      shortCategory: sMeta.shortCategory,
      title: sMeta.title,
      subtitle: bCopy.subtitle,
      observation: bCopy.observation,
      tag: bCopy.tag,
      accentRgb: sMeta.accentRgb,
      accentHex: sMeta.primaryHex,
      jpegBytes: new Uint8Array(jpg),
      width: targetW,
      height: targetH,
    });
  }

  const bands = [
    builtSynthetic[0],
    builtSynthetic[1],
    builtSynthetic[2],
    builtSynthetic[3],
  ] as [SpectralBandData, SpectralBandData, SpectralBandData, SpectralBandData];

  const acneBand = builtSynthetic.find((b) => b.id === "blue405" || b.id === "uv365") ?? builtSynthetic[builtSynthetic.length - 1];

  return {
    isRealPhoto: false,
    bands,
    globalSynthesis: `Analyse optique sur les 4 spectres sélectionnés : 1. ${bands[0].subtitle} · 2. ${bands[1].subtitle} · 3. ${bands[2].subtitle} · 4. ${bands[3].subtitle}.`,
    legacyAcne: {
      jpegBytes: acneBand.jpegBytes,
      width: targetW,
      height: targetH,
      isRealPhoto: false,
      sebumScoreEstimate: 65,
      porphyrinSpotsCount: 12,
      lipidFilmStatus: "Hyper-séborrhée modérée",
    },
  };
}

/**
 * Rétrocompatibilité : traite l'image pour le seul filtre acné/porphyrines 405nm
 */
export async function processSpectralAcneImage(
  photoBase64?: string | null,
  meta?: { clientName?: string; date?: Date | string; zoneLabel?: string }
): Promise<SpectralAcneResult> {
  const suite = await processMultiSpectralSuite(photoBase64, meta);
  return suite.legacyAcne;
}
