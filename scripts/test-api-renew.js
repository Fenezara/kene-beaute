const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testRenew() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    const res = await fetch('http://localhost:3000/api/subscriptions/renew', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: u.id })
    });
    const status = res.status;
    const body = await res.json().catch(() => null);
    console.log(`User ${u.name || u.phone} (${u.id}, role: ${u.role}): status ${status}`, body);
  }
}

testRenew().catch(console.error).finally(() => prisma.$disconnect());
