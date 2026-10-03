const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, role: true }
  });
  console.log('--- USERS ---');
  console.log(JSON.stringify(users, null, 2));

  const subs = await prisma.subscription.findMany({
    orderBy: { createdAt: 'desc' }
  });
  console.log('--- SUBSCRIPTIONS ---');
  console.log(JSON.stringify(subs, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
