/**
 * src/config/salon-identity.ts
 *
 * CONFIGURATION CENTRALE DE L'INSTITUT KÈNÈ (IDENTITÉ, FISCALITÉ, ÉQUIPE & COORDONNÉES)
 * ====================================================================================
 * Renseignez ici les informations réelles de votre institut pour personnaliser
 * automatiquement l'ensemble de la plateforme :
 * - En-têtes des tickets de caisse thermiques (ESC/POS & web)
 * - Factures d'achats et ordonnances dermo-botaniques PDF
 * - Coordonnées légales SYSCOHADA (RCCM, NIF, TVA 18%)
 * - Numéro WhatsApp officiel pour les notifications et tickets dématérialisés
 * - Taux de commissions par praticienne
 */

export interface StaffMemberConfig {
  id: string;
  name: string;
  phone: string;
  role: "directrice" | "praticienne" | "esthetitienne" | "receptionniste";
  careCommissionRate: number; // Ex: 0.10 pour 10% sur les soins
  productCommissionRate: number; // Ex: 0.05 pour 5% sur les ventes boutique
  active: boolean;
}

export interface SalonIdentityConfig {
  legal: {
    companyName: string; // Raison sociale officielle (ex: KÈNÈ BEAUTÉ & BIEN-ÊTRE SARL)
    brandName: string; // Nom commercial affiché (ex: Institut Kènè Cocody)
    rccm: string; // Registre du Commerce (ex: CI-ABJ-2024-B-12345)
    nif: string; // Numéro d'Identification Fiscale / Compte Contribuable
    country: "CI" | "SN"; // Côte d'Ivoire (+225) ou Sénégal (+221)
    city: string; // Ex: Abidjan ou Dakar
    commune: string; // Ex: Cocody Deux-Plateaux Vallons ou Almadies
    address: string; // Adresse géographique précise
  };
  contact: {
    phone: string; // Numéro de contact d'accueil
    whatsapp: string; // Numéro WhatsApp officiel (format international, ex: 2250700000000)
    email: string; // Email de contact officiel
  };
  accounting: {
    currency: "XOF";
    vatRate: number; // Taux de TVA standard UEMOA / SYSCOHADA : 18.0%
    isVatSubject: boolean; // Assujetti à la TVA (true) ou Régime synthétique (false)
  };
  businessHours: {
    openingHour: string; // "09:00"
    closingHour: string; // "19:30"
    workingDays: string[]; // ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"]
  };
  team: StaffMemberConfig[];
}

/**
 * Configuration par défaut de l'institut.
 * Modifiez les valeurs ci-dessous avec vos données réelles.
 */
export const SALON_CONFIG: SalonIdentityConfig = {
  legal: {
    companyName: "KÈNÈ DERMO-ESTHÉTIQUE & BIEN-ÊTRE",
    brandName: "Institut Kènè",
    rccm: "CI-ABJ-2026-B-84920",
    nif: "261084920M",
    country: "CI",
    city: "Abidjan",
    commune: "Cocody Deux-Plateaux Vallons",
    address: "Rue des Jardins, Immeuble Kènè, 1er Étage",
  },
  contact: {
    phone: "+225 27 22 00 00 00",
    whatsapp: "2250700000000",
    email: "contact@kene.app",
  },
  accounting: {
    currency: "XOF",
    vatRate: 18.0,
    isVatSubject: true,
  },
  businessHours: {
    openingHour: "09:00",
    closingHour: "19:30",
    workingDays: ["Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"],
  },
  team: [
    {
      id: "staff-1",
      name: "Aminata Diallo",
      phone: "+2250701020304",
      role: "directrice",
      careCommissionRate: 0.12, // 12% sur les soins
      productCommissionRate: 0.07, // 7% sur les produits
      active: true,
    },
    {
      id: "staff-2",
      name: "Fatou Traoré",
      phone: "+2250502030405",
      role: "esthetitienne",
      careCommissionRate: 0.10, // 10% sur les soins
      productCommissionRate: 0.05, // 5% sur les produits
      active: true,
    },
    {
      id: "staff-3",
      name: "Aïcha Bamba",
      phone: "+2250103040506",
      role: "praticienne",
      careCommissionRate: 0.10,
      productCommissionRate: 0.05,
      active: true,
    },
  ],
};
