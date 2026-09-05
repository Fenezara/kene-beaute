/**
 * Kènè — génération des icônes PWA / favicon à partir du mark vectoriel.
 *
 * Usage : bun scripts/gen-logo.ts  (depuis la racine du projet)
 *
 * Sorties (public/icons/) :
 *  - icon-192.png            192×192  badge tel quel (coins transparents, purpose "any")
 *  - icon-512.png            512×512  idem
 *  - icon-maskable-512.png   512×512  variante maskable : fond plein-cadre dégradé
 *                                      or→terre SANS coins arrondis, mark Duafe+filet
 *                                      réduit à ~52 % centré (safe zone 80 %)
 *  - apple-touch-icon.png    180×180  plein-cadre carré (iOS arrondit lui-même) :
 *                                      dégradé + filet intérieur + Duafe ~62 %
 *
 * Le design source est public/kene-mark.svg (badge canonique, cf. KeneMark
 * dans src/components/kene/icons.tsx). Rendu supersamplé 2× puis réduit
 * (lanczos) pour un tracé net à toutes les tailles.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MARK_SVG = path.join(ROOT, "public", "kene-mark.svg");
const ICONS_DIR = path.join(ROOT, "public", "icons");

/** Duafe canonique (24-grid) — identique à KENE_BADGE_PATHS / DuafeIcon. */
const DUAFE_PATHS: readonly string[] = [
  "M5 3v18",
  "M5 3h11.5a2.5 2.5 0 0 1 2.5 2.5V21H5",
  "M5 7.5h11",
  "M8.5 7.5V3",
  "M12 7.5V3",
  "M15.5 7.5V3",
  "M12 15.6V19",
] as const;
const DUAFE_CIRCLE = { cx: 12, cy: 13, r: 2.6 } as const;

const duafeGroup = (translate: number, scale: number, strokeWidth: number): string =>
  `<g transform="translate(${translate.toFixed(2)} ${translate.toFixed(2)}) scale(${scale.toFixed(3)})" fill="none" stroke="#FFF9EC" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">` +
  DUAFE_PATHS.map((d) => `<path d="${d}"/>`).join("") +
  `<circle cx="${DUAFE_CIRCLE.cx}" cy="${DUAFE_CIRCLE.cy}" r="${DUAFE_CIRCLE.r}"/>` +
  `</g>`;

/** Dégradé or chaud 3 tons du badge (diagonale haut-gauche → bas-droite). */
const GOLD_STOPS_3 = `<stop offset="0" stop-color="#E3B04B"/><stop offset="0.42" stop-color="#C8951E"/><stop offset="1" stop-color="#A0522D"/>`;
/** Dégradé plein-cadre maskable : or → terre (2 tons, spec). */
const GOLD_STOPS_2 = `<stop offset="0" stop-color="#C8951E"/><stop offset="1" stop-color="#A0522D"/>`;

const filet = (x: number, y: number, w: number, rx: number, opacity: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${w}" rx="${rx}" fill="none" stroke="#FFF9EC" stroke-opacity="${opacity}" stroke-width="1.8"/>`;

const svgDoc = (width: number, height: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 96 96">${body}</svg>`;

/** Variante maskable — fond plein-cadre, mark (filet + Duafe) réduit à 52 %.
 *  Safe zone 80 % : le Duafe occupe ~30 % du cadre, bien dans le cercle.
 *  Stroke Duafe porté à 2.2 (au lieu de 1.8 proportionnel) pour rester lisible
 *  aux tailles lanceur (≥ 48 dp). */
const MASKABLE_SVG = svgDoc(
  1024,
  1024,
  `<defs><linearGradient id="keneGold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="96" y2="96">${GOLD_STOPS_2}</linearGradient></defs>` +
  `<rect x="0" y="0" width="96" height="96" fill="url(#keneGold)"/>` +
  filet(26.42, 26.42, 43.16, 10.66, 0.4) +
  duafeGroup(33.65, 1.196, 2.2)
);

/** Apple touch — plein-cadre carré, filet intérieur du badge + Duafe à 62 %. */
const APPLE_SVG = svgDoc(
  360,
  360,
  `<defs><linearGradient id="keneGold" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="96" y2="96">${GOLD_STOPS_3}</linearGradient></defs>` +
  `<rect x="0" y="0" width="96" height="96" fill="url(#keneGold)"/>` +
  filet(6.5, 6.5, 83, 20.5, 0.32) +
  duafeGroup(18.24, 2.48, 1.8)
);

async function renderPng(svg: string | Buffer, target: number, density: number, out: string): Promise<number> {
  // sharp traite une string comme un chemin de fichier → toujours un Buffer.
  const input = typeof svg === "string" ? Buffer.from(svg) : svg;
  const buffer = await sharp(input, { density })
    .resize(target, target, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(out, buffer);
  return buffer.length;
}

async function main(): Promise<void> {
  const markSrc = await readFile(MARK_SVG);

  // Badge tel quel : densité = (cible/96)×72×2 → rendu 2× puis réduction nette.
  const jobs: Array<{ out: string; svg: string | Buffer; density: number; target: number; label: string }> = [
    { out: path.join(ICONS_DIR, "icon-192.png"), svg: markSrc, density: 288, target: 192, label: "icon-192.png (any)" },
    { out: path.join(ICONS_DIR, "icon-512.png"), svg: markSrc, density: 768, target: 512, label: "icon-512.png (any)" },
    { out: path.join(ICONS_DIR, "icon-maskable-512.png"), svg: MASKABLE_SVG, density: 72, target: 512, label: "icon-maskable-512.png (maskable)" },
    { out: path.join(ICONS_DIR, "apple-touch-icon.png"), svg: APPLE_SVG, density: 72, target: 180, label: "apple-touch-icon.png" },
  ];

  for (const job of jobs) {
    const bytes = await renderPng(job.svg, job.target, job.density, job.out);
    const kb = (bytes / 1024).toFixed(1);
    if (bytes < 2048) throw new Error(`${job.label} trop léger (${bytes} o) — rendu suspect`);
    console.log(`✓ ${job.label} — ${job.target}×${job.target}, ${(kb)} Ko`);
  }
  console.log("Icônes Kènè régénérées dans public/icons/");
}

main().catch((err: unknown) => {
  console.error("Échec gen-logo :", err);
  process.exit(1);
});
