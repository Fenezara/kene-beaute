// scripts/audit-duplicate-phones.js
// Audit approfondi des doublons et partages de numéros de téléphone
// à travers toute la base Kènè (Users, ClientProfiles, Diagnoses, Appointments)
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function phoneDigits(raw) {
  if (!raw) return "";
  return raw.replace(/\D/g, "");
}

function phoneTail(raw) {
  const d = phoneDigits(raw);
  if (d.length >= 10) return d.slice(-10);
  return d.length >= 8 ? d.slice(-8) : d;
}

async function audit() {
  console.log("==================================================");
  console.log(" AUDIT DE PARTAGE ET DOUBLONS DE NUMÉROS KÈNÈ");
  console.log("==================================================\n");

  // 1. Audit des comptes utilisateurs (User)
  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, role: true, createdAt: true },
  });

  const userPhoneMap = new Map();
  for (const u of users) {
    const key = phoneTail(u.phone);
    if (!key) continue;
    if (!userPhoneMap.has(key)) userPhoneMap.set(key, []);
    userPhoneMap.get(key).push(u);
  }

  const duplicateUsers = Array.from(userPhoneMap.entries()).filter(([_, list]) => list.length > 1);

  console.log(`--- 1. COMPTES UTILISATEURS (USER) ---`);
  console.log(`Total utilisateurs: ${users.length}`);
  if (duplicateUsers.length === 0) {
    console.log(" Aucun doublon de numéro dans la table User.");
  } else {
    console.log(`⚠️  ${duplicateUsers.length} numéro(s) partagé(s) entre plusieurs comptes User:`);
    for (const [key, list] of duplicateUsers) {
      console.log(`  📱 Numéro terminant par ${key}:`);
      for (const u of list) {
        console.log(`     - [${u.role}] ${u.name} (id: ${u.id}, phone: "${u.phone}", créé le: ${u.createdAt.toISOString().slice(0, 10)})`);
      }
    }
  }

  // 2. Audit des fiches CRM / dossiers cutanés (ClientProfile)
  const profiles = await prisma.clientProfile.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      userId: true,
      tenantId: true,
      skinType: true,
      fitzpatrick: true,
      tenant: { select: { name: true } },
    },
  });

  console.log(`\n--- 2. FICHES CRM & DOSSIERS CUTANÉS (CLIENT PROFILE) ---`);
  console.log(`Total fiches: ${profiles.length}`);

  // A) Doublons au sein du MÊME institut
  const sameTenantMap = new Map();
  for (const p of profiles) {
    const key = `${p.tenantId}___${phoneTail(p.phone)}`;
    if (!sameTenantMap.has(key)) sameTenantMap.set(key, []);
    sameTenantMap.get(key).push(p);
  }
  const duplicateProfilesInSameTenant = Array.from(sameTenantMap.entries()).filter(([_, list]) => list.length > 1);

  if (duplicateProfilesInSameTenant.length === 0) {
    console.log(" Aucun doublon de numéro au sein d'un même institut.");
  } else {
    console.log(`⚠️  ${duplicateProfilesInSameTenant.length} cas de doublons dans le même institut:`);
    for (const [key, list] of duplicateProfilesInSameTenant) {
      const [tenantId, tail] = key.split("___");
      console.log(`  🏢 Institut ${list[0]?.tenant?.name} (${tenantId}) - Numéro ${tail}:`);
      for (const p of list) {
        console.log(`     - ${p.name} (id: ${p.id}, userId: ${p.userId}, phone: "${p.phone}")`);
      }
    }
  }

  // B) Même numéro présent dans PLUSIEURS instituts différents (multi-salons légitime)
  const crossTenantMap = new Map();
  for (const p of profiles) {
    const key = phoneTail(p.phone);
    if (!crossTenantMap.has(key)) crossTenantMap.set(key, []);
    crossTenantMap.get(key).push(p);
  }
  const multiTenantProfiles = Array.from(crossTenantMap.entries()).filter(([_, list]) => {
    const distinctTenants = new Set(list.map((p) => p.tenantId));
    return distinctTenants.size > 1;
  });

  console.log(`\n  ℹ️  Clientes clientes de PLUSIEURS instituts différents: ${multiTenantProfiles.length}`);
  for (const [tail, list] of multiTenantProfiles) {
    console.log(`  📱 Numéro ${tail}:`);
    for (const p of list) {
      console.log(`     - Institut "${p.tenant?.name}" : Nom="${p.name}", userId=${p.userId}`);
    }
  }

  // 3. Bilans cutanés et diagnostics (Diagnosis & ProDiagnosis)
  const selfScans = await prisma.diagnosis.findMany({
    select: {
      id: true,
      userId: true,
      zone: true,
      scoreGlobal: true,
      createdAt: true,
      user: { select: { name: true, phone: true } },
    },
  });

  const proDiags = await prisma.proDiagnosis.findMany({
    select: {
      id: true,
      clientProfileId: true,
      zone: true,
      scoreGlobal: true,
      createdAt: true,
      clientProfile: {
        select: {
          name: true,
          phone: true,
          userId: true,
          tenant: { select: { name: true } },
        },
      },
    },
  });

  console.log(`\n--- 3. BILANS & AUTO-SCANS DE PEAU ---`);
  console.log(`Total self-scans (application cliente): ${selfScans.length}`);
  console.log(`Total diagnostics pro (réalisés en cabine): ${proDiags.length}`);

  // Vérifier si des diagnostics ont des numéros partagés avec des noms contradictoires
  const scanByPhone = new Map();
  for (const s of selfScans) {
    if (!s.user) continue;
    const key = phoneTail(s.user.phone);
    if (!scanByPhone.has(key)) scanByPhone.set(key, []);
    scanByPhone.get(key).push({ type: "self", ...s });
  }
  for (const p of proDiags) {
    if (!p.clientProfile) continue;
    const key = phoneTail(p.clientProfile.phone);
    if (!scanByPhone.has(key)) scanByPhone.set(key, []);
    scanByPhone.get(key).push({ type: "pro", ...p });
  }

  console.log(`Nombre de numéros de téléphone associés à au moins un bilan cutané: ${scanByPhone.size}`);

  // 4. Rendez-vous (Appointment)
  const appointments = await prisma.appointment.findMany({
    select: {
      id: true,
      clientName: true,
      clientPhone: true,
      userId: true,
      clientProfileId: true,
      status: true,
      startAt: true,
      tenant: { select: { name: true } },
    },
  });

  console.log(`\n--- 4. RENDEZ-VOUS (APPOINTMENTS) ---`);
  console.log(`Total rendez-vous: ${appointments.length}`);
  const apptByPhone = new Map();
  for (const a of appointments) {
    const key = phoneTail(a.clientPhone);
    if (!apptByPhone.has(key)) apptByPhone.set(key, []);
    apptByPhone.get(key).push(a);
  }

  const multiNameAppts = Array.from(apptByPhone.entries()).filter(([_, list]) => {
    const names = new Set(list.map((a) => a.clientName.trim().toLowerCase()));
    return names.size > 1;
  });

  if (multiNameAppts.length === 0) {
    console.log(" Cohérence parfaite des noms sur les rendez-vous par numéro.");
  } else {
    console.log(`⚠️  ${multiNameAppts.length} numéro(s) avec des variations de noms sur les RDV:`);
    for (const [key, list] of multiNameAppts) {
      console.log(`  📱 Numéro ${key}:`);
      for (const a of list) {
        console.log(`     - [${a.status}] "${a.clientName}" chez "${a.tenant?.name}" (userId: ${a.userId})`);
      }
    }
  }

  console.log("\n==================================================");
  console.log(" FIN DE L'AUDIT");
  console.log("==================================================");
}

audit()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
