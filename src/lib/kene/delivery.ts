// Kènè — Module de Logistique & Livraison Urbaine (Abidjan & Dakar)
// Gère la sélection des communes, le calcul des frais de livraison, les repères locaux et le suivi des colis.

export interface DeliveryArea {
  id: string;
  name: string;
  city: "abidjan" | "dakar";
  zone: "centre" | "intermediaire" | "peripherie";
  fee: number; // en FCFA
  delayHours: string; // délai estimé
}

export const DELIVERY_AREAS: DeliveryArea[] = [
  // ── Abidjan (Côte d'Ivoire) ──
  { id: "ci-cocody", name: "Cocody (Angré, Deux Plateaux, Danga, Riviera)", city: "abidjan", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "ci-plateau", name: "Plateau (Centre des affaires)", city: "abidjan", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "ci-marcory", name: "Marcory (Zone 4, Biétry, Résidentiel)", city: "abidjan", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "ci-treichville", name: "Treichville & Port", city: "abidjan", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "ci-adjame", name: "Adjamé & 220 Logements", city: "abidjan", zone: "centre", fee: 1500, delayHours: "3 à 5h" },
  { id: "ci-koumassi", name: "Koumassi (Remblais, Prodomo)", city: "abidjan", zone: "intermediaire", fee: 2000, delayHours: "3 à 5h" },
  { id: "ci-yopougon", name: "Yopougon (Siporex, Maroc, Niangon, Toit Rouge)", city: "abidjan", zone: "intermediaire", fee: 2000, delayHours: "4 à 6h" },
  { id: "ci-abobo", name: "Abobo (Gare, Samaké, PK18)", city: "abidjan", zone: "intermediaire", fee: 2000, delayHours: "4 à 6h" },
  { id: "ci-portbouet", name: "Port-Bouët & Vridi (Aéroport)", city: "abidjan", zone: "intermediaire", fee: 2000, delayHours: "3 à 5h" },
  { id: "ci-bingerville", name: "Bingerville (Feh Kessé, Akouédo)", city: "abidjan", zone: "peripherie", fee: 2500, delayHours: "4 à 6h" },
  { id: "ci-songon", name: "Songon & périphérie Ouest", city: "abidjan", zone: "peripherie", fee: 3000, delayHours: "Sous 24h" },

  // ── Dakar (Sénégal) ──
  { id: "sn-plateau", name: "Dakar-Plateau & Centre-Ville", city: "dakar", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "sn-almadies", name: "Les Almadies & Pointe des Almadies", city: "dakar", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "sn-ngor", name: "Ngor & Virage", city: "dakar", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "sn-ouakam", name: "Ouakam (Monument de la Renaissance, Mamelles)", city: "dakar", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "sn-mermoz", name: "Mermoz & Sacré-Cœur", city: "dakar", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "sn-fann", name: "Fann Résidence, Point E & Université", city: "dakar", zone: "centre", fee: 1500, delayHours: "2 à 4h" },
  { id: "sn-medina", name: "Médina, Gueule Tapée & Fass", city: "dakar", zone: "centre", fee: 1500, delayHours: "3 à 5h" },
  { id: "sn-yoff", name: "Yoff (Tonghor, Nord Foire, Ouest Foire)", city: "dakar", zone: "centre", fee: 1500, delayHours: "3 à 5h" },
  { id: "sn-liberte", name: "Sicap Liberté (1 à 6) & Dieuppeul", city: "dakar", zone: "intermediaire", fee: 2000, delayHours: "3 à 5h" },
  { id: "sn-maristes", name: "Hann Maristes & Patte d'Oie", city: "dakar", zone: "intermediaire", fee: 2000, delayHours: "3 à 5h" },
  { id: "sn-guediawaye", name: "Guédiawaye & Golf Sud", city: "dakar", zone: "peripherie", fee: 2500, delayHours: "4 à 6h" },
  { id: "sn-pikine", name: "Pikine (Icotaf, Bountou Pikine)", city: "dakar", zone: "peripherie", fee: 2500, delayHours: "4 à 6h" },
  { id: "sn-keurmassar", name: "Keur Massar & Malika", city: "dakar", zone: "peripherie", fee: 2500, delayHours: "4 à 6h" },
  { id: "sn-rufisque", name: "Rufisque, Bargny & Diamniadio", city: "dakar", zone: "peripherie", fee: 3000, delayHours: "Sous 24h" },
];

export interface DeliveryDetails {
  city: "abidjan" | "dakar";
  areaId: string;
  areaName: string;
  address: string; // Ex: "Rue des Jardins, Immeuble Horizon, Apt 3B"
  landmark?: string; // Repère local : "En face de la pharmacie, portail blanc"
  recipientPhone: string;
  fee: number;
}

export function getDeliveryAreas(city: "abidjan" | "dakar"): DeliveryArea[] {
  return DELIVERY_AREAS.filter((a) => a.city === city);
}

export function getAreaById(areaId: string): DeliveryArea | undefined {
  return DELIVERY_AREAS.find((a) => a.id === areaId);
}

export const CITIES = {
  abidjan: {
    name: "Abidjan (Côte d'Ivoire)",
    country: "CI",
    currency: "FCFA",
    areas: DELIVERY_AREAS.filter((a) => a.city === "abidjan"),
  },
  dakar: {
    name: "Dakar (Sénégal)",
    country: "SN",
    currency: "FCFA",
    areas: DELIVERY_AREAS.filter((a) => a.city === "dakar"),
  },
};

export function calculateShippingFee(param1?: string | null, param2?: string | null): number {
  if (!param1 && !param2) return 1500; // Par défaut : tarif standard intra-muros
  let city: "abidjan" | "dakar" | undefined = undefined;
  let areaSearch: string | undefined = undefined;

  if (param1 === "abidjan" || param1 === "dakar") {
    city = param1;
    areaSearch = param2 ?? undefined;
  } else {
    areaSearch = param1 ?? undefined;
    if (param2 === "abidjan" || param2 === "dakar") {
      city = param2;
    }
  }

  if (!areaSearch) return 1500;
  const trimmed = areaSearch.trim().toLowerCase();
  const area = DELIVERY_AREAS.find((a) => {
    if (city && a.city !== city) return false;
    if (a.id.toLowerCase() === trimmed) return true;
    if (a.name.toLowerCase().includes(trimmed)) return true;
    if (trimmed.includes(a.name.toLowerCase().slice(0, 6))) return true;
    return false;
  });
  return area ? area.fee : 1500;
}

export const ORDER_DELIVERY_STATUSES: Record<string, { label: string; step: number; cls: string; description: string }> = {
  pending: {
    label: "Paiement en attente",
    step: 0,
    cls: "bg-gold/15 text-gold-dark border-gold/40",
    description: "En attente de confirmation du paiement Mobile Money",
  },
  paid: {
    label: "Commande confirmée",
    step: 1,
    cls: "bg-[#3F7D3F]/15 text-[#3F7D3F] border-[#3F7D3F]/40",
    description: "Paiement validé — préparation par l'établissement partenaire agréé",
  },
  preparing: {
    label: "En préparation",
    step: 2,
    cls: "bg-primary/15 text-primary border-primary/40",
    description: "Vos soins sont préparés et emballés par l'établissement partenaire",
  },
  in_transit: {
    label: "En cours de livraison",
    step: 3,
    cls: "bg-blue-500/15 text-blue-600 border-blue-500/40",
    description: "Le coursier express est en route vers votre adresse",
  },
  delivered: {
    label: "Livrée",
    step: 4,
    cls: "bg-emerald-600/15 text-emerald-700 border-emerald-600/40",
    description: "Colis remis en main propre. Belle routine beauté !",
  },
  cancelled: {
    label: "Annulée",
    step: -1,
    cls: "bg-destructive/15 text-destructive border-destructive/40",
    description: "La commande a été annulée",
  },
};
