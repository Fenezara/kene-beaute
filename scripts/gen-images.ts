// Génération des assets visuels Kènè (produits, peaux démo, instituts, hero)
import ZAI from "z-ai-web-dev-sdk";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const PUB = "/home/z/my-project/public";

const SQUARE = "1024x1024";
const WIDE = "1344x768";
const HERO = "1152x864";

const jobs: { out: string; prompt: string; size: string }[] = [
  { out: "products/serum-moringa.png", size: SQUARE, prompt: "Professional cosmetic product photography, amber glass dropper serum bottle with elegant gold label, fresh green moringa leaves around the base, warm cream beige background, soft studio lighting, luxurious African botanical skincare brand, high quality, detailed, no text" },
  { out: "products/baume-karite.png", size: SQUARE, prompt: "Professional cosmetic product photography, open glass jar of raw ivory shea butter balm, shea nuts scattered nearby, warm terracotta and cream background, soft natural light, African botanical skincare aesthetic, high quality, no text" },
  { out: "products/huile-baobab.png", size: SQUARE, prompt: "Professional cosmetic product photography, tall slim glass bottle of golden baobab oil with pump, dried baobab fruit pieces, earthy brown background, warm studio light, African botanical skincare, high quality, no text" },
  { out: "products/gommage-bissap.png", size: SQUARE, prompt: "Professional cosmetic product photography, glass jar of deep red hibiscus flower sugar scrub texture visible, dried hibiscus petals, burgundy and cream tones, African botanical skincare aesthetic, soft lighting, high quality, no text" },
  { out: "products/masque-aloka.png", size: SQUARE, prompt: "Professional cosmetic product photography, ceramic jar of white clay face mask with aloe vera slices, sage green and cream background, minimal African spa aesthetic, soft light, high quality, no text" },
  { out: "products/savon-noir.png", size: SQUARE, prompt: "Professional product photography, rustic black African soap bars stacked on wooden tray, cocoa pods, natural linen cloth, warm earthy background, artisanal traditional aesthetic, high quality, no text" },
  { out: "products/brune-nere.png", size: SQUARE, prompt: "Professional cosmetic product photography, frosted glass spray bottle of facial mist tonic with pink rose petals and nere seeds, blush and cream palette, soft studio light, African botanical skincare, high quality, no text" },
  { out: "products/solaire-spf50.png", size: SQUARE, prompt: "Professional cosmetic product photography, matte bronze sunscreen tube standing upright, golden sunlight reflection, warm sand-colored background with palm shadow, premium African skincare aesthetic, high quality, no text" },
  { out: "skin/demo-visage-1.png", size: SQUARE, prompt: "Close-up macro photograph of the cheek area of a woman with deep dark brown skin, some post-acne dark spots and slight uneven tone, natural texture visible, neutral expression, soft even lighting, dermatology reference photo, realistic skin detail, no makeup" },
  { out: "skin/demo-visage-2.png", size: SQUARE, prompt: "Close-up macro photograph of forehead and temple area of a person with rich dark skin, small bumps and a few darker patches, natural pores visible, clinical dermatology lighting, realistic, no makeup" },
  { out: "skin/demo-mains-1.png", size: SQUARE, prompt: "Close-up photograph of the back of hands of a person with dark brown skin, slight dryness on knuckles, natural skin texture, resting on neutral beige towel, even lighting, dermatology reference, realistic" },
  { out: "skin/demo-dos-1.png", size: SQUARE, prompt: "Close-up photograph of upper back and shoulder skin of a person with dark brown skin, a few blemishes and spots, natural texture, soft clinical lighting, dermatology reference photo, realistic, tasteful framing" },
  { out: "instituts/eclat-d-abidjan.png", size: WIDE, prompt: "Interior photography of a modern African beauty institute in Abidjan, warm gold and cream tones, wooden accents, braided rattan pendant lights, treatment bed with kente-patterned throw, tropical plants, welcoming reception, professional interior photography, high quality" },
  { out: "instituts/institut-baobab.png", size: WIDE, prompt: "Interior photography of a serene spa in Dakar Senegal, terracotta walls, carved wooden screens, massage room with white linen and baobab-inspired decor, candles, warm sunset light through sheer curtains, professional photography, high quality" },
  { out: "hero/hero-client.png", size: HERO, prompt: "Portrait photography of a beautiful young African woman with glowing deep dark skin and natural curly hair, joyful confident smile, golden hour light, cream and terracotta background with subtle kente pattern fabric, editorial beauty photography, high quality, celebratory" },
];

async function main() {
  const zai = await ZAI.create();
  fs.mkdirSync(path.join(PUB, "products"), { recursive: true });
  fs.mkdirSync(path.join(PUB, "skin"), { recursive: true });
  fs.mkdirSync(path.join(PUB, "instituts"), { recursive: true });
  fs.mkdirSync(path.join(PUB, "hero"), { recursive: true });

  for (const job of jobs) {
    const pngPath = path.join(PUB, job.out);
    const webpPath = pngPath.replace(/\.png$/, ".webp");
    if (fs.existsSync(webpPath)) {
      console.log("skip:", webpPath);
      continue;
    }
    try {
      const t0 = Date.now();
      const res = await zai.images.generations.create({ prompt: job.prompt, size: job.size as never });
      const b64 = res.data?.[0]?.base64;
      if (!b64) throw new Error("pas d'image retournee");
      fs.writeFileSync(pngPath, Buffer.from(b64, "base64"));
      await sharp(pngPath).webp({ quality: 82 }).toFile(webpPath);
      fs.unlinkSync(pngPath);
      console.log("OK", job.out, ((Date.now() - t0) / 1000).toFixed(1) + "s");
    } catch (e) {
      console.error("FAIL", job.out, (e as Error).message);
    }
  }
  console.log("Termine.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
