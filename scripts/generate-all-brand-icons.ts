/**
 * Kènè — Génération automatisée de l'ensemble des icônes et favicons
 * dérivés du logo officiel de la marque : « Le Sceau Kènè » (kene-emblem-light.png).
 *
 * Sorties produites :
 *  - public/favicon.ico & src/app/favicon.ico : conteneur binaire multi-résolution (16x16, 32x32, 48x48)
 *  - src/app/icon.png : 512x512 (Next.js App Router root icon)
 *  - src/app/apple-icon.png : 180x180 (Next.js App Router apple touch icon)
 *  - public/icons/icon-192.png : 192x192 (PWA any)
 *  - public/icons/icon-512.png : 512x512 (PWA any & Windows Desktop)
 *  - public/icons/apple-touch-icon.png : 180x180 (iOS PWA)
 *  - public/icons/icon-maskable-512.png : 512x512 (Android Adaptive Icon, safe zone 80%)
 *  - public/icons/icon-maskable-192.png : 192x192 (Android Adaptive Icon, safe zone 80%)
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(__dirname, "..");
const EMBLEM_SRC = path.join(ROOT, "public", "brand", "kene-emblem-dark.png");
const ICONS_DIR = path.join(ROOT, "public", "icons");

/**
 * Construit un conteneur Windows .ico valide contenant plusieurs images PNG
 * (reconnues nativement par tous les navigateurs modernes et Windows Vista -> 11).
 */
function buildIcoBuffer(images: Array<{ size: number; buffer: Buffer }>): Buffer {
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = images.length * dirEntrySize;
  let offset = headerSize + dirSize;

  // En-tête ICO (6 octets)
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // Réservé (toujours 0)
  header.writeUInt16LE(1, 2); // Type 1 = Icône (.ico)
  header.writeUInt16LE(images.length, 4); // Nombre d'images

  const entries: Buffer[] = [];
  const imageBuffers: Buffer[] = [];

  for (const img of images) {
    const entry = Buffer.alloc(dirEntrySize);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // Largeur
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // Hauteur
    entry.writeUInt8(0, 2); // Palette de couleurs (0 si >= 8bpp)
    entry.writeUInt8(0, 3); // Réservé (toujours 0)
    entry.writeUInt16LE(1, 4); // Plans de couleur (1)
    entry.writeUInt16LE(32, 6); // Bits par pixel (32 bpp RGBA)
    entry.writeUInt32LE(img.buffer.length, 8); // Taille des données
    entry.writeUInt32LE(offset, 12); // Décalage absolu dans le fichier
    entries.push(entry);
    imageBuffers.push(img.buffer);
    offset += img.buffer.length;
  }

  return Buffer.concat([header, ...entries, ...imageBuffers]);
}

/**
 * Crée une variante maskable (Android Adaptive Icon) avec safe zone 80%
 * selon les spécifications W3C PWA et Google Android :
 * Le médaillon est réduit à ~80% et centré sur le fond de marque (#FAF7F2).
 */
async function createMaskableIcon(targetSize: number): Promise<Buffer> {
  // Safe zone Android : 80% de la largeur totale
  const emblemSize = Math.round(targetSize * 0.80);
  const cornerRadius = Math.round(emblemSize * 0.24);

  // Masque squircle pour un fondu harmonieux du médaillon
  const maskSvg = `<svg width="${emblemSize}" height="${emblemSize}"><rect x="0" y="0" width="${emblemSize}" height="${emblemSize}" rx="${cornerRadius}" ry="${cornerRadius}" fill="#ffffff"/></svg>`;

  const maskedEmblem = await sharp(EMBLEM_SRC)
    .resize(emblemSize, emblemSize, { kernel: "lanczos3" })
    .composite([{ input: Buffer.from(maskSvg), blend: "dest-in" }])
    .png()
    .toBuffer();

  const pad = Math.round((targetSize - emblemSize) / 2);

  return sharp({
    create: {
      width: targetSize,
      height: targetSize,
      channels: 4,
      background: { r: 26, g: 20, b: 16, alpha: 1 }, // #1A1410
    },
  })
    .composite([
      {
        input: maskedEmblem,
        top: pad,
        left: pad,
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  console.log("🎨 [Kènè] Génération des icônes à partir de :", EMBLEM_SRC);

  await mkdir(ICONS_DIR, { recursive: true });

  // 1. Génération des variantes standard (purpose: any)
  console.log("-> Rendu icon-512.png...");
  const buf512 = await sharp(EMBLEM_SRC)
    .resize(512, 512, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(ICONS_DIR, "icon-512.png"), buf512);

  console.log("-> Rendu icon-192.png...");
  const buf192 = await sharp(EMBLEM_SRC)
    .resize(192, 192, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(ICONS_DIR, "icon-192.png"), buf192);

  console.log("-> Rendu apple-touch-icon.png (180x180)...");
  const buf180 = await sharp(EMBLEM_SRC)
    .resize(180, 180, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  await writeFile(path.join(ICONS_DIR, "apple-touch-icon.png"), buf180);

  // 2. Génération des variantes adaptatives Android (purpose: maskable)
  console.log("-> Rendu icon-maskable-512.png (safe zone 80%)...");
  const maskable512 = await createMaskableIcon(512);
  await writeFile(path.join(ICONS_DIR, "icon-maskable-512.png"), maskable512);

  console.log("-> Rendu icon-maskable-192.png (safe zone 80%)...");
  const maskable192 = await createMaskableIcon(192);
  await writeFile(path.join(ICONS_DIR, "icon-maskable-192.png"), maskable192);

  // 3. Génération du favicon.ico multi-résolution (16x16, 32x32, 48x48)
  console.log("-> Rendu favicon.ico (multi-résolution 16/32/48)...");
  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => ({
      size,
      buffer: await sharp(EMBLEM_SRC)
        .resize(size, size, { kernel: "lanczos3" })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    }))
  );
  const icoBuffer = buildIcoBuffer(icoPngs);
  await writeFile(path.join(ROOT, "public", "favicon.ico"), icoBuffer);

  console.log("✅ Toutes les icônes de marque Kènè ont été générées avec succès dans public/ !");
}

main().catch((err) => {
  console.error("❌ Erreur génération icônes :", err);
  process.exit(1);
});
