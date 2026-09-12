import { db } from '@/lib/db'
async function main() {
  const u = await db.user.findUnique({ where: { phone: '+2250702030405' }, select: { name: true, role: true, skinType: true, fitzpatrick: true, goals: true, consentHealth: true, city: true, referralCode: true, createdAt: true } })
  console.log('USER +2250702030405:', JSON.stringify(u))
  const c = await db.consent.findMany({ where: { user: { phone: '+2250702030405' } }, select: { type: true, granted: true, createdAt: true } })
  console.log('CONSENTS:', JSON.stringify(c))
  const w = await db.wallet.findFirst({ where: { user: { phone: '+2250702030405' } }, select: { balance: true, createdAt: true } })
  console.log('WALLET:', JSON.stringify(w))
  const n = await db.notification.count({ where: { user: { phone: '+2250702030405' } } })
  console.log('NOTIFICATIONS:', n)
  await db.$disconnect()
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
