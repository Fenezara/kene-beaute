const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function run() {
  const founderPhone = "+2250748894270";

  // Rétrograder tout autre compte admin vers client
  const demoted = await db.user.updateMany({
    where: {
      role: "admin",
      phone: { not: founderPhone },
    },
    data: { role: "client" },
  });
  console.log("Comptes non-fondateurs rétrogradés :", demoted.count);

  // S'assurer que le fondateur est bien configuré
  const founder = await db.user.update({
    where: { phone: founderPhone },
    data: {
      name: "Fondateur Kènè",
      role: "admin",
    },
  });
  console.log("Fondateur Unique Kènè confirmé :", founder.phone, "-", founder.name);

  // Vérifier la liste complète des admins
  const allAdmins = await db.user.findMany({
    where: { role: "admin" },
    select: { id: true, phone: true, name: true, role: true },
  });
  console.log("Nombre total d'administrateurs en base :", allAdmins.length);
  console.log(JSON.stringify(allAdmins, null, 2));

  await db.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
