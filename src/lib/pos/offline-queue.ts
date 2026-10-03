// Kènè Pro — Gestionnaire de file d'attente d'encaissement hors-ligne (Offline-First POS)
// Résilience aux coupures d'électricité et de réseau à Abidjan & Dakar
// Persistance IndexedDB avec repli localStorage automatique

import { apiPost } from "@/lib/kene/api";
import type { ProSale } from "@/components/kene/pro/types";

export interface OfflineSaleItem {
  localId: string;
  tenantId: string;
  items: Array<{
    kind: "service" | "product";
    id: string;
    label?: string;
    unitPrice?: number;
    qty: number;
  }>;
  paymentMethod: string;
  clientProfileId?: string;
  discount?: number;
  total: number;
  createdAt: string;
  synced: boolean;
  retryCount: number;
  error?: string;
}

const DB_NAME = "kene_pos_offline_db";
const STORE_NAME = "sales";
const DB_VERSION = 1;
const STORAGE_FALLBACK_KEY = "kene_pos_offline_sales";

function getIndexedDB(): IDBFactory | null {
  if (typeof window !== "undefined" && window.indexedDB) {
    return window.indexedDB;
  }
  return null;
}

function openDB(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) return Promise.reject(new Error("IndexedDB non disponible"));

  return new Promise((resolve, reject) => {
    const request = idb.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "localId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

let inMemorySales: OfflineSaleItem[] = [];

function getFallbackSales(): OfflineSaleItem[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return inMemorySales;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_FALLBACK_KEY);
    return raw ? JSON.parse(raw) : inMemorySales;
  } catch {
    return inMemorySales;
  }
}

function setFallbackSales(sales: OfflineSaleItem[]) {
  inMemorySales = sales;
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(sales));
  } catch {
    // quota dépassé ou localStorage bloqué
  }
}

/** Enregistre une vente locale en attente de synchronisation */
export async function saveOfflineSale(
  data: Omit<OfflineSaleItem, "localId" | "createdAt" | "synced" | "retryCount">
): Promise<OfflineSaleItem> {
  const item: OfflineSaleItem = {
    ...data,
    localId: "off_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
    synced: false,
    retryCount: 0,
  };

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback localStorage
    const list = getFallbackSales();
    list.push(item);
    setFallbackSales(list);
    return item;
  }
}

/** Récupère toutes les ventes non synchronisées (filtrables par tenant) */
export async function getPendingOfflineSales(tenantId?: string): Promise<OfflineSaleItem[]> {
  try {
    const db = await openDB();
    const list = await new Promise<OfflineSaleItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as OfflineSaleItem[]) || []);
      req.onerror = () => reject(req.error);
    });
    return list.filter((s) => !s.synced && (!tenantId || s.tenantId === tenantId));
  } catch {
    const list = getFallbackSales();
    return list.filter((s) => !s.synced && (!tenantId || s.tenantId === tenantId));
  }
}

/** Supprime une vente locale une fois synchronisée avec le serveur */
export async function removeOfflineSale(localId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(localId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    const list = getFallbackSales().filter((s) => s.localId !== localId);
    setFallbackSales(list);
  }
}

/** Vérifie l'état actuel de la connexion réseau */
export function isNetworkOnline(): boolean {
  if (typeof window === "undefined") return true;
  return typeof navigator.onLine === "boolean" ? navigator.onLine : true;
}

/**
 * Tente de synchroniser toutes les ventes locales en attente avec l'API centrale Kènè.
 */
export async function syncOfflineSales(
  tenantId: string,
  onSaleSynced?: (sale: OfflineSaleItem, serverSale?: ProSale) => void
): Promise<{ syncedCount: number; errors: number }> {
  if (!isNetworkOnline()) {
    return { syncedCount: 0, errors: 0 };
  }

  const pending = await getPendingOfflineSales(tenantId);
  let syncedCount = 0;
  let errors = 0;

  for (const item of pending) {
    try {
      const res = await apiPost<{ sale: ProSale }>("/api/pro/sales", {
        tenantId: item.tenantId,
        items: item.items.map((it) => ({ kind: it.kind, id: it.id, qty: it.qty })),
        paymentMethod: item.paymentMethod,
        clientProfileId: item.clientProfileId || undefined,
        discount: item.discount || 0,
      });

      await removeOfflineSale(item.localId);
      syncedCount++;
      if (onSaleSynced) {
        onSaleSynced(item, res.sale);
      }
    } catch {
      errors++;
      // Maintien dans la file pour le prochain flush
    }
  }

  return { syncedCount, errors };
}
