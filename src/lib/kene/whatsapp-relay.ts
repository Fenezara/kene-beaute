// Kènè — Relais WhatsApp Business & Notifications Client en 1 clic
// Spécifique Afrique de l'Ouest (Côte d'Ivoire +225, Sénégal +221)
// Permet d'envoyer tickets dématérialisés, rappels de soin et suivis de livraison sans coût SMS.
import { useKene, isSavedUser } from "@/store/kene";
import { toast } from "sonner";

/** Nettoie et formate le numéro pour l'API WhatsApp (wa.me) */
export function formatWhatsAppPhone(phone: string, defaultCountry: "CI" | "SN" = "CI"): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");

  // Déjà indicatif international
  if (digits.startsWith("225") && digits.length >= 11) return digits;
  if (digits.startsWith("221") && digits.length >= 11) return digits;

  // Numéro local ivoirien (10 chiffres, ex: 07 08 09 10 11 ou 05...)
  if (defaultCountry === "CI") {
    if (digits.length === 10) return "225" + digits;
    if (digits.length === 8) return "22507" + digits; // fallback ancien format
    return "225" + digits;
  }

  // Numéro local sénégalais (9 chiffres, ex: 77 123 45 67)
  if (defaultCountry === "SN") {
    if (digits.length === 9) return "221" + digits;
    return "221" + digits;
  }

  return digits;
}

/** Construit l'URL wa.me complète prête pour ouverture (si aucun téléphone n'est fourni, ouvre le sélecteur de contact WhatsApp) */
export function createWhatsAppLink(phone: string, message: string, defaultCountry: "CI" | "SN" = "CI"): string {
  const formattedPhone = phone ? formatWhatsAppPhone(phone, defaultCountry) : "";
  const encodedText = encodeURIComponent(message.trim());
  return formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodedText}` : `https://wa.me/?text=${encodedText}`;
}

import { KENE_SUPPORT_PHONE } from "./config";
export { KENE_SUPPORT_PHONE };

/** Ouvre WhatsApp (application native ou WhatsApp Web) dans un nouvel onglet
 * SÉCURITÉ INVITÉE : Un invité non inscrit ne peut sous aucun prétexte exporter ou partager ses données.
 * L'application bloque immédiatement le partage et ouvre la modale d'inscription / connexion.
 */
export function openWhatsApp(phone: string, message: string, defaultCountry: "CI" | "SN" = "CI"): void {
  if (typeof window === "undefined") return;

  const user = useKene.getState?.()?.user;
  const isProOrAdmin = user?.role === "pro" || user?.role === "admin";

  // Si ce n'est pas un professionnel/admin et qu'il n'a pas de compte sauvegardé vérifié
  if (!isProOrAdmin && !isSavedUser(user)) {
    try {
      window.dispatchEvent(new CustomEvent("kene:open-link-account"));
      toast.error("Inscription requise pour partager", {
        description: "Veuillez créer ou enregistrer votre compte pour partager vos bilans, soins et ordonnances.",
      });
    } catch {
      // silence
    }
    return;
  }

  const url = createWhatsAppLink(phone, message, defaultCountry);
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Récupère en direct l'institut partenaire sélectionné / coché par la cliente dans le store */
export function getClientSelectedInstitute(): {
  id?: string;
  name?: string;
  phone?: string;
  ownerPhone?: string;
  city?: string;
  address?: string;
  country?: "CI" | "SN";
} | null {
  if (typeof window === "undefined") return null;
  try {
    const user = useKene.getState?.()?.user;
    if (user?.selectedTenant) {
      const tenant = user.selectedTenant;
      const phone = tenant.ownerPhone?.trim() || tenant.phone?.trim() || "";
      return {
        id: tenant.id,
        name: tenant.name,
        phone: phone || undefined,
        ownerPhone: tenant.ownerPhone || undefined,
        city: tenant.city,
        address: tenant.address || undefined,
        country: tenant.country === "SN" ? "SN" : "CI",
      };
    }
  } catch {
    // silence fallback
  }
  return null;
}

export interface WhatsAppProductOrderDetails {
  productName?: string;
  summary?: string;
  clientName?: string;
  tenantPhone?: string;
  instituteName?: string;
  country?: "CI" | "SN";
}

/** Ouvre WhatsApp directement pour commander des produits botaniques ou une routine recommandée auprès de l'entreprise choisie */
export function openWhatsAppProductOrderInquiry(details?: WhatsAppProductOrderDetails): void {
  const chosen = getClientSelectedInstitute();
  const phone = details?.tenantPhone?.trim() || chosen?.phone || KENE_SUPPORT_PHONE;
  const instName = details?.instituteName?.trim() || chosen?.name || "";
  const country = details?.country || chosen?.country || "CI";
  const clientName = details?.clientName?.trim() || (typeof window !== "undefined" ? useKene.getState?.()?.user?.name : "") || "";

  const greeting = instName
    ? `Bonjour ${instName} ! 🌿${clientName ? ` Je suis ${clientName}.` : ""}`
    : `Bonjour l'équipe Kènè ! 🌿${clientName ? ` Je suis ${clientName}.` : ""}`;

  const itemText = details?.productName ? `\n\nProduit / Rituel souhaité : *${details.productName}*` : "";
  const routineText = details?.summary ? `\n\nRoutine / soins recommandés :\n${details.summary}` : "";

  const destText = instName ? `dans votre établissement (*${instName}*)` : "Kènè";

  const msg = `${greeting}
Je souhaite commander les soins botaniques recommandés pour ma peau ${destText}.${itemText}${routineText}

Pouvez-vous m'indiquer la disponibilité, les tarifs et les modalités de retrait / livraison ? Merci beaucoup ! ✨`;

  openWhatsApp(phone, msg, country);
}

export interface WhatsAppAppointmentInquiryDetails {
  serviceName?: string;
  serviceCategory?: string; // consultation, contrôle, soin esthétique, coiffure, onglerie
  instituteName?: string;
  clientName?: string;
  datePref?: string;
  tenantPhone?: string;
  country?: "CI" | "SN";
  scoreGlobal?: number;
  notes?: string;
}

/** Ouvre WhatsApp directement pour prendre rendez-vous (consultation, contrôle, soin cabine, coiffure, onglerie) auprès de l'institut coché */
export function openWhatsAppAppointmentInquiry(details?: WhatsAppAppointmentInquiryDetails): void {
  const chosen = getClientSelectedInstitute();
  const phone = details?.tenantPhone?.trim() || chosen?.phone || KENE_SUPPORT_PHONE;
  const instName = details?.instituteName?.trim() || chosen?.name || "";
  const country = details?.country || chosen?.country || "CI";
  const clientName = details?.clientName?.trim() || (typeof window !== "undefined" ? useKene.getState?.()?.user?.name : "") || "";

  const greeting = instName
    ? `Bonjour ${instName} ! 💆‍♀️${clientName ? ` Je suis ${clientName}.` : ""}`
    : `Bonjour l'équipe Kènè ! 💆‍♀️${clientName ? ` Je suis ${clientName}.` : ""}`;

  const categoryText = details?.serviceCategory ? `\n• Type de prestation : *${details.serviceCategory}*` : "";
  const serviceText = details?.serviceName ? `\n• Soin souhaité : *${details.serviceName}*` : "";
  const scoreText = typeof details?.scoreGlobal === "number" ? `\n• Mon score cutané Kènè : *${details.scoreGlobal}/100*` : "";
  const dateText = details?.datePref ? `\n• Créneau / date souhaitée : *${details.datePref}*` : "";
  const notesText = details?.notes ? `\n• Précision : ${details.notes}` : "";

  const targetLabel = instName ? `chez *${instName}*` : "en institut partenaire Kènè";

  const msg = `${greeting}
Je souhaite prendre rendez-vous ${targetLabel} :${categoryText}${serviceText}${scoreText}${dateText}${notesText}

Quels sont vos créneaux disponibles cette semaine ? Merci de me confirmer ! 🌿`;

  openWhatsApp(phone, msg, country);
}

/** Contact direct libre sur WhatsApp avec l'entreprise choisie par la cliente */
export function openWhatsAppInstituteContact(details?: {
  tenantPhone?: string;
  instituteName?: string;
  clientName?: string;
  message?: string;
  country?: "CI" | "SN";
}): void {
  const chosen = getClientSelectedInstitute();
  const phone = details?.tenantPhone?.trim() || chosen?.phone || KENE_SUPPORT_PHONE;
  const instName = details?.instituteName?.trim() || chosen?.name || "votre institut";
  const country = details?.country || chosen?.country || "CI";
  const clientName = details?.clientName?.trim() || (typeof window !== "undefined" ? useKene.getState?.()?.user?.name : "") || "";

  const msg = details?.message
    ? details.message
    : `Bonjour ${instName} ! 🌸\n\nJe suis cliente sur l'application Kènè${clientName ? ` (${clientName})` : ""}. Je souhaite échanger avec vous concernant mes soins dermo-cosmétiques.\n\nÀ très bientôt ! ✨`;

  openWhatsApp(phone, msg, country);
}

/** Génère le message de recommandation et partage d'un institut sur WhatsApp */
export function buildWhatsAppInstituteShareMessage(inst: {
  name: string;
  city: string;
  address?: string | null;
  phone?: string | null;
  description?: string | null;
}): string {
  return `Coucou ! 🌸

Je te recommande vivement *${inst.name}*, mon institut partenaire sur l'application Kènè :
📍 ${inst.city}${inst.address ? ` (${inst.address})` : ""}
${inst.description ? `✨ ${inst.description}\n` : ""}${inst.phone ? `📞 Contact WhatsApp : ${inst.phone}\n` : ""}
Tu peux y faire tes soins cabine et bilans de peau personnalisés Kènè ! 🌿`;
}

// ─────────────── Modèles de messages ───────────────

export interface WhatsAppReceiptInput {
  tenantName: string;
  tenantPhone?: string;
  receiptNumber: string;
  clientName?: string;
  items: Array<{ label: string; qty: number; total: number }>;
  total: number;
  paymentMethod: string;
}

/** Génère le message de ticket de caisse dématérialisé pour la cliente */
export function buildWhatsAppReceiptMessage(input: WhatsAppReceiptInput): string {
  const greeting = input.clientName ? `Bonjour ${input.clientName} ! 🌸` : "Bonjour ! 🌸";
  const itemsText = input.items
    .map((it) => `• ${it.qty}× ${it.label} (${Math.round(it.total).toLocaleString("fr-FR")} FCFA)`)
    .join("\n");

  return `${greeting}

Voici votre reçu de caisse chez *${input.tenantName.toUpperCase()}* :

🧾 *Ticket N°* : ${input.receiptNumber}
${itemsText}

💰 *TOTAL PAYÉ* : *${Math.round(input.total).toLocaleString("fr-FR")} FCFA*
💳 *Règlement* : ${input.paymentMethod.toUpperCase()}

Merci infiniment pour votre confiance et à très bientôt pour votre prochain soin ! 🌿
— *${input.tenantName}* · Propulsé par Kènè`;
}

export interface WhatsAppAppointmentReminderInput {
  clientName: string;
  tenantName: string;
  serviceName: string;
  dateStr: string;
  timeStr: string;
  addressOrLandmark?: string;
  tenantPhone?: string;
}

/** Génère le message de rappel / confirmation de rendez-vous cabine */
export function buildWhatsAppAppointmentMessage(input: WhatsAppAppointmentReminderInput): string {
  return `Bonjour ${input.clientName} ! 💆‍♀️

Votre rendez-vous pour *${input.serviceName}* est confirmé chez *${input.tenantName}* :

📅 *Date* : ${input.dateStr}
⏰ *Heure* : ${input.timeStr}
📍 *Lieu* : ${input.addressOrLandmark || "En institut"}

En cas d'imprévu ou pour nous localiser, vous pouvez nous joindre au ${input.tenantPhone || "l'institut"}.
Prenez soin de vous et à très vite ! 🌿`;
}

export interface WhatsAppDeliveryInput {
  clientName: string;
  orderNumber: string;
  deliveryZone: string;
  deliveryAddress: string;
  carrierPhone?: string;
  total: number;
  isPaid: boolean;
}

/** Génère le message de suivi de livraison urbaine */
export function buildWhatsAppDeliveryMessage(input: WhatsAppDeliveryInput): string {
  const paymentNotice = input.isPaid
    ? "✅ *Commande déjà réglée en ligne.*"
    : `💵 *Montant à régler au livreur en espèces/Wave* : ${Math.round(input.total).toLocaleString("fr-FR")} FCFA.`;

  return `Bonjour ${input.clientName} ! 📦

Votre commande Kènè *#${input.orderNumber}* est en cours d'acheminement !

📍 *Zone de livraison* : ${input.deliveryZone} (${input.deliveryAddress})
${paymentNotice}
${input.carrierPhone ? `🛵 *Contact coursier* : ${input.carrierPhone}` : ""}

Notre coursier vous contactera à l'approche de votre repère. Merci de votre fidélité ! 🌿`;
}

export interface WhatsAppPassportInput {
  clientName?: string;
  passportUrl: string;
}

/** Génère le message de partage du Passeport de Peau pour institut ou praticien */
export function buildWhatsAppPassportMessage(input: WhatsAppPassportInput): string {
  const greeting = input.clientName ? `Bonjour ${input.clientName} ! 🌿` : "Bonjour ! 🌿";
  return `${greeting}

Voici mon *Passeport de Peau Kènè* numérique :
📲 ${input.passportUrl}

Scannez ce lien ou le QR code pour adapter le protocole de soin en cabine (phototype, allergies signalées, score cutané) en toute confidentialité et sans transfert de photo.

Prenez soin de vous ! 🌿
— Kènè, la beauté mélanoderme`;
}

export interface WhatsAppCartOrderInput {
  clientName?: string;
  items: Array<{ name: string; qty: number; price: number }>;
  subtotal: number;
  discount: number;
  promoCode?: string;
  shippingFee: number;
  city: "abidjan" | "dakar";
  areaName?: string;
  address?: string;
  notes?: string;
  phone?: string;
  total: number;
}

/** Génère le message de commande complète prête à envoyer sur WhatsApp au service client / salon */
export function buildWhatsAppCartOrderMessage(input: WhatsAppCartOrderInput): string {
  const greeting = input.clientName ? `Bonjour l'équipe Kènè ! Je suis ${input.clientName}. 🌿` : "Bonjour l'équipe Kènè ! 🌿";
  const itemsText = input.items
    .map((it) => `• ${it.qty}× *${it.name}* (${Math.round(it.price * it.qty).toLocaleString("fr-FR")} FCFA)`)
    .join("\n");
  const promoText = input.discount > 0 ? `\n🏷️ *Remise code ${input.promoCode || ""}* : -${Math.round(input.discount).toLocaleString("fr-FR")} FCFA` : "";
  const cityLabel = input.city === "abidjan" ? "Abidjan 🇨🇮" : "Dakar 🇸🇳";

  return `${greeting}

Je souhaite passer commande directement via WhatsApp :

🛍️ *PANIER DE SOINS :*
${itemsText}
${promoText}
🚚 *Livraison* : ${cityLabel} (${input.areaName || "Commune standard"}) — ${Math.round(input.shippingFee).toLocaleString("fr-FR")} FCFA
💰 *TOTAL À RÉGLER* : *${Math.round(input.total).toLocaleString("fr-FR")} FCFA*

📍 *Adresse de livraison* : ${input.address || "À préciser avec le coursier"}
${input.notes ? `🧭 *Repères* : ${input.notes}\n` : ""}📞 *Numéro de contact* : ${input.phone || "Mon numéro WhatsApp"}

Merci de me confirmer la prise en charge et les modalités de livraison ! 🌿`;
}

export interface WhatsAppDiagnosisShareInput {
  clientName?: string;
  zoneLabel: string;
  score: number;
  fitzpatrick?: string;
  botanicals: string[];
  referralCode?: string;
  appUrl?: string;
}

/** Génère le message viral de recommandation et partage de diagnostic pour WhatsApp (amis ou statut) */
export function buildWhatsAppDiagnosisShareMessage(input: WhatsAppDiagnosisShareInput): string {
  const botanicalsText = input.botanicals.length > 0 ? input.botanicals.join(", ") : "Karité, Balanites, Moringa";
  const refCode = input.referralCode ? input.referralCode : "KENE2026";
  const url = input.appUrl || "https://kene.app";

  return `Coucou ! 🌸

Je viens de faire mon analyse de peau sur *Kènè*, l'application de dermo-beauté africaine :

📊 *Mon Score Santé Cutanée* : *${input.score}/100* (${input.zoneLabel})
${input.fitzpatrick ? `🏾 *Phototype estimé* : Fitzpatrick ${input.fitzpatrick}\n` : ""}🌱 *Mes actifs botaniques recommandés* : ${botanicalsText}

🎁 *Cadeau pour toi* :
Fais ton diagnostic gratuit et profite d'un cadeau de bienvenue de *1 000 FCFA* sur ton premier soin avec mon code parrain : *${refCode}* !

👉 Découvre ta routine ici : ${url}?ref=${refCode}

Prends soin de ta peau mélanoderme ! 🌿`;
}


