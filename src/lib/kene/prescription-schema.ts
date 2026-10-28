// Kènè — Schéma & Utilitaires pour l'Ordonnance Dermo-Esthétique Hybride (Produits + Soins Cabine)
// Format JSON structuré encapsulé dans cosmeticsUsed avec versioning & historique des cures (v3)

export type ProductTransitionStatus = "keep" | "replace" | "stop" | "new";

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
  // Transition lors du renouvellement d'ordonnance
  transitionStatus?: ProductTransitionStatus;
  transitionNote?: string; // Ex: "Remplacement du Sérum Purifiant car comédons résorbés"
  replacedProductName?: string; // Nom de l'ancien produit remplacé
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

export interface PrescriptionVersion {
  id: string; // Ex: "cure_1730154000000"
  cureNumber: number; // 1, 2, 3...
  title?: string; // Ex: "Cure Régulation & Éclat #1"
  status: "active" | "archived";
  prescribedAt: string; // ISO string
  archivedAt?: string; // ISO string
  prescribedBy?: string; // Praticienne / Dermo-conseillère
  tenantId?: string;
  tenantName?: string;
  changeReason?: string; // Motif de l'évolution
  evolutionDelta?: {
    previousScore?: number;
    newScore?: number;
    notes?: string;
  };
  notes?: string;
  products: PrescribedProductItem[];
  cabineServices: PrescribedCabineServiceItem[];
}

export interface StructuredPrescription {
  version: 2 | 3;
  cureNumber?: number; // Numéro de cure (1 par défaut)
  status?: "active" | "archived";
  prescribedAt: string; // ISO string
  prescribedBy?: string; // Praticienne / Dermo-conseillère
  tenantId?: string;
  tenantName?: string;
  changeReason?: string; // Motif de transition de cure
  evolutionDelta?: {
    previousScore?: number;
    newScore?: number;
    notes?: string;
  };
  notes?: string; // Conseils généraux et vigilance
  products: PrescribedProductItem[];
  cabineServices: PrescribedCabineServiceItem[];
  // Historique immuable des anciennes ordonnances / cures
  history?: PrescriptionVersion[];
}

/** Préfixe de sérialisation pour stocker le JSON dans cosmeticsUsed */
const PRESCRIPTION_PREFIX_V3 = "KENE_PRESCRIPTION_V3:";
const PRESCRIPTION_PREFIX_V2 = "KENE_PRESCRIPTION_V2:";

/** Décode cosmeticsUsed : renvoie l'objet structuré ou convertit le texte brut existant */
export function parseStructuredPrescription(raw: string | null | undefined, defaultTenantName?: string): StructuredPrescription {
  if (!raw || !raw.trim()) {
    return {
      version: 3,
      cureNumber: 1,
      status: "active",
      prescribedAt: new Date().toISOString(),
      tenantName: defaultTenantName,
      products: [],
      cabineServices: [],
      history: [],
    };
  }

  const trimmed = raw.trim();
  const isV3 = trimmed.startsWith(PRESCRIPTION_PREFIX_V3);
  const isV2 = trimmed.startsWith(PRESCRIPTION_PREFIX_V2);

  if (isV3 || isV2) {
    try {
      const jsonStr = trimmed.slice(isV3 ? PRESCRIPTION_PREFIX_V3.length : PRESCRIPTION_PREFIX_V2.length);
      const parsed = JSON.parse(jsonStr) as StructuredPrescription;
      return {
        version: 3,
        cureNumber: parsed.cureNumber || 1,
        status: parsed.status || "active",
        prescribedAt: parsed.prescribedAt || new Date().toISOString(),
        prescribedBy: parsed.prescribedBy || "",
        tenantId: parsed.tenantId,
        tenantName: parsed.tenantName || defaultTenantName,
        changeReason: parsed.changeReason || "",
        evolutionDelta: parsed.evolutionDelta,
        notes: parsed.notes || "",
        products: Array.isArray(parsed.products) ? parsed.products : [],
        cabineServices: Array.isArray(parsed.cabineServices) ? parsed.cabineServices : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch {
      // repli en cas de JSON corrompu
    }
  }

  // Si c'est du texte brut existant, on le convertit en note générale
  return {
    version: 3,
    cureNumber: 1,
    status: "active",
    prescribedAt: new Date().toISOString(),
    tenantName: defaultTenantName,
    notes: trimmed,
    products: [],
    cabineServices: [],
    history: [],
  };
}

/** Encode l'objet structuré en chaîne prête pour cosmeticsUsed */
export function serializeStructuredPrescription(prescription: StructuredPrescription): string {
  const payload: StructuredPrescription = {
    ...prescription,
    version: 3,
    cureNumber: prescription.cureNumber || 1,
    status: prescription.status || "active",
  };
  return `${PRESCRIPTION_PREFIX_V3}${JSON.stringify(payload)}`;
}

/**
 * Prépare une nouvelle cure en archivant proprement l'ordonnance active dans l'historique
 */
export function createNewCureTransition(
  current: StructuredPrescription,
  params: {
    changeReason: string;
    previousScore?: number;
    newScore?: number;
    prescribedBy?: string;
    tenantId?: string;
    tenantName?: string;
    notes?: string;
    products: PrescribedProductItem[];
    cabineServices: PrescribedCabineServiceItem[];
  }
): StructuredPrescription {
  const currentCureNumber = current.cureNumber || 1;
  const nowIso = new Date().toISOString();

  // On archive la version courante dans l'historique
  const archivedVersion: PrescriptionVersion = {
    id: `cure_${Date.now()}_${currentCureNumber}`,
    cureNumber: currentCureNumber,
    title: `Cure #${currentCureNumber}`,
    status: "archived",
    prescribedAt: current.prescribedAt || nowIso,
    archivedAt: nowIso,
    prescribedBy: current.prescribedBy,
    tenantId: current.tenantId,
    tenantName: current.tenantName,
    changeReason: current.changeReason,
    evolutionDelta: current.evolutionDelta,
    notes: current.notes,
    products: current.products,
    cabineServices: current.cabineServices,
  };

  const existingHistory = Array.isArray(current.history) ? current.history : [];
  const updatedHistory = [archivedVersion, ...existingHistory];

  return {
    version: 3,
    cureNumber: currentCureNumber + 1,
    status: "active",
    prescribedAt: nowIso,
    prescribedBy: params.prescribedBy || current.prescribedBy,
    tenantId: params.tenantId || current.tenantId,
    tenantName: params.tenantName || current.tenantName,
    changeReason: params.changeReason,
    evolutionDelta:
      params.previousScore !== undefined || params.newScore !== undefined
        ? { previousScore: params.previousScore, newScore: params.newScore }
        : current.evolutionDelta,
    notes: params.notes ?? current.notes,
    products: params.products,
    cabineServices: params.cabineServices,
    history: updatedHistory,
  };
}

/** Génère un texte d'ordonnance lisible et soigné pour WhatsApp */
export function buildPrescriptionWhatsAppSummary(
  clientName: string,
  prescription: StructuredPrescription,
  tenantName?: string
): string {
  const tName = prescription.tenantName || tenantName || "Institut Partenaire Kènè";
  const cureLabel = prescription.cureNumber ? ` (Cure #${prescription.cureNumber})` : "";
  let text = `Bonjour ${clientName.split(" ")[0]} 🌸,\n\nVoici votre *Nouvelle Ordonnance Beauté & Soins Cabine${cureLabel}* prescrite par *${tName}* :\n`;

  if (prescription.changeReason) {
    text += `\n🎯 *Évolution du protocole :* _${prescription.changeReason}_\n`;
  }
  if (prescription.evolutionDelta && prescription.evolutionDelta.previousScore && prescription.evolutionDelta.newScore) {
    const diff = prescription.evolutionDelta.newScore - prescription.evolutionDelta.previousScore;
    const sign = diff > 0 ? "+" : "";
    text += `📈 *Score vitalité peau :* ${prescription.evolutionDelta.previousScore} ➔ *${prescription.evolutionDelta.newScore}/100* (${sign}${diff} pts)\n`;
  }

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

      let statusMarker = "";
      if (p.transitionStatus === "keep") statusMarker = " [🟢 Soin conservé]";
      else if (p.transitionStatus === "replace") statusMarker = ` [🔄 Remplace ${p.replacedProductName || "l'ancien soin"}]`;
      else if (p.transitionStatus === "new") statusMarker = " [✨ Nouveau]";

      text += `${idx + 1}. *${p.name}* (${momentLabel})${statusMarker}\n   👉 _${p.posology || "Appliquer selon recommandations"}_`;
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
