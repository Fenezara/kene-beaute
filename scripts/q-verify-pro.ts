import { db } from '@/lib/db'
async function main() {
  const t = await db.tenant.findFirst({ where: { name: 'Institut Sika & Karité' }, select: { id: true, name: true, type: true, city: true, country: true, ownerName: true, ownerPhone: true, plan: true, active: true, createdAt: true } })
  console.log('TENANT:', JSON.stringify(t))
  if (!t) process.exit(1)
  const emps = await db.resource.findMany({ where: { tenantId: t.id }, select: { name: true, role: true, active: true } })
  console.log('PRATICIENNES:', JSON.stringify(emps))
  const svcs = await db.service.findMany({ where: { tenantId: t.id }, select: { name: true, price: true, durationMin: true } })
  console.log('CATALOGUE:', JSON.stringify(svcs))
  const owner = await db.user.findUnique({ where: { phone: '+2250706050403' }, select: { name: true, role: true } })
  console.log('GÉRANTE (user):', JSON.stringify(owner))
  const notifs = await db.notification.count({ where: { tenantId: t.id } })
  console.log('NOTIFICATIONS BIENVENUE:', notifs)
  await db.$disconnect()
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
