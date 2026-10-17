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
    const staticDir = path.join(process.cwd(), ".next", "static");
    const all = getAllFiles(staticDir);
    const assets = all
      .map((p) => {
        const rel = path.relative(staticDir, p).replace(/\\/g, "/");
        return `/_next/static/${rel}`;
      })
      .filter((u) => u.endsWith(".js") || u.endsWith(".css"));

    return NextResponse.json({
      ok: true,
      count: assets.length,
      assets,
    }, {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, count: 0, assets: [], error: msg }, { status: 200 });
  }
}
