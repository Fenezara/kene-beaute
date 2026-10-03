import { db } from '@/lib/db'
async function main() {
  const phones = ['+2250702030405', '+2250703040506', '+2250706050403']
  for (const p of phones) {
    const r = await db.user.deleteMany({ where: { phone: p } })
    console.log(`user ${p} supprimé:`, r.count)
  }
  const t = await db.tenant.deleteMany({ where: { name: 'Institut Sika & Karité' } })
  console.log('tenant supprimé:', t.count)
  const o = await db.otpCode.deleteMany({ where: { phone: { in: phones } } })
  console.log('otp supprimés:', o.count)
  const users = await db.user.count()
  const tenants = await db.tenant.count()
  console.log('ÉTAT FINAL — users:', users, '| tenants:', tenants)
  await db.$disconnect()
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
