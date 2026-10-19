// scripts/purge_test_data.js
// Nettoyage ciblé des données de test et démo sur Kènè en production
// Conserve 100% des comptes réels, gérantes, instituts partenaires et clientes réelles.

const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

// Numéros et noms SACROSNACTS (ne JAMAIS supprimer)
const PROTECTED_PHONES = [
  "+2250504195071", // Déborah (Cabinet LA DERMO / Dermo SPA)
  "+2250546795032", // Yapo Déborah Ange Laure
  "+2250715929165", // Kouamé Edith
  "+2250555212325", // Delphine
  "+2250103814662", // Membre Kènè
  "+2250708366811", // Cliente réelle Kènè+
  "+2250555787538", // Cliente réelle Kènè+
  "+2250546412872", // Cliente réelle Kènè+
  "+2250778949146", // Cliente réelle Kènè+
];

async function runPurge() {
  console.log("=== DÉMARRAGE DE LA PURGE DES DONNÉES DE TEST KÈNÈ ===");

  // 1. Identification des instituts à supprimer
  const allTenants = await db.tenant.findMany();
  const tenantsToDelete = allTenants.filter((t) => {
    // Si c'est un institut actif de Déborah, on conserve IMPÉRATIVEMENT
    if (t.ownerPhone === "+2250504195071" || t.phone === "+2250504195071") {
      return false;
    }
    // Supprimer les démos et tests
    if (t.name === "Éclat d'Abidjan" || t.name === "Institut Baobab" || t.name === "dsfdsdf") {
      return true;
    }
    // Supprimer le faux doublon inactif de LA DERMO (+2250788225018 / active: false)
    if (t.name === "Cabinet LA DERMO" && (t.phone === "+2250788225018" || t.active === false)) {
      return true;
    }
    return false;
  });

  console.log(`Instituts identifiés pour suppression (${tenantsToDelete.length}) :`);
  for (const t of tenantsToDelete) {
    console.log(` - [${t.id}] ${t.name} (Tél: ${t.phone || t.ownerPhone}, Actif: ${t.active})`);
  }

  // 2. Identification des utilisateurs tests à supprimer
  const allUsers = await db.user.findMany();
  const usersToDelete = allUsers.filter((u) => {
    // Protection absolue admins & numéros réels
    if (u.role === "admin") return false;
    if (PROTECTED_PHONES.includes(u.phone)) return false;
    if (u.name && u.name.toLowerCase().includes("déborah")) return false;

    // Supprimer les comptes invités temporaires +22500...
    if (u.phone && u.phone.startsWith("+22500")) return true;

    // Supprimer les faux comptes de démo créés pour les salons d'exemple
    if (u.phone === "+2250709080706" || u.phone === "+221770000101") return true;

    // Faux compte associé à l'institut test dsfdsdf
    if (u.phone === "+2250703324674" && u.name === "Nouvelle cliente") return true;

    return false;
  });

  console.log(`Utilisateurs tests identifiés pour suppression (${usersToDelete.length})`);

  const tenantIds = tenantsToDelete.map((t) => t.id);
  const userIds = usersToDelete.map((u) => u.id);

  // 3. Suppression des données associées aux instituts supprimés
  if (tenantIds.length > 0) {
    console.log("\n--- Nettoyage des tables liées aux instituts tests ---");

    // Détacher d'abord selectedTenantId des users qui pointaient vers ces instituts
    await db.user.updateMany({
      where: { selectedTenantId: { in: tenantIds } },
      data: { selectedTenantId: null },
    });

    // Consentements liés à ces instituts
    await db.consent.deleteMany({ where: { tenantId: { in: tenantIds } } });

    // RDV de ces instituts
    const deletedAppts = await db.appointment.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    console.log(`RDV supprimés : ${deletedAppts.count}`);

    // Ventes et lignes de vente
    const sales = await db.sale.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } });
    const saleIds = sales.map((s) => s.id);
    if (saleIds.length > 0) {
      await db.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      await db.sale.deleteMany({ where: { id: { in: saleIds } } });
      console.log(`Ventes de caisse supprimées : ${saleIds.length}`);
    }

    // Diagnostics cabine pro
    const deletedProDiags = await db.proDiagnosis.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    console.log(`Diagnostics cabine pro supprimés : ${deletedProDiags.count}`);

    // Fiches clientes CRM propres à ces instituts
    const deletedProfiles = await db.clientProfile.deleteMany({
      where: { tenantId: { in: tenantIds } },
    });
    console.log(`Fiches clientes CRM supprimées : ${deletedProfiles.count}`);

    // Produits & Commandes de ces instituts
    const tenantProducts = await db.product.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true },
    });
    const productIds = tenantProducts.map((p) => p.id);
    if (productIds.length > 0) {
      // Supprimer les OrderItems pointant vers ces produits
      const delOrderItems = await db.orderItem.deleteMany({
        where: { productId: { in: productIds } },
      });
      console.log(`Lignes de commande boutique rattachées aux produits supprimées : ${delOrderItems.count}`);

      // Supprimer les SaleItems restants pointant vers ces produits
      await db.saleItem.deleteMany({ where: { productId: { in: productIds } } });

      // Mouvements de stock
      await db.inventoryMovement.deleteMany({ where: { productId: { in: productIds } } });

      // Supprimer les produits
      const delProducts = await db.product.deleteMany({ where: { id: { in: productIds } } });
      console.log(`Produits supprimés : ${delProducts.count}`);
    }

    // Services
    const tenantServices = await db.service.findMany({
      where: { tenantId: { in: tenantIds } },
      select: { id: true },
    });
    const serviceIds = tenantServices.map((s) => s.id);
    if (serviceIds.length > 0) {
      await db.appointment.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await db.saleItem.deleteMany({ where: { serviceId: { in: serviceIds } } });
      await db.service.deleteMany({ where: { id: { in: serviceIds } } });
      console.log(`Services supprimés : ${serviceIds.length}`);
    }

    // Ressources / Praticiennes
    await db.resource.deleteMany({ where: { tenantId: { in: tenantIds } } });

    // RH, Paie & Congés
    await db.leaveRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    const payPeriods = await db.payPeriod.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } });
    const ppIds = payPeriods.map((p) => p.id);
    if (ppIds.length > 0) {
      await db.payslip.deleteMany({ where: { payPeriodId: { in: ppIds } } });
      await db.payPeriod.deleteMany({ where: { id: { in: ppIds } } });
    }
    await db.employee.deleteMany({ where: { tenantId: { in: tenantIds } } });

    // Compta SYSCOHADA (JournalLines, JournalEntries, ChartAccounts)
    const journalEntries = await db.journalEntry.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } });
    const jeIds = journalEntries.map((j) => j.id);
    if (jeIds.length > 0) {
      await db.journalLine.deleteMany({ where: { entryId: { in: jeIds } } });
      await db.journalEntry.deleteMany({ where: { id: { in: jeIds } } });
    }
    await db.chartAccount.deleteMany({ where: { tenantId: { in: tenantIds } } });

    // Avis, Coupons, Relances, Notifs
    await db.review.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.coupon.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.followUpMark.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await db.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });

    // Enfin, supprimer les tenants eux-mêmes
    const deletedTenants = await db.tenant.deleteMany({
      where: { id: { in: tenantIds } },
    });
    console.log(`Instituts tests supprimés : ${deletedTenants.count}`);
  }

  // 4. Suppression des données associées aux utilisateurs tests
  if (userIds.length > 0) {
    console.log("\n--- Nettoyage des tables liées aux utilisateurs tests ---");

    // Subscriptions
    const deletedSubs = await db.subscription.deleteMany({
      where: { userId: { in: userIds } },
    });
    console.log(`Abonnements tests supprimés : ${deletedSubs.count}`);

    // Passeport de peau
    await db.skinPassport.deleteMany({ where: { userId: { in: userIds } } });

    // RDV résiduels de ces utilisateurs
    const appts = await db.appointment.deleteMany({ where: { userId: { in: userIds } } });
    console.log(`RDV clients tests supprimés : ${appts.count}`);

    // Commandes boutique
    const orders = await db.order.findMany({ where: { userId: { in: userIds } }, select: { id: true, paymentId: true } });
    const orderIds = orders.map((o) => o.id);
    const paymentIds = orders.map((o) => o.paymentId).filter(Boolean);
    if (orderIds.length > 0) {
      await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await db.order.deleteMany({ where: { id: { in: orderIds } } });
      if (paymentIds.length > 0) {
        await db.payment.deleteMany({ where: { id: { in: paymentIds } } });
      }
      console.log(`Commandes tests supprimées : ${orderIds.length}`);
    }

    // Diagnostics IA
    const diags = await db.diagnosis.deleteMany({ where: { userId: { in: userIds } } });
    console.log(`Diagnostics tests supprimés : ${diags.count}`);

    // Wallets & Transactions
    const wallets = await db.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const walletIds = wallets.map((w) => w.id);
    if (walletIds.length > 0) {
      await db.walletTransaction.deleteMany({ where: { walletId: { in: walletIds } } });
      await db.wallet.deleteMany({ where: { id: { in: walletIds } } });
    }

    // Consentements & Notifications & Push & Audit
    await db.consent.deleteMany({ where: { userId: { in: userIds } } });
    await db.pushSubscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });

    // Fiches profils CRM liées
    await db.clientProfile.deleteMany({ where: { userId: { in: userIds } } });

    // Supprimer également les paiements orphelins liés à ces users
    await db.payment.deleteMany({ where: { userId: { in: userIds } } });

    // Enfin, supprimer les utilisateurs tests
    const delUsers = await db.user.deleteMany({
      where: { id: { in: userIds } },
    });
    console.log(`Utilisateurs tests supprimés : ${delUsers.count}`);
  }

  // 6. Nettoyer les commandes vides éventuelles
  const emptyOrders = await db.order.findMany({
    where: { items: { none: {} } },
    select: { id: true, paymentId: true },
  });
  if (emptyOrders.length > 0) {
    const emptyOrderIds = emptyOrders.map((o) => o.id);
    const emptyPayIds = emptyOrders.map((o) => o.paymentId).filter(Boolean);
    await db.order.deleteMany({ where: { id: { in: emptyOrderIds } } });
    if (emptyPayIds.length > 0) {
      await db.payment.deleteMany({ where: { id: { in: emptyPayIds } } });
    }
    console.log(`Commandes vides résiduelles nettoyées : ${emptyOrders.length}`);
  }

  // 7. Synthèse finale
  console.log("\n=== BILAN APRÈS PURGE ===");
  const remainingTenants = await db.tenant.findMany({
    select: { id: true, name: true, city: true, ownerName: true, ownerPhone: true, active: true },
  });
  console.log(`Instituts restants (${remainingTenants.length}) :`);
  for (const t of remainingTenants) {
    console.log(` - ${t.name} (${t.city}) | Propriétaire: ${t.ownerName} (${t.ownerPhone}) | Actif: ${t.active}`);
  }

  const remainingUsers = await db.user.findMany({
    select: { id: true, name: true, phone: true, role: true },
  });
  console.log(`Utilisateurs restants (${remainingUsers.length}) :`);
  for (const u of remainingUsers) {
    console.log(` - ${u.name} | ${u.phone} | Rôle: ${u.role}`);
  }

  await db.$disconnect();
}

runPurge().catch((err) => {
  console.error("Erreur durant la purge :", err);
  db.$disconnect().then(() => process.exit(1));
});
