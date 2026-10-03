// Kènè Pro — Pilote d'impression thermique directe Web Bluetooth (ESC/POS)
// Compatible imprimantes portables Bluetooth 58mm & 80mm de salon
// (Xprinter, Goojprt, Netum, Sunmi, Munbyn, MPT-II, etc.)

import type { ThermalReceiptData, ThermalFormat } from "@/lib/accounting/receipt-thermal";
import { splitTVA } from "@/lib/accounting/syscohada";

// UUIDs des services Bluetooth thermiques courants
const BLE_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard Printer Service
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC Transparent UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Serial SPP BLE
  "0000e0ff-0000-1000-8000-00805f9b34fb", // POS Mobile Service
  "0000ff00-0000-1000-8000-00805f9b34fb", // Generic POS vendor
];

export interface BluetoothPrinterState {
  connected: boolean;
  deviceName?: string;
  error?: string;
}

/** Vérifie si le navigateur supporte Web Bluetooth */
export function isWebBluetoothSupported(): boolean {
  return typeof window !== "undefined" && "bluetooth" in navigator;
}

/** Encode une chaîne en octets ASCII / CP1252 simplifiés */
function encodeAscii(text: string): Uint8Array {
  const clean = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // suppression des accents pour compatibilité imprimante
    .replace(/[^\x20-\x7E\n\r]/g, " "); // substitution des caractères non-imprimables
  
  const bytes = new Uint8Array(clean.length);
  for (let i = 0; i < clean.length; i++) {
    bytes[i] = clean.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** Concatène plusieurs tableaux d'octets */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((acc, a) => acc + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Construit le flux binaire d'instructions ESC/POS pour le ticket de caisse */
export function buildEscPosBinary(data: ThermalReceiptData, format: ThermalFormat = "80mm"): Uint8Array {
  const maxCols = format === "58mm" ? 32 : 48;
  const chunks: Uint8Array[] = [];

  const write = (str: string) => chunks.push(encodeAscii(str));
  const raw = (...bytes: number[]) => chunks.push(new Uint8Array(bytes));

  const padLine = (left: string, right: string): string => {
    const space = maxCols - (left.length + right.length);
    if (space <= 0) return (left + " " + right).slice(0, maxCols) + "\n";
    return left + " ".repeat(space) + right + "\n";
  };

  const divider = "-".repeat(maxCols) + "\n";

  // 1. Initialisation imprimante (ESC @)
  raw(0x1b, 0x40);

  // 2. Alignement centré (ESC a 1)
  raw(0x1b, 0x61, 0x01);

  // Double hauteur / largeur pour le nom de l'institut (ESC ! 0x30)
  raw(0x1b, 0x21, 0x30);
  write(data.tenantName.toUpperCase() + "\n");

  // Retour en taille normale (ESC ! 0x00)
  raw(0x1b, 0x21, 0x00);
  if (data.tenantAddress) write(data.tenantAddress + "\n");
  if (data.tenantPhone) write("Tel: " + data.tenantPhone + "\n");
  if (data.tenantTaxId) write("NIF/RCCM: " + data.tenantTaxId + "\n");
  write("TICKET DE CAISSE\n");

  // Date et métadonnées
  const d = typeof data.createdAt === "string" ? new Date(data.createdAt) : data.createdAt;
  const dateStr = !isNaN(d.getTime()) ? d.toLocaleDateString("fr-FR") + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "";
  write(dateStr + "\n");
  write("Ticket N: " + data.receiptNumber.toUpperCase() + "\n");
  if (data.cashierName) write("Operateur: " + data.cashierName + "\n");
  if (data.clientName) write("Cliente: " + data.clientName + "\n");

  // 3. Alignement à gauche (ESC a 0)
  raw(0x1b, 0x61, 0x00);
  write(divider);

  // 4. Lignes d'articles
  for (const it of data.items) {
    const leftText = `${it.qty}x ${it.label}`;
    const rightText = Math.round(it.total).toLocaleString("fr-FR");
    if (leftText.length + rightText.length + 1 > maxCols) {
      write(leftText + "\n");
      write(" ".repeat(Math.max(0, maxCols - rightText.length)) + rightText + "\n");
    } else {
      write(padLine(leftText, rightText));
    }
  }

  write(divider);

  // 5. Totaux & SYSCOHADA
  const subtotalStr = Math.round(data.subtotal || data.total).toLocaleString("fr-FR");
  write(padLine("Sous-total", subtotalStr));

  if (data.discount && data.discount > 0) {
    const discStr = "-" + Math.round(data.discount).toLocaleString("fr-FR");
    write(padLine("Remise", discStr));
  }

  // Ligne TOTAL en gras / grand (ESC E 1)
  raw(0x1b, 0x45, 0x01);
  const totalStr = Math.round(data.total).toLocaleString("fr-FR") + " FCFA";
  write(padLine("TOTAL TTC", totalStr));
  raw(0x1b, 0x45, 0x00); // Gras désactivé

  if (!data.taxExempt) {
    const tva = splitTVA(data.total);
    write(padLine("dont TVA 18%", Math.round(tva.tva).toLocaleString("fr-FR")));
  } else {
    write(padLine("Regime fiscal", "Exonere TVA"));
  }

  write(divider);

  // 6. Règlement
  write(padLine("Reglement", data.paymentMethod.toUpperCase()));
  if (data.paymentRef) {
    write(padLine("Ref.", data.paymentRef.slice(-10).toUpperCase()));
  }

  write(divider);

  // 7. Alignement centré & Pied de page
  raw(0x1b, 0x61, 0x01);
  write("MERCI DE VOTRE CONFIANCE !\n");
  write("Kene Beaute & Bien-etre\n");
  write("Standard SYSCOHADA\n\n\n");

  // 8. Découpe papier partielle ou totale (GS V 66 0) + Feed
  raw(0x1d, 0x56, 0x42, 0x00);

  return concatBytes(...chunks);
}

/**
 * Imprime directement sur l'imprimante Bluetooth appairée via Web Bluetooth API.
 * Découpe les paquets en chunks de 128 octets pour éviter les pertes de buffer matériel.
 */
export async function printDirectWebBluetooth(
  data: ThermalReceiptData,
  format: ThermalFormat = "80mm"
): Promise<{ success: boolean; deviceName?: string; error?: string }> {
  if (!isWebBluetoothSupported()) {
    return {
      success: false,
      error: "Web Bluetooth n'est pas supporté par ce navigateur (veuillez utiliser Chrome ou Edge).",
    };
  }

  const binaryData = buildEscPosBinary(data, format);

  try {
    const navAny = navigator as unknown as {
      bluetooth: {
        requestDevice: (options: {
          acceptAllDevices?: boolean;
          optionalServices?: string[];
        }) => Promise<any>;
      };
    };

    const device = await navAny.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: BLE_PRINTER_SERVICES,
    });

    if (!device || !device.gatt) {
      return { success: false, error: "Périphérique Bluetooth non connecté." };
    }

    const server = await device.gatt.connect();

    // Recherche du service et de la caractéristique d'écriture
    let writeChar: any = null;

    for (const serviceUuid of BLE_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
        if (writeChar) break;
      } catch {
        // Continue recherche sur les autres services connus
      }
    }

    if (!writeChar) {
      // Fallback : inspection de tous les services exposés
      try {
        const services = await server.getPrimaryServices();
        for (const s of services) {
          const chars = await s.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              writeChar = c;
              break;
            }
          }
          if (writeChar) break;
        }
      } catch {
        // ignore
      }
    }

    if (!writeChar) {
      return {
        success: false,
        deviceName: device.name,
        error: "Caractéristique d'écriture ESC/POS introuvable sur cette imprimante.",
      };
    }

    // Transmission par paquets de 128 octets avec pause de 20ms
    const CHUNK_SIZE = 128;
    for (let i = 0; i < binaryData.length; i += CHUNK_SIZE) {
      const chunk = binaryData.slice(i, i + CHUNK_SIZE);
      if (writeChar.writeValueWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValue(chunk);
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    return {
      success: true,
      deviceName: device.name || "Imprimante Thermique Bluetooth",
    };
  } catch (err: any) {
    if (err.name === "NotFoundError" || err.message?.includes("User cancelled")) {
      return { success: false, error: "Sélection d'imprimante annulée." };
    }
    if (err.name === "SecurityError" || err.message?.includes("permissions policy")) {
      return {
        success: false,
        error: "Accès Bluetooth restreint par le navigateur. Assurez-vous d'être sur HTTPS et d'autoriser le Bluetooth dans les paramètres du site.",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur d'impression Bluetooth.",
    };
  }
}
