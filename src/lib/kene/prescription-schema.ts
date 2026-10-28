// Kènè — Schéma & Utilitaires pour l'Ordonnance Dermo-Esthétique Hybride (Produits + Soins Cabine)
// Format JSON structuré encapsulé dans cosmeticsUsed (avec repli texte brut compatible)

export interface PrescribedProductItem {
  id?: string;
  productId?: string;
  name: string;
  brandLine?: string;
  category?: string;
  price?: number;
  moment: "matin" | "soir" | "matin_soir" | "hebdo";
  posology: string; // Ex: "3 gouttes sur peau humide avant la crème"
  botanicals?: string;
  photoUrl?: string;
}

export interface PrescribedCabineServiceItem {
  id?: string;
  serviceId?: string;
  name: string;
  category?: string;
  price?: number;
  durationMin?: number;
  frequency: string; // Ex: "1 séance toutes les 2 semaines"
  sessionsCount?: number; // Ex: 3
  objective?: string; // Ex: "Désincrustation douce et élimination des comédons"
  photoUrl?: string;
}

export interface StructuredPrescription {
  version: 2;
  prescribedAt: string; // ISO string
  prescribedBy?: string; // Praticienne / Dermo-conseillère
  tenantId?: string;
  tenantName?: string;
  notes?: string; // Conseils généraux et vigilance
  products: PrescribedProductItem[];
  cabineServices: PrescribedCabineServiceItem[];
}

/** Préfixe de sérialisation pour stocker le JSON dans cosmeticsUsed */
const PRESCRIPTION_PREFIX = "KENE_PRESCRIPTION_V2:";

/** Décode cosmeticsUsed : renvoie l'objet structuré ou convertit le texte brut existant */
export function parseStructuredPrescription(raw: string | null | undefined, defaultTenantName?: string): StructuredPrescription {
  if (!raw || !raw.trim()) {
    return {
      version: 2,
      prescribedAt: new Date().toISOString(),
      tenantName: defaultTenantName,
      products: [],
      cabineServices: [],
    };
  }

  const trimmed = raw.trim();
  if (trimmed.startsWith(PRESCRIPTION_PREFIX)) {
    try {
      const jsonStr = trimmed.slice(PRESCRIPTION_PREFIX.length);
      const parsed = JSON.parse(jsonStr) as StructuredPrescription;
      return {
        version: 2,
        prescribedAt: parsed.prescribedAt || new Date().toISOString(),
        prescribedBy: parsed.prescribedBy || "",
        tenantId: parsed.tenantId,
        tenantName: parsed.tenantName || defaultTenantName,
        notes: parsed.notes || "",
        products: Array.isArray(parsed.products) ? parsed.products : [],
        cabineServices: Array.isArray(parsed.cabineServices) ? parsed.cabineServices : [],
      };
    } catch {
      // repli en cas de JSON corrompu
    }
  }

  // Si c'est du texte brut existant, on le convertit en note générale
  return {
    version: 2,
    prescribedAt: new Date().toISOString(),
    tenantName: defaultTenantName,
    notes: trimmed,
    products: [],
    cabineServices: [],
  };
}

/** Encode l'objet structuré en chaîne prête pour cosmeticsUsed */
export function serializeStructuredPrescription(prescription: StructuredPrescription): string {
  return `${PRESCRIPTION_PREFIX}${JSON.stringify(prescription)}`;
}

/** Génère un texte d'ordonnance lisible et soigné pour WhatsApp */
export function buildPrescriptionWhatsAppSummary(
  clientName: string,
  prescription: StructuredPrescription,
  tenantName?: string
): string {
  const tName = prescription.tenantName || tenantName || "Institut Partenaire Kènè";
  let text = `Bonjour ${clientName.split(" ")[0]} 🌸,\n\nVoici votre *Ordonnance Beauté & Soins Cabine* prescrite par *${tName}* :\n`;

  if (prescription.products.length > 0) {
    text += `\n🧴 *VOS PRODUITS COSMÉTIQUES À DOMICILE :*\n`;
    prescription.products.forEach((p, idx) => {
      const momentLabel =
        p.moment === "matin"
          ? "☀️ Matin"
          : p.moment === "soir"
          ? "🌙 Soir"
          : p.moment === "matin_soir"
          ? "☀️🌙 Matin & Soir"
          : "✨ Hebdomadaire";
      text += `${idx + 1}. *${p.name}* (${momentLabel})\n   👉 _${p.posology || "Appliquer selon recommandations"}_`;
      if (p.price) text += ` · ${p.price.toLocaleString("fr-FR")} FCFA`;
      text += `\n`;
    });
  }

  if (prescription.cabineServices.length > 0) {
    text += `\n💆‍♀️ *VOS SOINS ESTHÉTIQUES EN CABINE :*\n`;
    prescription.cabineServices.forEach((s, idx) => {
      text += `${idx + 1}. *${s.name}*`;
      if (s.durationMin) text += ` (${s.durationMin} min)`;
      text += `\n   👉 _Rythme : ${s.frequency || "1 séance / mois"}_`;
      if (s.sessionsCount && s.sessionsCount > 1) text += ` · Cure de ${s.sessionsCount} séances`;
      if (s.price) text += ` · ${s.price.toLocaleString("fr-FR")} FCFA`;
      text += `\n`;
    });
  }

  if (prescription.notes) {
    text += `\n📝 *Conseils de votre Dermo-Conseillère :*\n${prescription.notes}\n`;
  }

  text += `\n✨ Retrouvez votre ordonnance complète et réservez directement sur votre application Kènè.`;
  return text;
}
