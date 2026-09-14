/**
 * Nettoyage t. 121 (passe 2) — retire les références de suivi interne des
 * TOUS types de commentaires (// · /* · JSX) dans src/**, en respectant
 * strictement les chaînes de caractères (machine à états lexer).
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

async function walk(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(p);
  }
}

/** Référence de suivi : t. 90, t.90-bis, t. 63-a, tâche 42… */
const REF = /(?:\bt\.?\s?|tâche\s?)\d+(?:\s?[-–][a-z0-9]+)*/g;

function cleanComment(text: string): string {
  let out = text;
  // Parenthèses portées uniquement par des références : « (t. 90-bis) »,
  // « (t. 82 → t. 116) », « (t. 113/117) », « (t. 119/120) », « (tâche 42) »
  out = out.replace(
    /\((?:\s*(?:\bt\.?\s?|tâche\s?)\d+(?:\s?[-–][a-z0-9]+)*(?:\s*(?:→|,|\/|puis|et)\s*(?:\bt\.?\s?)?\d+(?:\s?[-–][a-z0-9]+)*)*)+\)/g,
    "",
  );
  // Références nues.
  out = out.replace(REF, "");
  // Artefacts typographiques créés par le retrait.
  out = out.replace(/ {2,}/g, " ");
  out = out.replace(/\s+([,.;:!?)])/g, "$1");
  out = out.replace(/([(«])\s+/g, "$1 ");
  out = out.replace(/\(\s*\)/g, "");
  out = out.replace(/«\s»/g, "");
  // « — : » / « —, » orphelins
  out = out.replace(/ —\s*([,.;:])/g, "$1");
  // Ligne de commentaire devenue vide après nettoyage : la vider.
  return out;
}

function process(source: string): { out: string; changes: number } {
  let result = "";
  let i = 0;
  let changes = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    const next = source[i + 1];
    // ── Commentaire ligne ──
    if (ch === "/" && next === "/") {
      let j = i;
      while (j < n && source[j] !== "\n") j++;
      const comment = source.slice(i, j);
      const cleaned = cleanComment(comment);
      if (cleaned !== comment) changes++;
      result += cleaned;
      i = j;
      continue;
    }
    // ── Commentaire bloc (y compris JSX) ──
    if (ch === "/" && next === "*") {
      let j = i + 2;
      while (j < n - 1 && !(source[j] === "*" && source[j + 1] === "/")) j++;
      if (j >= n - 1) {
        // bloc non fermé : garder tel quel
        result += source.slice(i);
        break;
      }
      j += 2;
      const comment = source.slice(i, j);
      const cleaned = cleanComment(comment);
      if (cleaned !== comment) changes++;
      result += cleaned;
      i = j;
      continue;
    }
    // ── Chaînes : sauter sainement ──
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < n) {
        const c = source[j]!;
        if (c === "\\") { j += 2; continue; }
        if (c === quote) { j++; break; }
        // Les template literals peuvent contenir ${…} — on saute naïvement
        // (les références de tâches n'y vivent jamais).
        j++;
      }
      result += source.slice(i, j);
      i = j;
      continue;
    }
    result += ch;
    i++;
  }
  // Lignes de commentaires devenues vides : « //   » seul → retirer le contenu
  const final = result.replace(/^([ \t]*\/\/)[ \t]+$/gm, "$1");
  return { out: final, changes };
}

async function main() {
  const files: string[] = [];
  await walk(path.join(ROOT, "src"), files);
  let total = 0;
  const touched: string[] = [];
  for (const file of files.sort()) {
    const src = await readFile(file, "utf8");
    const { out, changes } = process(src);
    if (changes > 0 && out !== src) {
      await writeFile(file, out);
      total += changes;
      touched.push(`${path.relative(ROOT, file)} (${changes})`);
    }
  }
  console.log(`Fichiers modifiés : ${touched.length}, blocs : ${total}`);
  for (const t of touched) console.log("  " + t);
}

main().catch((e) => { console.error(e); process.exit(1); });
