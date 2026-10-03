const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
async function main() {
  const u = await db.user.update({
    where: { phone: "+2250748894270" },
    data: { role: "admin" }
  });
  console.log("Updated Fenezara to admin:", u);
  await db.$disconnect();
}
main().catch(console.error);
