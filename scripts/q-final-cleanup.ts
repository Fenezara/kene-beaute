import { db } from '@/lib/db'
async function main() {
  // 1) Employée de test + son compte app
  const emp = await db.employee.findFirst({ where: { name: 'Adjoua Test' }, select: { id: true, userId: true } })
  if (emp) {
    await db.employee.delete({ where: { id: emp.id } })
    if (emp.userId) await db.user.delete({ where: { id: emp.userId } }).catch(() => {})
    console.log('employée Adjoua Test + compte supprimés')
  }
  // 2) RDV de test (Mariam → Éclat, aujourd'hui 10:00) + payment + wallet tx + notif + re-crédit
  const appt = await db.appointment.findFirst({ where: { id: 'cmty7cfen0009m1hq6bioegh2' }, select: { id: true, paymentId: true, userId: true, depositAmount: true } })
  if (appt) {
    await db.notification.deleteMany({ where: { metaJson: { contains: appt.id } } })
    await db.appointment.delete({ where: { id: appt.id } })
    if (appt.paymentId) {
      const wtx = await db.walletTransaction.findFirst({ where: { refId: appt.id }, select: { id: true, walletId: true } })
      if (wtx) {
        await db.walletTransaction.delete({ where: { id: wtx.id } })
        if (appt.depositAmount) await db.wallet.update({ where: { id: wtx.walletId }, data: { balance: { increment: appt.depositAmount } } })
      }
      await db.payment.delete({ where: { id: appt.paymentId } }).catch(() => {})
    }
    console.log('RDV de test + payment + wallet restaurés (+', appt.depositAmount, 'FCFA)')
  }
  // 3) ProDiagnosis de test (practitioner Adjoua Test)
  const pd = await db.proDiagnosis.deleteMany({ where: { practitioner: 'Adjoua Test' } })
  console.log('proDiagnosis test supprimés:', pd.count)
  // 4) Self-scans E2E d'aujourd'hui (les 2 du diagnostic)
  const today = new Date(); today.setHours(0,0,0,0)
  const d = await db.diagnosis.deleteMany({ where: { userId: 'cmtjdaiid0005qimiei7f1j3l', createdAt: { gte: today } } })
  console.log('self-scans du jour supprimés:', d.count)
  // 5) Profil CRM Éclat : notes restaurées au seed
  await db.clientProfile.update({ where: { id: 'cmtjdaij9001nqimial4fchkb' }, data: { notes: 'Cliente VIP — offrir brume néré au 15e soin.' } })
  console.log('notes CRM Éclat restaurées au seed')
  // 6) OTP de test + audits du jour
  await db.otpCode.deleteMany({ where: { phone: { in: ['+2250709080706', '+2250704050607'] } } })
  await db.auditLog.deleteMany({ where: { createdAt: { gte: today } } })
  console.log('OTP + audits du jour purgés')
  // ÉTAT FINAL
  const users = await db.user.count(); const tenants = await db.tenant.count(); const employees = await db.employee.count()
  console.log('ÉTAT FINAL — users:', users, '| tenants:', tenants, '| employees:', employees)
  await db.$disconnect()
}
main().catch(e => { console.error(String(e).slice(0, 400)); process.exit(1) })
