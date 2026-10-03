// Kènè — Logistique du Dernier Kilomètre en Afrique de l'Ouest
// Grille tarifaire dynamique par commune (Abidjan & Dakar) et générateur de mission coursier WhatsApp

export interface DeliveryCommune {
  id: string;
  name: string;
  city: "Abidjan" | "Dakar";
  fee: number; // en FCFA
  delayHours: string;
  zone: "centre" | "peripherie" | "banlieue";
}

export const ABIDJAN_COMMUNES: DeliveryCommune[] = [
  { id: "ci-plateau", name: "Plateau (Centre des Affaires)", city: "Abidjan", fee: 1000, delayHours: "1-2h", zone: "centre" },
  { id: "ci-cocody-ii-plateaux", name: "Cocody — Deux-Plateaux / Vallons", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-cocody-angre", name: "Cocody — Angré / 7ème & 8ème Tranche", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-cocody-riviera", name: "Cocody — Riviera (3, Golf, Palmeraie, Bonoumin)", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-marcory", name: "Marcory (Zone 4, Biétry, Résidentiel)", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-treichville", name: "Treichville", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-koumassi", name: "Koumassi", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-adjame", name: "Adjamé / Attécoubé", city: "Abidjan", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "ci-port-bouet", name: "Port-Bouët (Aéroport, Vridi)", city: "Abidjan", fee: 2000, delayHours: "3-4h", zone: "peripherie" },
  { id: "ci-yopougon", name: "Yopougon (Siporex, Maroc, Niangon, Toits Rouges)", city: "Abidjan", fee: 2500, delayHours: "3-4h", zone: "peripherie" },
  { id: "ci-abobo", name: "Abobo", city: "Abidjan", fee: 2500, delayHours: "3-4h", zone: "peripherie" },
  { id: "ci-bingerville", name: "Bingerville", city: "Abidjan", fee: 2500, delayHours: "3-5h", zone: "peripherie" },
  { id: "ci-bassam", name: "Grand-Bassam / Modeste", city: "Abidjan", fee: 3500, delayHours: "4-6h", zone: "banlieue" },
  { id: "ci-songon", name: "Songon", city: "Abidjan", fee: 3500, delayHours: "4-6h", zone: "banlieue" },
];

export const DAKAR_COMMUNES: DeliveryCommune[] = [
  { id: "sn-plateau", name: "Dakar Plateau / Gorée", city: "Dakar", fee: 1500, delayHours: "1-2h", zone: "centre" },
  { id: "sn-almadies", name: "Almadies / Ngor / Ouakam", city: "Dakar", fee: 2000, delayHours: "2-3h", zone: "centre" },
  { id: "sn-mermoz", name: "Mermoz / Sacré-Cœur", city: "Dakar", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "sn-point-e", name: "Point E / Fann Résidence", city: "Dakar", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "sn-medina", name: "Médina / Gueule Tapée / Fass", city: "Dakar", fee: 1500, delayHours: "2-3h", zone: "centre" },
  { id: "sn-yoff", name: "Yoff / Ouest-Foire / Nord-Foire", city: "Dakar", fee: 2000, delayHours: "2-3h", zone: "centre" },
  { id: "sn-grand-yoff", name: "Grand Yoff / Patte d'Oie / HLM", city: "Dakar", fee: 2000, delayHours: "2-3h", zone: "peripherie" },
  { id: "sn-parcelles", name: "Parcelles Assainies", city: "Dakar", fee: 2500, delayHours: "3-4h", zone: "peripherie" },
  { id: "sn-guediawaye", name: "Guédiawaye / Pikine", city: "Dakar", fee: 3000, delayHours: "3-5h", zone: "banlieue" },
  { id: "sn-rufisque", name: "Rufisque / Diamniadio", city: "Dakar", fee: 4500, delayHours: "4-6h", zone: "banlieue" },
];

export const ALL_DELIVERY_COMMUNES: DeliveryCommune[] = [
  ...ABIDJAN_COMMUNES,
  ...DAKAR_COMMUNES,
];

/**
 * Trouve une commune par son ID ou nom partiel
 */
export function findCommune(idOrName: string): DeliveryCommune | undefined {
  const q = idOrName.toLowerCase().trim();
  return ALL_DELIVERY_COMMUNES.find((c) => c.id === q || c.name.toLowerCase().includes(q));
}

/**
 * Retourne le tarif de livraison pour une commune donnée (ou tarif standard 1 500 FCFA si inconnu)
 */
export function getDeliveryFeeForCommune(communeId: string): number {
  const comm = findCommune(communeId);
  return comm ? comm.fee : 1500;
}

export interface CourierMissionPayload {
  orderRef: string;
  clientName: string;
  clientPhone: string;
  communeName: string;
  deliveryAddress: string;
  items: Array<{ name: string; qty: number }>;
  totalAmount: number;
  deliveryFee: number;
  paymentMethod: string;
  isPaid: boolean;
  instituteName: string;
  institutePhone?: string;
  notes?: string;
}

/**
 * Génère le message WhatsApp type prêt à être envoyé au livreur Yango Deli / Coursier moto
 */
export function buildCourierMissionMessage(m: CourierMissionPayload): string {
  const itemsText = m.items.map((i) => `  • ${i.qty}× ${i.name}`).join("\n");
  const encaissement = m.isPaid
    ? "✅ DÉJÀ RÉGLÉ EN LIGNE (Ne rien encaisser au client)"
    : `⚠️ À ENCAISSER EN CASH : ${m.totalAmount.toLocaleString("fr-FR")} FCFA`;

  return `🛵 *ORDRE DE MISSION LIVRAISON — ${m.instituteName.toUpperCase()}*

📦 *Commande :* #${m.orderRef.slice(-6).toUpperCase()}
👤 *Cliente :* ${m.clientName}
📞 *Téléphone Cliente :* ${m.clientPhone}

📍 *COMMUNE & ADRESSE DE DESTINATION :*
*Commune :* ${m.communeName}
*Repères / Adresse :* ${m.deliveryAddress}

🛍️ *Colis Cosmétiques à remettre :*
${itemsText}

💰 *CONDITIONS DE PAIEMENT :*
${encaissement}
(Frais de livraison inclus : ${m.deliveryFee.toLocaleString("fr-FR")} FCFA)

${m.notes ? `📝 *Remarques urgentes :* ${m.notes}\n` : ""}
Merci de prévenir la cliente par appel ou WhatsApp avant de démarrer la course !
Institut : ${m.instituteName}${m.institutePhone ? ` (${m.institutePhone})` : ""}`;
}
