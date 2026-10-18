import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
  try {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      if (fs.statSync(fullPath).isDirectory()) {
        getAllFiles(fullPath, arrayOfFiles);
      } else {
        arrayOfFiles.push(fullPath);
      }
    }
  } catch {
    // Tolérance lecture
  }
  return arrayOfFiles;
}

export async function GET() {
  try {
    const cwd = process.cwd();
    // Racines statiques possibles selon l'environnement (production standalone, dev Turbopack, build Next.js)
    const candidateRoots = [
      path.join(cwd, ".next", "static"),
      path.join(cwd, ".next", "dev", "static"),
      path.join(cwd, ".next", "standalone", ".next", "static"),
      path.join(cwd, ".next", "build", "chunks"),
    ];

    const assetSet = new Set<string>();

    for (const root of candidateRoots) {
      if (!fs.existsSync(root)) continue;
      const files = getAllFiles(root);
      for (const file of files) {
        const rel = path.relative(root, file).replace(/\\/g, "/");
        if (
          rel.endsWith(".js") ||
          rel.endsWith(".css") ||
          rel.endsWith(".woff2") ||
          rel.endsWith(".json")
        ) {
          // Normaliser sous la forme canonique Next.js /_next/static/...
          assetSet.add(`/_next/static/${rel}`);
        }
      }
    }

    const assets = Array.from(assetSet);

    return NextResponse.json(
      {
        ok: true,
        count: assets.length,
        assets,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
        },
      }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, count: 0, assets: [], error: msg }, { status: 200 });
  }
}
