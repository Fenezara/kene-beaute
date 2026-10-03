// scripts/test-security-hardening.ts
// Suite de tests securite 2026 — npx tsx scripts/test-security-hardening.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomInt } from "node:crypto";

const ROOT = resolve(".");
const G = "\x1b[32m✔\x1b[0m";
const R = "\x1b[31m✘\x1b[0m";
const B = "\x1b[34m•\x1b[0m";
let pass = 0; let fail = 0;

function ok(l: string) { console.log("  " + G + " " + l); pass++; }
function ko(l: string, d?: string) { console.log("  " + R + " " + l + (d ? "\n      -> " + d : "")); fail++; }
function section(t: string) { console.log("\n" + B + " " + t); }
function read(r: string) { return readFileSync(resolve(ROOT, r), "utf-8"); }

section("1. Cookies secure conditionnel (session.ts)");
const sess = read("src/lib/kene/session.ts");
!sess.includes("secure: false") ? ok("Aucun secure:false hardcode") : ko("secure:false encore present");
(sess.match(/process\.env\.NODE_ENV === "production"/g)?.length ?? 0) >= 4 ? ok("secure conditionnel x4 dans les fonctions cookie") : ko("secure conditionnel < 4 occurrences");
sess.includes("sameSite: \"strict\"") ? ok("SameSite=Strict pour le cookie elevation admin") : ko("SameSite=Strict manquant sur le cookie elevation");

section("2. OTP CSPRNG (otp/request/route.ts)");
const otp = read("src/app/api/auth/otp/request/route.ts");
!otp.includes("Math.random") ? ok("Math.random absent (non-CSPRNG elimine)") : ko("Math.random toujours present — CRITIQUE");
otp.includes("randomInt") && otp.includes("node:crypto") ? ok("randomInt de node:crypto importe") : ko("randomInt manquant");
otp.includes("randomInt(100000, 1000000)") ? ok("randomInt plage correcte [100000, 1000000)") : ko("randomInt plage incorrecte");

section("3. Receipt route auth + rate-limit (sales/receipt/route.ts)");
const rec = read("src/app/api/pro/sales/receipt/route.ts");
rec.includes("guardProRole") ? ok("guardProRole present") : ko("guardProRole ABSENT — route exposee sans auth");
rec.includes("rateLimit") ? ok("rateLimit present") : ko("rateLimit manquant");
rec.includes("no-store") ? ok("Cache-Control no-store") : ko("Cache-Control no-store manquant");
rec.includes("serverError") ? ok("serverError utilise (erreurs encapsulees)") : ko("serverError manquant");

section("4. Cosmetovigilance POST rate-limit");
const cosm = read("src/app/api/pro/cosmetovigilance/route.ts");
const cosmPost = cosm.slice(cosm.indexOf("async function POST"));
cosmPost.includes("rateLimit") ? ok("rateLimit sur POST cosmetovigilance") : ko("rateLimit ABSENT sur POST cosmetovigilance");
cosmPost.includes("guardProRole") ? ok("guardProRole sur POST cosmetovigilance") : ko("guardProRole manquant");

section("5. Closure POST rate-limit (sales/closure/route.ts)");
const clos = read("src/app/api/pro/sales/closure/route.ts");
const closPost = clos.slice(clos.indexOf("async function POST"));
closPost.includes("rateLimit") ? ok("rateLimit sur POST closure") : ko("rateLimit ABSENT sur POST closure");
closPost.includes("guardProRole") ? ok("guardProRole sur POST closure") : ko("guardProRole manquant");

section("6. Middleware CORP + Cache-Control API (middleware.ts)");
const mw = read("src/middleware.ts");
mw.includes("Cross-Origin-Resource-Policy") ? ok("CORP: same-site header present") : ko("CORP manquant");
mw.includes("API_CACHE_HEADERS") && mw.includes("no-store") ? ok("Cache-Control no-store pour /api/*") : ko("Cache-Control no-store manquant API");
mw.includes("frame-ancestors *") ? ok("frame-ancestors * preserve (contrainte preview iframe)") : ko("frame-ancestors * MANQUANT — preview cassee !");
!mw.includes("X-Frame-Options") ? ok("Pas de X-Frame-Options (correct iframe preview)") : ko("X-Frame-Options present — preview cassee !");
mw.includes("isApi") ? ok("isApi propage correctement") : ko("isApi non propage");
mw.includes("Sec-Fetch-Site") ? ok("Garde CSRF Sec-Fetch-Site preservee") : ko("Garde CSRF regresse !");

section("7. serverError info disclosure (server.ts)");
const srv = read("src/lib/kene/server.ts");
srv.includes("NODE_ENV === \"production\"") ? ok("serverError: comportement differencie prod/dev") : ko("serverError: pas de distinction prod/dev");

section("8. rateLimitResponse message optionnel (rate-limit.ts)");
const rlSrc = read("src/lib/kene/rate-limit.ts");
rlSrc.includes("message =") ? ok("message parametre optionnel avec valeur par defaut") : ko("message parametre obligatoire — TS errors potentielles");

section("9. OTP verify brute-force lock (otp/verify/route.ts)");
const ver = read("src/app/api/auth/otp/verify/route.ts");
(ver.includes("locked") || ver.includes("OTP_MAX_FAILS") || ver.includes("fails")) ? ok("Brute-force lock apres N echecs") : ko("Brute-force lock manquant");
ver.includes("timingSafeEqual") ? ok("timingSafeEqual (comparaison a temps constant)") : ko("timingSafeEqual manquant");

section("10. randomInt distribution statistique (crypto)");
const codes = new Set<number>();
for (let i = 0; i < 1000; i++) { codes.add(randomInt(100000, 1000000)); }
codes.size > 990 ? ok("1000 OTP: " + codes.size + " valeurs uniques (distribution OK)") : ko("Distribution suspecte: seulement " + codes.size + "/1000 uniques");

console.log("\n" + "─".repeat(52));
console.log("  Securite 2026: " + pass + " OK / " + fail + " KO");
if (fail === 0) { console.log("  \x1b[32m✔ Tous les correctifs sont en place.\x1b[0m"); }
else { console.log("  \x1b[31m✘ " + fail + " correctif(s) manquant(s).\x1b[0m"); }
process.exit(fail > 0 ? 1 : 0);
