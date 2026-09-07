// Prépare les emblèmes de marque Kènè depuis les concepts IA bruts :
// 1. trim — détecte la bounding-box de l'œuvre (ligne d'or sur fond uni)
// 2. décalage chromatique par canal — colle le fond de l'image sur le token
//    EXACT de l'app (#F8F1E4 clair / #14100B sombre) → intégration sans
//    couture sur la page (l'art semble posé directement sur le fond)
// 3. extend — respiration égale (~8 %) autour de l'œuvre
// 4. resize 1024×1024 contain — jamais déformé
import sharp from "sharp";

const PAD_RATIO = 0.08; // 8 % de marge autour de l'œuvre après trim

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function delta(from: Rgb, to: Rgb) {
  return [to.r - from.r, to.g - from.g, to.b - from.b];
}

async function sample(file: string): Promise<Rgb> {
  const { data } = await sharp(file)
    .extract({ left: 2, top: 2, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}

async function prepare(src: string, out: string, targetHex: string, threshold: number) {
  const target = hexToRgb(targetHex);
  const srcBg = await sample(src); // fond réel de l'image générée

  // Décalage par canal : fond source → token app (1,1 sur les gains)
  const [dr, dg, db] = delta(srcBg, target);

  const base = await sharp(src)
    .trim({ threshold })
    .toBuffer({ resolveWithObject: true });
  const tw = base.info.width;
  const th = base.info.height;
  console.log(`${src}: bg ${srcBg.r},${srcBg.g},${srcBg.b} → ${target.r},${target.g},${target.b} (Δ ${dr},${dg},${db}) ; trim ${tw}×${th}`);

  // Applique le décalage chromatique (canal par canal) à l'œuvre trimée
  const shifted = await sharp(base.data)
    .linear([1, 1, 1], [dr, dg, db])
    .png()
    .toBuffer();
  const shiftedMeta = await sharp(shifted).metadata();

  // Respiration égale : carré englobant + 8 %, fond = token exact
  const side = Math.max(shiftedMeta.width ?? tw, shiftedMeta.height ?? th);
  const pad = Math.round(side * PAD_RATIO);
  const total = Math.min(Math.round(side + pad * 2), 1024);

  await sharp(shifted)
    .extend({
      top: Math.floor((total - th) / 2),
      bottom: Math.ceil((total - th) / 2),
      left: Math.floor((total - tw) / 2),
      right: Math.ceil((total - tw) / 2),
      background: { r: target.r, g: target.g, b: target.b },
    })
    .resize(1024, 1024, { fit: "contain", background: { r: target.r, g: target.g, b: target.b } })
    .png({ compressionLevel: 9 })
    .toFile(out);

  // Vérif : le coin doit être EXACTEMENT le token
  const check = await sample(out);
  const ok = check.r === target.r && check.g === target.g && check.b === target.b;
  console.log(`  → ${out} (1024×1024) coin ${check.r},${check.g},${check.b} ${ok ? "✓ token exact" : "⚠ écart résiduel"}`);
}

async function main() {
  // Fond clair de l'app : #F8F1E4 ; fond sombre : #14100B (globals.css)
  await prepare("public/brand/concepts/04-ligne-visage.png", "public/brand/kene-emblem-light.png", "#F8F1E4", 18);
  await prepare("public/brand/concepts/04c-ligne-visage-sombre.png", "public/brand/kene-emblem-dark.png", "#14100B", 18);
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
