const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, role: true, selectedTenantId: true },
  });
  console.log("=== USERS (" + users.length + ") ===");
  console.log(JSON.stringify(users, null, 2));

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, ownerPhone: true, plan: true },
  });
  console.log("=== TENANTS (" + tenants.length + ") ===");
  console.log(JSON.stringify(tenants, null, 2));

  const profiles = await prisma.clientProfile.findMany({
    select: { id: true, name: true, phone: true, userId: true, tenantId: true },
  });
  console.log("=== CLIENT PROFILES (" + profiles.length + ") ===");
  console.log(JSON.stringify(profiles, null, 2));

  const appointments = await prisma.appointment.findMany({
    select: { id: true, tenantId: true, userId: true, clientProfileId: true, clientName: true, clientPhone: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  console.log("=== APPOINTMENTS (last " + appointments.length + ") ===");
  console.log(JSON.stringify(appointments, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
