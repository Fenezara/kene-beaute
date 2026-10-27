const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function run() {
  const users = await p.user.findMany();
  const profiles = await p.clientProfile.findMany({ include: { tenant: true } });
  
  console.log("=== 1. FICHES SALON SANS COMPTE APPLICATION (clientes caisse/salon) ===");
  const unlinked = profiles.filter((pr) => !pr.userId);
  console.log(`Total fiches sans compte app : ${unlinked.length}`);
  unlinked.forEach((pr) => {
    console.log(`- ${pr.name} (${pr.phone}) chez "${pr.tenant.name}" (Quartier: ${pr.district || "non renseigné"}, Peau: ${pr.skinType || "non renseigné"}, Anniv: ${pr.birthDate || "non renseigné"})`);
  });

  console.log("\n=== 2. COMPTES UTILISATEURS APPLICATION SANS FICHE DANS CET INSTITUT ===");
  // Utilisateurs qui n'ont pas encore sélectionné cet institut ou pris de RDV
  const usersWithoutProfile = users.filter((u) => !profiles.some((pr) => pr.userId === u.id));
  console.log(`Total utilisateurs sans aucune fiche salon : ${usersWithoutProfile.length}`);
  usersWithoutProfile.slice(0, 10).forEach((u) => {
    console.log(`- [${u.role}] ${u.name} (${u.phone}) - Inscrit sur l'app, institut de référence: ${u.selectedTenantId || "aucun"}`);
  });

  console.log("\n=== 3. FICHES LIÉES AVEC DES ÉCARTS ===");
  const linked = profiles.filter((pr) => pr.userId);
  let diffCount = 0;
  for (const pr of linked) {
    const u = users.find((x) => x.id === pr.userId);
    if (!u) continue;
    const diffs = [];
    if (pr.name !== u.name) diffs.push(`nom: "${pr.name}" (pro) vs "${u.name}" (client)`);
    if (pr.birthDate !== u.birthDate) diffs.push(`date naissance: "${pr.birthDate}" (pro) vs "${u.birthDate}" (client)`);
    if (pr.district !== u.district) diffs.push(`quartier: "${pr.district}" (pro) vs "${u.district}" (client)`);
    if (pr.skinType !== u.skinType) diffs.push(`type peau: "${pr.skinType}" (pro) vs "${u.skinType}" (client)`);
    if (pr.fitzpatrick !== u.fitzpatrick) diffs.push(`phototype: "${pr.fitzpatrick}" (pro) vs "${u.fitzpatrick}" (client)`);
    if (diffs.length > 0) {
      diffCount++;
      console.log(`Profil "${pr.name}" (${pr.phone}) chez "${pr.tenant.name}":`);
      diffs.forEach((d) => console.log(`   * ${d}`));
    }
  }
  if (diffCount === 0) {
    console.log(" Aucun écart sur les fiches liées !");
  }
}
run().finally(() => p.$disconnect());
