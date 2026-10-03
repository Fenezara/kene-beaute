// Kènè — Relais WhatsApp Business & Notifications Client en 1 clic
// Spécifique Afrique de l'Ouest (Côte d'Ivoire +225, Sénégal +221)
// Permet d'envoyer tickets dématérialisés, rappels de soin et suivis de livraison sans coût SMS.

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

/** Ouvre WhatsApp (application native ou WhatsApp Web) dans un nouvel onglet */
export function openWhatsApp(phone: string, message: string, defaultCountry: "CI" | "SN" = "CI"): void {
  if (typeof window === "undefined") return;
  const url = createWhatsAppLink(phone, message, defaultCountry);
  window.open(url, "_blank", "noopener,noreferrer");
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
Prenez soin de vous et à très vite ! ✨`;
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

Prenez soin de vous ! ✨
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

Merci de me confirmer la prise en charge et les modalités de livraison ! ✨`;
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

Prends soin de ta peau mélanoderme ! ✨`;
}


