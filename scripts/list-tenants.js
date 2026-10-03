const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
async function main() {
  const tenants = await db.tenant.findMany({
    select: { id: true, name: true, city: true, ownerName: true, ownerPhone: true }
  });
  console.log(JSON.stringify(tenants, null, 2));
  await db.$disconnect();
}
main().catch(console.error);
