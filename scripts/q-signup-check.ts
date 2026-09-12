import { db } from '@/lib/db'
async function main() {
  const otos = await db.otpCode.findMany({ select: { phone: true, createdAt: true, expiresAt: true, used: true }, orderBy: { createdAt: 'desc' }, take: 15 })
  console.log('DERNIERS OTP:')
  for (const o of otos) console.log(` - ${o.phone} | créé ${o.createdAt.toISOString()} | consommé=${o.used}`)
  const awa = await db.user.findUnique({ where: { phone: '+225070102030' }, select: { id: true, name: true, phone: true, skinType: true, consentHealth: true, createdAt: true } })
  console.log('COMPTE « Awa » +225070102030 :', JSON.stringify(awa))
  const consents = await db.consent.findMany({ where: { user: { phone: '+225070102030' } }, select: { type: true, granted: true, createdAt: true } })
  console.log('Consents Awa:', JSON.stringify(consents))
  await db.$disconnect()
}
main().catch(e => { console.error(String(e).slice(0, 500)); process.exit(1) })
