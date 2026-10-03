const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: { phone: '+2250504928817' }
  });
  console.log('User found:', user?.id, user?.name, user?.phone);

  if (!user) return;

  const now = new Date();
  const sub = await prisma.subscription.findFirst({
    where: { userId: user.id, status: 'active', expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' }
  });
  console.log('Active sub:', sub);
}

main().catch(console.error).finally(() => prisma.$disconnect());
