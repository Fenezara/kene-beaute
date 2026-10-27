// scripts/heal-identities.js — Script de réparation et synchronisation intégrale de la base de production.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function canonicalPhone(raw) {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, "").trim();
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return cleaned;
  const withoutLeadingZeroes = digits.startsWith("00225") ? digits.slice(2) : digits;
  if (withoutLeadingZeroes.startsWith("225") && withoutLeadingZeroes.length >= 11) {
    return `+${withoutLeadingZeroes}`;
  }
  if (withoutLeadingZeroes.length === 10 && withoutLeadingZeroes.startsWith("0")) {
    return `+225${withoutLeadingZeroes}`;
  }
  if (withoutLeadingZeroes.length === 8) {
    return `+22507${withoutLeadingZeroes}`;
  }
  if (cleaned.startsWith("+")) {
    return `+${withoutLeadingZeroes}`;
  }
  if (withoutLeadingZeroes.length === 10) {
    return `+225${withoutLeadingZeroes}`;
  }
  return `+${withoutLeadingZeroes}`;
}

function phoneMatchKey(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits.length >= 8 ? digits.slice(-8) : digits;
}

function arePhonesMatching(a, b) {
  if (!a || !b) return false;
  const ka = phoneMatchKey(a);
  const kb = phoneMatchKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 8 && kb.length >= 8 && ka.slice(-8) === kb.slice(-8)) return true;
  return false;
}

function isGenericName(name) {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return (
    n === "" ||
    n === "nouvelle cliente" ||
    n === "nouvelle invitée" ||
    n.startsWith("membre ") ||
    n.includes("??") ||
    n === "guest" ||
    n === "ma peau" ||
    n === "collaboratrice" ||
    n === "estheticienne"
  );
}

async function heal() {
  console.log("=== 1. CANONICALISATION DES NUMÉROS UTILISATEURS ===");
  const users = await prisma.user.findMany();
  for (const u of users) {
    const canon = canonicalPhone(u.phone);
    let cleanName = u.name;
    if (cleanName && cleanName.includes("??")) {
      cleanName = cleanName.replace(/\?\?/g, "è");
    }
    if (canon !== u.phone || cleanName !== u.name) {
      await prisma.user.update({
        where: { id: u.id },
        data: { phone: canon, name: cleanName },
      });
      console.log(`User ${u.id}: ${u.name} -> ${cleanName} (${u.phone} -> ${canon})`);
    }
  }

  console.log("\n=== 2. CANONICALISATION DES NUMÉROS CLIENT PROFILES ===");
  const profiles = await prisma.clientProfile.findMany();
  for (const p of profiles) {
    const canon = canonicalPhone(p.phone);
    let cleanName = p.name;
    if (cleanName && cleanName.includes("??")) {
      cleanName = cleanName.replace(/\?\?/g, "è");
    }
    if (canon !== p.phone || cleanName !== p.name) {
      await prisma.clientProfile.update({
        where: { id: p.id },
        data: { phone: canon, name: cleanName },
      });
      console.log(`Profile ${p.id}: ${p.name} -> ${cleanName} (${p.phone} -> ${canon})`);
    }
  }

  console.log("\n=== 3. RAPPROCHEMENT BIDIRECTIONNEL USER <-> CLIENT_PROFILE ===");
  const refreshedUsers = await prisma.user.findMany();
  const refreshedProfiles = await prisma.clientProfile.findMany();

  for (const p of refreshedProfiles) {
    let matchedUser = p.userId ? refreshedUsers.find((u) => u.id === p.userId) : null;
    if (!matchedUser) {
      matchedUser = refreshedUsers.find((u) => arePhonesMatching(u.phone, p.phone));
    }

    if (matchedUser) {
      const genericProf = isGenericName(p.name);
      const genericUser = isGenericName(matchedUser.name);

      let targetName = p.name;
      if (!genericUser) {
        targetName = matchedUser.name;
      } else if (!genericProf) {
        targetName = p.name;
        // Mettre à jour le compte utilisateur aussi
        await prisma.user.update({
          where: { id: matchedUser.id },
          data: { name: p.name },
        });
        console.log(`Updated User ${matchedUser.id} name from profile: ${p.name}`);
      }

      await prisma.clientProfile.update({
        where: { id: p.id },
        data: {
          userId: matchedUser.id,
          name: targetName,
          phone: matchedUser.phone || p.phone,
          skinType: p.skinType || matchedUser.skinType || undefined,
          fitzpatrick: p.fitzpatrick || matchedUser.fitzpatrick || undefined,
          district: p.district || matchedUser.district || undefined,
          birthDate: p.birthDate || matchedUser.birthDate || undefined,
          pregnant: p.pregnant ?? matchedUser.pregnant ?? undefined,
          preferredChannel: p.preferredChannel || matchedUser.preferredChannel || undefined,
          beautyBudget: p.beautyBudget || matchedUser.beautyBudget || undefined,
        },
      });
      console.log(`Linked Profile ${p.id} (${targetName}) to User ${matchedUser.id}`);
    }
  }

  console.log("\n=== 4. FUSION DES PROFILS DOUBLONS PAR ÉTABLISSEMENT ===");
  const tenants = await prisma.tenant.findMany({ select: { id: true, name: true } });
  for (const t of tenants) {
    const tenantProfiles = await prisma.clientProfile.findMany({
      where: { tenantId: t.id },
      include: { _count: { select: { appointments: true, sales: true } } },
    });

    const groups = new Map();
    for (const p of tenantProfiles) {
      const key = p.userId ? `user_${p.userId}` : `phone_${phoneMatchKey(p.phone)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }

    for (const [key, list] of groups.entries()) {
      if (list.length > 1) {
        console.log(`Merging ${list.length} duplicates in ${t.name} for ${key}`);
        // Trier pour choisir le meilleur profil principal :
        // 1. Qui a le plus d'activité (ventes + RDV)
        // 2. Qui n'a pas un nom générique
        // 3. Le plus ancien
        list.sort((a, b) => {
          const scoreA = (a._count.sales + a._count.appointments) * 10 + (!isGenericName(a.name) ? 5 : 0);
          const scoreB = (b._count.sales + b._count.appointments) * 10 + (!isGenericName(b.name) ? 5 : 0);
          return scoreB - scoreA;
        });

        const primary = list[0];
        console.log(`Selected primary: ${primary.id} (${primary.name}, ${primary.phone})`);

        for (let i = 1; i < list.length; i++) {
          const dup = list[i];
          console.log(`  Reassigning from ${dup.id} (${dup.name}) to ${primary.id}`);
          await prisma.appointment.updateMany({
            where: { clientProfileId: dup.id },
            data: { clientProfileId: primary.id },
          });
          await prisma.sale.updateMany({
            where: { clientProfileId: dup.id },
            data: { clientProfileId: primary.id },
          });
          await prisma.proDiagnosis.updateMany({
            where: { clientProfileId: dup.id },
            data: { clientProfileId: primary.id },
          });
          await prisma.clientProfile.delete({
            where: { id: dup.id },
          });
          console.log(`  Deleted duplicate ${dup.id}`);
        }
      }
    }
  }

  console.log("\n=== 5. SYNCHRONISATION DES RENDEZ-VOUS ===");
  const appointments = await prisma.appointment.findMany();
  for (const a of appointments) {
    const canonPhone = canonicalPhone(a.clientPhone);
    let matchedUser = a.userId ? refreshedUsers.find((u) => u.id === a.userId) : null;
    if (!matchedUser && a.clientPhone) {
      matchedUser = refreshedUsers.find((u) => arePhonesMatching(u.phone, a.clientPhone));
    }

    const effectiveName = matchedUser && !isGenericName(matchedUser.name) ? matchedUser.name : a.clientName;
    const effectivePhone = matchedUser?.phone || canonPhone || a.clientPhone;
    const effectiveUserId = matchedUser?.id || a.userId;

    let targetProfileId = a.clientProfileId;
    if (!targetProfileId && effectiveUserId) {
      const prof = await prisma.clientProfile.findFirst({
        where: { tenantId: a.tenantId, userId: effectiveUserId },
        select: { id: true },
      });
      if (prof) targetProfileId = prof.id;
    }

    if (
      a.clientName !== effectiveName ||
      a.clientPhone !== effectivePhone ||
      a.userId !== effectiveUserId ||
      a.clientProfileId !== targetProfileId
    ) {
      await prisma.appointment.update({
        where: { id: a.id },
        data: {
          clientName: effectiveName,
          clientPhone: effectivePhone,
          userId: effectiveUserId,
          clientProfileId: targetProfileId,
        },
      });
      console.log(`Updated Appointment ${a.id}: clientName="${effectiveName}", clientPhone="${effectivePhone}", userId=${effectiveUserId}`);
    }
  }

  console.log("\n=== HEALING TERMINÉ AVEC SUCCÈS ===");
}

heal()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
