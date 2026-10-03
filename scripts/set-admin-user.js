const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("crypto");

function hashPin(pin) {
  const clean = pin.trim();
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(clean, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

const db = new PrismaClient();

async function main() {
  const phone = "+2250748894270";
  const pin = "0103";
  const pinHash = hashPin(pin);

  const existing = await db.user.findFirst({
    where: {
      OR: [
        { phone: "+2250748894270" },
        { phone: "0748894270" },
        { phone: "2250748894270" }
      ]
    }
  });

  let u;
  if (existing) {
    u = await db.user.update({
      where: { id: existing.id },
      data: {
        phone: "+2250748894270",
        role: "admin",
        pinHash,
        pinFails: 0,
        pinLockedUntil: null,
        lockedAt: null,
        lockedReason: null
      }
    });
    console.log("Existing user updated to Admin with PIN 0103:", u);
  } else {
    u = await db.user.create({
      data: {
        phone: "+2250748894270",
        name: "Fenezara Admin",
        role: "admin",
        pinHash,
        pinFails: 0,
        consentHealth: true,
        consentTs: new Date()
      }
    });
    console.log("New user created as Admin with PIN 0103:", u);
  }

  await db.$disconnect();
}

main().catch(console.error);
