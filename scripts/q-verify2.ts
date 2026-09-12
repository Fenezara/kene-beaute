import { db } from '@/lib/db'
async function main() {
  const u = await db.user.findUnique({ where: { phone: '+2250703040506' }, select: { name: true, role: true, skinType: true, fitzpatrick: true, consentHealth: true, createdAt: true } })
  console.log('USER +2250703040506 (pont GET):', JSON.stringify(u))
  const c = await db.consent.findMany({ where: { user: { phone: '+2250703040506' } }, select: { type: true, granted: true } })
  console.log('CONSENTS:', JSON.stringify(c))
  await db.$disconnect()
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
