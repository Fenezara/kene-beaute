const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
async function main() {
  const users = await db.user.findMany({
    select: { id: true, phone: true, name: true, role: true, pinHash: true }
  });
  console.log(JSON.stringify(users, null, 2));
  await db.$disconnect();
}
main().catch(console.error);
