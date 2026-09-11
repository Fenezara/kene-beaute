import { db } from "../src/lib/db";
const users = await db.user.findMany({ orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, phone: true, name: true, role: true, updatedAt: true } });
for (const u of users) console.log(`${u.id} | ${u.phone} | ${u.name} | ${u.role} | ${u.updatedAt.toISOString()}`);
process.exit(0);
