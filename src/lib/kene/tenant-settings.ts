// src/lib/kene/tenant-settings.ts
// Gestion des préférences fiscales et des modes d'encaissement de l'institut
// Réservé à la patronne / gérante propriétaire (gouvernance d'entreprise).

import { SALON_CONFIG } from "@/config/salon-identity";

export interface TenantPosSettings {
  isVatSubject: boolean; // true = assujetti TVA 18% SYSCOHADA, false = exonéré (régime synthétique)
  allowedPaymentMethods: {
    cash: boolean;
    wave: boolean;
    orange: boolean;
    card: boolean;
    wallet: boolean;
  };
}

export const DEFAULT_TENANT_SETTINGS: TenantPosSettings = {
  isVatSubject: SALON_CONFIG.accounting.isVatSubject ?? true,
  allowedPaymentMethods: {
    cash: true,
    wave: true,
    orange: true,
    card: true,
    wallet: true,
  },
};

const STORAGE_PREFIX = "kene_tenant_pos_settings_";

export function getTenantPosSettings(tenantId?: string | null): TenantPosSettings {
  if (typeof window === "undefined" || !tenantId) return DEFAULT_TENANT_SETTINGS;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${tenantId}`);
    if (!raw) return DEFAULT_TENANT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      isVatSubject: typeof parsed.isVatSubject === "boolean" ? parsed.isVatSubject : DEFAULT_TENANT_SETTINGS.isVatSubject,
      allowedPaymentMethods: {
        cash: parsed.allowedPaymentMethods?.cash ?? true,
        wave: parsed.allowedPaymentMethods?.wave ?? true,
        orange: parsed.allowedPaymentMethods?.orange ?? true,
        card: parsed.allowedPaymentMethods?.card ?? true,
        wallet: parsed.allowedPaymentMethods?.wallet ?? true,
      },
    };
  } catch {
    return DEFAULT_TENANT_SETTINGS;
  }
}

export function saveTenantPosSettings(tenantId: string, settings: TenantPosSettings): void {
  if (typeof window === "undefined" || !tenantId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${tenantId}`, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("kene:tenant-settings-changed", { detail: { tenantId, settings } }));
  } catch {
    // localStorage plein ou indisponible
  }
}
