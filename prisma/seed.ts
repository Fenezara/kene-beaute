// Kènè — Seed POC : données démo complètes (instituts, CRM, ventes, paie, compta…)
import { PrismaClient } from "@prisma/client";
import { computePayroll } from "../src/lib/payroll";
import { SYSCOHADA_TEMPLATE, saleJournalLines, payrollJournalLines, splitTVA } from "../src/lib/accounting/syscohada";
import { fallbackResult } from "../src/lib/ai/vlm";
import type { BodyZone } from "../src/lib/kene/types";

const db = new PrismaClient();
const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T,>(arr: T[]): T => arr[rnd(0, arr.length - 1)];

async function main() {
  console.log("🌱 Seed Kènè…");
  await db.$transaction([
    db.otpCode.deleteMany(),
    db.journalLine.deleteMany(),
    db.journalEntry.deleteMany(),
    db.chartAccount.deleteMany(),
    db.payslip.deleteMany(),
    db.payPeriod.deleteMany(),
    db.attendance.deleteMany(),
    db.leaveRequest.deleteMany(),
    db.employee.deleteMany(),
    db.notification.deleteMany(),
    db.review.deleteMany(),
    db.orderItem.deleteMany(),
    db.order.deleteMany(),
    db.payment.deleteMany(),
    db.walletTransaction.deleteMany(),
    db.wallet.deleteMany(),
    db.diagnosis.deleteMany(),
    db.saleItem.deleteMany(),
    db.sale.deleteMany(),
    db.inventoryMovement.deleteMany(),
    db.product.deleteMany(),
    db.appointment.deleteMany(),
    db.clientProfile.deleteMany(),
    db.followUpMark.deleteMany(),
    db.service.deleteMany(),
    db.resource.deleteMany(),
    db.tenant.deleteMany(),
    db.consent.deleteMany(),
    db.auditLog.deleteMany(),
    db.user.deleteMany(),
    db.momoOperator.deleteMany(),
    db.country.deleteMany(),
  ]);

  // ── Référentiels ──
  await db.country.createMany({
    data: [
      { code: "CI", name: "Côte d'Ivoire", currency: "XOF", tvaRate: 18, phoneCode: "+225" },
      { code: "SN", name: "Sénégal", currency: "XOF", tvaRate: 18, phoneCode: "+221" },
    ],
  });
  await db.momoOperator.createMany({
    data: [
      { code: "wave", name: "Wave", color: "#1DC8FF", ussd: "*144*" },
      { code: "orange", name: "Orange Money", color: "#FF7900", ussd: "*144#" },
      { code: "mtn", name: "MTN MoMo", color: "#FFCC00", ussd: "*133#" },
    ],
  });

  // ── Utilisateurs ──
  const mariam = await db.user.create({
    data: {
      phone: "+2250701020304",
      name: "Mariam Diallo",
      role: "client",
      city: "Abidjan",
      skinType: "mixte",
      fitzpatrick: "V",
      allergies: "Aucune connue",
      goals: JSON.stringify([
        { id: "taches", label: "Atténuer mes taches PIH" },
        { id: "acne", label: "Contrôler mon acné" },
        { id: "eclat", label: "Retrouver de l'éclat" },
      ]),
      consentHealth: true,
      consentTs: new Date(),
      referralCode: "MARIAM-KENE",
    },
  });
  const awa = await db.user.create({
    data: { phone: "+2250705060708", name: "Awa Traoré", role: "client", city: "Abidjan", skinType: "grasse", fitzpatrick: "IV", consentHealth: true, referredBy: mariam.id },
  });
  // Filleule de Mariam — a rejoint la communauté il y a 5 j via son code, a commandé il y a 4 j (récompense déclenchée)
  const bintou = await db.user.create({
    data: { phone: "+2250706070709", name: "Bintou Cissé", role: "client", city: "Abidjan", skinType: "mixte", fitzpatrick: "IV", consentHealth: true, referredBy: mariam.id, createdAt: new Date(Date.now() - 5 * 864e5) },
  });
  const ndeye = await db.user.create({
    data: { phone: "+221770000101", name: "Ndeye Sow", role: "pro", city: "Dakar", consentHealth: true },
  });
  await db.user.create({ data: { phone: "+2250700000000", name: "Console Kènè", role: "admin", city: "Abidjan" } });

  // ── Tenants ──
  const t1 = await db.tenant.create({
    data: {
      name: "Éclat d'Abidjan",
      type: "institut",
      country: "CI",
      city: "Abidjan — Cocody",
      address: "Rue des Jardins, Cocody, Abidjan",
      phone: "+2252722491500",
      ownerName: "Fatou Koné",
      ownerPhone: "+2250709080706",
      plan: "pro",
      rating: 4.8,
      reviewCount: 132,
      description:
        "Institut spécialisé peaux mélanodermes : soins éclat, protocol anti-taches PIH, gommages traditionnels au karité et diagnostics IA Kènè.",
      openingHour: 9,
      closingHour: 20,
    },
  });
  const t2 = await db.tenant.create({
    data: {
      name: "Institut Baobab",
      type: "spa",
      country: "SN",
      city: "Dakar — Almadies",
      address: "Route de Ngor, Almadies, Dakar",
      phone: "+221338690000",
      ownerName: "Ndeye Sow",
      ownerPhone: ndeye.phone,
      plan: "trial",
      rating: 4.9,
      reviewCount: 87,
      description: "Spa urbain dakarois : massages à l'huile de baobab, soins IPRES-friendly et rituels bogolan.",
      openingHour: 10,
      closingHour: 19,
    },
  });

  // ── Ressources (praticiennes) ──
  const resT1 = await Promise.all(
    [
      { name: "Aminata Coulibaly", role: "estheticienne", color: "#C8951E" },
      { name: "Bintou Cissé", role: "estheticienne", color: "#3F7D3F" },
      { name: "Chantal Amani", role: "dermo_conseillere", color: "#8B1A3B" },
    ].map((r) => db.resource.create({ data: { tenantId: t1.id, ...r } }))
  );
  const resT2 = await Promise.all(
    [
      { name: "Sokhna Fall", role: "estheticienne", color: "#C8951E" },
      { name: "Maïmouna Diop", role: "estheticienne", color: "#E07A2B" },
    ].map((r) => db.resource.create({ data: { tenantId: t2.id, ...r } }))
  );

  // ── Services ──
  const servicesT1 = await Promise.all(
    [
      { name: "Soin Éclat Mélanoderme", category: "soin", durationMin: 60, price: 25000, commissionPct: 12, description: "Double nettoyage, exfoliation enzymatique, masque éclat & modelage.", botanicals: "Moringa, Aloka" },
      { name: "Protocol Anti-Taches PIH", category: "soin", durationMin: 75, price: 35000, commissionPct: 15, description: "Peeling doux + sérum dépigmentant sans corticoïdes + LED.", botanicals: "Bissap, Vitamine C" },
      { name: "Gommage Corps Karité", category: "gommage", durationMin: 45, price: 18000, commissionPct: 10, description: "Gommage traditionnel au beurre de karité brut.", botanicals: "Karité" },
      { name: "Massage Détente Baobab", category: "massage", durationMin: 60, price: 22000, commissionPct: 10, description: "Massage relaxant à l'huile de baobab pressée à froid.", botanicals: "Baobab" },
      { name: "Diagnostic IA + Consultation", category: "diagnostic", durationMin: 30, price: 10000, commissionPct: 20, description: "Analyse visage IA Kènè multi-zones + routine personnalisée.", botanicals: "—" },
      { name: "Soin Cuir Chevelu Néré", category: "soin", durationMin: 45, price: 15000, commissionPct: 10, description: "Bain d'huile de néré + massage scalp stimulant.", botanicals: "Néré" },
    ].map((s) => db.service.create({ data: { tenantId: t1.id, ...s } }))
  );
  await Promise.all(
    [
      { name: "Massage Signature Baobab", category: "massage", durationMin: 75, price: 30000, commissionPct: 12, description: "Rituel complet corps à l'huile de baobab.", botanicals: "Baobab" },
      { name: "Soin Éclat Dakar", category: "soin", durationMin: 60, price: 28000, commissionPct: 12, description: "Soin visage éclat adapté peaux mélanodermes.", botanicals: "Moringa" },
      { name: "Gommage Bogolan", category: "gommage", durationMin: 45, price: 20000, commissionPct: 10, description: "Gommage corps aux pigments naturels.", botanicals: "Néré" },
    ].map((s) => db.service.create({ data: { tenantId: t2.id, ...s } }))
  );

  // ── Produits boutique Kènè (marketplace) ──
  const boutiqueSpecs = [
    { name: "Sérum Éclat Moringa", category: "serum", price: 15000, botanicals: "Moringa, Vitamine C stabilisée", image: "/products/serum-moringa.webp", description: "Sérum anti-taches & éclat formulé pour peaux mélanodermes. Moringa bio du plateau Dogbo.", rating: 4.9, reviewCount: 214 },
    { name: "Baume Nuit Karité Bio", category: "creme", price: 12000, botanicals: "Karité brut non raffiné", image: "/products/baume-karite.webp", description: "Réparateur nuit ultra-nourrissant, karité du Burkina fair-trade.", rating: 4.8, reviewCount: 178 },
    { name: "Huile Sèche Baobab", category: "huile", price: 14000, botanicals: "Baobab pressé à froid", image: "/products/huile-baobab.webp", description: "Huile sèche corps & cheveux, absorption instantanée, brillance zéro.", rating: 4.7, reviewCount: 96 },
    { name: "Gommage Bissap & Sucre", category: "gommage", price: 9500, botanicals: "Bissap (hibiscus)", image: "/products/gommage-bissap.webp", description: "Gommage doux aux grains de sucre de canne et fleurs d'hibiscus.", rating: 4.6, reviewCount: 143 },
    { name: "Masque Argile & Aloka", category: "masque", price: 11000, botanicals: "Argile blanche, Aloka (aloe vera)", image: "/products/masque-aloka.webp", description: "Masque purifiant sans assécher, pour peaux mixtes à grasses.", rating: 4.7, reviewCount: 88 },
    { name: "Savon Noir Traditionnel", category: "savon", price: 4500, botanicals: "Cendres de cabosses de cacao", image: "/products/savon-noir.webp", description: "Savon noir authentique, nettoyant profond visage & corps.", rating: 4.8, reviewCount: 320 },
    { name: "Brume Tonique Néré & Rose", category: "serum", price: 8500, botanicals: "Néré, eau de rose", image: "/products/brune-nere.webp", description: "Brume fraîcheur hydratante, parfait après nettoyage.", rating: 4.5, reviewCount: 61 },
    { name: "Crème Solaire Teintée SPF50", category: "creme", price: 18000, botanicals: "Filtres minéraux, sans traces blanches", image: "/products/solaire-spf50.webp", description: "SPF 50 invisible sur peaux foncées, anti-taches photo-induites.", rating: 4.9, reviewCount: 267 },
  ];
  await Promise.all(boutiqueSpecs.map((p) => db.product.create({ data: { ...p, stock: rnd(24, 90), stockAlert: 10 } })));

  // ── Produits en stock institut t1 (POS) ──
  const posSpecs = boutiqueSpecs.slice(0, 5).map((p, i) => ({ ...p, stock: [4, 9, 22, 35, 6][i], stockAlert: 8 }));
  const posProducts = await Promise.all(posSpecs.map((p) => db.product.create({ data: { ...p, tenantId: t1.id } })));

  // ── CRM t1 ──
  const clientSpecs = [
    { name: "Mariam Diallo", phone: mariam.phone, userId: mariam.id, skinType: "mixte", fitzpatrick: "V", segment: "Champions", visits: 14, spent: 342000, lastDaysAgo: 5 },
    { name: "Awa Traoré", phone: awa.phone, userId: awa.id, skinType: "grasse", fitzpatrick: "IV", segment: "Champions", visits: 11, spent: 268000, lastDaysAgo: 9 },
    { name: "Aïcha Bamba", phone: "+2250703344556", segment: "Fidèles", visits: 8, spent: 176000, lastDaysAgo: 16 },
    { name: "Rokia Coulibaly", phone: "+2250707788990", segment: "Fidèles", visits: 7, spent: 149000, lastDaysAgo: 22 },
    { name: "Sarah Mensah", phone: "+2250501122334", segment: "Potentiels", visits: 3, spent: 58000, lastDaysAgo: 35 },
    { name: "Ines Yao", phone: "+2250704455667", segment: "À risque", visits: 5, spent: 112000, lastDaysAgo: 88 },
    { name: "Grace N'Guessan", phone: "+2250708899001", segment: "Perdus", visits: 2, spent: 36000, lastDaysAgo: 150 },
    { name: "Diane Kacou", phone: "+2250702233445", segment: "Nouveaux", visits: 1, spent: 18000, lastDaysAgo: 3 },
    { name: "Nafissa Ouattara", phone: "+2250701122344", segment: "Potentiels", visits: 4, spent: 92000, lastDaysAgo: 26 },
  ];
  const clients = await Promise.all(
    clientSpecs.map((c) =>
      db.clientProfile.create({
        data: {
          tenantId: t1.id,
          name: c.name,
          phone: c.phone,
          userId: c.userId,
          skinType: c.skinType,
          fitzpatrick: c.fitzpatrick,
          visitsCount: c.visits,
          totalSpent: c.spent,
          lastVisit: new Date(Date.now() - c.lastDaysAgo * 864e5),
          rfmSegment: c.segment,
          notes: c.segment === "Champions" ? "Cliente VIP — offrir brume néré au 15e soin." : undefined,
        },
      })
    )
  );
  await Promise.all(
    [
      { name: "Amy Sow", phone: "+221775551223" },
      { name: "Dieynaba Lam", phone: "+221775554455" },
      { name: "Khady Ndoye", phone: "+221775557788" },
    ].map((c) => db.clientProfile.create({ data: { tenantId: t2.id, ...c, rfmSegment: "Nouveaux" } }))
  );

  // ── RDV t1 : passés + aujourd'hui + semaine ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const mkAppt = (dayOffset: number, hour: number, minute: number, clientId: number, serviceIdx: number, resIdx: number, status: string) => {
    const start = new Date(today);
    start.setDate(start.getDate() + dayOffset);
    start.setHours(hour, minute, 0, 0);
    const svc = servicesT1[serviceIdx];
    return db.appointment.create({
      data: {
        tenantId: t1.id,
        clientProfileId: clients[clientId].id,
        clientName: clients[clientId].name,
        clientPhone: clients[clientId].phone,
        resourceId: resT1[resIdx].id,
        serviceId: svc.id,
        startAt: start,
        durationMin: svc.durationMin,
        status,
        price: svc.price,
        depositAmount: 0,
      },
    });
  };
  const todayDay = today.getDate();
  await mkAppt(-14, 10, 0, 0, 0, 0, "completed");
  await mkAppt(-7, 11, 30, 1, 1, 1, "completed");
  await mkAppt(-3, 15, 0, 2, 2, 2, "completed");
  await mkAppt(-1, 9, 30, 3, 0, 0, "completed");
  await mkAppt(0, 9, 30, 0, 4, 2, "confirmed");
  await mkAppt(0, 11, 0, 1, 1, 0, "confirmed");
  await mkAppt(0, 14, 30, 2, 0, 1, "confirmed");
  await mkAppt(0, 16, 30, 4, 3, 0, "confirmed");
  await mkAppt(1, 10, 0, 3, 5, 1, "confirmed");
  await mkAppt(2, 11, 0, 7, 1, 0, "confirmed");
  await mkAppt(2, 15, 0, 0, 3, 1, "confirmed");
  await mkAppt(3, 9, 30, 4, 2, 2, "confirmed");
  await mkAppt(-26, 10, 30, 8, 1, 1, "completed"); // Nafissa — relance soin de suivi à S+28
  await mkAppt(-2, 10, 0, 6, 0, 0, "cancelled");

  // ── Plan comptable t1 + capitaux initiaux ──
  const accounts = await Promise.all(
    SYSCOHADA_TEMPLATE.map((a) =>
      db.chartAccount.create({ data: { tenantId: t1.id, code: a.code, classe: a.classe, label: a.label, type: a.type } })
    )
  );
  const accByCode = new Map(accounts.map((a) => [a.code, a.id]));

  const entryDate = (d: Date) => {
    const x = new Date(today);
    x.setDate(1);
    x.setMonth(0);
    x.setHours(9, 0, 0, 0);
    return x;
  };
  const capitalEntry = await db.journalEntry.create({
    data: {
      tenantId: t1.id,
      journalCode: "OD",
      date: entryDate(today),
      reference: "OD-0001",
      description: "Virement de capitaux propres à l'ouverture",
      sourceType: "manual",
      lines: {
        create: [
          { accountId: accByCode.get("521000")!, debit: 5_000_000, label: "Banque" },
          { accountId: accByCode.get("101000")!, credit: 5_000_000, label: "Capital social" },
        ],
      },
    },
  });

  // ── Ventes t1 : 45 ventes sur 30 jours ──
  const methods = ["wave", "orange", "cash", "card"] as const;
  let saleCounter = 1;
  for (let day = 30; day >= 0; day--) {
    const nbSales = rnd(0, 2);
    for (let s = 0; s < nbSales; s++) {
      const when = new Date(today);
      when.setDate(when.getDate() - day);
      when.setHours(rnd(9, 19), pick([0, 15, 30, 45]), 0, 0);
      const client = clients[rnd(0, clients.length - 1)];
      const nbSvc = rnd(1, 2);
      const nbProd = rnd(0, 2);
      const svcPicks = [...servicesT1].sort(() => Math.random() - 0.5).slice(0, nbSvc);
      const prodPicks = [...posProducts].sort(() => Math.random() - 0.5).slice(0, nbProd);
      const items: { kind: "service" | "product"; id: string; label: string; qty: number; unitPrice: number; total: number }[] = [];
      for (const svc of svcPicks) items.push({ kind: "service", id: svc.id, label: svc.name, qty: 1, unitPrice: svc.price, total: svc.price });
      for (const prod of prodPicks) {
        const qty = rnd(1, 2);
        items.push({ kind: "product", id: prod.id, label: prod.name, qty, unitPrice: prod.price, total: prod.price * qty });
      }
      const subtotal = items.reduce((sum, i) => sum + i.total, 0);
      const discount = Math.random() < 0.15 ? Math.round(subtotal * 0.05) : 0;
      const total = subtotal - discount;
      const method = pick([...methods]);
      const { tva } = splitTVA(total);
      const servicesAmount = items.filter((i) => i.kind === "service").reduce((sum, i) => sum + i.total, 0);
      const productsAmount = subtotal - servicesAmount;

      const sale = await db.sale.create({
        data: {
          tenantId: t1.id,
          clientProfileId: Math.random() < 0.85 ? client.id : null,
          subtotal,
          discount,
          total,
          tvaAmount: tva,
          paymentMethod: method,
          paymentRef: `POS-${String(saleCounter).padStart(4, "0")}`,
          cashierName: pick(["Aminata C.", "Bintou C.", "Caisse 1"]),
          status: "completed",
          createdAt: when,
          items: {
            create: items.map((i) => ({
              kind: i.kind,
              serviceId: i.kind === "service" ? i.id : null,
              productId: i.kind === "product" ? i.id : null,
              label: i.label,
              qty: i.qty,
              unitPrice: i.unitPrice,
              total: i.total,
            })),
          },
        },
      });
      saleCounter++;

      // Journal comptable automatique
      const jl = saleJournalLines({ total, servicesAmount, productsAmount, method: method as "wave" });
      await db.journalEntry.create({
        data: {
          tenantId: t1.id,
          journalCode: method === "cash" ? "CA" : "BQ",
          date: when,
          reference: `VE-${String(saleCounter).padStart(4, "0")}`,
          description: `Encaissement ${sale.paymentRef} (${method})`,
          sourceType: "sale",
          sourceId: sale.id,
          lines: {
            create: jl.map((l) => ({
              accountId: accByCode.get(l.accountCode)!,
              debit: l.debit ?? 0,
              credit: l.credit ?? 0,
              label: l.label ?? undefined,
            })),
          },
        },
      });
    }
  }

  // ── Mouvements de stock (réassorts) ──
  for (const p of posProducts) {
    await db.inventoryMovement.createMany({
      data: [
        { tenantId: t1.id, productId: p.id, type: "in", qty: 40, reason: "Réassort fournisseur BioSenke (Abidjan)", createdAt: new Date(Date.now() - 20 * 864e5) },
        { tenantId: t1.id, productId: p.id, type: "loss", qty: rnd(1, 3), reason: "Casse / échantillons clients", createdAt: new Date(Date.now() - 8 * 864e5) },
      ],
    });
  }

  // ── Employés ──
  const employeesT1 = await Promise.all(
    [
      { name: "Aminata Coulibaly", role: "estheticienne", baseSalary: 120000, transport: 10000, cnps: "CI-0031288" },
      { name: "Bintou Cissé", role: "estheticienne", baseSalary: 110000, transport: 10000, cnps: "CI-0031289" },
      { name: "Chantal Amani", role: "dermo_conseillere", baseSalary: 180000, transport: 15000, cnps: "CI-0029904" },
      { name: "Fatou Koné", role: "manager", baseSalary: 350000, transport: 20000, cnps: "CI-0011223" },
    ].map((e) =>
      db.employee.create({
        data: {
          tenantId: t1.id,
          name: e.name,
          role: e.role,
          contractType: "CDI",
          country: "CI",
          baseSalary: e.baseSalary,
          transport: e.transport,
          cnpsNumber: e.cnps,
          hireDate: new Date(Date.now() - rnd(200, 900) * 864e5),
        },
      })
    )
  );
  await Promise.all(
    [
      { name: "Sokhna Fall", baseSalary: 130000, transport: 12000, cadres: false },
      { name: "Aïssatou Ba", baseSalary: 210000, transport: 15000, cadres: true },
    ].map((e) =>
      db.employee.create({
        data: {
          tenantId: t2.id,
          name: e.name,
          role: "estheticienne",
          contractType: "CDI",
          country: "SN",
          baseSalary: e.baseSalary,
          transport: e.transport,
          cadres: e.cadres,
          hireDate: new Date(Date.now() - 400 * 864e5),
        },
      })
    )
  );

  // ── Pointage (7 derniers jours) ──
  for (const emp of employeesT1) {
    for (let d = 1; d <= 7; d++) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);
      if (day.getDay() === 0) continue; // dimanche fermé
      const late = Math.random() < 0.15;
      await db.attendance.create({
        data: {
          employeeId: emp.id,
          date: day,
          checkIn: late ? "09:22" : pick(["08:28", "08:45", "08:55"]),
          checkOut: pick(["17:32", "18:04", "18:15"]),
          hours: late ? 7.6 : 8,
          status: late ? "late" : "present",
        },
      });
    }
  }

  // ── Paie du mois dernier (CI) ──
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const period = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  const payPeriod = await db.payPeriod.create({
    data: { tenantId: t1.id, period, country: "CI", status: "validated" },
  });
  let grossT = 0, employerT = 0, employeeT = 0, taxT = 0, netT = 0;
  for (const emp of employeesT1) {
    const res = computePayroll({ country: "CI", baseSalary: emp.baseSalary, transport: emp.transport, housing: 0 });
    grossT += res.brut; employerT += res.cnpsEmployer; employeeT += res.cnpsEmployee; taxT += res.incomeTax; netT += res.net;
    await db.payslip.create({
      data: {
        payPeriodId: payPeriod.id,
        employeeId: emp.id,
        baseSalary: emp.baseSalary,
        grossSalary: res.brut,
        cnpsEmployee: res.cnpsEmployee,
        cnpsEmployer: res.cnpsEmployer,
        incomeTax: res.incomeTax,
        cn: res.cn,
        netSalary: res.net,
        detailsJson: JSON.stringify({ lines: res.lines, regime: res.regimeLabel, coutEmployeur: res.coutEmployeur }),
      },
    });
  }
  await db.payPeriod.update({
    where: { id: payPeriod.id },
    data: { totalsJson: JSON.stringify({ grossT, employerT, employeeT, taxT, netT }) },
  });

  // Écriture de paie
  const payLines = payrollJournalLines({ grossTotal: grossT, employerContribTotal: employerT, employeeContribTotal: employeeT, incomeTaxTotal: taxT });
  const payEntryDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0, 12, 0, 0);
  await db.journalEntry.create({
    data: {
      tenantId: t1.id,
      journalCode: "PA",
      date: payEntryDate,
      reference: `PA-${period}`,
      description: `Paie ${period} — CNPS + IGR + CN`,
      sourceType: "payroll",
      sourceId: payPeriod.id,
      lines: {
        create: payLines.map((l) => ({
          accountId: accByCode.get(l.accountCode)!,
          debit: l.debit ?? 0,
          credit: l.credit ?? 0,
          label: l.label ?? undefined,
        })),
      },
    },
  });

  // ── Achat fournisseur ──
  const purchaseTotal = 480_000;
  await db.journalEntry.create({
    data: {
      tenantId: t1.id,
      journalCode: "BQ",
      date: new Date(Date.now() - 15 * 864e5),
      reference: "AC-0007",
      description: "Achat stock cosmétiques — BioSenke Abidjan",
      sourceType: "manual",
      lines: {
        create: [
          { accountId: accByCode.get("601000")!, debit: Math.round(purchaseTotal / 1.18), label: "Achats de marchandises" },
          { accountId: accByCode.get("445000")!, debit: purchaseTotal - Math.round(purchaseTotal / 1.18), label: "TVA récupérable" },
          { accountId: accByCode.get("401000")!, credit: purchaseTotal, label: "Fournisseur BioSenke" },
        ],
      },
    },
  });

  // ── Wallet Mariam (10 000 topup + 1 500 cashback + 2 500 bonus parrainage Bintou) ──
  const wallet = await db.wallet.create({ data: { userId: mariam.id, balance: 14000, referralCode: "MARIAM-KENE" } });
  await db.walletTransaction.createMany({
    data: [
      { walletId: wallet.id, type: "credit", amount: 10000, reason: "topup", refId: "TOP-INIT", createdAt: new Date(Date.now() - 30 * 864e5) },
      { walletId: wallet.id, type: "credit", amount: 1500, reason: "cashback", refId: "ORD-DEMO1", createdAt: new Date(Date.now() - 12 * 864e5) },
      { walletId: wallet.id, type: "credit", amount: 2500, reason: "referral", refId: `parrain:${bintou.id}`, createdAt: new Date(Date.now() - 4 * 864e5) },
    ],
  });

  // ── « Le Fil du Parrainage » : wallet de la filleule Bintou (cadeau de bienvenue 2 000) + sa 1ʳᵉ commande payée ──
  const bintouWallet = await db.wallet.create({ data: { userId: bintou.id, balance: 2000, referralCode: "BINTOU-KENE" } });
  await db.walletTransaction.create({
    data: { walletId: bintouWallet.id, type: "credit", amount: 2000, reason: "referral", refId: `gift:${bintou.id}`, createdAt: new Date(Date.now() - 5 * 864e5) },
  });
  const savonSeed = await db.product.findFirst({ where: { name: "Savon Noir Traditionnel" } });
  if (savonSeed) {
    const bintouOrder = await db.order.create({
      data: {
        userId: bintou.id, subtotal: 4500, cashback: 225, total: 4500, status: "paid",
        createdAt: new Date(Date.now() - 4 * 864e5),
        items: { create: [{ productId: savonSeed.id, label: savonSeed.name, qty: 1, unitPrice: 4500, total: 4500 }] },
      },
    });
    await db.payment.create({
      data: {
        userId: bintou.id, purpose: "shop_order", method: "wave", amount: 4500, status: "success",
        ref: "PAY-BINTOU", confirmedAt: new Date(Date.now() - 4 * 864e5), createdAt: new Date(Date.now() - 4 * 864e5),
        metaJson: JSON.stringify({ orderId: bintouOrder.id }),
      },
    });
  }

  // ── Diagnostics passés de Mariam ──
  const pastDiag = (zone: BodyZone, image: string, seed: number, daysAgo: number) => {
    const result = fallbackResult(zone, seed);
    return db.diagnosis.create({
      data: {
        userId: mariam.id,
        zone,
        imageData: `file:${image}`,
        resultJson: JSON.stringify(result),
        scoreGlobal: result.score_global,
        status: "done",
        createdAt: new Date(Date.now() - daysAgo * 864e5),
      },
    });
  };
  await pastDiag("visage", "/skin/demo-visage-1.webp", 42, 21);
  await pastDiag("mains", "/skin/demo-mains-1.webp", 17, 21);
  await pastDiag("visage", "/skin/demo-visage-2.webp", 91, 7);

  // ── Diagnostic récent d'Awa (relance contrôle protocole à S+3) ──
  const awaResult = fallbackResult("visage", 55);
  await db.diagnosis.create({
    data: {
      userId: awa.id,
      zone: "visage",
      imageData: "file:/skin/demo-visage-1.webp",
      resultJson: JSON.stringify(awaResult),
      scoreGlobal: awaResult.score_global,
      status: "done",
      createdAt: new Date(Date.now() - 5 * 864e5),
    },
  });

  // ── Avis ──
  await db.review.createMany({
    data: [
      { tenantId: t1.id, userId: mariam.id, rating: 5, comment: "Le protocol anti-taches PIH a vraiment changé ma peau en 3 séances. L'analyse IA était bluffante !", createdAt: new Date(Date.now() - 6 * 864e5) },
      { tenantId: t1.id, userId: awa.id, rating: 4, comment: "Très bon soin éclat, institut propre et accueillant. J'ai payé par Wave, ultra simple.", createdAt: new Date(Date.now() - 10 * 864e5) },
      { tenantId: t1.id, userId: mariam.id, rating: 5, comment: "La dermo-conseillère Chantal est une merveille. Suivi personnalisé via WhatsApp.", createdAt: new Date(Date.now() - 14 * 864e5) },
    ],
  });

  // ── Notifications simulées ──
  await db.notification.createMany({
    data: [
      { userId: mariam.id, tenantId: t1.id, channel: "sms", toPhone: mariam.phone, message: "Kènè : Bienvenue Mariam ! Votre profil peau est prêt. Faites votre 1er diagnostic IA 🧴", createdAt: new Date(Date.now() - 30 * 864e5) },
      { userId: mariam.id, tenantId: t1.id, channel: "whatsapp", toPhone: mariam.phone, message: "Kènè : Rappel — votre soin Éclat Mélanoderme est prévu aujourd'hui à 9h30 chez Éclat d'Abidjan.", createdAt: new Date(Date.now() - 864e5) },
      { userId: mariam.id, channel: "whatsapp", toPhone: mariam.phone, message: "Kènè : Bonjour Mariam, comment se porte ta peau après 3 jours de sérum Moringa ? Envoie-moi une photo !", createdAt: new Date(Date.now() - 12 * 36e5), status: "scheduled" },
      { userId: mariam.id, channel: "whatsapp", toPhone: mariam.phone, message: "Kènè : Bintou a passé sa première commande 🎉 Ton bonus parrainage de 2 500 FCFA est crédité sur ton wallet !", createdAt: new Date(Date.now() - 4 * 864e5) },
      { userId: bintou.id, channel: "sms", toPhone: bintou.phone, message: "Kènè : bienvenue Bintou ! Cadeau de bienvenue de 2 000 FCFA crédité sur ton wallet 💛", createdAt: new Date(Date.now() - 5 * 864e5) },
      { userId: bintou.id, channel: "sms", toPhone: bintou.phone, message: "Kènè : commande confirmée ✅ 4 500 FCFA payés — 225 FCFA de cashback crédités.", createdAt: new Date(Date.now() - 4 * 864e5) },
    ],
  });

  // ── Consentements & audit ──
  await db.consent.create({
    data: { userId: mariam.id, type: "health_data", granted: true, ip: "196.28.240.11", createdAt: new Date(Date.now() - 30 * 864e5) },
  });
  await db.auditLog.create({
    data: { tenantId: t1.id, action: "seed", entity: "platform", detailsJson: JSON.stringify({ sales: saleCounter - 1, employees: employeesT1.length }) },
  });

  const counts = {
    users: await db.user.count(),
    tenants: await db.tenant.count(),
    services: await db.service.count(),
    products: await db.product.count(),
    clients: await db.clientProfile.count(),
    appointments: await db.appointment.count(),
    sales: await db.sale.count(),
    employees: await db.employee.count(),
    payslips: await db.payslip.count(),
    journals: await db.journalEntry.count(),
    diagnoses: await db.diagnosis.count(),
  };
  console.log("✅ Seed terminé:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
