// scripts/compare-identities.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const profiles = await prisma.clientProfile.findMany({
    include: { tenant: { select: { name: true } } },
  });

  console.log("=== COMPARAISON CLIENT (User) VS ENTREPRISE (ClientProfile) ===\n");

  for (const p of profiles) {
    const u = p.userId ? users.find((user) => user.id === p.userId) : null;
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`Profil ID: ${p.id} | Institut: "${p.tenant?.name}"`);
    console.log(`  ENTREPRISE (ClientProfile):`);
    console.log(`    Nom:              "${p.name}"`);
    console.log(`    Téléphone:        "${p.phone}"`);
    console.log(`    Date Naissance:   "${p.birthDate}"`);
    console.log(`    Genre:            "${p.gender}"`);
    console.log(`    Quartier:         "${p.district}"`);
    console.log(`    Grossesse:        ${p.pregnant}`);
    console.log(`    Canal préféré:    "${p.preferredChannel}"`);
    console.log(`    Budget beauté:    "${p.beautyBudget}"`);
    console.log(`    Type de peau:     "${p.skinType}"`);
    console.log(`    Phototype:        "${p.fitzpatrick}"`);
    console.log(`    userId lié:       "${p.userId}"`);

    if (u) {
      console.log(`  CLIENT (User lié):`);
      console.log(`    Nom:              "${u.name}"`);
      console.log(`    Téléphone:        "${u.phone}"`);
      console.log(`    Date Naissance:   "${u.birthDate}"`);
      console.log(`    Genre:            "${u.gender}"`);
      console.log(`    Quartier:         "${u.district}"`);
      console.log(`    Grossesse:        ${u.pregnant}`);
      console.log(`    Canal préféré:    "${u.preferredChannel}"`);
      console.log(`    Budget beauté:    "${u.beautyBudget}"`);
      console.log(`    Type de peau:     "${u.skinType}"`);
      console.log(`    Phototype:        "${u.fitzpatrick}"`);
      console.log(`    Allergies:        "${u.allergies}"`);
      console.log(`    Institut choisi:  "${u.selectedTenantId}"`);

      // Vérifier les écarts
      const diffs = [];
      if (p.name !== u.name) diffs.push(`Nom ("${p.name}" vs "${u.name}")`);
      if (p.phone !== u.phone) diffs.push(`Téléphone ("${p.phone}" vs "${u.phone}")`);
      if (p.birthDate !== u.birthDate) diffs.push(`birthDate ("${p.birthDate}" vs "${u.birthDate}")`);
      if (p.gender !== u.gender) diffs.push(`gender ("${p.gender}" vs "${u.gender}")`);
      if (p.district !== u.district) diffs.push(`district ("${p.district}" vs "${u.district}")`);
      if (p.pregnant !== u.pregnant) diffs.push(`pregnant (${p.pregnant} vs ${u.pregnant})`);
      if (p.preferredChannel !== u.preferredChannel) diffs.push(`preferredChannel ("${p.preferredChannel}" vs "${u.preferredChannel}")`);
      if (p.beautyBudget !== u.beautyBudget) diffs.push(`beautyBudget ("${p.beautyBudget}" vs "${u.beautyBudget}")`);
      if (p.skinType !== u.skinType) diffs.push(`skinType ("${p.skinType}" vs "${u.skinType}")`);
      if (p.fitzpatrick !== u.fitzpatrick) diffs.push(`fitzpatrick ("${p.fitzpatrick}" vs "${u.fitzpatrick}")`);

      if (diffs.length > 0) {
        console.log(`  ⚠️ ÉCARTS DÉTECTÉS : ${diffs.join(", ")}`);
      } else {
        console.log(`  ✅ PARFAITEMENT IDENTIQUE`);
      }
    } else {
      console.log(`  ❌ AUCUN COMPTE USER LIÉ !`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
